import { prisma } from '../db/index.js';

export class AccessControl {
  private allowedChats = new Set<bigint>();
  private allowedUsers = new Set<bigint>();
  private managers = new Set<bigint>();
  private superAdminId: number;

  constructor(superAdminId: number) {
    this.superAdminId = superAdminId;
  }

  async loadFromDb(): Promise<void> {
    const [chats, users, mgrs] = await Promise.all([
      prisma.allowedChat.findMany(),
      prisma.allowedUser.findMany(),
      prisma.manager.findMany(),
    ]);

    this.allowedChats = new Set(chats.map((c) => c.telegramChatId));
    this.allowedUsers = new Set(users.map((u) => u.telegramUserId));
    this.managers = new Set(mgrs.map((m) => m.telegramUserId));
  }

  isSuperAdmin(userId: number | bigint): boolean {
    return Number(userId) === this.superAdminId;
  }

  isManager(userId: bigint): boolean {
    return this.managers.has(userId);
  }

  isChatAllowed(chatId: bigint): boolean {
    return this.allowedChats.has(chatId);
  }

  isUserAllowed(userId: bigint): boolean {
    return this.allowedUsers.has(userId);
  }

  canAccess(chatType: 'private' | 'group', chatId: bigint, userId: bigint): boolean {
    if (this.isSuperAdmin(userId)) return true;
    if (this.isManager(userId)) return true;

    if (chatType === 'private') {
      return this.isUserAllowed(userId);
    }
    return this.isChatAllowed(chatId);
  }

  async addChat(
    telegramChatId: bigint,
    title: string | null,
    addedByUserId: bigint
  ): Promise<void> {
    await prisma.allowedChat.create({
      data: { telegramChatId, title, addedByUserId },
    });
    this.allowedChats.add(telegramChatId);
  }

  async removeChat(telegramChatId: bigint): Promise<void> {
    await prisma.allowedChat.delete({
      where: { telegramChatId },
    });
    this.allowedChats.delete(telegramChatId);
  }

  async addUser(telegramUserId: bigint, addedByUserId: bigint): Promise<void> {
    await prisma.allowedUser.create({
      data: { telegramUserId, addedByUserId },
    });
    this.allowedUsers.add(telegramUserId);
  }

  async removeUser(telegramUserId: bigint): Promise<void> {
    await prisma.allowedUser.delete({
      where: { telegramUserId },
    });
    this.allowedUsers.delete(telegramUserId);
  }

  async addManager(telegramUserId: bigint, addedByUserId: bigint): Promise<void> {
    await prisma.manager.create({
      data: { telegramUserId, addedByUserId },
    });
    this.managers.add(telegramUserId);
  }

  async removeManager(telegramUserId: bigint): Promise<void> {
    await prisma.manager.delete({
      where: { telegramUserId },
    });
    this.managers.delete(telegramUserId);
  }
}

let instance: AccessControl | null = null;

export function getAccessControl(superAdminId?: number): AccessControl {
  if (!instance) {
    if (superAdminId === undefined) {
      throw new Error('AccessControl not initialized. Call with superAdminId first.');
    }
    instance = new AccessControl(superAdminId);
  }
  return instance;
}

export function resetAccessControl(): void {
  instance = null;
}
