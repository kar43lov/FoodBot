import type { Context } from 'grammy';
import { prisma, MembershipRole } from '../db/index.js';
import { upsertProject, upsertUser, upsertMembership } from './photoHandler.js';
import { getAccessControl } from './accessControl.js';

/**
 * Bot commands module.
 * Contains handlers for all bot commands.
 */

/**
 * /start command handler.
 * Welcomes the user and provides a brief instruction.
 */
export async function handleStartCommand(ctx: Context): Promise<void> {
  const firstName = ctx.from?.first_name ?? 'Пользователь';
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const chatType = ctx.chat?.type;
  const ac = getAccessControl();

  const isSuperAdmin = userId !== undefined && ac.isSuperAdmin(userId);
  const isManager = userId !== undefined && ac.isManager(BigInt(userId));

  // Check if user has any access
  const hasPrivateAccess =
    isSuperAdmin ||
    isManager ||
    (userId !== undefined && ac.isUserAllowed(BigInt(userId)));
  const inAllowedGroup =
    chatType !== 'private' && chatId !== undefined && ac.isChatAllowed(BigInt(chatId));
  const hasAccess = hasPrivateAccess || inAllowedGroup;

  // For users without access — info-only message
  if (!hasAccess) {
    let text =
      `Привет, ${firstName}! 👋\n\n` +
      `Я — CheatMealDay Bot, помогаю отслеживать калорийность еды.\n` +
      `📸 Отправь фото еды — я оценю калорийность с помощью AI.\n\n`;

    // Check if user is a member of any whitelisted group
    const userMemberships = userId
      ? await prisma.membership.findMany({
          where: { user: { telegramUserId: BigInt(userId) } },
          include: { project: true },
        })
      : [];

    const allowedGroupMemberships = userMemberships.filter(
      (m) => m.project.type === 'group' && ac.isChatAllowed(m.project.telegramChatId)
    );

    if (allowedGroupMemberships.length > 0) {
      text += `📊 Ты участник групп, где бот активен:\n`;
      for (const m of allowedGroupMemberships) {
        text += `  • ${m.project.title}\n`;
      }
      text += `\nОтправляй фото еды в эти группы для отслеживания калорий.`;
    } else {
      text +=
        `🔒 Сейчас у тебя нет доступа к боту.\n` +
        `Бот работает по приглашению — обратись к администратору для получения доступа.`;
    }

    await ctx.reply(text);
    return;
  }

  // Full message for users with access
  let text =
    `Привет, ${firstName}! 👋\n\n` +
    `Я бот для отслеживания калорийности еды.\n` +
    `📸 Отправь фото еды — я оценю калорийность.\n\n` +
    `📋 Команды:\n` +
    `/start — Начать работу с ботом\n` +
    `/help — Справка по командам\n` +
    `/today — Калории за сегодня\n` +
    `/myweek — Статистика за неделю\n` +
    `/project — Информация о проекте/группе\n` +
    `/setadmin @username — Назначить админа группы`;

  if (isManager || isSuperAdmin) {
    text +=
      `\n\n🔧 Команды менеджера:\n` +
      `/allowchat — Разрешить группу (из группы или по ID)\n` +
      `/denychat — Запретить группу\n` +
      `/allowuser <id/@user> — Разрешить пользователя\n` +
      `/denyuser <id> — Запретить пользователя\n` +
      `/listallowed — Список разрешённых`;
  }

  if (isSuperAdmin) {
    text +=
      `\n\n👑 Команды суперадмина:\n` +
      `/setmanager <id> — Назначить менеджера\n` +
      `/removemanager <id> — Удалить менеджера`;
  }

  text +=
    `\n\n💡 В группах доступны:\n` +
    `/today, /myweek, /project, /setadmin\n` +
    `+ отправка фото еды`;

  await ctx.reply(text);
}

/**
 * /help command handler.
 * Shows all available commands with descriptions.
 */
