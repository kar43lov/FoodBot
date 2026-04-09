/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pino from 'pino';
import { Config } from '../config/index.js';

// Type definitions for mocks
interface MockBot {
  use: ReturnType<typeof vi.fn>;
  command: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  catch: ReturnType<typeof vi.fn>;
  api: {
    deleteWebhook: ReturnType<typeof vi.fn>;
    setWebhook: ReturnType<typeof vi.fn>;
  };
}

// Store mock bot for testing
let mockBotInstance: MockBot;

// Mock grammy module
vi.mock('grammy', () => {
  return {
    Bot: vi.fn(() => {
      mockBotInstance = {
        use: vi.fn(),
        command: vi.fn(),
        on: vi.fn(),
        catch: vi.fn(),
        api: {
          deleteWebhook: vi.fn().mockResolvedValue(true),
          setWebhook: vi.fn().mockResolvedValue(true),
        },
      };
      return mockBotInstance;
    }),
    Context: vi.fn(),
    GrammyError: class GrammyError extends Error {
      public description: string;
      public method: string;
      public payload: unknown;
      constructor(message: string, description: string, method: string, payload: unknown) {
        super(message);
        this.description = description;
        this.method = method;
        this.payload = payload;
      }
    },
    HttpError: class HttpError extends Error {},
    webhookCallback: vi.fn(() => () => ({ status: 200 })),
  };
});

// Mock accessGuard
vi.mock('./accessGuard.js', () => ({
  createAccessGuard: vi.fn(() => vi.fn((_ctx: unknown, next: () => Promise<void>) => next())),
}));

// Mock accessControl
vi.mock('./accessControl.js', () => ({
  getAccessControl: vi.fn(() => ({
    isSuperAdmin: vi.fn().mockReturnValue(false),
    isManager: vi.fn().mockReturnValue(false),
  })),
  resetAccessControl: vi.fn(),
}));

// Mock @grammyjs/runner
vi.mock('@grammyjs/runner', () => ({
  run: vi.fn(() => ({
    isRunning: vi.fn().mockReturnValue(true),
    stop: vi.fn(),
  })),
  sequentialize: vi.fn(() => vi.fn()),
}));

function createMockConfig(): Config {
  return {
    bot: {
      token: 'test-token-123',
      name: 'TestBot',
      webhookUrl: 'https://example.com',
      appUrl: 'https://app.example.com',
    },
    database: {
      url: 'file:./test.db',
    },
    ai: {
      apiKey: 'test-api-key',
      model: 'gpt-4o',
      foodConfidenceThreshold: 0.6,
    },
    app: {
      mode: 'dev',
      isProduction: false,
      isDevelopment: true,
    },
    log: {
      level: 'info',
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    timezone: 'Europe/Moscow',
    superAdminId: 123456789,
  };
}

function createMockLogger(): pino.Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as pino.Logger;
}

