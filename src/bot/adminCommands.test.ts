import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handleAllowChatCommand,
  handleDenyChatCommand,
  handleAllowUserCommand,
  handleDenyUserCommand,
  handleSetManagerCommand,
  handleRemoveManagerCommand,
  handleListAllowedCommand,
} from './adminCommands.js';

// Mock accessControl
const mockAc = {
  isSuperAdmin: vi.fn(),
  isManager: vi.fn(),
  addChat: vi.fn(),
  removeChat: vi.fn(),
  addUser: vi.fn(),
  removeUser: vi.fn(),
  addManager: vi.fn(),
  removeManager: vi.fn(),
  isChatAllowed: vi.fn(),
  isUserAllowed: vi.fn(),
};

vi.mock('./accessControl.js', () => ({
  getAccessControl: vi.fn(() => mockAc),
  AccessControl: vi.fn(),
  resetAccessControl: vi.fn(),
}));

// Mock prisma
vi.mock('../db/index.js', () => ({
  prisma: {
    allowedChat: { findMany: vi.fn(), findUnique: vi.fn() },
    allowedUser: { findMany: vi.fn(), findUnique: vi.fn() },
    manager: { findMany: vi.fn(), findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
  },
}));

import { prisma } from '../db/index.js';

function createMockCtx(overrides: {
  chatId?: number;
  chatType?: string;
  chatTitle?: string;
  userId?: number;
  messageText?: string;
} = {}) {
  return {
    chat: overrides.chatId !== undefined
      ? { id: overrides.chatId, type: overrides.chatType ?? 'private', title: overrides.chatTitle }
      : undefined,
    from: overrides.userId !== undefined ? { id: overrides.userId } : undefined,
    message: overrides.messageText !== undefined ? { text: overrides.messageText } : undefined,
    reply: vi.fn(),
  } as any;
}

describe('Admin Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleAllowChatCommand', () => {
    it('should add current group when called from group by superadmin', async () => {
      const ctx = createMockCtx({
        chatId: -100111,
        chatType: 'group',
        chatTitle: 'Test Group',
        userId: 999,
        messageText: '/allowchat',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isChatAllowed.mockReturnValue(false);

      await handleAllowChatCommand(ctx);

      expect(mockAc.addChat).toHaveBeenCalledWith(BigInt(-100111), 'Test Group', BigInt(999));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('добавлена'));
    });

    it('should add chat by ID from private by superadmin', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/allowchat -100222',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isChatAllowed.mockReturnValue(false);

      await handleAllowChatCommand(ctx);

      expect(mockAc.addChat).toHaveBeenCalledWith(BigInt(-100222), null, BigInt(999));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('добавлена'));
    });

    it('should allow manager to add chat', async () => {
      const ctx = createMockCtx({
        chatId: -100333,
        chatType: 'group',
        chatTitle: 'Manager Group',
        userId: 333,
        messageText: '/allowchat',
      });
      mockAc.isSuperAdmin.mockReturnValue(false);
      mockAc.isManager.mockReturnValue(true);
      mockAc.isChatAllowed.mockReturnValue(false);

      await handleAllowChatCommand(ctx);

      expect(mockAc.addChat).toHaveBeenCalled();
    });

    it('should deny non-admin/non-manager', async () => {
      const ctx = createMockCtx({
        chatId: -100111,
        chatType: 'group',
        userId: 555,
        messageText: '/allowchat',
      });
      mockAc.isSuperAdmin.mockReturnValue(false);
      mockAc.isManager.mockReturnValue(false);

      await handleAllowChatCommand(ctx);

      expect(mockAc.addChat).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('нет прав'));
    });

    it('should inform if chat already allowed', async () => {
      const ctx = createMockCtx({
        chatId: -100111,
        chatType: 'group',
        userId: 999,
        messageText: '/allowchat',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isChatAllowed.mockReturnValue(true);

      await handleAllowChatCommand(ctx);

      expect(mockAc.addChat).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('уже'));
    });
  });

  describe('handleDenyChatCommand', () => {
    it('should remove current group by superadmin', async () => {
      const ctx = createMockCtx({
        chatId: -100111,
        chatType: 'group',
        userId: 999,
        messageText: '/denychat',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isChatAllowed.mockReturnValue(true);

      await handleDenyChatCommand(ctx);

      expect(mockAc.removeChat).toHaveBeenCalledWith(BigInt(-100111));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('удалена'));
    });

    it('should remove chat by ID from private', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/denychat -100222',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isChatAllowed.mockReturnValue(true);

      await handleDenyChatCommand(ctx);

      expect(mockAc.removeChat).toHaveBeenCalledWith(BigInt(-100222));
    });

    it('should deny non-admin/non-manager', async () => {
      const ctx = createMockCtx({
        chatId: -100111,
        chatType: 'group',
        userId: 555,
        messageText: '/denychat',
      });
      mockAc.isSuperAdmin.mockReturnValue(false);
      mockAc.isManager.mockReturnValue(false);

      await handleDenyChatCommand(ctx);

      expect(mockAc.removeChat).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('нет прав'));
    });

    it('should inform if chat not in whitelist', async () => {
      const ctx = createMockCtx({
        chatId: -100111,
        chatType: 'group',
        userId: 999,
        messageText: '/denychat',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isChatAllowed.mockReturnValue(false);

      await handleDenyChatCommand(ctx);

      expect(mockAc.removeChat).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('не найдена'));
    });
  });

  describe('handleAllowUserCommand', () => {
    it('should add user by numeric ID', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/allowuser 444555666',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isUserAllowed.mockReturnValue(false);

      await handleAllowUserCommand(ctx);

      expect(mockAc.addUser).toHaveBeenCalledWith(BigInt(444555666), BigInt(999));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('добавлен'));
    });

    it('should add user by @username found in DB', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/allowuser @testuser',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isUserAllowed.mockReturnValue(false);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: '1',
        telegramUserId: BigInt(777888),
        firstName: 'Test',
        username: 'testuser',
        createdAt: new Date(),
      });

      await handleAllowUserCommand(ctx);

      expect(mockAc.addUser).toHaveBeenCalledWith(BigInt(777888), BigInt(999));
    });

    it('should report error when @username not found in DB', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/allowuser @unknown',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      await handleAllowUserCommand(ctx);

      expect(mockAc.addUser).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('не найден'));
    });

    it('should deny non-admin/non-manager', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 555,
        messageText: '/allowuser 123',
      });
      mockAc.isSuperAdmin.mockReturnValue(false);
      mockAc.isManager.mockReturnValue(false);

      await handleAllowUserCommand(ctx);

      expect(mockAc.addUser).not.toHaveBeenCalled();
    });

    it('should inform if user already allowed', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/allowuser 444',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isUserAllowed.mockReturnValue(true);

      await handleAllowUserCommand(ctx);

      expect(mockAc.addUser).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('уже'));
    });
  });

  describe('handleDenyUserCommand', () => {
    it('should remove user by numeric ID', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/denyuser 444555666',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isUserAllowed.mockReturnValue(true);

      await handleDenyUserCommand(ctx);

      expect(mockAc.removeUser).toHaveBeenCalledWith(BigInt(444555666));
    });

    it('should deny non-admin/non-manager', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 555,
        messageText: '/denyuser 444',
      });
      mockAc.isSuperAdmin.mockReturnValue(false);
      mockAc.isManager.mockReturnValue(false);

      await handleDenyUserCommand(ctx);

      expect(mockAc.removeUser).not.toHaveBeenCalled();
    });

    it('should inform if user not in whitelist', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/denyuser 444',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isUserAllowed.mockReturnValue(false);

      await handleDenyUserCommand(ctx);

      expect(mockAc.removeUser).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('не найден'));
    });
  });

  describe('handleSetManagerCommand', () => {
    it('should add manager by superadmin', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/setmanager 333444',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isManager.mockReturnValue(false);

      await handleSetManagerCommand(ctx);

      expect(mockAc.addManager).toHaveBeenCalledWith(BigInt(333444), BigInt(999));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('назначен'));
    });

    it('should deny manager from adding managers', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 333,
        messageText: '/setmanager 444',
      });
      mockAc.isSuperAdmin.mockReturnValue(false);
      mockAc.isManager.mockReturnValue(true);

      await handleSetManagerCommand(ctx);

      expect(mockAc.addManager).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('суперадмин'));
    });

    it('should inform if already manager', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/setmanager 333',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isManager.mockReturnValue(true);

      await handleSetManagerCommand(ctx);

      expect(mockAc.addManager).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('уже'));
    });
  });

  describe('handleRemoveManagerCommand', () => {
    it('should remove manager by superadmin', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/removemanager 333',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      mockAc.isManager.mockImplementation((id: bigint) => id === BigInt(333));

      await handleRemoveManagerCommand(ctx);

      expect(mockAc.removeManager).toHaveBeenCalledWith(BigInt(333));
    });

    it('should deny non-superadmin', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 333,
        messageText: '/removemanager 444',
      });
      mockAc.isSuperAdmin.mockReturnValue(false);

      await handleRemoveManagerCommand(ctx);

      expect(mockAc.removeManager).not.toHaveBeenCalled();
    });
  });

  describe('handleListAllowedCommand', () => {
    it('should list all whitelists for superadmin', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/listallowed',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      vi.mocked(prisma.allowedChat.findMany).mockResolvedValue([
        { id: '1', telegramChatId: BigInt(-100111), title: 'Group 1', addedByUserId: BigInt(1), createdAt: new Date() },
      ]);
      vi.mocked(prisma.allowedUser.findMany).mockResolvedValue([
        { id: '2', telegramUserId: BigInt(222), addedByUserId: BigInt(1), createdAt: new Date() },
      ]);
      vi.mocked(prisma.manager.findMany).mockResolvedValue([
        { id: '3', telegramUserId: BigInt(333), addedByUserId: BigInt(1), createdAt: new Date() },
      ]);

      await handleListAllowedCommand(ctx);

      expect(ctx.reply).toHaveBeenCalled();
      const replyText = ctx.reply.mock.calls[0][0] as string;
      expect(replyText).toContain('-100111');
      expect(replyText).toContain('222');
      expect(replyText).toContain('333');
    });

    it('should deny non-admin/non-manager', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 555,
        messageText: '/listallowed',
      });
      mockAc.isSuperAdmin.mockReturnValue(false);
      mockAc.isManager.mockReturnValue(false);

      await handleListAllowedCommand(ctx);

      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('нет прав'));
    });

    it('should show empty lists message', async () => {
      const ctx = createMockCtx({
        chatId: 999,
        chatType: 'private',
        userId: 999,
        messageText: '/listallowed',
      });
      mockAc.isSuperAdmin.mockReturnValue(true);
      vi.mocked(prisma.allowedChat.findMany).mockResolvedValue([]);
      vi.mocked(prisma.allowedUser.findMany).mockResolvedValue([]);
      vi.mocked(prisma.manager.findMany).mockResolvedValue([]);

      await handleListAllowedCommand(ctx);

      expect(ctx.reply).toHaveBeenCalled();
    });
  });
});