export async function handleHelpCommand(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const chatType = ctx.chat?.type;
  const ac = getAccessControl();

  const isSuperAdmin = userId !== undefined && ac.isSuperAdmin(userId);
  const isManager = userId !== undefined && ac.isManager(BigInt(userId));
  const hasPrivateAccess =
    isSuperAdmin ||
    isManager ||
    (userId !== undefined && ac.isUserAllowed(BigInt(userId)));
  const inAllowedGroup =
    chatType !== 'private' && chatId !== undefined && ac.isChatAllowed(BigInt(chatId));

  if (!hasPrivateAccess && !inAllowedGroup) {
    await ctx.reply(
      `📖 CheatMealDay Bot — отслеживание калорийности еды.\n\n` +
        `🔒 У тебя нет доступа. Обратись к администратору.`
    );
    return;
  }

  let text =
    `📖 Список команд:\n\n` +
    `/start — Начать работу с ботом\n` +
    `/help — Показать это сообщение\n` +
    `/today — Статистика калорий за сегодня\n` +
    `/myweek — Статистика за неделю\n` +
    `/project — Информация о проекте/группе\n` +
    `/setadmin @username — Назначить админа группы\n\n` +
    `📸 Просто отправь фото еды, чтобы записать калории!`;

  if (isManager || isSuperAdmin) {
    text +=
      `\n\n🔧 Менеджер:\n` +
      `/allowchat — Разрешить группу\n` +
      `/denychat — Запретить группу\n` +
      `/allowuser <id/@user> — Разрешить пользователя\n` +
      `/denyuser <id> — Запретить пользователя\n` +
      `/listallowed — Список разрешённых`;
  }

  if (isSuperAdmin) {
    text +=
      `\n\n👑 Суперадмин:\n` +
      `/setmanager <id> — Назначить менеджера\n` +
      `/removemanager <id> — Удалить менеджера`;
  }

  await ctx.reply(text);
}

/**
 * Gets the start of today in the configured timezone.
 */
function getTodayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

/**
 * Gets the start of the week (Monday) in the configured timezone.
 */
function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // Convert to Monday-based week (0 = Monday, 6 = Sunday)
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + mondayOffset,
    0,
    0,
    0,
    0
  );
  return monday;
}

/**
 * /today command handler.
 * Shows calorie statistics for today.
 */
export async function handleTodayCommand(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (!chatId || !userId) {
    await ctx.reply('❌ Не удалось определить чат или пользователя.');
    return;
  }

  // Find project by chat ID
  const project = await prisma.project.findUnique({
    where: { telegramChatId: BigInt(chatId) },
  });

  if (!project) {
    await ctx.reply('📭 Пока нет записей. Отправь фото еды, чтобы начать!');
    return;
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { telegramUserId: BigInt(userId) },
  });

  if (!user) {
    await ctx.reply('📭 Пока нет записей. Отправь фото еды, чтобы начать!');
    return;
  }

  const todayStart = getTodayStart();

  // Get today's entries for this user in this project
  const entries = await prisma.mealEntry.findMany({
    where: {
      projectId: project.id,
      userId: user.id,
      recordedAt: {
        gte: todayStart,
      },
    },
    orderBy: { recordedAt: 'asc' },
  });

  if (entries.length === 0) {
    await ctx.reply('📭 Сегодня записей нет. Отправь фото еды!');
    return;
  }

  // Calculate total
  const totalCalories = entries.reduce((sum, entry) => sum + entry.caloriesEstimated, 0);

  // Format entries list
  const entriesList = entries
    .map((entry, index) => {
      const time = entry.recordedAt.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const desc = entry.description ? ` (${entry.description})` : '';
      return `${index + 1}. ${time} — ${entry.caloriesEstimated} ккал${desc}`;
    })
    .join('\n');

  await ctx.reply(
    `📊 Статистика за сегодня:\n\n` +
      `${entriesList}\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `📈 Всего: ${totalCalories} ккал`
  );
}

/**
 * /myweek command handler.
 * Shows calorie statistics for the current week.
 */
export async function handleMyWeekCommand(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (!chatId || !userId) {
    await ctx.reply('❌ Не удалось определить чат или пользователя.');
    return;
  }

  // Find project by chat ID
  const project = await prisma.project.findUnique({
    where: { telegramChatId: BigInt(chatId) },
  });

  if (!project) {
    await ctx.reply('📭 Пока нет записей. Отправь фото еды, чтобы начать!');
    return;
  }

  // Find user
  const user = await prisma.user.findUnique({
    where: { telegramUserId: BigInt(userId) },
  });

  if (!user) {
    await ctx.reply('📭 Пока нет записей. Отправь фото еды, чтобы начать!');
    return;
  }

  const weekStart = getWeekStart();

  // Get week's entries for this user in this project
  const entries = await prisma.mealEntry.findMany({
    where: {
      projectId: project.id,
      userId: user.id,
      recordedAt: {
        gte: weekStart,
      },
    },
    orderBy: { recordedAt: 'asc' },
  });

  if (entries.length === 0) {
    await ctx.reply('📭 На этой неделе записей нет. Отправь фото еды!');
    return;
  }

  // Group by day
  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const byDay: Map<string, { calories: number; count: number; dayName: string }> = new Map();

  for (const entry of entries) {
    const date = entry.recordedAt;
    const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const dayName = dayNames[date.getDay()] ?? 'Н/Д';

    const existing = byDay.get(dateKey);
    if (existing) {
      existing.calories += entry.caloriesEstimated;
      existing.count += 1;
    } else {
      byDay.set(dateKey, {
        calories: entry.caloriesEstimated,
        count: 1,
        dayName,
      });
    }
  }

  // Calculate total and average
  const totalCalories = entries.reduce((sum, entry) => sum + entry.caloriesEstimated, 0);
  const daysWithEntries = byDay.size;
  const avgCalories = Math.round(totalCalories / daysWithEntries);

  // Format daily summary
  const dailySummary = Array.from(byDay.entries())
    .map(([, data]) => `${data.dayName}: ${data.calories} ккал (${data.count} записей)`)
    .join('\n');

  await ctx.reply(
    `📊 Статистика за неделю:\n\n` +
      `${dailySummary}\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `📈 Всего: ${totalCalories} ккал\n` +
      `📉 Среднее в день: ${avgCalories} ккал\n` +
      `📝 Всего записей: ${entries.length}`
  );
}

