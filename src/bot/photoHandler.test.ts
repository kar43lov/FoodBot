/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import type { Context } from 'grammy';

// Mock Prisma
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

function createMockContext(
  overrides: Partial<{
    chatId: number;
    chatType: string;
    chatTitle?: string;
    userId: number;
    firstName: string;
    username?: string;
    photoFileId?: string;
    messageId: number;
  }> = {}
): Context {
  const defaults = {
    chatId: 123456,
    chatType: 'private',
    userId: 789,
    firstName: 'Test',
    username: 'testuser',
    photoFileId: 'photo123',
    messageId: 1,
  };

  const opts = { ...defaults, ...overrides };

  const mockApi = {
    getFile: vi.fn().mockResolvedValue({ file_path: 'photos/test.jpg' }),
    setMessageReaction: vi.fn().mockResolvedValue(true),
    token: 'test-token',
  };

  return {
    chat: {
      id: opts.chatId,
      type: opts.chatType as 'private' | 'group' | 'supergroup',
      ...(opts.chatTitle ? { title: opts.chatTitle } : {}),
    },
    from: {
      id: opts.userId,
      first_name: opts.firstName,
      username: opts.username,
      is_bot: false,
    },
    message: {
      message_id: opts.messageId,
      date: Date.now(),
      chat: { id: opts.chatId, type: opts.chatType as 'private' },
      photo: opts.photoFileId
        ? [
            { file_id: 'small', file_unique_id: 's1', width: 100, height: 100 },
            { file_id: opts.photoFileId, file_unique_id: 'u1', width: 800, height: 600 },
          ]
        : undefined,
    },
    api: mockApi,
    reply: vi.fn().mockResolvedValue({}),
  } as unknown as Context;
}

