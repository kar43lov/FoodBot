import type { Context } from 'grammy';
import OpenAI from 'openai';
import { prisma, MembershipRole } from '../db/index.js';
import { getConfig } from '../config/index.js';
import { upsertProject, upsertUser, upsertMembership } from './photoHandler.js';
import { getAccessControl } from './accessControl.js';
import { getUserNorms, DAILY_NORMS, type NutritionNorms } from './nutrition.js';
import { getRandomTip } from './tips.js';

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
      text += `🔒 Сейчас у тебя нет доступа к боту.\n`;

      // Show admin contacts
      const config = getConfig();
      const superAdminUser = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(config.superAdminId) },
      });
      const managers = await prisma.manager.findMany() ?? [];
      const managerUsers = managers.length > 0
        ? await prisma.user.findMany({
            where: { telegramUserId: { in: managers.map((m) => m.telegramUserId) } },
          })
        : [];

      const contacts: string[] = [];
      if (superAdminUser?.username) contacts.push(`@${superAdminUser.username}`);
      for (const mu of managerUsers) {
        if (mu.username && mu.telegramUserId !== BigInt(config.superAdminId)) {
          contacts.push(`@${mu.username}`);
        }
      }

      if (contacts.length > 0) {
        text += `Напиши ${contacts.join(' или ')} для получения доступа.`;
      } else {
        text += `Обратись к администратору для получения доступа.`;
      }
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
      `/listallowed — Список разрешённых\n` +
      `/tips — Управление подсказками`;
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

  text +=
    `\n\n🎯 Настройте личные цели КБЖУ — откройте приложение (кнопка «Открыть») → Профиль`;

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
      `/listallowed — Список разрешённых\n` +
      `/tips — Управление подсказками`;
  }

  if (isSuperAdmin) {
    text +=
      `\n\n👑 Суперадмин:\n` +
      `/setmanager <id> — Назначить менеджера\n` +
      `/removemanager <id> — Удалить менеджера`;
  }

  await ctx.reply(text);
}

export function getTodayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

export function getWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
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

function shortDesc(desc: string | null): string {
  if (!desc) return 'Без описания';
  return desc.length > 40 ? desc.slice(0, 37) + '...' : desc;
}

function getTodayTip(totalCalories: number): string {
  if (totalCalories === 0) return '';
  if (totalCalories < 1200)
    return '💡 Маловато калорий — не забывай про полноценные приёмы пищи.';
  if (totalCalories > 2500)
    return '💡 Калораж выше среднего — попробуй сбалансировать ужин.';
  return '💡 Хороший баланс — так держать!';
}

function getWeekTip(avgCalories: number, daysTracked: number, totalDays: number): string {
  const parts: string[] = [];
  if (daysTracked < totalDays)
    parts.push(
      `Записи есть только за ${daysTracked} из ${totalDays} дней — старайся фиксировать каждый день.`
    );
  if (avgCalories < 1200) parts.push('Средний калораж низковат — следи за питанием.');
  else if (avgCalories > 2500)
    parts.push('Средний калораж высоковат — обрати внимание на порции.');
  else parts.push('Средний калораж в норме — отличная работа!');
  return '💡 ' + parts.join(' ');
}

type MacroStatus = 'deficit' | 'excess' | 'ok';

function getMacroStatus(actual: number, norm: number): MacroStatus {
  const ratio = actual / norm;
  if (ratio < 0.8) return 'deficit';
  if (ratio > 1.2) return 'excess';
  return 'ok';
}

function formatMacroBalance(
  totalProtein: number,
  totalFat: number,
  totalCarbs: number,
  norms: NutritionNorms = DAILY_NORMS
): string {
  const statusIcon = (s: MacroStatus) =>
    s === 'deficit' ? '↓' : s === 'excess' ? '↑' : '✓';
  const ps = getMacroStatus(totalProtein, norms.protein);
  const fs = getMacroStatus(totalFat, norms.fat);
  const cs = getMacroStatus(totalCarbs, norms.carbs);
  return (
    `📋 Баланс: Б ${Math.round(totalProtein)}/${norms.protein}г ${statusIcon(ps)}` +
    ` · Ж ${Math.round(totalFat)}/${norms.fat}г ${statusIcon(fs)}` +
    ` · У ${Math.round(totalCarbs)}/${norms.carbs}г ${statusIcon(cs)}`
  );
}

