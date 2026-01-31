import pino from 'pino';
import { loadConfig } from './config/index.js';
import { createBot, startBot } from './bot/index.js';

/**
 * Food Calories Bot - Entry Point
 * Initializes configuration, logger, and bot.
 */
async function main(): Promise<void> {
  // Load and validate configuration
  const config = loadConfig();

  // Create logger with proper typing for exactOptionalPropertyTypes
  const loggerOptions: pino.LoggerOptions = {
    level: config.log.level,
  };

  // Add transport only in development
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
  });

  // Create bot
  const bot = createBot(config, logger);

  // Start bot
  await startBot(bot, config, logger);

  logger.info({
    event: 'app_started',
    mode: config.app.mode,
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start application:', error);
  process.exit(1);
});
