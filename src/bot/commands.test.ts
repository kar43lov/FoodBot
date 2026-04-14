/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma before importing anything else
vi.mock('../db/index.js', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    mealEntry: {
      findMany: vi.fn(),
    },
    userGoal: {
      findUnique: vi.fn(),
    },
  },
  MembershipRole: {
    MEMBER: 'member',
    ADMIN: 'admin',
  },
  ProjectType: {
    GROUP: 'group',
    PERSONAL: 'personal',
  },
}));

// Mock photoHandler
vi.mock('./photoHandler.js', () => ({
  upsertProject: vi.fn(),
  upsertUser: vi.fn(),
  upsertMembership: vi.fn(),
}));

// Mock nutrition
vi.mock('./nutrition.js', () => ({
  getUserNorms: vi.fn().mockResolvedValue({ calories: 2000, protein: 60, fat: 70, carbs: 250 }),
  DAILY_NORMS: { calories: 2000, protein: 60, fat: 70, carbs: 250 },
}));

// Mock accessControl
vi.mock('./accessControl.js', () => ({
  getAccessControl: vi.fn(() => ({
    isSuperAdmin: vi.fn().mockReturnValue(false),
    isManager: vi.fn().mockReturnValue(false),
    isUserAllowed: vi.fn().mockReturnValue(true),
    isChatAllowed: vi.fn().mockReturnValue(true),
  })),
}));

import { prisma, MembershipRole } from '../db/index.js';
import { upsertProject, upsertUser, upsertMembership } from './photoHandler.js';

function createMockContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    from: { id: 123456, first_name: 'Test', username: 'testuser' },
    chat: { id: 789, type: 'private' },
    message: { text: '' },
    reply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('Bot Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleStartCommand', () => {
    it('should send welcome message with user name', async () => {
      const { handleStartCommand } = await import('./commands.js');
      const ctx = createMockContext({
        from: { id: 123, first_name: 'Иван', username: 'ivan' },
      });

      await handleStartCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Привет, Иван!'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('фото еды'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/help'));
    });

    it('should use default name if first_name is not available', async () => {
      const { handleStartCommand } = await import('./commands.js');
      const ctx = createMockContext({
        from: undefined,
      });

      await handleStartCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Привет, Пользователь!'));
    });
  });

  describe('handleHelpCommand', () => {
    it('should list all available commands', async () => {
      const { handleHelpCommand } = await import('./commands.js');
      const ctx = createMockContext();

      await handleHelpCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/start'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/help'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/today'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/myweek'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/project'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/setadmin'));
    });
  });

  describe('handleTodayCommand', () => {
    it('should show message when no project exists', async () => {
      const { handleTodayCommand } = await import('./commands.js');
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
      const ctx = createMockContext();

      await handleTodayCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Пока нет записей'));
    });

    it('should show message when no entries for today', async () => {
      const { handleTodayCommand } = await import('./commands.js');
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'proj-1',
        telegramChatId: BigInt(789),
        title: 'Test Project',
        type: 'personal',
        createdAt: new Date(),
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        telegramUserId: BigInt(123456),
        firstName: 'Test',
        username: 'testuser',
        createdAt: new Date(),
      });
      vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([]);
      const ctx = createMockContext();

      await handleTodayCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Сегодня записей нет'));
    });

    it('should show statistics when entries exist', async () => {
      const { handleTodayCommand } = await import('./commands.js');
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'proj-1',
        telegramChatId: BigInt(789),
        title: 'Test Project',
        type: 'personal',
        createdAt: new Date(),
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        telegramUserId: BigInt(123456),
        firstName: 'Test',
        username: 'testuser',
        createdAt: new Date(),
      });
      vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([
        {
          id: 'entry-1',
          projectId: 'proj-1',
          userId: 'user-1',
          recordedAt: new Date(),
          caloriesEstimated: 500,
          description: 'Завтрак',
          source: 'photo',
          photoFileId: null,
          aiConfidence: 0.9,
          needsReview: false,
          protein: null,
          fat: null,
          carbs: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'entry-2',
          projectId: 'proj-1',
          userId: 'user-1',
          recordedAt: new Date(),
          caloriesEstimated: 700,
          description: 'Обед',
          source: 'photo',
          photoFileId: null,
          aiConfidence: 0.85,
          needsReview: false,
          protein: null,
          fat: null,
          carbs: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      const ctx = createMockContext();

      await handleTodayCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Статистика за сегодня'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('500 ккал'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('700 ккал'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Всего: 1200 ккал'));
    });

    it('should handle missing chat or user gracefully', async () => {
      const { handleTodayCommand } = await import('./commands.js');
      const ctx = createMockContext({ chat: undefined });

      await handleTodayCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Не удалось определить'));
    });
  });

  describe('handleMyWeekCommand', () => {
    it('should show message when no project exists', async () => {
      const { handleMyWeekCommand } = await import('./commands.js');
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
      const ctx = createMockContext();

      await handleMyWeekCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Пока нет записей'));
    });

    it('should show weekly statistics with daily breakdown', async () => {
      const { handleMyWeekCommand } = await import('./commands.js');
      const monday = new Date();
      monday.setDate(monday.getDate() - monday.getDay() + 1); // Set to Monday
      monday.setHours(12, 0, 0, 0);

      const tuesday = new Date(monday);
      tuesday.setDate(tuesday.getDate() + 1);

      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'proj-1',
        telegramChatId: BigInt(789),
        title: 'Test Project',
        type: 'personal',
        createdAt: new Date(),
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'user-1',
        telegramUserId: BigInt(123456),
        firstName: 'Test',
        username: 'testuser',
        createdAt: new Date(),
      });
      vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([
        {
          id: 'entry-1',
          projectId: 'proj-1',
          userId: 'user-1',
          recordedAt: monday,
          caloriesEstimated: 2000,
          description: null,
          source: 'photo',
          photoFileId: null,
          aiConfidence: 0.9,
          needsReview: false,
          protein: null,
          fat: null,
          carbs: null,
          createdAt: monday,
          updatedAt: monday,
        },
        {
          id: 'entry-2',
          projectId: 'proj-1',
          userId: 'user-1',
          recordedAt: tuesday,
          caloriesEstimated: 1800,
          description: null,
          source: 'photo',
          photoFileId: null,
          aiConfidence: 0.85,
          needsReview: false,
          protein: null,
          fat: null,
          carbs: null,
          createdAt: tuesday,
          updatedAt: tuesday,
        },
      ]);
      const ctx = createMockContext();

      await handleMyWeekCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Статистика за неделю'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Всего: 3800 ккал'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Всего записей: 2'));
    });
  });

  describe('handleProjectCommand', () => {
    it('should show message when no project exists', async () => {
      const { handleProjectCommand } = await import('./commands.js');
      vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
      const ctx = createMockContext();

      await handleProjectCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Проект ещё не создан'));
    });

    it('should show project information', async () => {
      const { handleProjectCommand } = await import('./commands.js');
      vi.mocked(prisma.project.findUnique).mockResolvedValue({
        id: 'proj-1',
        telegramChatId: BigInt(789),
        title: 'My Food Group',
        type: 'group',
        createdAt: new Date('2024-01-15'),
        memberships: [
          {
            id: 'mem-1',
            projectId: 'proj-1',
            userId: 'user-1',
            role: 'admin',
            createdAt: new Date(),
            user: {
              id: 'user-1',
              telegramUserId: BigInt(123),
              firstName: 'Admin',
              username: 'admin_user',
              createdAt: new Date(),
            },
          },
          {
            id: 'mem-2',
            projectId: 'proj-1',
            userId: 'user-2',
            role: 'member',
            createdAt: new Date(),
            user: {
              id: 'user-2',
              telegramUserId: BigInt(456),
              firstName: 'Member',
              username: 'member_user',
              createdAt: new Date(),
            },
          },
        ],
        mealEntries: [
          { id: 'e1', caloriesEstimated: 500 },
          { id: 'e2', caloriesEstimated: 700 },
        ],
      } as never);
      const ctx = createMockContext();

      await handleProjectCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('My Food Group'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Групповой'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Участников: 2'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('@admin_user'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Всего записей: 2'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('1200 ккал'));
    });
  });

  describe('handleSetAdminCommand', () => {
    it('should reject if user is not admin', async () => {
      const { handleSetAdminCommand } = await import('./commands.js');
      vi.mocked(upsertProject).mockResolvedValue({ id: 'proj-1', isNew: false });
      vi.mocked(upsertUser).mockResolvedValue({ id: 'user-1', isNew: false });
      vi.mocked(upsertMembership).mockResolvedValue({ id: 'mem-1', role: 'member', isNew: false });

      const ctx = createMockContext({
        message: { text: '/setadmin @newadmin' },
      });

      await handleSetAdminCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Только админы'));
    });

    it('should show usage if no username provided', async () => {
      const { handleSetAdminCommand } = await import('./commands.js');
      vi.mocked(upsertProject).mockResolvedValue({ id: 'proj-1', isNew: false });
      vi.mocked(upsertUser).mockResolvedValue({ id: 'user-1', isNew: false });
      vi.mocked(upsertMembership).mockResolvedValue({ id: 'mem-1', role: 'admin', isNew: false });

      const ctx = createMockContext({
        message: { text: '/setadmin' },
      });

      await handleSetAdminCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Использование: /setadmin @username')
      );
    });

    it('should report if target user not found', async () => {
      const { handleSetAdminCommand } = await import('./commands.js');
      vi.mocked(upsertProject).mockResolvedValue({ id: 'proj-1', isNew: false });
      vi.mocked(upsertUser).mockResolvedValue({ id: 'user-1', isNew: false });
      vi.mocked(upsertMembership).mockResolvedValue({ id: 'mem-1', role: 'admin', isNew: false });
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const ctx = createMockContext({
        message: { text: '/setadmin @unknown_user' },
      });

      await handleSetAdminCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('@unknown_user не найден'));
    });

    it('should report if target is not a project member', async () => {
      const { handleSetAdminCommand } = await import('./commands.js');
      vi.mocked(upsertProject).mockResolvedValue({ id: 'proj-1', isNew: false });
      vi.mocked(upsertUser).mockResolvedValue({ id: 'user-1', isNew: false });
      vi.mocked(upsertMembership).mockResolvedValue({ id: 'mem-1', role: 'admin', isNew: false });
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'user-2',
        telegramUserId: BigInt(456),
        firstName: 'Target',
        username: 'target_user',
        createdAt: new Date(),
      });
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);

      const ctx = createMockContext({
        message: { text: '/setadmin @target_user' },
      });

      await handleSetAdminCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('не является участником'));
    });

    it('should report if target is already admin', async () => {
      const { handleSetAdminCommand } = await import('./commands.js');
      vi.mocked(upsertProject).mockResolvedValue({ id: 'proj-1', isNew: false });
      vi.mocked(upsertUser).mockResolvedValue({ id: 'user-1', isNew: false });
      vi.mocked(upsertMembership).mockResolvedValue({ id: 'mem-1', role: 'admin', isNew: false });
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'user-2',
        telegramUserId: BigInt(456),
        firstName: 'Target',
        username: 'target_user',
        createdAt: new Date(),
      });
      vi.mocked(prisma.membership.findUnique).mockResolvedValue({
        id: 'mem-2',
        projectId: 'proj-1',
        userId: 'user-2',
        role: MembershipRole.ADMIN,
        createdAt: new Date(),
      });

      const ctx = createMockContext({
        message: { text: '/setadmin @target_user' },
      });

      await handleSetAdminCommand(ctx as never);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('уже является админом'));
    });

    it('should successfully set new admin', async () => {
      const { handleSetAdminCommand } = await import('./commands.js');
      vi.mocked(upsertProject).mockResolvedValue({ id: 'proj-1', isNew: false });
      vi.mocked(upsertUser).mockResolvedValue({ id: 'user-1', isNew: false });
      vi.mocked(upsertMembership).mockResolvedValue({ id: 'mem-1', role: 'admin', isNew: false });
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'user-2',
        telegramUserId: BigInt(456),
        firstName: 'Target',
        username: 'target_user',
        createdAt: new Date(),
      });
      vi.mocked(prisma.membership.findUnique).mockResolvedValue({
        id: 'mem-2',
        projectId: 'proj-1',
        userId: 'user-2',
        role: MembershipRole.MEMBER,
        createdAt: new Date(),
      });
      vi.mocked(prisma.membership.update).mockResolvedValue({
        id: 'mem-2',
        projectId: 'proj-1',
        userId: 'user-2',
        role: MembershipRole.ADMIN,
        createdAt: new Date(),
      });

      const ctx = createMockContext({
        message: { text: '/setadmin @target_user' },
      });

      await handleSetAdminCommand(ctx as never);

      expect(prisma.membership.update).toHaveBeenCalledWith({
        where: { id: 'mem-2' },
        data: { role: MembershipRole.ADMIN },
      });
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('@target_user назначен админом')
      );
    });
  });
});
