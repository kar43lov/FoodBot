import type { Context } from 'grammy';
import { getAccessControl } from './accessControl.js';
import { prisma } from '../db/index.js';

function hasAdminAccess(ctx: Context): boolean {
  const userId = ctx.from?.id;
  if (!userId) return false;
  const ac = getAccessControl();
  return ac.isSuperAdmin(userId) || ac.isManager(BigInt(userId));
}

function isSuperAdmin(ctx: Context): boolean {
  const userId = ctx.from?.id;
  if (!userId) return false;
  return getAccessControl().isSuperAdmin(userId);
}

function parseArg(ctx: Context): string | undefined {
  const text = ctx.message && 'text' in ctx.message ? ctx.message.text : undefined;
  if (!text) return undefined;
  const parts = text.split(/\s+/);
  return parts[1];
}

export async function handleAllowChatCommand(ctx: Context): Promise<void> {
  if (!hasAdminAccess(ctx)) {
    await ctx.reply('❌ У вас нет прав для этой команды.');
    return;
  }

  const ac = getAccessControl();
  const arg = parseArg(ctx);
  const userId = BigInt(ctx.from!.id);

  let chatId: bigint;
  let title: string | null = null;

  if (arg) {
    chatId = BigInt(arg);
  } else if (ctx.chat && ctx.chat.type !== 'private') {
    chatId = BigInt(ctx.chat.id);
    title = 'title' in ctx.chat ? (ctx.chat.title ?? null) : null;
  } else {
    await ctx.reply('❓ Использование: /allowchat <chat_id> или вызовите из группы.');
    return;
  }

  if (ac.isChatAllowed(chatId)) {
    await ctx.reply('ℹ️ Группа уже в списке разрешённых.');
    return;
  }

  await ac.addChat(chatId, title, userId);
  await ctx.reply(`✅ Группа ${title ?? chatId.toString()} добавлена в список разрешённых.`);
}

export async function handleDenyChatCommand(ctx: Context): Promise<void> {
  if (!hasAdminAccess(ctx)) {
    await ctx.reply('❌ У вас нет прав для этой команды.');
    return;
  }

  const ac = getAccessControl();
  const arg = parseArg(ctx);

  let chatId: bigint;

  if (arg) {
    chatId = BigInt(arg);
  } else if (ctx.chat && ctx.chat.type !== 'private') {
    chatId = BigInt(ctx.chat.id);
  } else {
    await ctx.reply('❓ Использование: /denychat <chat_id> или вызовите из группы.');
    return;
  }

  if (!ac.isChatAllowed(chatId)) {
    await ctx.reply('ℹ️ Группа не найдена в списке разрешённых.');
    return;
  }

  await ac.removeChat(chatId);
  await ctx.reply(`✅ Группа ${chatId.toString()} удалена из списка разрешённых.`);
}

export async function handleAllowUserCommand(ctx: Context): Promise<void> {
  if (!hasAdminAccess(ctx)) {
    await ctx.reply('❌ У вас нет прав для этой команды.');
    return;
  }

  const ac = getAccessControl();
  const arg = parseArg(ctx);
  const addedBy = BigInt(ctx.from!.id);

  if (!arg) {
    await ctx.reply('❓ Использование: /allowuser <user_id> или /allowuser @username');
    return;
  }

  let targetUserId: bigint;

  if (arg.startsWith('@')) {
    const username = arg.slice(1);
    const user = await prisma.user.findFirst({ where: { username } });
    if (!user) {
      await ctx.reply(`❌ Пользователь @${username} не найден в БД. Используйте числовой ID.`);
      return;
    }
    targetUserId = user.telegramUserId;
  } else {
    targetUserId = BigInt(arg);
  }

  if (ac.isUserAllowed(targetUserId)) {
    await ctx.reply('ℹ️ Пользователь уже в списке разрешённых.');
    return;
  }

  await ac.addUser(targetUserId, addedBy);
  await ctx.reply(`✅ Пользователь ${targetUserId.toString()} добавлен в список разрешённых.`);
}

export async function handleDenyUserCommand(ctx: Context): Promise<void> {
  if (!hasAdminAccess(ctx)) {
    await ctx.reply('❌ У вас нет прав для этой команды.');
    return;
  }

  const ac = getAccessControl();
  const arg = parseArg(ctx);

  if (!arg) {
    await ctx.reply('❓ Использование: /denyuser <user_id>');
    return;
  }

  const targetUserId = BigInt(arg);

  if (!ac.isUserAllowed(targetUserId)) {
    await ctx.reply('ℹ️ Пользователь не найден в списке разрешённых.');
    return;
  }

  await ac.removeUser(targetUserId);
  await ctx.reply(`✅ Пользователь ${targetUserId.toString()} удалён из списка разрешённых.`);
}

export async function handleSetManagerCommand(ctx: Context): Promise<void> {
  if (!isSuperAdmin(ctx)) {
    await ctx.reply('❌ Только суперадмин может назначать менеджеров.');
    return;
  }

  const ac = getAccessControl();
  const arg = parseArg(ctx);

  if (!arg) {
    await ctx.reply('❓ Использование: /setmanager <user_id>');
    return;
  }

  const targetUserId = BigInt(arg);

  if (ac.isManager(targetUserId)) {
    await ctx.reply('ℹ️ Пользователь уже является менеджером.');
    return;
  }

  await ac.addManager(targetUserId, BigInt(ctx.from!.id));
  await ctx.reply(`✅ Пользователь ${targetUserId.toString()} назначен менеджером.`);
}

export async function handleRemoveManagerCommand(ctx: Context): Promise<void> {
  if (!isSuperAdmin(ctx)) {
    await ctx.reply('❌ Только суперадмин может удалять менеджеров.');
    return;
  }

  const ac = getAccessControl();
  const arg = parseArg(ctx);

  if (!arg) {
    await ctx.reply('❓ Использование: /removemanager <user_id>');
    return;
  }

  const targetUserId = BigInt(arg);

  if (!ac.isManager(targetUserId)) {
    await ctx.reply('ℹ️ Пользователь не является менеджером.');
    return;
  }

  await ac.removeManager(targetUserId);
  await ctx.reply(`✅ Менеджер ${targetUserId.toString()} удалён.`);
}

export async function handleListAllowedCommand(ctx: Context): Promise<void> {
  if (!hasAdminAccess(ctx)) {
    await ctx.reply('❌ У вас нет прав для этой команды.');
    return;
  }

  const [chats, users, managers] = await Promise.all([
    prisma.allowedChat.findMany(),
    prisma.allowedUser.findMany(),
    prisma.manager.findMany(),
  ]);

  const chatsList =
    chats.length > 0
      ? chats
          .map((c) => `  ${c.telegramChatId.toString()} — ${c.title ?? 'без названия'}`)
          .join('\n')
      : '  (пусто)';

  const usersList =
    users.length > 0
      ? users.map((u) => `  ${u.telegramUserId.toString()}`).join('\n')
      : '  (пусто)';

  const managersList =
    managers.length > 0
      ? managers.map((m) => `  ${m.telegramUserId.toString()}`).join('\n')
      : '  (пусто)';

  await ctx.reply(
    `📋 Списки доступа:\n\n` +
      `👥 Разрешённые группы:\n${chatsList}\n\n` +
      `👤 Разрешённые пользователи:\n${usersList}\n\n` +
      `🔧 Менеджеры:\n${managersList}`
  );
}
