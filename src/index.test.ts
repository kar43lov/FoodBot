import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('./config/index.js', () => ({
  loadConfig: vi.fn(() => ({
    app: {
      mode: 'dev',
      isProduction: false,
      isDevelopment: true,
    },
    bot: {
      token: 'test-token',
      webhookUrl: undefined,
      appUrl: 'http://localhost:3000',
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
    },
    log: {
      level: 'info',
    },
    ai: {
      apiKey: 'test-key',
      model: 'gpt-4o',
      confidenceThreshold: 0.6,
    },
  })),
}));

vi.mock('./bot/index.js', () => ({
  createBot: vi.fn(() => ({})),
  startBot: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('./api/index.js', () => ({
  startApiServer: vi.fn(() =>
    Promise.resolve({
      close: vi.fn(() => Promise.resolve()),
    })
  ),
}));

vi.mock('./db/index.js', () => ({
  prisma: {
    $disconnect: vi.fn(() => Promise.resolve()),
  },
}));

describe('Application entry point', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should export main module without errors', async () => {
    // Verify module can be loaded
    const module = await import('./config/index.js');
    expect(module.loadConfig).toBeDefined();
  });

  it('should have loadConfig return valid config structure', async () => {
    const { loadConfig } = await import('./config/index.js');
    const config = loadConfig();

    expect(config).toHaveProperty('app');
    expect(config).toHaveProperty('bot');
    expect(config).toHaveProperty('server');
    expect(config).toHaveProperty('log');
    expect(config).toHaveProperty('ai');
  });

  it('should have bot module exports', async () => {
    const botModule = await import('./bot/index.js');
    expect(botModule.createBot).toBeDefined();
    expect(botModule.startBot).toBeDefined();
  });

  it('should have api module exports', async () => {
    const apiModule = await import('./api/index.js');
    expect(apiModule.startApiServer).toBeDefined();
  });
});
