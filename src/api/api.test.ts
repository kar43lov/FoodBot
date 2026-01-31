import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { validateTelegramAuth, validateTelegramWebApp } from './index.js';

// Mock the prisma client
vi.mock('../db/index.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    mealEntry: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
  MembershipRole: {
    MEMBER: 'member',
    ADMIN: 'admin',
  },
  MealEntrySource: {
    PHOTO: 'photo',
    MANUAL: 'manual',
    WEB: 'web',
  },
}));

describe('Telegram Auth Validation', () => {
  const testBotToken = 'test:bot_token_123';

  describe('validateTelegramAuth', () => {
    it('should validate correct Login Widget data', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const data: Record<string, string | number> = {
        id: 123456789,
        first_name: 'Test',
        username: 'testuser',
        auth_date: authDate,
      };

      // Calculate correct hash
      const dataCheckArr = Object.entries(data)
        .map(([k, v]) => `${k}=${v}`)
        .sort();
      const dataCheckString = dataCheckArr.join('\n');
      const secretKey = crypto.createHash('sha256').update(testBotToken).digest();
      const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      const dataWithHash = { ...data, hash };

      const result = validateTelegramAuth(dataWithHash, testBotToken);
      expect(result).toBe(true);
    });

    it('should reject invalid hash', () => {
      const data = {
        id: 123456789,
        first_name: 'Test',
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'invalid_hash',
      };

      const result = validateTelegramAuth(data, testBotToken);
      expect(result).toBe(false);
    });

    it('should reject missing hash', () => {
      const data = {
        id: 123456789,
        first_name: 'Test',
        auth_date: Math.floor(Date.now() / 1000),
      };

      const result = validateTelegramAuth(data, testBotToken);
      expect(result).toBe(false);
    });

    it('should handle undefined values in data', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const data: Record<string, string | number | undefined> = {
        id: 123456789,
        first_name: 'Test',
        username: undefined, // Optional field
        auth_date: authDate,
      };

      // Calculate correct hash (excluding undefined values)
      const dataCheckArr = Object.entries(data)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${v}`)
        .sort();
      const dataCheckString = dataCheckArr.join('\n');
      const secretKey = crypto.createHash('sha256').update(testBotToken).digest();
      const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      const dataWithHash = { ...data, hash };

      const result = validateTelegramAuth(dataWithHash, testBotToken);
      expect(result).toBe(true);
    });
  });

  describe('validateTelegramWebApp', () => {
    it('should validate correct WebApp initData', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const userData = {
        id: 123456789,
        first_name: 'Test',
        username: 'testuser',
      };

      const params = new URLSearchParams();
      params.set('user', JSON.stringify(userData));
      params.set('auth_date', authDate.toString());

      // Calculate correct hash for WebApp
      const dataCheckArr: string[] = [];
      params.forEach((value, key) => {
        dataCheckArr.push(`${key}=${value}`);
      });
      dataCheckArr.sort();
      const dataCheckString = dataCheckArr.join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(testBotToken).digest();
      const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      params.set('hash', hash);
      const initData = params.toString();

      const result = validateTelegramWebApp(initData, testBotToken);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(123456789);
      expect(result?.first_name).toBe('Test');
      expect(result?.username).toBe('testuser');
    });

    it('should reject invalid hash', () => {
      const userData = {
        id: 123456789,
        first_name: 'Test',
      };

      const params = new URLSearchParams();
      params.set('user', JSON.stringify(userData));
      params.set('auth_date', Math.floor(Date.now() / 1000).toString());
      params.set('hash', 'invalid_hash');

      const result = validateTelegramWebApp(params.toString(), testBotToken);
      expect(result).toBeNull();
    });

    it('should reject missing hash', () => {
      const userData = {
        id: 123456789,
        first_name: 'Test',
      };

      const params = new URLSearchParams();
      params.set('user', JSON.stringify(userData));
      params.set('auth_date', Math.floor(Date.now() / 1000).toString());

      const result = validateTelegramWebApp(params.toString(), testBotToken);
      expect(result).toBeNull();
    });

    it('should reject missing user data', () => {
      const authDate = Math.floor(Date.now() / 1000);
      const params = new URLSearchParams();
      params.set('auth_date', authDate.toString());

      // Calculate hash without user
      const dataCheckArr: string[] = [];
      params.forEach((value, key) => {
        dataCheckArr.push(`${key}=${value}`);
      });
      dataCheckArr.sort();
      const dataCheckString = dataCheckArr.join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(testBotToken).digest();
      const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      params.set('hash', hash);

      const result = validateTelegramWebApp(params.toString(), testBotToken);
      expect(result).toBeNull();
    });

    it('should reject invalid JSON in user data', () => {
      const params = new URLSearchParams();
      params.set('user', 'not-valid-json');
      params.set('auth_date', Math.floor(Date.now() / 1000).toString());
      params.set('hash', 'somehash');

      const result = validateTelegramWebApp(params.toString(), testBotToken);
      expect(result).toBeNull();
    });

    it('should reject missing auth_date', () => {
      const userData = {
        id: 123456789,
        first_name: 'Test',
      };

      const params = new URLSearchParams();
      params.set('user', JSON.stringify(userData));

      // Calculate hash
      const dataCheckArr: string[] = [];
      params.forEach((value, key) => {
        dataCheckArr.push(`${key}=${value}`);
      });
      dataCheckArr.sort();
      const dataCheckString = dataCheckArr.join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(testBotToken).digest();
      const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      params.set('hash', hash);

      const result = validateTelegramWebApp(params.toString(), testBotToken);
      expect(result).toBeNull();
    });
  });
});

// Note: API endpoint tests are in api.integration.test.ts
// These unit tests focus on validation functions only