interface PersonData {
  name: string;
  todayMeals: Array<{ description: string | null; calories: number; protein: number; fat: number; carbs: number }>;
  todayTotal: { calories: number; protein: number; fat: number; carbs: number };
  historyDays: Array<{ date: string; calories: number; protein: number; fat: number; carbs: number }>;
}

async function callOpenAI(prompt: string, systemPrompt: string, maxTokens = 200): Promise<string> {
  try {
    const config = getConfig();
    const openai = new OpenAI({ apiKey: config.ai.apiKey });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);
    return response.choices[0]?.message?.content?.trim() ?? '';
  } catch {
    return '';
  }
}

async function loadUserHistory(
  projectId: string,
  userId: string,
  days: number
): Promise<Array<{ date: string; calories: number; protein: number; fat: number; carbs: number }>> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);
  const todayStart = getTodayStart();

  const entries = await prisma.mealEntry.findMany({
    where: {
      projectId,
      userId,
      recordedAt: { gte: since, lt: todayStart },
    },
    orderBy: { recordedAt: 'asc' },
  });

  const byDay = new Map<string, { calories: number; protein: number; fat: number; carbs: number }>();
  for (const e of entries) {
    const d = e.recordedAt;
    const key = `${d.getDate()}.${d.getMonth() + 1}`;
    const existing = byDay.get(key) ?? { calories: 0, protein: 0, fat: 0, carbs: 0 };
    existing.calories += e.caloriesEstimated;
    existing.protein += e.protein ?? 0;
    existing.fat += e.fat ?? 0;
    existing.carbs += e.carbs ?? 0;
    byDay.set(key, existing);
  }

  return Array.from(byDay.entries()).map(([date, data]) => ({ date, ...data }));
}

async function generatePersonRecommendation(
  person: PersonData,
  norms: NutritionNorms = DAILY_NORMS
): Promise<string> {
  const mealsList = person.todayMeals
    .map((m) => `${m.description ?? 'Без описания'}: ${m.calories} ккал (Б${m.protein} Ж${m.fat} У${m.carbs})`)
    .join('\n');

  const t = person.todayTotal;
  const historyStr = person.historyDays.length > 0
    ? person.historyDays.map((d) => `${d.date}: ${d.calories} ккал (Б${Math.round(d.protein)} Ж${Math.round(d.fat)} У${Math.round(d.carbs)})`).join('\n')
    : 'Нет данных за предыдущие дни';

  const prompt =
    `Участник: ${person.name}\n` +
    `Сегодня:\n${mealsList}\n` +
    `Итого: ${t.calories} ккал, Б${Math.round(t.protein)}г Ж${Math.round(t.fat)}г У${Math.round(t.carbs)}г\n\n` +
    `История (предыдущие дни):\n${historyStr}\n\n` +
    `Личные нормы: ${norms.calories} ккал, Б${norms.protein}г, Ж${norms.fat}г, У${norms.carbs}г`;

  const systemPrompt =
    'Ты — дружелюбный диетолог-помощник в групповом фитнес-челлендже. ' +
    'Дай 1 короткое предложение-рекомендацию для конкретного участника на русском. ' +
    'Опирайся на то, что человек реально ест и его историю. ' +
    'Если первый день — просто похвали за начало. ' +
    'Если калорий мало — мягко подскажи. Если много — деликатно отметь. ' +
    'Не предлагай незнакомые продукты — рекомендуй корректировки к тому, что уже едят. ' +
    'Пример: "Сегодня маловато белка — попробуй добавить порцию побольше к обеду". ' +
    'Ответь ТОЛЬКО рекомендацию, без имени участника.';

  return callOpenAI(prompt, systemPrompt, 100);
}