describe('Photo Handler Module', () => {
  let logger: pino.Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();

    // Reset fetch mock
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000)),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getChatType', () => {
    it('should return personal for private chat', async () => {
      const { getChatType } = await import('./photoHandler.js');
      const ctx = createMockContext({ chatType: 'private' });

      expect(getChatType(ctx)).toBe('personal');
    });

    it('should return group for group chat', async () => {
      const { getChatType } = await import('./photoHandler.js');
      const ctx = createMockContext({ chatType: 'group' });

      expect(getChatType(ctx)).toBe('group');
    });

    it('should return group for supergroup chat', async () => {
      const { getChatType } = await import('./photoHandler.js');
      const ctx = createMockContext({ chatType: 'supergroup' });

      expect(getChatType(ctx)).toBe('group');
    });
  });

  describe('upsertProject', () => {
    it('should create new project if not exists', async () => {
      const { upsertProject } = await import('./photoHandler.js');

      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.project.create.mockResolvedValue({
        id: 'project-123',
        telegramChatId: BigInt(123456),
        title: 'Personal: Test',
        type: 'personal',
      });

      const ctx = createMockContext({ chatType: 'private', firstName: 'Test' });
      const result = await upsertProject(ctx);

      expect(result.isNew).toBe(true);
      expect(result.id).toBe('project-123');
      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: {
          telegramChatId: BigInt(123456),
          title: 'Personal: Test',
          type: 'personal',
        },
      });
    });

    it('should return existing project', async () => {
      const { upsertProject } = await import('./photoHandler.js');

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'existing-project',
        telegramChatId: BigInt(123456),
        title: 'Personal: Test',
        type: 'personal',
      });

      const ctx = createMockContext();
      const result = await upsertProject(ctx);

      expect(result.isNew).toBe(false);
      expect(result.id).toBe('existing-project');
      expect(mockPrisma.project.create).not.toHaveBeenCalled();
    });

    it('should update title if changed', async () => {
      const { upsertProject } = await import('./photoHandler.js');

      mockPrisma.project.findUnique.mockResolvedValue({
        id: 'existing-project',
        telegramChatId: BigInt(123456),
        title: 'Old Title',
        type: 'personal',
      });

      const ctx = createMockContext({ firstName: 'NewName' });
      await upsertProject(ctx);

      expect(mockPrisma.project.update).toHaveBeenCalledWith({
        where: { id: 'existing-project' },
        data: { title: 'Personal: NewName' },
      });
    });

    it('should use group title for group chats', async () => {
      const { upsertProject } = await import('./photoHandler.js');

      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.project.create.mockResolvedValue({
        id: 'project-123',
        telegramChatId: BigInt(123456),
        title: 'Test Group',
        type: 'group',
      });

      const ctx = createMockContext({ chatType: 'group', chatTitle: 'Test Group' });
      await upsertProject(ctx);

      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: {
          telegramChatId: BigInt(123456),
          title: 'Test Group',
          type: 'group',
        },
      });
    });
  });

  describe('upsertUser', () => {
    it('should create new user if not exists', async () => {
      const { upsertUser } = await import('./photoHandler.js');

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-123',
        telegramUserId: BigInt(789),
        firstName: 'Test',
        username: 'testuser',
      });

      const ctx = createMockContext();
      const result = await upsertUser(ctx);

      expect(result.isNew).toBe(true);
      expect(result.id).toBe('user-123');
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          telegramUserId: BigInt(789),
          firstName: 'Test',
          username: 'testuser',
        },
      });
    });

    it('should return existing user', async () => {
      const { upsertUser } = await import('./photoHandler.js');

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        telegramUserId: BigInt(789),
        firstName: 'Test',
        username: 'testuser',
      });

      const ctx = createMockContext();
      const result = await upsertUser(ctx);

      expect(result.isNew).toBe(false);
      expect(result.id).toBe('existing-user');
    });

    it('should update user info if changed', async () => {
      const { upsertUser } = await import('./photoHandler.js');

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'existing-user',
        telegramUserId: BigInt(789),
        firstName: 'OldName',
        username: 'olduser',
      });

      const ctx = createMockContext({ firstName: 'NewName', username: 'newuser' });
      await upsertUser(ctx);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'existing-user' },
        data: { firstName: 'NewName', username: 'newuser' },
      });
    });
  });

  describe('upsertMembership', () => {
    it('should create admin membership for new project', async () => {
      const { upsertMembership } = await import('./photoHandler.js');

      mockPrisma.membership.findUnique.mockResolvedValue(null);
      mockPrisma.membership.create.mockResolvedValue({
        id: 'membership-123',
        projectId: 'project-1',
        userId: 'user-1',
        role: 'admin',
      });

      const result = await upsertMembership('project-1', 'user-1', true);

      expect(result.isNew).toBe(true);
      expect(result.role).toBe('admin');
    });

    it('should create member membership for existing project with members', async () => {
      const { upsertMembership } = await import('./photoHandler.js');

      mockPrisma.membership.findUnique.mockResolvedValue(null);
      mockPrisma.membership.count.mockResolvedValue(1);
      mockPrisma.membership.create.mockResolvedValue({
        id: 'membership-123',
        projectId: 'project-1',
        userId: 'user-2',
        role: 'member',
      });

      const result = await upsertMembership('project-1', 'user-2', false);

      expect(result.isNew).toBe(true);
      expect(result.role).toBe('member');
    });

    it('should return existing membership', async () => {
      const { upsertMembership } = await import('./photoHandler.js');

      mockPrisma.membership.findUnique.mockResolvedValue({
        id: 'existing-membership',
        projectId: 'project-1',
        userId: 'user-1',
        role: 'admin',
      });

      const result = await upsertMembership('project-1', 'user-1', false);

      expect(result.isNew).toBe(false);
      expect(result.role).toBe('admin');
    });
  });

  describe('downloadPhoto', () => {
    it('should download photo from Telegram', async () => {
      const { downloadPhoto } = await import('./photoHandler.js');

      const ctx = createMockContext() as Context & {
        api: { getFile: ReturnType<typeof vi.fn>; token: string };
      };
      const buffer = await downloadPhoto(ctx);

      expect(ctx.api.getFile).toHaveBeenCalledWith('photo123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.telegram.org/file/bottest-token/photos/test.jpg'
      );
      expect(buffer).toBeInstanceOf(Buffer);
    });

    it('should throw error if no photo in message', async () => {
      const { downloadPhoto } = await import('./photoHandler.js');

      const ctx = createMockContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).message.photo = undefined;

      await expect(downloadPhoto(ctx)).rejects.toThrow('No photo in message');
    });
  });

  describe('handlePhoto', () => {
    it('should process food photo and create meal entry', async () => {
      const { handlePhoto } = await import('./photoHandler.js');

      // Setup mocks
      mockPrisma.project.findUnique.mockResolvedValue(null);
      mockPrisma.project.create.mockResolvedValue({ id: 'project-1' });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'user-1' });
      mockPrisma.membership.findUnique.mockResolvedValue(null);
      mockPrisma.membership.create.mockResolvedValue({ id: 'm-1', role: 'admin' });
      mockPrisma.mealEntry.create.mockResolvedValue({
        id: 'entry-1',
        caloriesEstimated: 500,
      });

      mockAnalyze.mockResolvedValue({
        is_food: true,
        food_confidence: 0.9,
        estimated_calories: 500,
        description: 'Pasta with tomato sauce',
      });

      const ctx = createMockContext();

      await handlePhoto(ctx, logger);

      // Should create meal entry
      expect(mockPrisma.mealEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: 'project-1',
          userId: 'user-1',
          caloriesEstimated: 500,
          description: 'Pasta with tomato sauce',
          source: 'photo',
          aiConfidence: 0.9,
        }),
      });

      // Should reply with calories
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('500 ккал'),
        expect.objectContaining({
          reply_parameters: { message_id: 1 },
        })
      );
    });

    it('should set shrug reaction for non-food photo', async () => {
      const { handlePhoto } = await import('./photoHandler.js');

      // Setup mocks
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project-1', title: 'Test' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        firstName: 'Test',
        username: 'test',
      });
      mockPrisma.membership.findUnique.mockResolvedValue({ id: 'm-1', role: 'admin' });

      mockAnalyze.mockResolvedValue({
        is_food: false,
        food_confidence: 0.2,
        estimated_calories: null,
        description: null,
      });

      const ctx = createMockContext() as Context & {
        api: { setMessageReaction: ReturnType<typeof vi.fn> };
      };

      await handlePhoto(ctx, logger);

      // Should NOT create meal entry
      expect(mockPrisma.mealEntry.create).not.toHaveBeenCalled();

      // Should set shrug reaction
      expect(ctx.api.setMessageReaction).toHaveBeenCalledWith(123456, 1, [
        { type: 'emoji', emoji: '🤷‍♂' },
      ]);
    });

    it('should handle AI errors gracefully', async () => {
      const { handlePhoto } = await import('./photoHandler.js');

      // Setup mocks
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project-1', title: 'Test' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        firstName: 'Test',
        username: 'test',
      });
      mockPrisma.membership.findUnique.mockResolvedValue({ id: 'm-1', role: 'admin' });

      mockAnalyze.mockRejectedValue(new Error('AI service unavailable'));

      const ctx = createMockContext();

      // Should not throw
      await handlePhoto(ctx, logger);

      // Should reply with error message
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Не удалось обработать'),
        expect.any(Object)
      );

      // Should log error
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle download errors gracefully', async () => {
      const { handlePhoto } = await import('./photoHandler.js');

      // Setup mocks
      mockPrisma.project.findUnique.mockResolvedValue({ id: 'project-1', title: 'Test' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        firstName: 'Test',
        username: 'test',
      });
      mockPrisma.membership.findUnique.mockResolvedValue({ id: 'm-1', role: 'admin' });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const ctx = createMockContext();

      await handlePhoto(ctx, logger);

      // Should reply with error message
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Не удалось обработать'),
        expect.any(Object)
      );
    });
  });

  describe('getPhotoFileId', () => {
    it('should return largest photo file_id', async () => {
      const { getPhotoFileId } = await import('./photoHandler.js');

      const ctx = createMockContext({ photoFileId: 'large-photo-id' });
      const fileId = getPhotoFileId(ctx);

      expect(fileId).toBe('large-photo-id');
    });

    it('should return null if no photos', async () => {
      const { getPhotoFileId } = await import('./photoHandler.js');

      const ctx = createMockContext();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (ctx as any).message.photo = undefined;

      const fileId = getPhotoFileId(ctx);
      expect(fileId).toBeNull();
    });
  });

  describe('createMealEntry', () => {
    it('should create meal entry with correct data', async () => {
      const { createMealEntry } = await import('./photoHandler.js');

      mockPrisma.mealEntry.create.mockResolvedValue({
        id: 'entry-1',
        caloriesEstimated: 350,
      });

      const result = await createMealEntry(
        'project-1',
        'user-1',
        {
          is_food: true,
          food_confidence: 0.85,
          estimated_calories: 350,
          description: 'Salad',
        },
        'photo-file-id'
      );

      expect(result.calories).toBe(350);
      expect(mockPrisma.mealEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: 'project-1',
          userId: 'user-1',
          caloriesEstimated: 350,
          description: 'Salad',
          source: 'photo',
          photoFileId: 'photo-file-id',
          aiConfidence: 0.85,
          needsReview: false, // confidence >= 0.8
        }),
      });
    });

    it('should mark entry for review if low confidence', async () => {
      const { createMealEntry } = await import('./photoHandler.js');

      mockPrisma.mealEntry.create.mockResolvedValue({
        id: 'entry-1',
        caloriesEstimated: 200,
      });

      await createMealEntry(
        'project-1',
        'user-1',
        {
          is_food: true,
          food_confidence: 0.65,
          estimated_calories: 200,
          description: 'Unknown dish',
        },
        null
      );

      expect(mockPrisma.mealEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          needsReview: true, // confidence < 0.8
        }),
      });
    });
  });
});
