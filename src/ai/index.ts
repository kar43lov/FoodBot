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

// System prompt for food analysis
const FOOD_ANALYSIS_PROMPT = `You are a food nutrition estimation assistant. Analyze the provided image and determine:
1. Whether the image contains food
2. If food is present, estimate calories, protein, fat, carbohydrates and provide a brief description in Russian

Response format (JSON):
{
  "is_food": boolean,
  "food_confidence": number (0-1, confidence that image contains food),
  "estimated_calories": number or null (10-10000 kcal if food, null otherwise),
  "protein_g": number or null (estimated protein in grams, null if not food),
  "fat_g": number or null (estimated fat in grams, null if not food),
  "carbs_g": number or null (estimated carbohydrates in grams, null if not food),
  "description": string or null (brief description in Russian if food, null otherwise)
}

Guidelines:
- Be conservative with estimates when uncertain
- For composite dishes, estimate total nutrition of visible portion
- estimated_calories must be between 10 and 10000, or null if not food
- protein_g, fat_g, carbs_g should be reasonable estimates based on visible portion size
- food_confidence should reflect how certain you are the image contains food
- description should be concise (1-2 sentences max) and in Russian`;

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
      max_completion_tokens: 500,
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
      if (result.fat_g !== null)
        result.fat_g = Math.min(MAX_FAT, Math.round(result.fat_g));
      if (result.carbs_g !== null)
        result.carbs_g = Math.min(MAX_CARBS, Math.round(result.carbs_g));
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
