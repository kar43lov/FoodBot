import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAccessGuard, ADMIN_COMMANDS } from './accessGuard.js';

// Mock accessControl module
vi.mock('./accessControl.js', () => {
  const mockAc = {
    canAccess: vi.fn(),
    isSuperAdmin: vi.fn(),
    isManager: vi.fn(),
  };
  return {
    AccessControl: vi.fn(),
    getAccessControl: vi.fn(() => mockAc),
    resetAccessControl: vi.fn(),
  };
});

import { getAccessControl } from './accessControl.js';

function createMockCtx(
  overrides: {
    chatId?: number;
    chatType?: string;
    userId?: number;
    messageText?: string;
  } = {}
) {
  return {
    chat:
      overrides.chatId !== undefined
        ? { id: overrides.chatId, type: overrides.chatType ?? 'private' }
        : undefined,
    from: overrides.userId !== undefined ? { id: overrides.userId } : undefined,
    message: overrides.messageText !== undefined ? { text: overrides.messageText } : undefined,
  } as any;
}

describe('accessGuard', () => {
  let guard: ReturnType<typeof createAccessGuard>;
  let mockAc: ReturnType<typeof getAccessControl>;
  let next: ReturnType<typeof vi.fn<[], Promise<void>>>;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = createAccessGuard();
    mockAc = getAccessControl();
    next = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);
  });

  it('should pass superadmin through', async () => {
    const ctx = createMockCtx({ chatId: 123, chatType: 'private', userId: 999 });
    vi.mocked(mockAc.canAccess).mockReturnValue(true);

    await guard(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it('should pass manager through', async () => {
    const ctx = createMockCtx({ chatId: -100111, chatType: 'group', userId: 333 });
    vi.mocked(mockAc.canAccess).mockReturnValue(true);

    await guard(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it('should pass allowed chat in group', async () => {
    const ctx = createMockCtx({ chatId: -100111, chatType: 'group', userId: 555 });
    vi.mocked(mockAc.canAccess).mockReturnValue(true);

    await guard(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it('should pass allowed user in private', async () => {
    const ctx = createMockCtx({ chatId: 222, chatType: 'private', userId: 222 });
    vi.mocked(mockAc.canAccess).mockReturnValue(true);

    await guard(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it('should silently block unauthorized chat', async () => {
    const ctx = createMockCtx({ chatId: -999, chatType: 'group', userId: 555 });
    vi.mocked(mockAc.canAccess).mockReturnValue(false);
    vi.mocked(mockAc.isSuperAdmin).mockReturnValue(false);
    vi.mocked(mockAc.isManager).mockReturnValue(false);

    await guard(ctx, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('should silently block unauthorized user in private', async () => {
    const ctx = createMockCtx({ chatId: 999, chatType: 'private', userId: 999 });
    vi.mocked(mockAc.canAccess).mockReturnValue(false);
    vi.mocked(mockAc.isSuperAdmin).mockReturnValue(false);
    vi.mocked(mockAc.isManager).mockReturnValue(false);

    await guard(ctx, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('should pass admin commands from superadmin even in unallowed chat', async () => {
    const ctx = createMockCtx({
      chatId: -999,
      chatType: 'group',
      userId: 111,
      messageText: '/allowchat',
    });
    vi.mocked(mockAc.canAccess).mockReturnValue(false);
    vi.mocked(mockAc.isSuperAdmin).mockReturnValue(true);

    await guard(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it('should pass admin commands from manager even in unallowed chat', async () => {
    const ctx = createMockCtx({
      chatId: -999,
      chatType: 'group',
      userId: 333,
      messageText: '/allowchat',
    });
    vi.mocked(mockAc.canAccess).mockReturnValue(false);
    vi.mocked(mockAc.isSuperAdmin).mockReturnValue(false);
    vi.mocked(mockAc.isManager).mockReturnValue(true);

    await guard(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it('should NOT pass admin commands from regular user', async () => {
    const ctx = createMockCtx({
      chatId: -999,
      chatType: 'group',
      userId: 555,
      messageText: '/allowchat',
    });
    vi.mocked(mockAc.canAccess).mockReturnValue(false);
    vi.mocked(mockAc.isSuperAdmin).mockReturnValue(false);
    vi.mocked(mockAc.isManager).mockReturnValue(false);

    await guard(ctx, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('should handle missing chat/user gracefully', async () => {
    const ctx = createMockCtx({});
    await guard(ctx, next);

    expect(next).not.toHaveBeenCalled();
  });

  describe('ADMIN_COMMANDS', () => {
    it('should include all admin command names', () => {
      expect(ADMIN_COMMANDS).toContain('allowchat');
      expect(ADMIN_COMMANDS).toContain('denychat');
      expect(ADMIN_COMMANDS).toContain('allowuser');
      expect(ADMIN_COMMANDS).toContain('denyuser');
      expect(ADMIN_COMMANDS).toContain('setmanager');
      expect(ADMIN_COMMANDS).toContain('removemanager');
      expect(ADMIN_COMMANDS).toContain('listallowed');
    });
  });
});