async function generateGroupSummary(
  people: PersonData[],
  grandTotal: number
): Promise<string> {
  const peopleStr = people
    .map((p) => `${p.name}: ${p.todayTotal.calories} ккал, ${p.todayMeals.length} приёмов`)
    .join('\n');

  const prompt =
    `Группа из ${people.length} человек:\n${peopleStr}\n` +
    `Общий калораж группы: ${grandTotal} ккал\n\n` +
    `Дай 1 короткую фразу-итог для всей группы.`;

  const systemPrompt =
    'Ты — мотивирующий тренер группового фитнес-челленджа. ' +
    'Дай 1 короткую дружелюбную фразу-итог для всей группы. ' +
    'Учитывай, что калораж складывается из нескольких человек. ' +
    'Похвали за активность или мягко подбодри. ' +
    'Отвечай на русском, кратко, в стиле группового чата.';

  return callOpenAI(prompt, systemPrompt, 80);
}

/**
 * Build today summary text for a project (all users). Used by /today in groups and scheduler.
 */
export async function buildTodaySummary(projectId: string): Promise<string | null> {
  const todayStart = getTodayStart();

  const entries = await prisma.mealEntry.findMany({
    where: { projectId, recordedAt: { gte: todayStart } },
    include: { user: true },
    orderBy: { recordedAt: 'asc' },
  });

  if (entries.length === 0) return null;

  // Group by user
  const byUser = new Map<
    string,
    { userId: string; name: string; entries: typeof entries; total: number; protein: number; fat: number; carbs: number }
  >();
  for (const e of entries) {
    const key = e.userId;
    const existing = byUser.get(key);
    if (existing) {
      existing.entries.push(e);
      existing.total += e.caloriesEstimated;
      existing.protein += e.protein ?? 0;
      existing.fat += e.fat ?? 0;
      existing.carbs += e.carbs ?? 0;
    } else {
      const name = e.user.username ? `@${e.user.username}` : e.user.firstName;
      byUser.set(key, {
        userId: e.userId,
        name,
        entries: [e],
        total: e.caloriesEstimated,
        protein: e.protein ?? 0,
        fat: e.fat ?? 0,
        carbs: e.carbs ?? 0,
      });
    }
  }

  const grandTotal = entries.reduce((s, e) => s + e.caloriesEstimated, 0);
  const hasMacros = entries.some((e) => e.protein != null || e.fat != null || e.carbs != null);

  const lines: string[] = ['📊 Статистика за сегодня:\n'];

  // Build per-person data with history for AI recommendations
  const personDataList: PersonData[] = [];

  for (const u of byUser.values()) {
    let userHeader = `👤 ${u.name} — ${u.total} ккал`;
    if (hasMacros) {
      userHeader += ` (Б: ${Math.round(u.protein)}г · Ж: ${Math.round(u.fat)}г · У: ${Math.round(u.carbs)}г)`;
    }
    lines.push(userHeader);
    for (const e of u.entries) {
      const time = e.recordedAt.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      lines.push(`  • ${time} — ${shortDesc(e.description)} (${e.caloriesEstimated})`);
    }

    // Load 3-day history for this user
    const historyDays = await loadUserHistory(projectId, u.userId, 3);

    const personData: PersonData = {
      name: u.name,
      todayMeals: u.entries.map((e) => ({
        description: e.description,
        calories: e.caloriesEstimated,
        protein: e.protein ?? 0,
        fat: e.fat ?? 0,
        carbs: e.carbs ?? 0,
      })),
      todayTotal: { calories: u.total, protein: u.protein, fat: u.fat, carbs: u.carbs },
      historyDays,
    };
    personDataList.push(personData);

    // Per-person AI recommendation with personal norms
    if (hasMacros) {
      const userNorms = await getUserNorms(u.userId);
      const tip = await generatePersonRecommendation(personData, userNorms);
      if (tip) lines.push(`  💡 ${tip}`);
    }

    lines.push('');
  }

  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`📈 Всего на группу: ${grandTotal} ккал`);

  // Group summary via AI
  const groupTip = await generateGroupSummary(personDataList, grandTotal);
  if (groupTip) {
    lines.push(`\n${groupTip}`);
  } else {
    const tip = getTodayTip(grandTotal);
    if (tip) lines.push(`\n${tip}`);
  }

  // Random tip from DB
  const randomTip = await getRandomTip();
  if (randomTip) lines.push(`\n${randomTip}`);

  // Nudge users without goals
  const usersWithoutGoals: string[] = [];
  for (const u of byUser.values()) {
    const goal = await prisma.userGoal.findUnique({ where: { userId: u.userId } });
    if (!goal) usersWithoutGoals.push(u.name);
  }
  if (usersWithoutGoals.length > 0) {
    lines.push(
      `\n🎯 ${usersWithoutGoals.join(', ')} — для персональных рекомендаций ` +
      `перейдите в бот → нажмите «Открыть» → Профиль → укажите свои данные.`
    );
  }

  return lines.join('\n');
}

