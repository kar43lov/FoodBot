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

const PUBLIC_COMMANDS = ['start', 'help'] as const;

function getCommand(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return text.split(/[\s@]/)[0]?.replace('/', '');
}

function isAdminCommand(command: string | undefined): boolean {
  return command !== undefined && (ADMIN_COMMANDS as readonly string[]).includes(command);
}

function isPublicCommand(command: string | undefined): boolean {
  return command !== undefined && (PUBLIC_COMMANDS as readonly string[]).includes(command);
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

    const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
    const command = getCommand(messageText);

    // Allow /start and /help for everyone — they show access-aware info
    if (isPublicCommand(command)) {
      return next();
    }

    // Allow admin commands from superadmin/manager even in non-whitelisted chats
    if (isAdminCommand(command) && (ac.isSuperAdmin(userId) || ac.isManager(BigInt(userId)))) {
      return next();
    }

    // Silent drop — bot ignores this update
  };
}