/**
 * /project command handler.
 * Shows information about the current project/group.
 */
export async function handleProjectCommand(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;

  if (!chatId) {
    await ctx.reply('❌ Не удалось определить чат.');
    return;
  }

  // Find project by chat ID
  const project = await prisma.project.findUnique({
    where: { telegramChatId: BigInt(chatId) },
    include: {
      memberships: {
        include: {
          user: true,
        },
      },
      mealEntries: true,
    },
  });

  if (!project) {
    await ctx.reply('📭 Проект ещё не создан. Отправь фото еды, чтобы начать!');
    return;
  }

  // Count stats
  const memberCount = project.memberships.length;
  const entryCount = project.mealEntries.length;
  const totalCalories = project.mealEntries.reduce(
    (sum, entry) => sum + entry.caloriesEstimated,
    0
  );

  // Get admins
  const admins = project.memberships
    .filter((m) => m.role === MembershipRole.ADMIN)
    .map((m) => (m.user.username ? `@${m.user.username}` : m.user.firstName));

  const typeLabel = project.type === 'personal' ? '👤 Личный' : '👥 Групповой';
  const createdDate = project.createdAt.toLocaleDateString('ru-RU');

  await ctx.reply(
    `📋 Информация о проекте:\n\n` +
      `📝 Название: ${project.title}\n` +
      `${typeLabel}\n` +
      `📅 Создан: ${createdDate}\n\n` +
      `👥 Участников: ${memberCount}\n` +
      `👑 Админы: ${admins.join(', ') || 'нет'}\n\n` +
      `📊 Всего записей: ${entryCount}\n` +
      `🔥 Всего калорий: ${totalCalories} ккал`
  );
}

/**
 * /setadmin command handler.
 * Allows admins to set another user as admin.
 * Usage: /setadmin @username
 */
export async function handleSetAdminCommand(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const fromUserId = ctx.from?.id;

  if (!chatId || !fromUserId) {
    await ctx.reply('❌ Не удалось определить чат или пользователя.');
    return;
  }

  // Ensure project and user exist
  const { id: projectId } = await upsertProject(ctx);
  const { id: currentUserId } = await upsertUser(ctx);
  const { role: currentUserRole } = await upsertMembership(projectId, currentUserId, false);

  // Check if current user is admin
  if (currentUserRole !== MembershipRole.ADMIN) {
    await ctx.reply('❌ Только админы могут назначать других админов.');
    return;
  }

  // Parse username from message text
  const text = ctx.message?.text ?? '';
  const match = text.match(/\/setadmin\s+@?(\w+)/);

  if (!match) {
    await ctx.reply('❓ Использование: /setadmin @username');
    return;
  }

  const targetUsername = match[1];
  if (!targetUsername) {
    await ctx.reply('❓ Использование: /setadmin @username');
    return;
  }

  // Find target user by username
  const targetUser = await prisma.user.findFirst({
    where: { username: targetUsername },
  });

  if (!targetUser) {
    await ctx.reply(
      `❌ Пользователь @${targetUsername} не найден в системе.\nОн должен сначала отправить хотя бы одно фото в этот чат.`
    );
    return;
  }

  // Find or create membership
  const existingMembership = await prisma.membership.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId: targetUser.id,
      },
    },
  });

  if (!existingMembership) {
    await ctx.reply(`❌ Пользователь @${targetUsername} не является участником этого проекта.`);
    return;
  }

  if (existingMembership.role === MembershipRole.ADMIN) {
    await ctx.reply(`ℹ️ Пользователь @${targetUsername} уже является админом.`);
    return;
  }

  // Update role to admin
  await prisma.membership.update({
    where: { id: existingMembership.id },
    data: { role: MembershipRole.ADMIN },
  });

  await ctx.reply(`✅ Пользователь @${targetUsername} назначен админом!`);
}
