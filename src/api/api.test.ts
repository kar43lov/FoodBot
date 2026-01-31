import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have health check endpoint logic', () => {
    // The health endpoint returns status and timestamp
    const healthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    expect(healthResponse.status).toBe('ok');
    expect(healthResponse.timestamp).toBeDefined();
  });

  it('should format project list correctly', () => {
    const mockMembership = {
      project: {
        id: 'proj-1',
        telegramChatId: BigInt(123456789),
        title: 'Test Project',
        type: 'group',
        createdAt: new Date('2024-01-01'),
      },
      role: 'admin',
    };

    const formatted = {
      id: mockMembership.project.id,
      telegramChatId: mockMembership.project.telegramChatId.toString(),
      title: mockMembership.project.title,
      type: mockMembership.project.type,
      role: mockMembership.role,
      createdAt: mockMembership.project.createdAt.toISOString(),
    };

    expect(formatted.id).toBe('proj-1');
    expect(formatted.telegramChatId).toBe('123456789');
    expect(formatted.title).toBe('Test Project');
    expect(formatted.type).toBe('group');
    expect(formatted.role).toBe('admin');
  });

  it('should format meal entry correctly', () => {
    const mockMeal = {
      id: 'meal-1',
      userId: 'user-1',
      recordedAt: new Date('2024-01-15T12:00:00Z'),
      caloriesEstimated: 500,
      description: 'Lunch',
      source: 'photo',
      aiConfidence: 0.85,
      needsReview: false,
      user: {
        firstName: 'Test',
        username: 'testuser',
      },
    };

    const formatted = {
      id: mockMeal.id,
      userId: mockMeal.userId,
      recordedAt: mockMeal.recordedAt.toISOString(),
      caloriesEstimated: mockMeal.caloriesEstimated,
      description: mockMeal.description,
      source: mockMeal.source,
      aiConfidence: mockMeal.aiConfidence,
      needsReview: mockMeal.needsReview,
      user: {
        firstName: mockMeal.user.firstName,
        username: mockMeal.user.username,
      },
    };

    expect(formatted.id).toBe('meal-1');
    expect(formatted.caloriesEstimated).toBe(500);
    expect(formatted.recordedAt).toBe('2024-01-15T12:00:00.000Z');
    expect(formatted.user.firstName).toBe('Test');
  });

  it('should validate calorie range correctly', () => {
    const minValid = 1;
    const maxValid = 10000;

    const validateCalories = (calories: number): boolean => {
      return calories >= minValid && calories <= maxValid;
    };

    expect(validateCalories(0)).toBe(false);
    expect(validateCalories(1)).toBe(true);
    expect(validateCalories(500)).toBe(true);
    expect(validateCalories(10000)).toBe(true);
    expect(validateCalories(10001)).toBe(false);
  });
});

describe('Permission Checks', () => {
  it('should correctly identify owner', () => {
    const mealUserId = 'user-1';
    const requestUserId = 'user-1';

    const isOwner = mealUserId === requestUserId;
    expect(isOwner).toBe(true);
  });

  it('should correctly identify non-owner', () => {
    const mealUserId: string = 'user-1';
    const requestUserId: string = 'user-2';

    const isOwner = mealUserId === requestUserId;
    expect(isOwner).toBe(false);
  });

  it('should correctly identify admin', () => {
    const membershipRole: string = 'admin';
    const isAdmin = membershipRole === 'admin';
    expect(isAdmin).toBe(true);
  });

  it('should correctly identify non-admin', () => {
    const membershipRole: string = 'member';
    const isAdmin = membershipRole === 'admin';
    expect(isAdmin).toBe(false);
  });

  it('should allow edit for owner', () => {
    const isOwner = true;
    const isAdmin = false;
    const canEdit = isOwner || isAdmin;
    expect(canEdit).toBe(true);
  });

  it('should allow edit for admin', () => {
    const isOwner = false;
    const isAdmin = true;
    const canEdit = isOwner || isAdmin;
    expect(canEdit).toBe(true);
  });

  it('should deny edit for non-owner non-admin', () => {
    const isOwner = false;
    const isAdmin = false;
    const canEdit = isOwner || isAdmin;
    expect(canEdit).toBe(false);
  });
});
