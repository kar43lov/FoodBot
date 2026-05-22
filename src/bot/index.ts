import { timingSafeEqual } from 'node:crypto';
import { Bot, Context, GrammyError, HttpError } from 'grammy';
import type { Update } from 'grammy/types';
import { run, sequentialize } from '@grammyjs/runner';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import pino from 'pino';
import { Config } from '../config/index.js';
import { handlePhoto } from './photoHandler.js';
import { createAccessGuard } from './accessGuard.js';
import {
  handleStartCommand,
  handleHelpCommand,
  handleTodayCommand,
  handleMyWeekCommand,
  handleProjectCommand,
  handleSetAdminCommand,
} from './commands.js';
import {
  handleAllowChatCommand,
  handleDenyChatCommand,
  handleAllowUserCommand,
  handleDenyUserCommand,
  handleSetManagerCommand,
  handleRemoveManagerCommand,
  handleListAllowedCommand,
} from './adminCommands.js';
import { registerApiRoutes } from '../api/index.js';
import { handleTipsCommand, handleTipsCallback, handleTipsTextInput } from './tipsCommands.js';
import { tryHandleReplyCorrection } from './replyHandler.js';

/**
 * Custom bot context with additional properties.
 */
export type BotContext = Context;

/**
 * Creates and configures the Telegram bot instance.
 */
export function createBot(config: Config, logger: pino.Logger): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.bot.token);

  // Sequentialize updates by chat to prevent race conditions
  bot.use(sequentialize((ctx) => ctx.chat?.id.toString() ?? ctx.from?.id.toString() ?? ''));

  // Deduplicate update_id — Telegram retries webhook after ~60s timeout if response is slow.
  // Without this guard, slow OpenAI responses cause the same photo to be processed multiple times.
  const seenUpdateIds = new Set<number>();
  const seenUpdateOrder: number[] = [];
  const MAX_SEEN = 500;
  bot.use(async (ctx, next) => {
    const id = ctx.update.update_id;
    if (seenUpdateIds.has(id)) {
      logger.warn({ event: 'duplicate_update_skipped', updateId: id, chatId: ctx.chat?.id });
      return;
    }
    seenUpdateIds.add(id);
    seenUpdateOrder.push(id);
    if (seenUpdateOrder.length > MAX_SEEN) {
      const evicted = seenUpdateOrder.shift();
      if (evicted !== undefined) seenUpdateIds.delete(evicted);
    }
    await next();
  });

  // Access control guard — blocks non-whitelisted chats/users
  bot.use(createAccessGuard());

  // Logging middleware
  bot.use(async (ctx, next) => {
    const start = Date.now();
    const updateType = ctx.update
      ? Object.keys(ctx.update).find((k) => k !== 'update_id')
      : 'unknown';
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    const username = ctx.from?.username;

    logger.info({
      event: 'update_received',
      updateType,
      updateId: ctx.update.update_id,
      chatId,
      userId,
      username,
      hasPhoto: Boolean(ctx.message?.photo),
      hasDocument: Boolean(ctx.message?.document),
    });

    try {
      await next();
    } finally {
      const duration = Date.now() - start;
      logger.info({
        event: 'update_processed',
        updateType,
        updateId: ctx.update.update_id,
        chatId,
        duration,
      });
    }
  });

  // Command handlers
  bot.command('start', handleStartCommand);
  bot.command('help', handleHelpCommand);
  bot.command('today', handleTodayCommand);
  bot.command('myweek', handleMyWeekCommand);
  bot.command('project', handleProjectCommand);
  bot.command('setadmin', handleSetAdminCommand);

  // Admin commands (access control)
  bot.command('allowchat', handleAllowChatCommand);
  bot.command('denychat', handleDenyChatCommand);
  bot.command('allowuser', handleAllowUserCommand);
  bot.command('denyuser', handleDenyUserCommand);
  bot.command('setmanager', handleSetManagerCommand);
  bot.command('removemanager', handleRemoveManagerCommand);
  bot.command('listallowed', handleListAllowedCommand);
  bot.command('tips', handleTipsCommand);

  // Callback query handler for inline buttons (tips management)
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith('tip_')) {
      await handleTipsCallback(ctx);
    }
  });

  // Text input handler for tips add/edit (must be before photo handler)
  bot.on('message:text', async (ctx, next) => {
    const tipsHandled = await handleTipsTextInput(ctx);
    if (tipsHandled) return;

    // Try to interpret as a reply-correction to a previous food entry
    const correctionHandled = await tryHandleReplyCorrection(ctx, logger);
    if (correctionHandled) return;

    await next();
  });

  // Photo handler - process food images (or correct existing entry on reply)
  bot.on('message:photo', async (ctx) => {
    const correctionHandled = await tryHandleReplyCorrection(ctx, logger);
    if (correctionHandled) return;
    await handlePhoto(ctx, logger);
  });

  // Error handler
  bot.catch((err) => {
    const ctx = err.ctx;
    const error = err.error;
    const updateType = ctx.update
      ? Object.keys(ctx.update).find((k) => k !== 'update_id')
      : 'unknown';

    logger.error({
      event: 'bot_error',
      updateType,
      chatId: ctx.chat?.id,
      userId: ctx.from?.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof GrammyError) {
      logger.error({
        event: 'grammy_error',
        description: error.description,
        method: error.method,
        payload: error.payload,
      });
    } else if (error instanceof HttpError) {
      logger.error({
        event: 'http_error',
        message: error.message,
      });
    }
  });

  return bot;
}

