import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccessControl } from './accessControl.js';

// Mock Prisma
vi.mock('../db/index.js', () => ({
  prisma: {
    allowedChat: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    allowedUser: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
    manager: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '../db/index.js';

describe('AccessControl', () => {
  let ac: AccessControl;
  const SUPER_ADMIN_ID = 123456789;

  beforeEach(() => {
    vi.clearAllMocks();
    ac = new AccessControl(SUPER_ADMIN_ID);
  });

  describe('loadFromDb', () => {
    it('should load allowed chats, users, and managers from DB', async () => {
      vi.mocked(prisma.allowedChat.findMany).mockResolvedValue([
        {
          id: '1',
          telegramChatId: BigInt(-100111),
          title: 'Test Group',
          addedByUserId: BigInt(1),
          createdAt: new Date(),
        },
      ]);
      vi.mocked(prisma.allowedUser.findMany).mockResolvedValue([
        { id: '2', telegramUserId: BigInt(222), addedByUserId: BigInt(1), createdAt: new Date() },
      ]);
      vi.mocked(prisma.manager.findMany).mockResolvedValue([
        { id: '3', telegramUserId: BigInt(333), addedByUserId: BigInt(1), createdAt: new Date() },
      ]);

      await ac.loadFromDb();

      expect(ac.isChatAllowed(BigInt(-100111))).toBe(true);
      expect(ac.isUserAllowed(BigInt(222))).toBe(true);
      expect(ac.isManager(BigInt(333))).toBe(true);
    });

    it('should handle empty DB', async () => {
      vi.mocked(prisma.allowedChat.findMany).mockResolvedValue([]);
      vi.mocked(prisma.allowedUser.findMany).mockResolvedValue([]);
      vi.mocked(prisma.manager.findMany).mockResolvedValue([]);

      await ac.loadFromDb();

      expect(ac.isChatAllowed(BigInt(-100111))).toBe(false);
      expect(ac.isUserAllowed(BigInt(222))).toBe(false);
      expect(ac.isManager(BigInt(333))).toBe(false);
    });
  });

  describe('isSuperAdmin', () => {
    it('should return true for superadmin ID', () => {
      expect(ac.isSuperAdmin(SUPER_ADMIN_ID)).toBe(true);
    });

    it('should return false for other IDs', () => {
      expect(ac.isSuperAdmin(999)).toBe(false);
    });
  });

  describe('isManager', () => {
    it('should return true for manager in cache', async () => {
      vi.mocked(prisma.allowedChat.findMany).mockResolvedValue([]);
      vi.mocked(prisma.allowedUser.findMany).mockResolvedValue([]);
      vi.mocked(prisma.manager.findMany).mockResolvedValue([
        { id: '1', telegramUserId: BigInt(555), addedByUserId: BigInt(1), createdAt: new Date() },
      ]);

      await ac.loadFromDb();
      expect(ac.isManager(BigInt(555))).toBe(true);
    });

    it('should return false for non-manager', () => {
      expect(ac.isManager(BigInt(999))).toBe(false);
    });
  });

  describe('canAccess', () => {
    beforeEach(async () => {
      vi.mocked(prisma.allowedChat.findMany).mockResolvedValue([
        {
          id: '1',
          telegramChatId: BigInt(-100111),
          title: 'Test',
          addedByUserId: BigInt(1),
          createdAt: new Date(),
        },
      ]);
      vi.mocked(prisma.allowedUser.findMany).mockResolvedValue([
        { id: '2', telegramUserId: BigInt(222), addedByUserId: BigInt(1), createdAt: new Date() },
      ]);
      vi.mocked(prisma.manager.findMany).mockResolvedValue([
        { id: '3', telegramUserId: BigInt(333), addedByUserId: BigInt(1), createdAt: new Date() },
      ]);
      await ac.loadFromDb();
    });

    it('should allow superadmin in any context', () => {
      expect(ac.canAccess('private', BigInt(SUPER_ADMIN_ID), BigInt(SUPER_ADMIN_ID))).toBe(true);
      expect(ac.canAccess('group', BigInt(-999), BigInt(SUPER_ADMIN_ID))).toBe(true);
    });

    it('should allow manager in any context', () => {
      expect(ac.canAccess('private', BigInt(333), BigInt(333))).toBe(true);
      expect(ac.canAccess('group', BigInt(-999), BigInt(333))).toBe(true);
    });

    it('should allow user in private if in allowedUsers', () => {
      expect(ac.canAccess('private', BigInt(222), BigInt(222))).toBe(true);
    });

    it('should deny user in private if not in allowedUsers', () => {
      expect(ac.canAccess('private', BigInt(999), BigInt(999))).toBe(false);
    });

    it('should allow in group if chatId in allowedChats', () => {
      expect(ac.canAccess('group', BigInt(-100111), BigInt(999))).toBe(true);
    });

    it('should deny in group if chatId not in allowedChats', () => {
      expect(ac.canAccess('group', BigInt(-999), BigInt(999))).toBe(false);
    });

    it('should work with number inputs converted to BigInt', () => {
      // grammy gives numbers, DB has BigInt — ensure conversion works
      expect(ac.canAccess('group', BigInt(-100111), BigInt(999))).toBe(true);
    });
  });

  describe('addChat', () => {
    it('should add chat to DB and cache', async () => {
      vi.mocked(prisma.allowedChat.create).mockResolvedValue({
        id: '1',
        telegramChatId: BigInt(-100222),
        title: 'New Group',
        addedByUserId: BigInt(1),
        createdAt: new Date(),
      });

      await ac.addChat(BigInt(-100222), 'New Group', BigInt(1));

      expect(prisma.allowedChat.create).toHaveBeenCalledWith({
        data: { telegramChatId: BigInt(-100222), title: 'New Group', addedByUserId: BigInt(1) },
      });
      expect(ac.isChatAllowed(BigInt(-100222))).toBe(true);
    });
  });

  describe('removeChat', () => {
    it('should remove chat from DB and cache', async () => {
      // First add to cache
      vi.mocked(prisma.allowedChat.create).mockResolvedValue({
        id: '1',
        telegramChatId: BigInt(-100222),
        title: 'Group',
        addedByUserId: BigInt(1),
        createdAt: new Date(),
      });
      await ac.addChat(BigInt(-100222), 'Group', BigInt(1));

      vi.mocked(prisma.allowedChat.delete).mockResolvedValue({
        id: '1',
        telegramChatId: BigInt(-100222),
        title: 'Group',
        addedByUserId: BigInt(1),
        createdAt: new Date(),
      });

      await ac.removeChat(BigInt(-100222));

      expect(prisma.allowedChat.delete).toHaveBeenCalledWith({
        where: { telegramChatId: BigInt(-100222) },
      });
      expect(ac.isChatAllowed(BigInt(-100222))).toBe(false);
    });
  });

  describe('addUser', () => {
    it('should add user to DB and cache', async () => {
      vi.mocked(prisma.allowedUser.create).mockResolvedValue({
        id: '1',
        telegramUserId: BigInt(444),
        addedByUserId: BigInt(1),
        createdAt: new Date(),
      });

      await ac.addUser(BigInt(444), BigInt(1));

      expect(prisma.allowedUser.create).toHaveBeenCalledWith({
        data: { telegramUserId: BigInt(444), addedByUserId: BigInt(1) },
      });
      expect(ac.isUserAllowed(BigInt(444))).toBe(true);
    });
  });

  describe('removeUser', () => {
    it('should remove user from DB and cache', async () => {
      vi.mocked(prisma.allowedUser.create).mockResolvedValue({
        id: '1',
        telegramUserId: BigInt(444),
        addedByUserId: BigInt(1),
        createdAt: new Date(),
      });
      await ac.addUser(BigInt(444), BigInt(1));

      vi.mocked(prisma.allowedUser.delete).mockResolvedValue({
        id: '1',
        telegramUserId: BigInt(444),
        addedByUserId: BigInt(1),
        createdAt: new Date(),
      });

      await ac.removeUser(BigInt(444));

      expect(ac.isUserAllowed(BigInt(444))).toBe(false);
    });
  });

  describe('addManager', () => {
    it('should add manager to DB and cache', async () => {
      vi.mocked(prisma.manager.create).mockResolvedValue({
        id: '1',
        telegramUserId: BigInt(555),
        addedByUserId: BigInt(1),
        createdAt: new Date(),
      });

      await ac.addManager(BigInt(555), BigInt(1));

      expect(ac.isManager(BigInt(555))).toBe(true);
    });
  });

  describe('removeManager', () => {
    it('should remove manager from DB and cache', async () => {
      vi.mocked(prisma.manager.create).mockResolvedValue({
        id: '1',
        telegramUserId: BigInt(555),
        addedByUserId: BigInt(1),
        createdAt: new Date(),
      });
      await ac.addManager(BigInt(555), BigInt(1));

      vi.mocked(prisma.manager.delete).mockResolvedValue({
        id: '1',
        telegramUserId: BigInt(555),
        addedByUserId: BigInt(1),
        createdAt: new Date(),
      });

      await ac.removeManager(BigInt(555));

      expect(ac.isManager(BigInt(555))).toBe(false);
    });
  });
});
