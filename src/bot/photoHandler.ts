import type { Context } from 'grammy';
import type { ReactionTypeEmoji } from 'grammy/types';
import pino from 'pino';
import {
  prisma,
  ProjectType,
  MembershipRole,
  MealEntrySource,
  type MembershipRole as MembershipRoleType,
} from '../db/index.js';
import { getFoodVisionService, type FoodAnalysisResult } from '../ai/index.js';
import type { BotContext } from './index.js';

/**
 * Photo handler module for processing food images.
 * Handles the full flow: chat type detection, upsert operations,
 * AI analysis, and appropriate response.
 */

/**
 * Determines if a chat is personal (private) or group chat.
 */
export function getChatType(ctx: Context): 'group' | 'personal' {
  const chatType = ctx.chat?.type;
  if (chatType === 'private') {
    return 'personal';
  }
  // group, supergroup, channel are all treated as "group"
  return 'group';
}

/**
 * Gets or creates a project for the current chat.
 * For personal chats, creates a personal project.
 * For group chats, creates a group project.
 */
export async function upsertProject(ctx: Context): Promise<{ id: string; isNew: boolean }> {
  const chatId = ctx.chat?.id;
  if (!chatId) {
    throw new Error('Chat ID is required');
  }

  const chatType = getChatType(ctx);
  const title =
    chatType === 'personal'
      ? `Personal: ${ctx.from?.first_name ?? 'User'}`
      : ((ctx.chat && 'title' in ctx.chat ? ctx.chat.title : null) ?? 'Group');

  // Try to find existing project
  const existing = await prisma.project.findUnique({
    where: { telegramChatId: BigInt(chatId) },
  });

  if (existing) {
    // Update title if changed
    if (existing.title !== title) {
      await prisma.project.update({
        where: { id: existing.id },
        data: { title },
      });
    }
    return { id: existing.id, isNew: false };
  }

  // Create new project
  const project = await prisma.project.create({
    data: {
      telegramChatId: BigInt(chatId),
      title,
      type: chatType === 'personal' ? ProjectType.PERSONAL : ProjectType.GROUP,
    },
  });

  return { id: project.id, isNew: true };
}

/**
 * Gets or creates a user from Telegram context.
 */
export async function upsertUser(ctx: Context): Promise<{ id: string; isNew: boolean }> {
  const telegramUser = ctx.from;
  if (!telegramUser) {
    throw new Error('User is required');
  }

  const existing = await prisma.user.findUnique({
    where: { telegramUserId: BigInt(telegramUser.id) },
  });

  if (existing) {
    // Update user info if changed
    const needsUpdate =
      existing.firstName !== telegramUser.first_name ||
      existing.username !== (telegramUser.username ?? null);

    if (needsUpdate) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          firstName: telegramUser.first_name,
          username: telegramUser.username ?? null,
        },
      });
    }
    return { id: existing.id, isNew: false };
  }

  // Create new user
  const user = await prisma.user.create({
    data: {
      telegramUserId: BigInt(telegramUser.id),
      firstName: telegramUser.first_name,
      username: telegramUser.username ?? null,
    },
  });

  return { id: user.id, isNew: true };
}

/**
 * Gets or creates a membership for user in project.
 * First user in a project becomes admin, others become members.
 */
export async function upsertMembership(
  projectId: string,
  userId: string,
  isNewProject: boolean
): Promise<{ id: string; role: MembershipRoleType; isNew: boolean }> {
  const existing = await prisma.membership.findUnique({
    where: {
      projectId_userId: {
        projectId,
        userId,
      },
    },
  });

  if (existing) {
    return { id: existing.id, role: existing.role as MembershipRoleType, isNew: false };
  }

  // Determine role: first user is admin, others are members
  let role: MembershipRoleType = MembershipRole.MEMBER;

  if (isNewProject) {
    // First user in new project is admin
    role = MembershipRole.ADMIN;
  } else {
    // Check if project has any members
    const memberCount = await prisma.membership.count({
      where: { projectId },
    });

    if (memberCount === 0) {
      // First member becomes admin
      role = MembershipRole.ADMIN;
    }
  }

  const membership = await prisma.membership.create({
    data: {
      projectId,
      userId,
      role,
    },
  });

  return { id: membership.id, role: membership.role as MembershipRoleType, isNew: true };
}

/**
 * Downloads photo from Telegram servers.
 */
