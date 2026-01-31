import pino from 'pino';
import { FastifyInstance } from 'fastify';
import { loadConfig } from './config/index.js';
import { createBot, startBot } from './bot/index.js';
import { startApiServer } from './api/index.js';
import { prisma } from './db/index.js';

/**
 * Food Calories Bot - Entry Point
 * Initializes configuration, logger, bot, and API server.
 * Implements graceful shutdown for proper resource cleanup.
 */
async function main(): Promise<void> {
  // Load and validate configuration
  const config = loadConfig();

  // Create logger with structured JSON output in production
  const loggerOptions: pino.LoggerOptions = {
    level: config.log.level,
    // Add base fields for structured logging
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME,
    },
    // Format timestamps as ISO strings
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // Add pretty printing only in development
  if (config.app.isDevelopment) {
    loggerOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    };
  }

  const logger = pino(loggerOptions);

  logger.info({
    event: 'app_starting',
    mode: config.app.mode,
    logLevel: config.log.level,
    nodeEnv: process.env.NODE_ENV,
  });

  // Create bot
  const bot = createBot(config, logger);

  // Start bot (returns server in webhook mode)
  const botServer: FastifyInstance | void = await startBot(bot, config, logger);

  // Start API server
  // In production, API routes are registered on the webhook server (same port).
  // In development, start a separate API server for convenience.
  let apiServer: FastifyInstance | undefined;
  if (!config.app.isProduction) {
    // In development, start separate API server
    apiServer = await startApiServer(config, logger);
  }
  // Note: In production mode, API routes are registered on the webhook server
  // via createWebhookServer() in bot/index.ts

  logger.info({
    event: 'app_started',
    mode: config.app.mode,
    pid: process.pid,
  });

  // Graceful shutdown handler
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({
      event: 'shutdown_initiated',
      signal,
    });

    const shutdownTimeout = setTimeout(() => {
      logger.error({
        event: 'shutdown_timeout',
        message: 'Graceful shutdown timed out, forcing exit',
      });
      process.exit(1);
    }, 30000); // 30 seconds timeout

    try {
      // Stop accepting new requests
      if (apiServer) {
        logger.info({ event: 'closing_api_server' });
        await apiServer.close();
      }

      if (botServer) {
        logger.info({ event: 'closing_bot_server' });
        await botServer.close();
      }

      // Close database connections
      logger.info({ event: 'closing_database' });
      await prisma.$disconnect();

      clearTimeout(shutdownTimeout);

      logger.info({
        event: 'shutdown_complete',
        signal,
      });

      process.exit(0);
    } catch (error) {
      clearTimeout(shutdownTimeout);
      logger.error({
        event: 'shutdown_error',
        error: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    }
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.fatal({
      event: 'uncaught_exception',
      error: error.message,
      stack: error.stack,
    });
    void shutdown('uncaughtException');
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.fatal({
      event: 'unhandled_rejection',
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    void shutdown('unhandledRejection');
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start application:', error);
  process.exit(1);
});
