/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { createApiServer } from './index.js';
import { createToken, getJwtSecret } from './jwt.js';
import type { Config } from '../config/index.js';

// Mock Prisma with realistic test data
const mockUser = {
  id: 'user-test-123',
  telegramUserId: BigInt(123456789),
  firstName: 'TestUser',
  username: 'testuser',
  createdAt: new Date('2024-01-01'),
};

const mockProject = {
  id: 'project-test-123',
  telegramChatId: BigInt(987654321),
  title: 'Test Project',
  type: 'group',
  createdAt: new Date('2024-01-01'),
};

const mockMembership = {
  id: 'membership-test-123',
  projectId: mockProject.id,
  userId: mockUser.id,
  role: 'admin' as const,
  createdAt: new Date('2024-01-01'),
};

const mockMealEntry = {
  id: 'meal-test-123',
  projectId: mockProject.id,
  userId: mockUser.id,
  recordedAt: new Date('2024-01-15T12:00:00Z'),
  caloriesEstimated: 500,
  description: 'Test meal',
  source: 'photo' as const,
  photoFileId: 'photo123',
  aiConfidence: 0.9,
  needsReview: false,
  protein: null,
  fat: null,
  carbs: null,
  createdAt: new Date('2024-01-15T12:00:00Z'),
  updatedAt: new Date('2024-01-15T12:00:00Z'),
};

