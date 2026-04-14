import cron from 'node-cron';
import type { Bot } from 'grammy';
import type pino from 'pino';
import { prisma } from '../db/index.js';
import { buildTodaySummary, buildWeekSummary } from './commands.js';
import type { BotContext } from './index.js';

/**
 * Sends a message to all allowed group projects.
 */
async function sendToAllGroups(
  bot: Bot<BotContext>,
  logger: pino.Logger,
  buildMessage: (projectId: string) => Promise<string | null>
): Promise<void> {
  const projects = await prisma.project.findMany({
    where: { type: 'group' },
  });

  for (const project of projects) {
    try {
      const text = await buildMessage(project.id);
      if (!text) continue;

      await bot.api.sendMessage(project.telegramChatId.toString(), text);
      logger.info({
        event: 'scheduled_message_sent',
        projectId: project.id,
        chatId: project.telegramChatId.toString(),
      });
    } catch (err) {
      logger.error({
        event: 'scheduled_message_failed',
        projectId: project.id,
        chatId: project.telegramChatId.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/**
 * Starts scheduled tasks:
 * - Daily summary at 21:00 MSK (18:00 UTC) to all groups
 * - Weekly summary at 20:00 MSK (17:00 UTC) on Sundays to all groups
 */
export function startScheduler(bot: Bot<BotContext>, logger: pino.Logger): void {
  // Daily at 21:00 MSK (TZ=Europe/Moscow set in .env on server)
  cron.schedule('0 21 * * *', async () => {
    logger.info({ event: 'scheduler_daily_start' });
    await sendToAllGroups(bot, logger, buildTodaySummary);
    logger.info({ event: 'scheduler_daily_done' });
  });

  // Sunday at 20:00 MSK
  cron.schedule('0 20 * * 0', async () => {
    logger.info({ event: 'scheduler_weekly_start' });
    await sendToAllGroups(bot, logger, buildWeekSummary);
    logger.info({ event: 'scheduler_weekly_done' });
  });

  logger.info({ event: 'scheduler_started', daily: '21:00 MSK', weekly: 'Sun 20:00 MSK' });
}
