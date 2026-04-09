import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { FoodVisionService, FoodAnalysisResult, resetFoodVisionService } from './index.js';
import { resetConfig } from '../config/index.js';

// Create mock at module level
const mockCreateFn: Mock = vi.fn();

// Mock OpenAI with hoisted mock
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreateFn,
      },
    },
  })),
}));

describe('FoodVisionService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    mockCreateFn.mockClear();
    resetConfig();
    resetFoodVisionService();
    process.env = { ...originalEnv };
    // Set required env vars
    process.env.BOT_TOKEN = 'test-bot-token';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.OPENAI_MODEL = 'gpt-4o';
    process.env.AI_FOOD_CONFIDENCE_THRESHOLD = '0.6';
    process.env.MODE = 'dev';
    process.env.LOG_LEVEL = 'error';
    process.env.SUPER_ADMIN_ID = '123456789';
    process.env.BOT_NAME = 'TestBot';
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
    resetFoodVisionService();
  });

  function createMockResponse(content: object): object {
    return {
      choices: [
        {
          message: {
            content: JSON.stringify(content),
          },
        },
      ],
    };
  }

  describe('analyze', () => {
    it('should return food analysis result for food image', async () => {
      mockCreateFn.mockResolvedValueOnce(
        createMockResponse({
          is_food: true,
          food_confidence: 0.95,
          estimated_calories: 450,
          description: 'Куриная грудка с овощами',
        })
      );

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      expect(result).toEqual({
        is_food: true,
        food_confidence: 0.95,
        estimated_calories: 450,
        description: 'Куриная грудка с овощами',
      });
      expect(mockCreateFn).toHaveBeenCalledTimes(1);
    });

    it('should return not food result for non-food image', async () => {
      mockCreateFn.mockResolvedValueOnce(
        createMockResponse({
          is_food: false,
          food_confidence: 0.1,
          estimated_calories: null,
          description: null,
        })
      );

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      expect(result).toEqual({
        is_food: false,
        food_confidence: 0.1,
        estimated_calories: null,
        description: null,
      });
    });

    it('should apply confidence threshold', async () => {
      // Response says it's food but with low confidence (below 0.6 threshold)
      mockCreateFn.mockResolvedValueOnce(
        createMockResponse({
          is_food: true,
          food_confidence: 0.4, // Below threshold
          estimated_calories: 200,
          description: 'Possibly food',
        })
      );

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      // Should be treated as not food due to low confidence
      expect(result).toEqual({
        is_food: false,
        food_confidence: 0.4,
        estimated_calories: null,
        description: null,
      });
    });

    it('should clamp calories to minimum (10)', async () => {
      mockCreateFn.mockResolvedValueOnce(
        createMockResponse({
          is_food: true,
          food_confidence: 0.9,
          estimated_calories: 5, // Below minimum
          description: 'Very small snack',
        })
      );

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      expect(result.estimated_calories).toBe(10);
    });

    it('should clamp calories to maximum (10000)', async () => {
      mockCreateFn.mockResolvedValueOnce(
        createMockResponse({
          is_food: true,
          food_confidence: 0.9,
          estimated_calories: 15000, // Above maximum
          description: 'Huge feast',
        })
      );

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      expect(result.estimated_calories).toBe(10000);
    });

    it('should round calories to integer', async () => {
      mockCreateFn.mockResolvedValueOnce(
        createMockResponse({
          is_food: true,
          food_confidence: 0.9,
          estimated_calories: 456.7,
          description: 'Lunch',
        })
      );

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      expect(result.estimated_calories).toBe(457);
    });

    it('should retry on transient failures', async () => {
      // First two calls fail, third succeeds
      mockCreateFn
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce(
          createMockResponse({
            is_food: true,
            food_confidence: 0.85,
            estimated_calories: 300,
            description: 'Salad',
          })
        );

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      expect(result).toEqual({
        is_food: true,
        food_confidence: 0.85,
        estimated_calories: 300,
        description: 'Salad',
      });
      expect(mockCreateFn).toHaveBeenCalledTimes(3);
    }, 15000); // Increase timeout due to retry delays

    it('should return fallback after all retries exhausted', async () => {
      // All calls fail
      mockCreateFn
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      // Graceful fallback
      expect(result).toEqual({
        is_food: false,
        food_confidence: 0,
        estimated_calories: null,
        description: null,
      });
      expect(mockCreateFn).toHaveBeenCalledTimes(3);
    }, 15000);

    it('should handle empty response from OpenAI', async () => {
      mockCreateFn.mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      // Should return fallback after retries
      expect(result.is_food).toBe(false);
    }, 15000);

    it('should handle invalid JSON response', async () => {
      mockCreateFn.mockResolvedValue({
        choices: [{ message: { content: 'not valid json' } }],
      });

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      // Should return fallback after retries
      expect(result.is_food).toBe(false);
    }, 15000);

    it('should handle malformed response structure', async () => {
      mockCreateFn.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                is_food: 'not-a-boolean', // Invalid type
                food_confidence: 0.9,
              }),
            },
          },
        ],
      });

      const service = new FoodVisionService();
      const result = await service.analyze(Buffer.from('fake-image-data'));

      // Should return fallback after retries
      expect(result.is_food).toBe(false);
    }, 15000);

    it('should pass correct parameters to OpenAI', async () => {
      mockCreateFn.mockResolvedValueOnce(
        createMockResponse({
          is_food: false,
          food_confidence: 0,
          estimated_calories: null,
          description: null,
        })
      );

      const service = new FoodVisionService();
      await service.analyze(Buffer.from('fake-image-data'));

      expect(mockCreateFn).toHaveBeenCalledTimes(1);
      const callArgs = mockCreateFn.mock.calls[0] as [Record<string, unknown>];
      const params = callArgs[0];

      expect(params).toHaveProperty('model', 'gpt-4o');
      expect(params).toHaveProperty('response_format');
      expect(params.response_format).toEqual({ type: 'json_object' });
      expect(params).toHaveProperty('max_completion_tokens', 500);
      expect(params).toHaveProperty('messages');
      expect(Array.isArray(params.messages)).toBe(true);
    });
  });

  describe('FoodAnalysisResult interface', () => {
    it('should match expected interface structure', () => {
      const result: FoodAnalysisResult = {
        is_food: true,
        food_confidence: 0.9,
        estimated_calories: 500,
        description: 'Test food',
      };

      expect(result).toHaveProperty('is_food');
      expect(result).toHaveProperty('food_confidence');
      expect(result).toHaveProperty('estimated_calories');
      expect(result).toHaveProperty('description');
    });

    it('should allow null values for calories and description', () => {
      const result: FoodAnalysisResult = {
        is_food: false,
        food_confidence: 0.1,
        estimated_calories: null,
        description: null,
      };

      expect(result.estimated_calories).toBeNull();
      expect(result.description).toBeNull();
    });
  });
});