/**
 * Build week summary text for a project (all users). Used by /myweek in groups and scheduler.
 */
export async function buildWeekSummary(projectId: string): Promise<string | null> {
  const weekStart = getWeekStart();

  const entries = await prisma.mealEntry.findMany({
    where: { projectId, recordedAt: { gte: weekStart } },
    include: { user: true },
    orderBy: { recordedAt: 'asc' },
  });

  if (entries.length === 0) return null;

  const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  // Group by user -> by day
  const byUser = new Map<
    string,
    {
      name: string;
      byDay: Map<string, { dayName: string; calories: number; protein: number; fat: number; carbs: number; meals: string[] }>;
    }
  >();

  for (const e of entries) {
    const key = e.userId;
    if (!byUser.has(key)) {
      const name = e.user.username ? `@${e.user.username}` : e.user.firstName;
      byUser.set(key, { name, byDay: new Map() });
    }
    const user = byUser.get(key)!;
    const d = e.recordedAt;
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const dayName = dayNames[d.getDay()] ?? 'Н/Д';

    if (!user.byDay.has(dateKey)) {
      user.byDay.set(dateKey, { dayName, calories: 0, protein: 0, fat: 0, carbs: 0, meals: [] });
    }
    const day = user.byDay.get(dateKey)!;
    day.calories += e.caloriesEstimated;
    day.protein += e.protein ?? 0;
    day.fat += e.fat ?? 0;
    day.carbs += e.carbs ?? 0;
    day.meals.push(shortDesc(e.description));
  }

  const grandTotal = entries.reduce((s, e) => s + e.caloriesEstimated, 0);
  const grandProtein = entries.reduce((s, e) => s + (e.protein ?? 0), 0);
  const grandFat = entries.reduce((s, e) => s + (e.fat ?? 0), 0);
  const grandCarbs = entries.reduce((s, e) => s + (e.carbs ?? 0), 0);
  const hasMacros = entries.some((e) => e.protein != null || e.fat != null || e.carbs != null);

  const allDays = new Set<string>();
  for (const e of entries) {
    const d = e.recordedAt;
    allDays.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }

  const now = new Date();
  const dayOfWeek = now.getDay();
  const totalDaysSoFar = dayOfWeek === 0 ? 7 : dayOfWeek;
  const daysCount = allDays.size;

  const lines: string[] = ['📊 Статистика за неделю:\n'];
  const personDataList: PersonData[] = [];

  for (const u of byUser.values()) {
    const userTotal = Array.from(u.byDay.values()).reduce((s, d) => s + d.calories, 0);
    const userAvg = Math.round(userTotal / u.byDay.size);
    const up = Math.round(Array.from(u.byDay.values()).reduce((s, d) => s + d.protein, 0));
    const uf = Math.round(Array.from(u.byDay.values()).reduce((s, d) => s + d.fat, 0));
    const uc = Math.round(Array.from(u.byDay.values()).reduce((s, d) => s + d.carbs, 0));

    let userHeader = `👤 ${u.name} — ${userTotal} ккал (ср. ${userAvg}/день)`;
    if (hasMacros) {
      userHeader += `\n  КБЖУ: Б ${up}г · Ж ${uf}г · У ${uc}г`;
    }
    lines.push(userHeader);
    for (const day of u.byDay.values()) {
      const mealsStr = day.meals.join(', ');
      lines.push(`  ${day.dayName}: ${day.calories} ккал — ${mealsStr}`);
    }

    // Weekly per-day breakdown as history for AI
    const weekDays = Array.from(u.byDay.values()).map((d) => ({
      date: d.dayName,
      calories: d.calories,
      protein: d.protein,
      fat: d.fat,
      carbs: d.carbs,
    }));

    personDataList.push({
      name: u.name,
      todayMeals: [],
      todayTotal: { calories: userTotal, protein: up, fat: uf, carbs: uc },
      historyDays: weekDays,
    });

    lines.push('');
  }

  const avgCalories = Math.round(grandTotal / daysCount);

  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`📈 Всего: ${grandTotal} ккал`);
  lines.push(`📉 Среднее в день: ${avgCalories} ккал`);
  lines.push(`📝 Записей: ${entries.length}`);

  if (hasMacros) {
    const avgP = Math.round(grandProtein / daysCount);
    const avgF = Math.round(grandFat / daysCount);
    const avgC = Math.round(grandCarbs / daysCount);
    lines.push(formatMacroBalance(avgP, avgF, avgC));
  }

  // Weekly group summary via AI
  const groupTip = await generateGroupSummary(personDataList, grandTotal);
  if (groupTip) {
    lines.push(`\n${groupTip}`);
  } else {
    const tip = getWeekTip(avgCalories, daysCount, totalDaysSoFar);
    lines.push(`\n${tip}`);
  }

  return lines.join('\n');
}

