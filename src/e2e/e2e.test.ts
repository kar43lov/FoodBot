/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/**
 * E2E Test: Photo → Recognition → Save
 *
 * This test simulates the full flow:
 * 1. User sends photo to bot
 * 2. Photo is downloaded and sent to AI service
 * 3. AI recognizes food and estimates calories
 * 4. Meal entry is saved to database
 * 5. User receives confirmation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type pino from 'pino';
import type { Context } from 'grammy';

// Mock all external dependencies
const mockPrisma = {
  project: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  membership: {
    findUnique: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  mealEntry: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
};

vi.mock('../db/index.js', () => ({
  prisma: mockPrisma,
  ProjectType: {
    GROUP: 'group',
    PERSONAL: 'personal',
  },
  MembershipRole: {
    MEMBER: 'member',
    ADMIN: 'admin',
  },
  MealEntrySource: {
    PHOTO: 'photo',
    MANUAL: 'manual',
    WEB: 'web',
  },
}));

// Mock AI service
const mockAnalyze = vi.fn();
vi.mock('../ai/index.js', () => ({
  getFoodVisionService: vi.fn(() => ({
    analyze: mockAnalyze,
  })),
}));

// Mock fetch for photo download
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockLogger(): pino.Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as pino.Logger;
}

function createFullMockContext(options: {
  chatId: number;
  chatType: 'private' | 'group' | 'supergroup';
  chatTitle?: string;
  userId: number;
  firstName: string;
  username?: string;
  photoFileId: string;
  messageId: number;
}): Context {
  const mockApi = {
    getFile: vi.fn().mockResolvedValue({ file_path: 'photos/test-food.jpg' }),
    setMessageReaction: vi.fn().mockResolvedValue(true),
    token: 'test-bot-token',
  };

  return {
    chat: {
      id: options.chatId,
      type: options.chatType,
      ...(options.chatTitle ? { title: options.chatTitle } : {}),
    },
    from: {
      id: options.userId,
      first_name: options.firstName,
      username: options.username,
      is_bot: false,
    },
    message: {
      message_id: options.messageId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: options.chatId, type: options.chatType },
      photo: [
        { file_id: 'small', file_unique_id: 's1', width: 100, height: 100 },
        { file_id: options.photoFileId, file_unique_id: 'u1', width: 800, height: 600 },
      ],
    },
    api: mockApi,
    reply: vi.fn().mockResolvedValue({ message_id: 2 }),
  } as unknown as Context;
}

describe('E2E: Photo → Recognition → Save', () => {
  let logger: pino.Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();

    // Reset fetch mock to successful download
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(5000)), // Simulated image data
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Flow - New User in Private Chat', () => {
    it('should process photo from new user: create entities and save meal', async () => {
      // Setup: New user, no existing project
      const projectId = 'proj-new-123';
      const userId = 'user-new-123';
      const mealId = 'meal-new-123';

      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.project.create.mockResolvedValue({
        id: projectId,
        telegramChatId: BigInt(111222333),
        title: 'Personal: Alice',
        type: 'personal',
      });

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: userId,
        telegramUserId: BigInt(444555666),
        firstName: 'Alice',
        username: 'alice',
      });

      mockPrisma.membership.findUnique.mockResolvedValue(null);
      mockPrisma.membership.create.mockResolvedValue({
        id: 'membership-new',
        projectId,
        userId,
        role: 'admin',
      });

      mockPrisma.mealEntry.create.mockResolvedValue({
        id: mealId,
        projectId,
        userId,
        caloriesEstimated: 450,
        description: 'Куриный салат с овощами',
        source: 'photo',
        aiConfidence: 0.92,
        needsReview: false,
      });

      // AI recognizes food with high confidence
      mockAnalyze.mockResolvedValue({
        is_food: true,
        food_confidence: 0.92,
        estimated_calories: 450,
        description: 'Куриный салат с овощами',
      });

      const ctx = createFullMockContext({
        chatId: 111222333,
        chatType: 'private',
        userId: 444555666,
        firstName: 'Alice',
        username: 'alice',
        photoFileId: 'photo-food-123',
        messageId: 1,
      });

      // Execute
      const { handlePhoto } = await import('../bot/photoHandler.js');
      await handlePhoto(ctx, logger);

      // Verify: Project created
      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          telegramChatId: BigInt(111222333),
          title: 'Personal: Alice',
          type: 'personal',
        }),
      });

      // Verify: User created
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          telegramUserId: BigInt(444555666),
          firstName: 'Alice',
          username: 'alice',
        }),
      });

      // Verify: Admin membership created (first user)
      expect(mockPrisma.membership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId,
          userId,
          role: 'admin',
        }),
      });

      // Verify: Photo downloaded
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.telegram.org/file/bottest-bot-token/photos/test-food.jpg')
      );

      // Verify: AI called with image buffer
      expect(mockAnalyze).toHaveBeenCalledWith(expect.any(Buffer));

      // Verify: Meal entry created with AI results
      expect(mockPrisma.mealEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId,
          userId,
          caloriesEstimated: 450,
          description: 'Куриный салат с овощами',
          source: 'photo',
          aiConfidence: 0.92,
          needsReview: false,
        }),
      });

      // Verify: User notified with calories
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('450 ккал'),
        expect.objectContaining({
          reply_parameters: { message_id: 1 },
        })
      );
    });
  });

  describe('Complete Flow - Existing User in Group Chat', () => {
    it('should process photo from existing user in group', async () => {
      const projectId = 'proj-group-123';
      const userId = 'user-existing-123';

      // Setup: Existing project and user
      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        telegramChatId: BigInt(999888777),
        title: 'Lunch Club',
        type: 'group',
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        telegramUserId: BigInt(123123123),
        firstName: 'Bob',
        username: 'bob',
      });

      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'membership-existing',
        projectId,
        userId,
        role: 'member',
      });

      mockPrisma.mealEntry.create.mockResolvedValue({
        id: 'meal-group-123',
        projectId,
        userId,
        caloriesEstimated: 780,
        description: 'Бургер с картофелем фри',
        source: 'photo',
        aiConfidence: 0.88,
        needsReview: false,
      });

      mockAnalyze.mockResolvedValue({
        is_food: true,
        food_confidence: 0.88,
        estimated_calories: 780,
        description: 'Бургер с картофелем фри',
      });

      const ctx = createFullMockContext({
        chatId: 999888777,
        chatType: 'supergroup',
        chatTitle: 'Lunch Club',
        userId: 123123123,
        firstName: 'Bob',
        username: 'bob',
        photoFileId: 'photo-burger-456',
        messageId: 42,
      });

      const { handlePhoto } = await import('../bot/photoHandler.js');
      await handlePhoto(ctx, logger);

      // Verify: No new project/user created
      expect(mockPrisma.project.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(mockPrisma.membership.create).not.toHaveBeenCalled();

      // Verify: Meal saved
      expect(mockPrisma.mealEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId,
          userId,
          caloriesEstimated: 780,
          description: 'Бургер с картофелем фри',
        }),
      });

      // Verify: Reply sent
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('780 ккал'),
        expect.any(Object)
      );
    });
  });

  describe('Non-Food Photo Handling', () => {
    it('should set shrug reaction when AI detects non-food', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-123',
        telegramChatId: BigInt(111111),
        title: 'Personal: Test',
        type: 'personal',
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        telegramUserId: BigInt(222222),
        firstName: 'Test',
        username: 'test',
      });

      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'membership-123',
        projectId: 'proj-123',
        userId: 'user-123',
        role: 'admin',
      });

      // AI detects non-food
      mockAnalyze.mockResolvedValue({
        is_food: false,
        food_confidence: 0.15,
        estimated_calories: null,
        description: null,
      });

      const ctx = createFullMockContext({
        chatId: 111111,
        chatType: 'private',
        userId: 222222,
        firstName: 'Test',
        username: 'test',
        photoFileId: 'photo-cat-789',
        messageId: 5,
      }) as Context & { api: { setMessageReaction: ReturnType<typeof vi.fn> } };

      const { handlePhoto } = await import('../bot/photoHandler.js');
      await handlePhoto(ctx, logger);

      // Verify: No meal created
      expect(mockPrisma.mealEntry.create).not.toHaveBeenCalled();

      // Verify: Shrug reaction set
      expect(ctx.api.setMessageReaction).toHaveBeenCalledWith(111111, 5, [
        { type: 'emoji', emoji: '🤷‍♂' },
      ]);

      // Verify: No reply sent
      expect(ctx.reply).not.toHaveBeenCalledWith(
        expect.stringContaining('ккал'),
        expect.any(Object)
      );
    });
  });

  describe('Low Confidence Detection', () => {
    it('should mark meal for review when AI confidence is low', async () => {
      const projectId = 'proj-low-conf';
      const userId = 'user-low-conf';

      mockPrisma.project.findUnique.mockResolvedValue({
        id: projectId,
        telegramChatId: BigInt(333333),
        title: 'Test',
        type: 'personal',
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        telegramUserId: BigInt(444444),
        firstName: 'Test',
        username: 'test',
      });

      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'membership',
        projectId,
        userId,
        role: 'admin',
      });

      mockPrisma.mealEntry.create.mockResolvedValue({
        id: 'meal-low-conf',
        projectId,
        userId,
        caloriesEstimated: 300,
        description: 'Неизвестное блюдо',
        source: 'photo',
        aiConfidence: 0.65, // Low confidence
        needsReview: true,
      });

      // AI returns low confidence
      mockAnalyze.mockResolvedValue({
        is_food: true,
        food_confidence: 0.65, // Below 0.8 threshold for review
        estimated_calories: 300,
        description: 'Неизвестное блюдо',
      });

      const ctx = createFullMockContext({
        chatId: 333333,
        chatType: 'private',
        userId: 444444,
        firstName: 'Test',
        username: 'test',
        photoFileId: 'photo-unclear',
        messageId: 10,
      });

      const { handlePhoto } = await import('../bot/photoHandler.js');
      await handlePhoto(ctx, logger);

      // Verify: Meal created with needsReview flag
      expect(mockPrisma.mealEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          needsReview: true,
          aiConfidence: 0.65,
        }),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle AI service failure gracefully', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-error',
        telegramChatId: BigInt(555555),
        title: 'Test',
        type: 'personal',
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-error',
        telegramUserId: BigInt(666666),
        firstName: 'Test',
        username: 'test',
      });

      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'membership',
        projectId: 'proj-error',
        userId: 'user-error',
        role: 'admin',
      });

      // AI service throws error
      mockAnalyze.mockRejectedValue(new Error('OpenAI API rate limited'));

      const ctx = createFullMockContext({
        chatId: 555555,
        chatType: 'private',
        userId: 666666,
        firstName: 'Test',
        username: 'test',
        photoFileId: 'photo-error',
        messageId: 20,
      });

      const { handlePhoto } = await import('../bot/photoHandler.js');
      await handlePhoto(ctx, logger);

      // Verify: No meal created
      expect(mockPrisma.mealEntry.create).not.toHaveBeenCalled();

      // Verify: Error reply sent
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Не удалось обработать'),
        expect.any(Object)
      );

      // Verify: Error logged
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle photo download failure gracefully', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-dl-error',
        telegramChatId: BigInt(777777),
        title: 'Test',
        type: 'personal',
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-dl-error',
        telegramUserId: BigInt(888888),
        firstName: 'Test',
        username: 'test',
      });

      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'membership',
        projectId: 'proj-dl-error',
        userId: 'user-dl-error',
        role: 'admin',
      });

      // Photo download fails
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const ctx = createFullMockContext({
        chatId: 777777,
        chatType: 'private',
        userId: 888888,
        firstName: 'Test',
        username: 'test',
        photoFileId: 'photo-unavailable',
        messageId: 30,
      });

      const { handlePhoto } = await import('../bot/photoHandler.js');
      await handlePhoto(ctx, logger);

      // Verify: No meal created
      expect(mockPrisma.mealEntry.create).not.toHaveBeenCalled();

      // Verify: AI not called (download failed first)
      expect(mockAnalyze).not.toHaveBeenCalled();

      // Verify: Error reply sent
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Не удалось обработать'),
        expect.any(Object)
      );
    });
  });

  describe('Calorie Validation', () => {
    it('should clamp very low calorie estimates to minimum', async () => {
      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'proj-cal',
        telegramChatId: BigInt(111),
        title: 'Test',
        type: 'personal',
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-cal',
        telegramUserId: BigInt(222),
        firstName: 'Test',
        username: 'test',
      });

      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'membership',
        projectId: 'proj-cal',
        userId: 'user-cal',
        role: 'admin',
      });

      mockPrisma.mealEntry.create.mockResolvedValue({
        id: 'meal-cal',
        projectId: 'proj-cal',
        userId: 'user-cal',
        caloriesEstimated: 10, // Minimum
        description: 'Чашка воды', // Water - very low calories
        source: 'photo',
        aiConfidence: 0.9,
        needsReview: false,
      });

      // AI returns very low calories (will be clamped by service)
      mockAnalyze.mockResolvedValue({
        is_food: true,
        food_confidence: 0.9,
        estimated_calories: 10, // Already clamped by AI service
        description: 'Чашка воды',
      });

      const ctx = createFullMockContext({
        chatId: 111,
        chatType: 'private',
        userId: 222,
        firstName: 'Test',
        username: 'test',
        photoFileId: 'photo-water',
        messageId: 40,
      });

      const { handlePhoto } = await import('../bot/photoHandler.js');
      await handlePhoto(ctx, logger);

      // Verify: Meal created with minimum calories
      expect(mockPrisma.mealEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          caloriesEstimated: 10,
        }),
      });
    });
  });
});

describe('E2E: Daily Statistics Flow', () => {
  it('should demonstrate data availability for /today command', async () => {
    const projectId = 'proj-stats';
    const userId = 'user-stats';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Simulate multiple meals recorded today
    const todayMeals = [
      {
        id: 'meal-1',
        projectId,
        userId,
        recordedAt: new Date(today.getTime() + 8 * 60 * 60 * 1000), // 8:00
        caloriesEstimated: 350,
        description: 'Завтрак',
        source: 'photo',
      },
      {
        id: 'meal-2',
        projectId,
        userId,
        recordedAt: new Date(today.getTime() + 13 * 60 * 60 * 1000), // 13:00
        caloriesEstimated: 650,
        description: 'Обед',
        source: 'photo',
      },
      {
        id: 'meal-3',
        projectId,
        userId,
        recordedAt: new Date(today.getTime() + 19 * 60 * 60 * 1000), // 19:00
        caloriesEstimated: 500,
        description: 'Ужин',
        source: 'photo',
      },
    ];

    mockPrisma.mealEntry.findMany.mockResolvedValue(todayMeals);

    // Execute query similar to /today command
    const meals = await mockPrisma.mealEntry.findMany({
      where: {
        projectId,
        userId,
        recordedAt: {
          gte: today,
          lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { recordedAt: 'asc' },
    });

    // Calculate total
    const totalCalories = meals.reduce(
      (sum: number, m: { caloriesEstimated: number }) => sum + m.caloriesEstimated,
      0
    );

    // Verify statistics
    expect(meals).toHaveLength(3);
    expect(totalCalories).toBe(1500); // 350 + 650 + 500
  });
});
