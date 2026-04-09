import type { Context, NextFunction } from 'grammy';
import { getAccessControl } from './accessControl.js';

export const ADMIN_COMMANDS = [
  'allowchat',
  'denychat',
  'allowuser',
  'denyuser',
  'setmanager',
  'removemanager',
  'listallowed',
] as const;

function isAdminCommand(text: string | undefined): boolean {
  if (!text) return false;
  const command = text.split(/[\s@]/)[0]?.replace('/', '');
  return command !== undefined && (ADMIN_COMMANDS as readonly string[]).includes(command);
}

export function createAccessGuard(): (ctx: Context, next: NextFunction) => Promise<void> {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;

    if (chatId === undefined || userId === undefined) {
      return;
    }

    const ac = getAccessControl();
    const chatType = ctx.chat?.type === 'private' ? 'private' : 'group';

    // Allow access if whitelisted
    if (ac.canAccess(chatType, BigInt(chatId), BigInt(userId))) {
      return next();
    }

    // Allow admin commands from superadmin/manager even in non-whitelisted chats
    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
    if (isAdminCommand(messageText) && (ac.isSuperAdmin(userId) || ac.isManager(BigInt(userId)))) {
      return next();
    }

    // Silent drop — bot ignores this update
  };
}