/**
 * /today command handler.
 * In groups: shows all members. In private: shows current user only.
 */
export async function handleTodayCommand(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (!chatId || !userId) {
    await ctx.reply('❌ Не удалось определить чат или пользователя.');
    return;
  }

  const project = await prisma.project.findUnique({
    where: { telegramChatId: BigInt(chatId) },
  });

  if (!project) {
    await ctx.reply('📭 Пока нет записей. Отправь фото еды, чтобы начать!');
    return;
  }

  const isGroup = ctx.chat?.type !== 'private';

  if (isGroup) {
    const text = await buildTodaySummary(project.id);
    await ctx.reply(text ?? '📭 Сегодня записей нет. Отправьте фото еды!');
    return;
  }

  // Private chat — show only current user
  const user = await prisma.user.findUnique({
    where: { telegramUserId: BigInt(userId) },
  });

  if (!user) {
    await ctx.reply('📭 Пока нет записей. Отправь фото еды, чтобы начать!');
    return;
  }

  const todayStart = getTodayStart();
  const entries = await prisma.mealEntry.findMany({
    where: { projectId: project.id, userId: user.id, recordedAt: { gte: todayStart } },
    orderBy: { recordedAt: 'asc' },
  });

  if (entries.length === 0) {
    await ctx.reply('📭 Сегодня записей нет. Отправь фото еды!');
    return;
  }

  const totalCalories = entries.reduce((sum, entry) => sum + entry.caloriesEstimated, 0);
  const totalProtein = entries.reduce((s, e) => s + (e.protein ?? 0), 0);
  const totalFat = entries.reduce((s, e) => s + (e.fat ?? 0), 0);
  const totalCarbs = entries.reduce((s, e) => s + (e.carbs ?? 0), 0);
  const hasMacros = entries.some((e) => e.protein != null || e.fat != null || e.carbs != null);

  const entriesList = entries
    .map((entry, index) => {
      const time = entry.recordedAt.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      });
      let line = `${index + 1}. ${time} — ${shortDesc(entry.description)} (${entry.caloriesEstimated} ккал)`;
      if (entry.protein != null) {
        line += ` Б${Math.round(entry.protein)}/Ж${Math.round(entry.fat ?? 0)}/У${Math.round(entry.carbs ?? 0)}`;
      }
      return line;
    })
    .join('\n');

  const userNorms = await getUserNorms(user.id);
  let footer = `━━━━━━━━━━━━━━━\n📈 Всего: ${totalCalories} ккал`;
  if (hasMacros) {
    footer += `\n${formatMacroBalance(totalProtein, totalFat, totalCarbs, userNorms)}`;
  }

  const tip = getTodayTip(totalCalories);
  await ctx.reply(
    `📊 Статистика за сегодня:\n\n` +
      `${entriesList}\n\n` +
      `${footer}` +
      (tip ? `\n\n${tip}` : '')
  );
}