export async function downloadPhoto(ctx: BotContext): Promise<Buffer> {
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) {
    throw new Error('No photo in message');
  }

  // Get the largest photo (last in array)
  const photo = photos[photos.length - 1];
  if (!photo) {
    throw new Error('No photo found in array');
  }

  // Get file info from Telegram
  const file = await ctx.api.getFile(photo.file_id);
  if (!file.file_path) {
    throw new Error('Failed to get file path from Telegram');
  }

  // Download file using grammy's built-in method
  const response = await fetch(
    `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`
  );

  if (!response.ok) {
    throw new Error(`Failed to download photo: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Gets the file_id of the largest photo in the message.
 */
export function getPhotoFileId(ctx: BotContext): string | null {
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) {
    return null;
  }
  // Get the largest photo (last in array)
  const photo = photos[photos.length - 1];
  return photo?.file_id ?? null;
}

/**
 * Creates a meal entry in the database.
 */
export async function createMealEntry(
  projectId: string,
  userId: string,
  analysisResult: FoodAnalysisResult,
  photoFileId: string | null
): Promise<{ id: string; calories: number }> {
  const entry = await prisma.mealEntry.create({
    data: {
      projectId,
      userId,
      recordedAt: new Date(),
      caloriesEstimated: analysisResult.estimated_calories ?? 0,
      description: analysisResult.description,
      source: MealEntrySource.PHOTO,
      photoFileId,
      aiConfidence: analysisResult.food_confidence,
      needsReview: analysisResult.food_confidence < 0.8,
    },
  });

  return { id: entry.id, calories: entry.caloriesEstimated };
}

/**
 * Sets a reaction on a message.
 * Uses shrug emoji for non-food images.
 */
export async function setReaction(
  ctx: BotContext,
  emoji: ReactionTypeEmoji['emoji']
): Promise<void> {
  const messageId = ctx.message?.message_id;
  const chatId = ctx.chat?.id;

  if (!messageId || !chatId) {
    return;
  }

  try {
    await ctx.api.setMessageReaction(chatId, messageId, [{ type: 'emoji', emoji }]);
  } catch {
    // Reactions might not be supported in all chats
    // Silently ignore reaction errors
  }
}

/**
 * Main photo handler function.
 * Processes incoming photos, analyzes them for food,
 * and creates meal entries or sets reactions accordingly.
 */
export async function handlePhoto(ctx: BotContext, logger: pino.Logger): Promise<void> {
  const handlerLogger = logger.child({ handler: 'photo' });

  try {
    // 1. Upsert project
    const { id: projectId, isNew: isNewProject } = await upsertProject(ctx);
    handlerLogger.debug({ projectId, isNewProject }, 'Project upserted');

    // 2. Upsert user
    const { id: userId, isNew: isNewUser } = await upsertUser(ctx);
    handlerLogger.debug({ userId, isNewUser }, 'User upserted');

    // 3. Upsert membership
    const { role } = await upsertMembership(projectId, userId, isNewProject);
    handlerLogger.debug({ projectId, userId, role }, 'Membership upserted');

    // 4. Download photo
    const photoBuffer = await downloadPhoto(ctx);
    handlerLogger.debug({ photoSize: photoBuffer.length }, 'Photo downloaded');

    // 5. Analyze with AI
    const foodService = getFoodVisionService(logger);
    const analysisResult = await foodService.analyze(photoBuffer);
    handlerLogger.info(
      {
        isFood: analysisResult.is_food,
        confidence: analysisResult.food_confidence,
        calories: analysisResult.estimated_calories,
      },
      'Photo analyzed'
    );

    // 6. Handle result
    if (analysisResult.is_food && analysisResult.estimated_calories) {
      // Food detected - create entry and reply
      const photoFileId = getPhotoFileId(ctx);
      const { calories } = await createMealEntry(projectId, userId, analysisResult, photoFileId);

      handlerLogger.info({ calories, projectId, userId }, 'Meal entry created');

      // Format response
      let response = `✅ Записал ~${calories} ккал`;
      if (analysisResult.description) {
        response += `\n📝 ${analysisResult.description}`;
      }

      await ctx.reply(response, { reply_parameters: { message_id: ctx.message!.message_id } });
    } else {
      // Not food - set shrug reaction (using 🤷‍♂ which is in allowed emoji list)
      handlerLogger.debug('Not food, setting shrug reaction');
      await setReaction(ctx, '🤷‍♂');
    }
  } catch (error) {
    handlerLogger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
      },
      'Photo handler error'
    );

    // Graceful error handling - inform user without crashing
    try {
      await ctx.reply('😕 Не удалось обработать фото. Попробуйте ещё раз.', {
        reply_parameters: { message_id: ctx.message!.message_id },
      });
    } catch {
      // If even reply fails, just log and continue
      handlerLogger.error('Failed to send error reply');
    }
  }
}