describe('Bot Module', () => {
  let config: Config;
  let logger: pino.Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createMockConfig();
    logger = createMockLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createBot', () => {
    it('should create bot instance with token', async () => {
      const { Bot } = await import('grammy');
      const { createBot } = await import('./index.js');

      createBot(config, logger);

      expect(Bot).toHaveBeenCalledWith('test-token-123');
    });

    it('should register sequentialize middleware', async () => {
      const { sequentialize } = await import('@grammyjs/runner');
      const { createBot } = await import('./index.js');

      const bot = createBot(config, logger);

      expect(sequentialize).toHaveBeenCalled();
      expect(bot.use).toHaveBeenCalled();
    });

    it('should register logging middleware', async () => {
      const { createBot } = await import('./index.js');

      const bot = createBot(config, logger);

      // Should be called 3 times: sequentialize + accessGuard + logging
      expect(bot.use).toHaveBeenCalledTimes(3);
    });

    it('should register /start command', async () => {
      const { createBot } = await import('./index.js');

      const bot = createBot(config, logger);

      expect(bot.command).toHaveBeenCalledWith('start', expect.any(Function));
    });

    it('should register /help command', async () => {
      const { createBot } = await import('./index.js');

      const bot = createBot(config, logger);

      expect(bot.command).toHaveBeenCalledWith('help', expect.any(Function));
    });

    it('should register error handler', async () => {
      const { createBot } = await import('./index.js');

      const bot = createBot(config, logger);

      expect(bot.catch).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('createWebhookServer', () => {
    it('should create fastify server with health endpoint', async () => {
      const { createBot, createWebhookServer } = await import('./index.js');

      const bot = createBot(config, logger);
      const server = await createWebhookServer(bot, config, logger);

      // Test health endpoint
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.payload) as {
        status: string;
        timestamp: string;
      };
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();

      await server.close();
    });

    it('should register webhook endpoint with custom path', async () => {
      const { webhookCallback } = await import('grammy');
      const { createBot, createWebhookServer } = await import('./index.js');

      const bot = createBot(config, logger);
      await createWebhookServer(bot, config, logger, {
        path: '/custom-webhook',
      });

      // Verify webhookCallback was called (it's registered for the endpoint)
      expect(webhookCallback).toHaveBeenCalled();
    });

    it('should register webhook endpoint with default path', async () => {
      const { webhookCallback } = await import('grammy');
      const { createBot, createWebhookServer } = await import('./index.js');

      const bot = createBot(config, logger);
      await createWebhookServer(bot, config, logger);

      // Verify webhookCallback was called
      expect(webhookCallback).toHaveBeenCalled();
    });
  });

  describe('Logging Middleware', () => {
    it('should log update received and processed', async () => {
      const { createBot } = await import('./index.js');

      createBot(config, logger);

      // Get the logging middleware (third call to use: sequentialize, accessGuard, logging)
      type MockCall = [unknown];
      const useCalls = mockBotInstance.use.mock.calls as MockCall[];
      const loggingMiddleware = useCalls[2]?.[0] as (
        ctx: Record<string, unknown>,
        next: () => Promise<void>
      ) => Promise<void>;

      const mockCtx = {
        update: { update_id: 1, message: { chat: { id: 123 } } },
        chat: { id: 123 },
        from: { id: 456, username: 'testuser' },
      };

      const mockNext = vi.fn().mockResolvedValue(undefined);

      await loggingMiddleware(mockCtx, mockNext);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'update_received',
          updateType: 'message',
          chatId: 123,
          userId: 456,
          username: 'testuser',
        })
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'update_processed',
          updateType: 'message',
          chatId: 123,
          duration: expect.any(Number),
        })
      );
    });
  });

  describe('Command Handlers', () => {
    it('/start should send welcome message', async () => {
      const { createBot } = await import('./index.js');

      createBot(config, logger);

      // Get the /start handler
      type CommandCall = [string, (ctx: Record<string, unknown>) => Promise<void>];
      const commandCalls = mockBotInstance.command.mock.calls as CommandCall[];
      const startCall = commandCalls.find((call) => call[0] === 'start');
      const startHandler = startCall?.[1];

      expect(startHandler).toBeDefined();

      const mockReply = vi.fn().mockResolvedValue(undefined);
      const mockCtx = {
        from: { first_name: 'John' },
        reply: mockReply,
      };

      await startHandler!(mockCtx);

      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('Привет, John!'));
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('/help'));
    });

    it('/help should send commands list', async () => {
      const { createBot } = await import('./index.js');

      createBot(config, logger);

      // Get the /help handler
      type CommandCall = [string, (ctx: Record<string, unknown>) => Promise<void>];
      const commandCalls = mockBotInstance.command.mock.calls as CommandCall[];
      const helpCall = commandCalls.find((call) => call[0] === 'help');
      const helpHandler = helpCall?.[1];

      expect(helpHandler).toBeDefined();

      const mockReply = vi.fn().mockResolvedValue(undefined);
      const mockCtx = {
        from: { id: 555 },
        reply: mockReply,
      };

      await helpHandler!(mockCtx);

      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('/start'));
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('/help'));
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('/today'));
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('/myweek'));
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('/project'));
      expect(mockReply).toHaveBeenCalledWith(expect.stringContaining('/setadmin'));
    });
  });

  describe('Error Handler', () => {
    it('should log errors with context', async () => {
      const { createBot } = await import('./index.js');

      createBot(config, logger);

      // Get the error handler
      type CatchCall = [(err: Record<string, unknown>) => void];
      const catchCalls = mockBotInstance.catch.mock.calls as CatchCall[];
      const errorHandler = catchCalls[0]?.[0];

      expect(errorHandler).toBeDefined();

      const mockError = {
        ctx: {
          update: { update_id: 1, message: { chat: { id: 123 } } },
          chat: { id: 123 },
          from: { id: 456 },
        },
        error: new Error('Test error'),
      };

      errorHandler!(mockError);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'bot_error',
          updateType: 'message',
          chatId: 123,
          userId: 456,
          error: 'Test error',
        })
      );
    });
  });
});