/**
 * /myweek command handler.
 * In groups: shows all members. In private: shows current user only.
 */
export async function handleMyWeekCommand(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;

  if (!chatId || !userId) {
    await ctx.reply('❌ Не удалось определить чат или пользователя.');
    return;
  }

  const project = await prisma.project.findUnique({
    where: { telegramChatId: BigInt(chatId) },
  });

  if (!project) {
    await ctx.reply('📭 Пока нет записей. Отправь фото еды, чтобы начать!');
    return;
  }

  const isGroup = ctx.chat?.type !== 'private';

  if (isGroup) {
    const text = await buildWeekSummary(project.id);
    await ctx.reply(text ?? '📭 На этой неделе записей нет. Отправьте фото еды!');
    return;
  }

  // Private chat — show only current user
  const user = await prisma.user.findUnique({
    where: { telegramUserId: BigInt(userId) },
  });

  if (!user) {
    await ctx.reply('📭 Пока нет записей. Отправь фото еды, чтобы начать!');
    return;
  }

  const weekStart = getWeekStart();
  const entries = await prisma.mealEntry.findMany({
    where: { projectId: project.id, userId: user.id, recordedAt: { gte: weekStart } },
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

  const totalCalories = entries.reduce((sum, entry) => sum + entry.caloriesEstimated, 0);
  const totalProtein = entries.reduce((s, e) => s + (e.protein ?? 0), 0);
  const totalFat = entries.reduce((s, e) => s + (e.fat ?? 0), 0);
  const totalCarbs = entries.reduce((s, e) => s + (e.carbs ?? 0), 0);
  const hasMacros = entries.some((e) => e.protein != null);
  const daysWithEntries = byDay.size;
  const avgCalories = Math.round(totalCalories / daysWithEntries);

  const dailySummary = Array.from(byDay.entries())
    .map(([, data]) => `${data.dayName}: ${data.calories} ккал (${data.count} записей)`)
    .join('\n');

  const now = new Date();
  const dayOfWeek = now.getDay();
  const totalDaysSoFar = dayOfWeek === 0 ? 7 : dayOfWeek;
  const tip = getWeekTip(avgCalories, daysWithEntries, totalDaysSoFar);

  const userNorms = await getUserNorms(user.id);
  let macroLine = '';
  if (hasMacros) {
    const avgP = Math.round(totalProtein / daysWithEntries);
    const avgF = Math.round(totalFat / daysWithEntries);
    const avgC = Math.round(totalCarbs / daysWithEntries);
    macroLine = `\n${formatMacroBalance(avgP, avgF, avgC, userNorms)}`;
  }

  await ctx.reply(
    `📊 Статистика за неделю:\n\n` +
      `${dailySummary}\n\n` +
      `━━━━━━━━━━━━━━━\n` +
      `📈 Всего: ${totalCalories} ккал\n` +
      `📉 Среднее в день: ${avgCalories} ккал\n` +
      `📝 Всего записей: ${entries.length}` +
      macroLine +
      `\n\n${tip}`
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
