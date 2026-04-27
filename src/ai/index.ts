import pino from 'pino';
import OpenAI from 'openai';
import { z } from 'zod';
import { getConfig } from '../config/index.js';

/**
 * Food analysis result interface.
 * Returned by the FoodVisionService after analyzing an image.
 */
export interface FoodAnalysisResult {
  /** Whether the image contains food */
  is_food: boolean;
  /** Confidence level that the image contains food (0-1) */
  food_confidence: number;
  /** Estimated calories (10-10000 kcal), null if not food */
  estimated_calories: number | null;
  /** Estimated protein in grams, null if not food */
  protein_g: number | null;
  /** Estimated fat in grams, null if not food */
  fat_g: number | null;
  /** Estimated carbohydrates in grams, null if not food */
  carbs_g: number | null;
  /** Description of the food in Russian, null if not food */
  description: string | null;
}

/**
 * Error thrown when food analysis fails after all retries.
 */
export class FoodAnalysisError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'FoodAnalysisError';
  }
}

// Zod schema for validating OpenAI response
// Note: estimated_calories accepts any positive number, clamping happens after validation
const FoodAnalysisResponseSchema = z.object({
  is_food: z.boolean(),
  food_confidence: z.number().min(0).max(1),
  estimated_calories: z.number().positive().nullable(),
  protein_g: z.number().nonnegative().nullable(),
  fat_g: z.number().nonnegative().nullable(),
  carbs_g: z.number().nonnegative().nullable(),
  description: z.string().nullable(),
});

// Constants
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MIN_CALORIES = 10;
const MAX_CALORIES = 10000;
const MAX_PROTEIN = 500;
const MAX_FAT = 500;
const MAX_CARBS = 1000;

// System prompt for correction (when user replies to bot message with adjustments)
const FOOD_CORRECTION_PROMPT = `You are an expert food nutrition analyst. The user is correcting a previous estimate you made.

You will receive:
1. The PREVIOUS estimate (calories, protein, fat, carbs, description) — what you (or another model) previously calculated.
2. The user's CORRECTION — free-form text and/or a new image (e.g. a nutrition label, a clearer photo, a different angle, or just text like "это две порции, не одна" / "там был ещё хлеб").

Your job: produce a NEW best-effort estimate that respects the user's correction. Treat the user as the ground truth for facts they state directly (portion size, ingredients, weight, brand). When they don't override a value, you may keep the previous one if it still makes sense.

If the user provides a new image with a nutrition label — read it and prefer those values.
If the user only adjusts one aspect (e.g. portion count) — scale the macros accordingly.
If the user clarifies the dish — recompute everything from scratch using the clarification.

Response format (JSON, same as initial analysis):
{
  "is_food": boolean,
  "food_confidence": number (0-1),
  "estimated_calories": number or null,
  "protein_g": number or null,
  "fat_g": number or null,
  "carbs_g": number or null,
  "description": string or null (concise 1-2 sentences in Russian, mention what was corrected)
}

Always set is_food: true and food_confidence: 0.95+ unless the user explicitly says it's not food.
Round macros to whole numbers.`;

// System prompt for food analysis
const FOOD_ANALYSIS_PROMPT = `You are an expert food nutrition analyst. Your task: analyze the image and estimate calories + macronutrients as accurately as possible.

STEP 1: Determine what's in the image.
- Food on a plate/in a container?
- A nutrition label / product packaging with printed nutritional info?
- Both food AND a label together?
- Not food at all?

STEP 2: Estimation strategy based on what you see.

IF NUTRITION LABEL IS VISIBLE:
- Read and use the printed values (calories, protein, fat, carbs per serving/package).
- If a serving size and number of servings are visible, calculate for the full visible portion.
- This is the most accurate source — prioritize it over visual estimation.

IF FOOD IS VISIBLE (no label):
- Estimate portion size using visual cues: plate diameter (~25cm standard), utensils, hands, cups, packaging.
- Identify each component (protein source, carbs, fats, vegetables, sauces).
- Estimate weight of each component, then calculate nutrition.
- For packaged/branded items you recognize, use known nutritional data.

IF BOTH FOOD AND LABEL ARE VISIBLE:
- If the label corresponds to the food shown (same product) — use the label values.
- If the label is for a different product than the food shown — report nutrition for BOTH items combined.

STEP 3: Return JSON.

Response format (JSON):
{
  "is_food": boolean,
  "food_confidence": number (0-1, confidence that image contains food or nutrition label),
  "estimated_calories": number or null (10-10000 kcal, null if not food),
  "protein_g": number or null (grams, null if not food),
  "fat_g": number or null (grams, null if not food),
  "carbs_g": number or null (grams, null if not food),
  "description": string or null (brief description in Russian, null if not food)
}

Guidelines:
- A nutrition label photo IS food-related — set is_food: true, food_confidence: 0.95+
- Use plate/hand/utensil proportions to gauge portion size more accurately
- For mixed dishes, estimate each visible component separately, then sum
- Round macros to whole numbers
- description: concise 1-2 sentences in Russian, mention if values came from a label`;