// Mock Prisma
vi.mock('../db/index.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    project: {
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

// Import mocked prisma
import { prisma } from '../db/index.js';

// Test configuration
const testConfig: Config = {
  bot: {
    token: 'test-bot-token-12345',
    name: 'TestBot',
    webhookUrl: undefined,
    appUrl: 'http://localhost:5173',
  },
  database: {
    url: 'file:./test.db',
  },
  ai: {
    apiKey: 'test-openai-key',
    model: 'gpt-4o',
    foodConfidenceThreshold: 0.6,
  },
  app: {
    mode: 'dev',
    isProduction: false,
    isDevelopment: true,
  },
  log: {
    level: 'error',
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  timezone: 'Europe/Moscow',
  superAdminId: 123456789,
};

function createTestLogger(): pino.Logger {
  return pino({ level: 'silent' });
}

function createValidTelegramAuthData(botToken: string): Record<string, string | number> {
  const authDate = Math.floor(Date.now() / 1000);
  const data: Record<string, string | number> = {
    id: 123456789,
    first_name: 'TestUser',
    username: 'testuser',
    auth_date: authDate,
  };

  // Calculate correct hash
  const dataCheckArr = Object.entries(data)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const dataCheckString = dataCheckArr.join('\n');
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return { ...data, hash };
}

function createJwtToken(botToken: string): string {
  const secret = getJwtSecret(botToken);
  return createToken(
    {
      telegramUserId: '123456789',
      firstName: 'TestUser',
      username: 'testuser',
    },
    secret
  );
}

describe('API Integration Tests', () => {
  let server: FastifyInstance;
  let jwtToken: string;

  beforeAll(async () => {
    server = await createApiServer(testConfig, createTestLogger());
    jwtToken = createJwtToken(testConfig.bot.token);
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser);
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(mockMembership);
    vi.mocked(prisma.membership.findMany).mockResolvedValue([
      { ...mockMembership, user: mockUser, project: mockProject },
    ] as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as { status: string; timestamp: string };
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /auth/me', () => {
    it('should return 401 without authorization', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return user info with valid JWT token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as {
        telegramUserId: string;
        firstName: string;
        isRegistered: boolean;
      };
      expect(body.telegramUserId).toBe('123456789');
      expect(body.firstName).toBe('TestUser');
      expect(body.isRegistered).toBe(true);
    });

    it('should return isRegistered false if user not in database', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as { isRegistered: boolean };
      expect(body.isRegistered).toBe(false);
    });

    it('should return 401 with invalid JWT token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: 'Bearer invalid-token',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /auth/telegram', () => {
    it('should return JWT token with valid Telegram auth data', async () => {
      const authData = createValidTelegramAuthData(testConfig.bot.token);

      const response = await server.inject({
        method: 'POST',
        url: '/auth/telegram',
        payload: authData,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as {
        token: string;
        user: { telegramUserId: string; isRegistered: boolean };
      };
      expect(body.token).toBeDefined();
      expect(body.user.telegramUserId).toBe('123456789');
      expect(body.user.isRegistered).toBe(true);
    });

    it('should return 403 if user not registered', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      const authData = createValidTelegramAuthData(testConfig.bot.token);

      const response = await server.inject({
        method: 'POST',
        url: '/auth/telegram',
        payload: authData,
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload) as { code: string };
      expect(body.code).toBe('USER_NOT_REGISTERED');
    });

    it('should return 401 with invalid hash', async () => {
      const authData = createValidTelegramAuthData(testConfig.bot.token);
      authData.hash = 'invalid-hash';

      const response = await server.inject({
        method: 'POST',
        url: '/auth/telegram',
        payload: authData,
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 401 with expired auth data', async () => {
      const authData = createValidTelegramAuthData(testConfig.bot.token);
      // Set auth_date to 25 hours ago
      authData.auth_date = Math.floor(Date.now() / 1000) - 25 * 60 * 60;

      const response = await server.inject({
        method: 'POST',
        url: '/auth/telegram',
        payload: authData,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /projects', () => {
    it('should return 401 without authorization', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/projects',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return user projects with valid auth', async () => {
      vi.mocked(prisma.membership.findMany).mockResolvedValue([
        { ...mockMembership, project: mockProject },
      ] as never);

      const response = await server.inject({
        method: 'GET',
        url: '/projects',
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as Array<{
        id: string;
        title: string;
        role: string;
      }>;
      expect(body).toHaveLength(1);
      expect(body[0]!.id).toBe(mockProject.id);
      expect(body[0]!.title).toBe(mockProject.title);
      expect(body[0]!.role).toBe('admin');
    });

    it('should return 404 if user not in system', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: '/projects',
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /projects/:id/users', () => {
    it('should return project users for member', async () => {
      vi.mocked(prisma.membership.findMany).mockResolvedValue([
        { ...mockMembership, user: mockUser },
      ] as never);

      const response = await server.inject({
        method: 'GET',
        url: `/projects/${mockProject.id}/users`,
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as Array<{
        userId: string;
        firstName: string;
        role: string;
      }>;
      expect(body).toHaveLength(1);
      expect(body[0]!.userId).toBe(mockUser.id);
      expect(body[0]!.firstName).toBe(mockUser.firstName);
    });

    it('should return 403 if user not member of project', async () => {
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: `/projects/${mockProject.id}/users`,
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /projects/:id/meals', () => {
    it('should return project meals for member', async () => {
      vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([
        { ...mockMealEntry, user: { firstName: mockUser.firstName, username: mockUser.username } },
      ] as never);

      const response = await server.inject({
        method: 'GET',
        url: `/projects/${mockProject.id}/meals`,
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as Array<{
        id: string;
        caloriesEstimated: number;
        description: string;
      }>;
      expect(body).toHaveLength(1);
      expect(body[0]!.id).toBe(mockMealEntry.id);
      expect(body[0]!.caloriesEstimated).toBe(500);
    });

    it('should filter meals by date range', async () => {
      vi.mocked(prisma.mealEntry.findMany).mockResolvedValue([]);

      const from = '2024-01-01T00:00:00Z';
      const to = '2024-01-31T23:59:59Z';

      const response = await server.inject({
        method: 'GET',
        url: `/projects/${mockProject.id}/meals?from=${from}&to=${to}`,
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      expect(prisma.mealEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId: mockProject.id,
            recordedAt: {
              gte: new Date(from),
              lte: new Date(to),
            },
          }),
        })
      );
    });
  });

  describe('POST /meals', () => {
    it('should create meal entry for project member', async () => {
      const newMeal = {
        ...mockMealEntry,
        id: 'new-meal-123',
        user: {
          firstName: mockUser.firstName,
          username: mockUser.username,
        },
      };
      vi.mocked(prisma.mealEntry.create).mockResolvedValue(newMeal as never);

      const response = await server.inject({
        method: 'POST',
        url: '/meals',
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        payload: {
          projectId: mockProject.id,
          recordedAt: '2024-01-15T12:00:00Z',
          caloriesEstimated: 500,
          description: 'New meal',
          source: 'web',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload) as { id: string; caloriesEstimated: number };
      expect(body.id).toBe('new-meal-123');
      expect(body.caloriesEstimated).toBe(500);
    });

    it('should return 400 for invalid calories', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/meals',
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        payload: {
          projectId: mockProject.id,
          recordedAt: '2024-01-15T12:00:00Z',
          caloriesEstimated: 0, // Invalid: must be 1-10000
          description: 'Test',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 403 if not project member', async () => {
      vi.mocked(prisma.membership.findUnique).mockResolvedValue(null);

      const response = await server.inject({
        method: 'POST',
        url: '/meals',
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        payload: {
          projectId: mockProject.id,
          recordedAt: '2024-01-15T12:00:00Z',
          caloriesEstimated: 500,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PUT /meals/:id', () => {
    it('should update own meal entry', async () => {
      vi.mocked(prisma.mealEntry.findUnique).mockResolvedValue({
        ...mockMealEntry,
        project: {
          ...mockProject,
          memberships: [mockMembership],
        },
      } as never);
      vi.mocked(prisma.mealEntry.update).mockResolvedValue({
        ...mockMealEntry,
        caloriesEstimated: 600,
        user: {
          firstName: mockUser.firstName,
          username: mockUser.username,
        },
      } as never);

      const response = await server.inject({
        method: 'PUT',
        url: `/meals/${mockMealEntry.id}`,
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        payload: {
          caloriesEstimated: 600,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as { caloriesEstimated: number };
      expect(body.caloriesEstimated).toBe(600);
    });

    it('should return 404 if meal not found', async () => {
      vi.mocked(prisma.mealEntry.findUnique).mockResolvedValue(null);

      const response = await server.inject({
        method: 'PUT',
        url: '/meals/nonexistent',
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        payload: {
          caloriesEstimated: 600,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 403 if not owner and not admin', async () => {
      vi.mocked(prisma.mealEntry.findUnique).mockResolvedValue({
        ...mockMealEntry,
        userId: 'other-user-id', // Different user
        project: {
          ...mockProject,
          memberships: [{ ...mockMembership, role: 'member' }], // Not admin
        },
      } as never);

      const response = await server.inject({
        method: 'PUT',
        url: `/meals/${mockMealEntry.id}`,
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
        payload: {
          caloriesEstimated: 600,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('DELETE /meals/:id', () => {
    it('should delete own meal entry', async () => {
      vi.mocked(prisma.mealEntry.findUnique).mockResolvedValue({
        ...mockMealEntry,
        project: {
          ...mockProject,
          memberships: [mockMembership],
        },
      } as never);
      vi.mocked(prisma.mealEntry.delete).mockResolvedValue(mockMealEntry as never);

      const response = await server.inject({
        method: 'DELETE',
        url: `/meals/${mockMealEntry.id}`,
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload) as { success: boolean };
      expect(body.success).toBe(true);
    });

    it('should allow admin to delete any meal', async () => {
      vi.mocked(prisma.mealEntry.findUnique).mockResolvedValue({
        ...mockMealEntry,
        userId: 'other-user-id', // Different user
        project: {
          ...mockProject,
          memberships: [{ ...mockMembership, role: 'admin' }], // Is admin
        },
      } as never);
      vi.mocked(prisma.mealEntry.delete).mockResolvedValue(mockMealEntry as never);

      const response = await server.inject({
        method: 'DELETE',
        url: `/meals/${mockMealEntry.id}`,
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 404 if meal not found', async () => {
      vi.mocked(prisma.mealEntry.findUnique).mockResolvedValue(null);

      const response = await server.inject({
        method: 'DELETE',
        url: '/meals/nonexistent',
        headers: {
          authorization: `Bearer ${jwtToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('CORS', () => {
    it('should allow configured origins', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'GET',
        },
      });

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });
  });
});
