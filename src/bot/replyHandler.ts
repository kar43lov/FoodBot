import type pino from 'pino';
import { prisma } from '../db/index.js';
import { getFoodVisionService } from '../ai/index.js';
import { downloadPhoto, getPhotoFileId, upsertProject } from './photoHandler.js';
import type { BotContext } from './index.js';

/**
 * Reply-correction handler.
 *
 * If the user replies to a bot message that was a food-analysis confirmation,
 * we look up the meal entry by botMessageId, ask the AI to re-estimate using
 * the user's correction (text and/or new photo), update the entry, and reply
 * with the new totals.
 *
 * Returns true if the message was handled as a correction; false otherwise
 * (so the caller can fall through to normal handling).
 */
export async function tryHandleReplyCorrection(
  ctx: BotContext,
  logger: pino.Logger
): Promise<boolean> {
  const reply = ctx.message?.reply_to_message;
  if (!reply) return false;

  // Only handle replies to messages from THIS bot
  const botId = ctx.me.id;
  if (reply.from?.id !== botId) return false;

  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  if (!chatId || !userId) return false;

  // Find project for this chat
  const project = await prisma.project.findUnique({
    where: { telegramChatId: BigInt(chatId) },
  });
  if (!project) return false;

  // Find meal entry by botMessageId in this project
  const meal = await prisma.mealEntry.findFirst({
    where: {
      projectId: project.id,
      botMessageId: BigInt(reply.message_id),
    },
    include: { user: true },
  });
  if (!meal) return false;

  const correctionLogger = logger.child({ handler: 'reply_correction', mealId: meal.id });

  // Authorisation: only the original author can correct their own entry
  if (meal.user.telegramUserId !== BigInt(userId)) {
    correctionLogger.info(
      { authorId: meal.user.telegramUserId.toString(), replierId: userId },
      'Reply by non-author, ignoring'
    );
    await ctx.reply('🤔 Это не ваша запись — её может откорректировать только автор.', {
      reply_parameters: { message_id: ctx.message.message_id },
    });
    return true;
  }

  // Ensure project is up to date (chat title may have changed)
  await upsertProject(ctx);

  const text = ctx.message?.text ?? ctx.message?.caption ?? '';
  const hasPhoto = Boolean(ctx.message?.photo && ctx.message.photo.length > 0);

  if (!text && !hasPhoto) {
    correctionLogger.debug('Reply has no text or photo, ignoring');
    return false;
  }

  correctionLogger.info({ hasText: Boolean(text), hasPhoto }, 'Processing correction');

  try {
    let newPhotoBuffer: Buffer | undefined;
    let newPhotoFileId: string | null = null;

    if (hasPhoto) {
      newPhotoBuffer = await downloadPhoto(ctx);
      newPhotoFileId = getPhotoFileId(ctx);
    }

    const ai = getFoodVisionService(logger);
    const result = await ai.correct(
      {
        calories: meal.caloriesEstimated,
        protein: meal.protein,
        fat: meal.fat,
        carbs: meal.carbs,
        description: meal.description,
      },
      text,
      newPhotoBuffer
    );

    if (!result.is_food || result.estimated_calories === null) {
      correctionLogger.warn('Correction returned non-food, keeping previous entry');
      await ctx.reply(
        '🤔 Не понял корректировку. Опишите подробнее, что не так — например: «там 2 порции» или пришлите фото этикетки.',
        { reply_parameters: { message_id: ctx.message.message_id } }
      );
      return true;
    }

    // Update meal entry
    const updated = await prisma.mealEntry.update({
      where: { id: meal.id },
      data: {
        caloriesEstimated: result.estimated_calories,
        protein: result.protein_g,
        fat: result.fat_g,
        carbs: result.carbs_g,
        description: result.description ?? meal.description,
        aiConfidence: result.food_confidence,
        needsReview: false,
        ...(newPhotoFileId ? { photoFileId: newPhotoFileId } : {}),
      },
    });

    // Build response
    let response = `🔄 Обновил: ~${updated.caloriesEstimated} ккал`;
    if (updated.protein !== null && updated.fat !== null && updated.carbs !== null) {
      response += `\n📊 Б: ${Math.round(updated.protein)}г · Ж: ${Math.round(updated.fat)}г · У: ${Math.round(updated.carbs)}г`;
    }
    if (updated.description) {
      response += `\n📝 ${updated.description}`;
    }
    response += `\n\n💬 Всё ещё не точно? Ответьте на это сообщение — пересчитаю ещё раз.`;

    const sent = await ctx.reply(response, {
      reply_parameters: { message_id: ctx.message.message_id },
    });

    // Re-bind botMessageId to the new confirmation so subsequent replies route here
    try {
      await prisma.mealEntry.update({
        where: { id: meal.id },
        data: { botMessageId: BigInt(sent.message_id) },
      });
    } catch (err) {
      correctionLogger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to re-bind botMessageId after correction'
      );
    }

    correctionLogger.info(
      {
        calories: updated.caloriesEstimated,
        protein: updated.protein,
        fat: updated.fat,
        carbs: updated.carbs,
      },
      'Meal entry corrected'
    );
    return true;
  } catch (err) {
    correctionLogger.error(
      { error: err instanceof Error ? err.message : String(err) },
      'Reply correction failed'
    );
    try {
      await ctx.reply('😕 Не получилось обновить запись. Попробуйте ещё раз.', {
        reply_parameters: { message_id: ctx.message.message_id },
      });
    } catch {
      /* ignore */
    }
    return true;
  }
}