/**
 * Service for analyzing food images using OpenAI Vision API.
 */
export class FoodVisionService {
  private readonly openai: OpenAI;
  private readonly model: string;
  private readonly confidenceThreshold: number;
  private readonly logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    const config = getConfig();
    this.openai = new OpenAI({
      apiKey: config.ai.apiKey,
    });
    this.model = config.ai.model;
    this.confidenceThreshold = config.ai.foodConfidenceThreshold;
    this.logger = (logger ?? pino({ level: config.log.level })).child({
      service: 'FoodVisionService',
    });
  }

  /**
   * Analyzes an image buffer to detect food and estimate calories.
   * Uses exponential backoff retry on transient failures.
   *
   * @param imageBuffer - The image data as a Buffer
   * @returns FoodAnalysisResult with food detection and calorie estimation
   * @throws FoodAnalysisError if analysis fails after all retries
   */
  async analyze(imageBuffer: Buffer): Promise<FoodAnalysisResult> {
    this.logger.debug({ imageSize: imageBuffer.length }, 'Starting food analysis');

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.performAnalysis(imageBuffer);
        this.logger.info(
          {
            isFood: result.is_food,
            confidence: result.food_confidence,
            calories: result.estimated_calories,
          },
          'Food analysis completed'
        );
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          { attempt, maxRetries: MAX_RETRIES, error: lastError.message },
          'Food analysis attempt failed'
        );

        if (attempt < MAX_RETRIES) {
          const delay = this.calculateBackoffDelay(attempt);
          this.logger.debug({ delayMs: delay }, 'Waiting before retry');
          await this.sleep(delay);
        }
      }
    }

    // All retries exhausted - return graceful fallback
    this.logger.error(
      { error: lastError?.message },
      'Food analysis failed after all retries, returning fallback'
    );
    return this.createFallbackResult();
  }

  /**
   * Re-analyzes a previous estimate using user's correction.
   * Accepts free-form correction text and optionally a new image.
   * Falls back to the previous estimate if the AI call fails.
   */
  async correct(
    previous: {
      calories: number | null;
      protein: number | null;
      fat: number | null;
      carbs: number | null;
      description: string | null;
    },
    correctionText: string,
    newImageBuffer?: Buffer
  ): Promise<FoodAnalysisResult> {
    this.logger.debug(
      { hasNewImage: Boolean(newImageBuffer), textLength: correctionText.length },
      'Starting food correction'
    );

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.performCorrection(previous, correctionText, newImageBuffer);
        this.logger.info(
          { calories: result.estimated_calories, confidence: result.food_confidence },
          'Food correction completed'
        );
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          { attempt, maxRetries: MAX_RETRIES, error: lastError.message },
          'Food correction attempt failed'
        );

        if (attempt < MAX_RETRIES) {
          await this.sleep(this.calculateBackoffDelay(attempt));
        }
      }
    }

    this.logger.error(
      { error: lastError?.message },
      'Food correction failed, returning previous as fallback'
    );
    return {
      is_food: true,
      food_confidence: 1,
      estimated_calories: previous.calories,
      protein_g: previous.protein,
      fat_g: previous.fat,
      carbs_g: previous.carbs,
      description: previous.description,
    };
  }

  private async performCorrection(
    previous: {
      calories: number | null;
      protein: number | null;
      fat: number | null;
      carbs: number | null;
      description: string | null;
    },
    correctionText: string,
    newImageBuffer?: Buffer
  ): Promise<FoodAnalysisResult> {
    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    const previousJson = JSON.stringify(
      {
        estimated_calories: previous.calories,
        protein_g: previous.protein,
        fat_g: previous.fat,
        carbs_g: previous.carbs,
        description: previous.description,
      },
      null,
      2
    );

    userContent.push({
      type: 'text',
      text: `PREVIOUS estimate:\n${previousJson}\n\nUSER CORRECTION:\n${correctionText || '(no text — see new image)'}`,
    });

    if (newImageBuffer) {
      const base64Image = newImageBuffer.toString('base64');
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`,
          detail: 'low',
        },
      });
    }

    const response = await this.openai.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: FOOD_CORRECTION_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_completion_tokens: 700,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new FoodAnalysisError('Empty response from OpenAI (correction)');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new FoodAnalysisError(`Failed to parse correction response as JSON: ${content}`);
    }

    const validated = FoodAnalysisResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new FoodAnalysisError(`Invalid correction response: ${validated.error.message}`);
    }

    const result = validated.data;

    if (result.estimated_calories !== null) {
      result.estimated_calories = this.clampCalories(result.estimated_calories);
    }
    if (result.protein_g !== null)
      result.protein_g = Math.min(MAX_PROTEIN, Math.round(result.protein_g));
    if (result.fat_g !== null) result.fat_g = Math.min(MAX_FAT, Math.round(result.fat_g));
    if (result.carbs_g !== null) result.carbs_g = Math.min(MAX_CARBS, Math.round(result.carbs_g));

    return result;
  }

  /**
   * Performs the actual OpenAI API call for image analysis.
   */
  private async performAnalysis(imageBuffer: Buffer): Promise<FoodAnalysisResult> {
    const base64Image = imageBuffer.toString('base64');
    const imageUrl = `data:image/jpeg;base64,${base64Image}`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: FOOD_ANALYSIS_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'low',
              },
            },
          ],
        },
      ],
      max_completion_tokens: 700,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new FoodAnalysisError('Empty response from OpenAI');
    }

    // Parse and validate the JSON response
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new FoodAnalysisError(`Failed to parse OpenAI response as JSON: ${content}`);
    }

    const validated = FoodAnalysisResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new FoodAnalysisError(`Invalid response structure: ${validated.error.message}`);
    }

    const result = validated.data;

    // Apply confidence threshold
    if (result.is_food && result.food_confidence < this.confidenceThreshold) {
      this.logger.debug(
        {
          confidence: result.food_confidence,
          threshold: this.confidenceThreshold,
        },
        'Food confidence below threshold, treating as not food'
      );
      return {
        is_food: false,
        food_confidence: result.food_confidence,
        estimated_calories: null,
        protein_g: null,
        fat_g: null,
        carbs_g: null,
        description: null,
      };
    }

    // Validate and clamp calories and macros
    if (result.is_food && result.estimated_calories !== null) {
      result.estimated_calories = this.clampCalories(result.estimated_calories);
    }
    if (result.is_food) {
      if (result.protein_g !== null)
        result.protein_g = Math.min(MAX_PROTEIN, Math.round(result.protein_g));
      if (result.fat_g !== null) result.fat_g = Math.min(MAX_FAT, Math.round(result.fat_g));
      if (result.carbs_g !== null) result.carbs_g = Math.min(MAX_CARBS, Math.round(result.carbs_g));
    }

    return result;
  }

  /**
   * Calculates exponential backoff delay for retry.
   */
  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s...
    const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
    // Add jitter (0-500ms) to prevent thundering herd
    const jitter = Math.random() * 500;
    return exponentialDelay + jitter;
  }

  /**
   * Clamps calories to valid range.
   */
  private clampCalories(calories: number): number {
    return Math.max(MIN_CALORIES, Math.min(MAX_CALORIES, Math.round(calories)));
  }

  /**
   * Creates a fallback result when analysis fails.
   */
  private createFallbackResult(): FoodAnalysisResult {
    return {
      is_food: false,
      food_confidence: 0,
      estimated_calories: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
      description: null,
    };
  }

  /**
   * Sleep utility for retry delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let foodVisionServiceInstance: FoodVisionService | null = null;

/**
 * Gets the singleton FoodVisionService instance.
 */
export function getFoodVisionService(logger?: pino.Logger): FoodVisionService {
  if (!foodVisionServiceInstance) {
    foodVisionServiceInstance = new FoodVisionService(logger);
  }
  return foodVisionServiceInstance;
}

/**
 * Resets the singleton instance.
 * Useful for testing.
 */
export function resetFoodVisionService(): void {
  foodVisionServiceInstance = null;
}
