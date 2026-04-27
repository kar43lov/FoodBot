import { Bot, Context, GrammyError, HttpError, webhookCallback } from 'grammy';
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

  // Webhook endpoint - handle secretToken properly for exactOptionalPropertyTypes
  if (webhookConfig.secretToken) {
    fastify.post(
      webhookPath,
      webhookCallback(bot, 'fastify', { secretToken: webhookConfig.secretToken })
    );
  } else {
    fastify.post(webhookPath, webhookCallback(bot, 'fastify'));
  }

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
