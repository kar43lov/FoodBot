import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, resetConfig, getConfig } from './index.js';

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetConfig();
    // Reset process.env to a clean state
    process.env = { ...originalEnv };
    // Clear all env vars that might interfere
    delete process.env.BOT_TOKEN;
    delete process.env.DATABASE_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.AI_FOOD_CONFIDENCE_THRESHOLD;
    delete process.env.MODE;
    delete process.env.LOG_LEVEL;
    delete process.env.TZ;
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.WEBHOOK_URL;
    delete process.env.APP_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  function setRequiredEnvVars(): void {
    process.env.BOT_TOKEN = 'test-bot-token';
    process.env.DATABASE_URL = 'file:./test.db';
    process.env.OPENAI_API_KEY = 'sk-test-key';
  }

  describe('loadConfig', () => {
    it('should throw error when BOT_TOKEN is missing', () => {
      process.env.DATABASE_URL = 'file:./test.db';
      process.env.OPENAI_API_KEY = 'sk-test-key';

      expect(() => loadConfig()).toThrow('BOT_TOKEN');
    });

    it('should throw error when DATABASE_URL is missing', () => {
      process.env.BOT_TOKEN = 'test-bot-token';
      process.env.OPENAI_API_KEY = 'sk-test-key';

      expect(() => loadConfig()).toThrow('DATABASE_URL');
    });

    it('should throw error when OPENAI_API_KEY is missing', () => {
      process.env.BOT_TOKEN = 'test-bot-token';
      process.env.DATABASE_URL = 'file:./test.db';

      expect(() => loadConfig()).toThrow('OPENAI_API_KEY');
    });

    it('should load config with all required variables', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.bot.token).toBe('test-bot-token');
      expect(config.database.url).toBe('file:./test.db');
      expect(config.ai.apiKey).toBe('sk-test-key');
    });

    it('should use default values for optional variables', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.ai.model).toBe('gpt-4o');
      expect(config.ai.foodConfidenceThreshold).toBe(0.6);
      expect(config.app.mode).toBe('dev');
      expect(config.app.isDevelopment).toBe(true);
      expect(config.app.isProduction).toBe(false);
      expect(config.log.level).toBe('info');
      expect(config.timezone).toBe('Europe/Moscow');
      expect(config.server.port).toBe(3000);
      expect(config.server.host).toBe('0.0.0.0');
    });

    it('should allow overriding optional variables', () => {
      setRequiredEnvVars();
      process.env.OPENAI_MODEL = 'gpt-4-turbo';
      process.env.AI_FOOD_CONFIDENCE_THRESHOLD = '0.8';
      process.env.MODE = 'dev';
      process.env.LOG_LEVEL = 'debug';
      process.env.TZ = 'UTC';
      process.env.PORT = '8080';
      process.env.HOST = '127.0.0.1';

      const config = loadConfig();

      expect(config.ai.model).toBe('gpt-4-turbo');
      expect(config.ai.foodConfidenceThreshold).toBe(0.8);
      expect(config.app.mode).toBe('dev');
      expect(config.log.level).toBe('debug');
      expect(config.timezone).toBe('UTC');
      expect(config.server.port).toBe(8080);
      expect(config.server.host).toBe('127.0.0.1');
    });

    it('should require WEBHOOK_URL in production mode', () => {
      setRequiredEnvVars();
      process.env.MODE = 'prod';

      expect(() => loadConfig()).toThrow('WEBHOOK_URL is required in production mode');
    });

    it('should load production config with WEBHOOK_URL', () => {
      setRequiredEnvVars();
      process.env.MODE = 'prod';
      process.env.WEBHOOK_URL = 'https://example.com/webhook';

      const config = loadConfig();

      expect(config.app.mode).toBe('prod');
      expect(config.app.isProduction).toBe(true);
      expect(config.app.isDevelopment).toBe(false);
      expect(config.bot.webhookUrl).toBe('https://example.com/webhook');
    });

    it('should validate AI_FOOD_CONFIDENCE_THRESHOLD range (0-1)', () => {
      setRequiredEnvVars();
      process.env.AI_FOOD_CONFIDENCE_THRESHOLD = '1.5';

      expect(() => loadConfig()).toThrow();
    });

    it('should validate WEBHOOK_URL as valid URL', () => {
      setRequiredEnvVars();
      process.env.MODE = 'prod';
      process.env.WEBHOOK_URL = 'not-a-valid-url';

      expect(() => loadConfig()).toThrow();
    });

    it('should validate PORT as positive integer', () => {
      setRequiredEnvVars();
      process.env.PORT = '-1';

      expect(() => loadConfig()).toThrow();
    });

    it('should validate LOG_LEVEL enum', () => {
      setRequiredEnvVars();
      process.env.LOG_LEVEL = 'invalid-level';

      expect(() => loadConfig()).toThrow();
    });

    it('should validate MODE enum', () => {
      setRequiredEnvVars();
      process.env.MODE = 'invalid-mode';

      expect(() => loadConfig()).toThrow();
    });
  });

  describe('getConfig', () => {
    it('should return cached config on subsequent calls', () => {
      setRequiredEnvVars();

      const config1 = getConfig();
      const config2 = getConfig();

      expect(config1).toBe(config2);
    });

    it('should return fresh config after reset', () => {
      setRequiredEnvVars();

      const config1 = getConfig();
      resetConfig();
      process.env.OPENAI_MODEL = 'different-model';
      const config2 = getConfig();

      expect(config1.ai.model).toBe('gpt-4o');
      expect(config2.ai.model).toBe('different-model');
    });
  });

  describe('config structure', () => {
    it('should have correct bot config structure', () => {
      setRequiredEnvVars();
      process.env.WEBHOOK_URL = 'https://example.com/webhook';
      process.env.APP_URL = 'https://example.com';

      const config = loadConfig();

      expect(config.bot).toEqual({
        token: 'test-bot-token',
        webhookUrl: 'https://example.com/webhook',
        appUrl: 'https://example.com',
      });
    });

    it('should have correct database config structure', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.database).toEqual({
        url: 'file:./test.db',
      });
    });

    it('should have correct ai config structure', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.ai).toEqual({
        apiKey: 'sk-test-key',
        model: 'gpt-4o',
        foodConfidenceThreshold: 0.6,
      });
    });

    it('should have correct app config structure', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.app).toEqual({
        mode: 'dev',
        isProduction: false,
        isDevelopment: true,
      });
    });

    it('should have correct log config structure', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.log).toEqual({
        level: 'info',
      });
    });

    it('should have correct server config structure', () => {
      setRequiredEnvVars();

      const config = loadConfig();

      expect(config.server).toEqual({
        port: 3000,
        host: '0.0.0.0',
      });
    });
  });
});