/**
 * Starts the bot in long polling mode (development).
 */
export async function startPolling(bot: Bot<BotContext>, logger: pino.Logger): Promise<void> {
  logger.info({ event: 'bot_starting', mode: 'polling' });

  // Delete webhook if exists
  await bot.api.deleteWebhook();

  // Use runner for better performance
  const runner = run(bot);

  // Graceful shutdown
  const stopRunner = () => {
    logger.info({ event: 'bot_stopping', mode: 'polling' });
    if (runner.isRunning()) {
      void runner.stop();
    }
  };

  process.once('SIGINT', stopRunner);
  process.once('SIGTERM', stopRunner);

  logger.info({ event: 'bot_started', mode: 'polling' });
}

/**
 * Webhook handler configuration.
 */
export interface WebhookConfig {
  path?: string;
  secretToken?: string;
}

/**
 * Creates Fastify server with webhook handler, health check, and API routes.
 */
export async function createWebhookServer(
  bot: Bot<BotContext>,
  config: Config,
  logger: pino.Logger,
  webhookConfig: WebhookConfig = {}
): Promise<FastifyInstance> {
  // grammY's Bot must be initialised before handleUpdate is called directly.
  // The previous webhookCallback did this lazily; do it eagerly here so both
  // startWebhook and any direct createWebhookServer caller work the same way.
  if (!bot.isInited()) {
    await bot.init();
  }

  const fastify = Fastify({
    logger: false, // Use our pino logger instead
  });

  // CORS configuration for web app (needed for API routes)
  await fastify.register(cors, {
    origin: config.bot.appUrl ? [config.bot.appUrl, 'http://localhost:5173'] : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data'],
  });

  const webhookPath = webhookConfig.path ?? '/webhook';
  const expectedSecret = webhookConfig.secretToken;

  // Track in-flight background handlers so graceful shutdown can wait for them.
  // We ACK the webhook before processing (to stop Telegram from retrying on slow OpenAI
  // calls), so on SIGTERM we must drain in-flight handlers ourselves — Telegram won't retry.
  const inFlight = new Set<Promise<unknown>>();
  const SHUTDOWN_DRAIN_MS = 30_000;

  fastify.addHook('onClose', async () => {
    if (inFlight.size === 0) return;
    logger.info({ event: 'webhook_drain_started', count: inFlight.size });
    const start = Date.now();
    let timeoutHandle: NodeJS.Timeout | undefined;
    const drained = await Promise.race([
      Promise.allSettled([...inFlight]).then(() => 'done' as const),
      new Promise<'timeout'>((resolve) => {
        timeoutHandle = setTimeout(() => resolve('timeout'), SHUTDOWN_DRAIN_MS);
      }),
    ]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    logger.info({
      event: 'webhook_drain_finished',
      result: drained,
      remaining: inFlight.size,
      durationMs: Date.now() - start,
    });
  });

  // Respond to Telegram immediately with 200 OK and handle the update in background.
  // Telegram retries the webhook after ~60s if it doesn't get a response, which used to
  // cause duplicate processing on slow OpenAI calls. update_id deduplication in the bot
  // middleware is the second line of defence.
  const expectedSecretBuf = expectedSecret ? Buffer.from(expectedSecret) : null;

  fastify.post(webhookPath, async (request, reply) => {
    if (expectedSecret && expectedSecretBuf) {
      const got = request.headers['x-telegram-bot-api-secret-token'];
      if (typeof got !== 'string' || got.length !== expectedSecret.length) {
        await reply.code(401).send();
        return;
      }
      if (!timingSafeEqual(Buffer.from(got), expectedSecretBuf)) {
        await reply.code(401).send();
        return;
      }
    }

    const update = request.body as Update | undefined;
    await reply.code(200).send();

    if (!update) return;

    const task = bot.handleUpdate(update).catch((err: unknown) => {
      logger.error({
        event: 'webhook_handle_update_error',
        updateId: update.update_id,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    });
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task));
  });

  // Register API routes for production mode
  registerApiRoutes(fastify, config, logger);

  logger.info({
    event: 'api_routes_registered',
    mode: 'webhook',
  });

  return fastify;
}

/**
 * Starts the bot in webhook mode (production).
 */
export async function startWebhook(
  bot: Bot<BotContext>,
  config: Config,
  logger: pino.Logger,
  webhookConfig: WebhookConfig = {}
): Promise<FastifyInstance> {
  logger.info({ event: 'bot_starting', mode: 'webhook' });

  const webhookPath = webhookConfig.path ?? '/webhook';
  const webhookUrl = config.bot.webhookUrl;

  if (!webhookUrl) {
    throw new Error('WEBHOOK_URL is required in production mode');
  }

  // Set webhook - handle secretToken properly for exactOptionalPropertyTypes
  const setWebhookOptions: {
    secret_token?: string;
    allowed_updates: ('message' | 'callback_query' | 'my_chat_member')[];
  } = {
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  };

  if (webhookConfig.secretToken) {
    setWebhookOptions.secret_token = webhookConfig.secretToken;
  }

  await bot.api.setWebhook(`${webhookUrl}${webhookPath}`, setWebhookOptions);

  // Create and start server
  const server = await createWebhookServer(bot, config, logger, webhookConfig);

  await server.listen({
    host: config.server.host,
    port: config.server.port,
  });

  logger.info({
    event: 'bot_started',
    mode: 'webhook',
    webhookUrl: `${webhookUrl}${webhookPath}`,
    port: config.server.port,
  });

  // Graceful shutdown
  const stopServer = async () => {
    logger.info({ event: 'bot_stopping', mode: 'webhook' });
    await server.close();
    await bot.api.deleteWebhook();
  };

  process.once('SIGINT', () => void stopServer());
  process.once('SIGTERM', () => void stopServer());

  return server;
}

/**
 * Starts the bot based on configuration mode.
 */
export async function startBot(
  bot: Bot<BotContext>,
  config: Config,
  logger: pino.Logger
): Promise<FastifyInstance | void> {
  if (config.app.isProduction) {
    return startWebhook(bot, config, logger);
  } else {
    return startPolling(bot, logger);
  }
}
