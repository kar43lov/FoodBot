import { z } from 'zod';

/**
 * Environment configuration schema with validation.
 * Validates all required and optional environment variables at startup.
 */

// Mode enum for polling/webhook switching
const ModeSchema = z.enum(['dev', 'prod']).default('dev');
export type Mode = z.infer<typeof ModeSchema>;

// Log level enum
const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info');
export type LogLevel = z.infer<typeof LogLevelSchema>;

// Environment schema with all variables
const EnvSchema = z.object({
  // Telegram Bot - required
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),

  // Telegram Bot - optional (required only in prod mode)
  WEBHOOK_URL: z.string().url().optional(),
  APP_URL: z.string().url().optional(),

  // Database - required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // OpenAI - required
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),

  // OpenAI - optional with defaults
  OPENAI_MODEL: z.string().default('gpt-4o'),
  AI_FOOD_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.6),

  // Application mode - optional with default
  MODE: ModeSchema,

  // Logging - optional with default
  LOG_LEVEL: LogLevelSchema,

  // Timezone - optional with default
  TZ: z.string().default('Europe/Moscow'),

  // Server - optional with defaults
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Configuration interface with typed values.
 */
export interface Config {
  // Telegram
  bot: {
    token: string;
    webhookUrl: string | undefined;
    appUrl: string | undefined;
  };

  // Database
  database: {
    url: string;
  };

  // OpenAI
  ai: {
    apiKey: string;
    model: string;
    foodConfidenceThreshold: number;
  };

  // Application
  app: {
    mode: Mode;
    isProduction: boolean;
    isDevelopment: boolean;
  };

  // Logging
  log: {
    level: LogLevel;
  };

  // Server
  server: {
    port: number;
    host: string;
  };

  // Timezone
  timezone: string;
}

/**
 * Validates environment variables and returns typed configuration.
 * Throws ZodError if validation fails.
 */
function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${errors}`);
  }

  const env = result.data;

  // Additional validation: prod mode requires webhook URL
  if (env.MODE === 'prod' && !env.WEBHOOK_URL) {
    throw new Error('WEBHOOK_URL is required in production mode (MODE=prod)');
  }

  return env;
}

/**
 * Creates configuration object from validated environment.
 */
function createConfig(env: Env): Config {
  return {
    bot: {
      token: env.BOT_TOKEN,
      webhookUrl: env.WEBHOOK_URL,
      appUrl: env.APP_URL,
    },
    database: {
      url: env.DATABASE_URL,
    },
    ai: {
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      foodConfidenceThreshold: env.AI_FOOD_CONFIDENCE_THRESHOLD,
    },
    app: {
      mode: env.MODE,
      isProduction: env.MODE === 'prod',
      isDevelopment: env.MODE === 'dev',
    },
    log: {
      level: env.LOG_LEVEL,
    },
    server: {
      port: env.PORT,
      host: env.HOST,
    },
    timezone: env.TZ,
  };
}

/**
 * Loads and validates configuration.
 * Call this at application startup to fail fast on invalid config.
 */
export function loadConfig(): Config {
  const env = validateEnv();
  return createConfig(env);
}

/**
 * Lazy-loaded singleton configuration.
 * Use this for accessing config throughout the application.
 */
let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * Resets cached configuration.
 * Useful for testing.
 */
export function resetConfig(): void {
  cachedConfig = null;
}
