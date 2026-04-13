import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { Config } from '../config/index.js';
import { prisma, MembershipRole, MealEntrySource } from '../db/index.js';
import { createToken, verifyToken, extractBearerToken, getJwtSecret } from './jwt.js';
import { getFoodVisionService } from '../ai/index.js';

/**
 * Telegram WebApp/Login Widget auth data
 */
export interface TelegramAuthData {
  id: number;
  first_name: string;
  username: string | undefined;
  photo_url: string | undefined;
  auth_date: number;
  hash: string;
}

/**
 * Authenticated user info attached to request
 */
export interface AuthUser {
  telegramUserId: bigint;
  firstName: string;
  username: string | undefined;
  userId: string | undefined; // Database user ID if exists
}

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

/**
 * Validates Telegram Login Widget data hash
 */
export function validateTelegramAuth(
  data: Record<string, string | number | undefined>,
  botToken: string
): boolean {
  const { hash, ...checkData } = data;
  if (!hash || typeof hash !== 'string') return false;

  // Create data-check-string
  const dataCheckArr = Object.entries(checkData)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .sort();
  const dataCheckString = dataCheckArr.join('\n');

  // Create secret key
  const secretKey = crypto.createHash('sha256').update(botToken).digest();

  // Calculate hash
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
  } catch {
    // If buffers have different lengths, comparison throws - return false
    return false;
  }
}

/**
 * Validates Telegram WebApp initData
 */
export function validateTelegramWebApp(
  initData: string,
  botToken: string
): TelegramAuthData | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    // Remove hash from params for verification
    params.delete('hash');

    // Create data-check-string (sorted alphabetically)
    const dataCheckArr: string[] = [];
    params.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`);
    });
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    // Create secret key using "WebAppData" as HMAC key
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      if (!crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash))) {
        return null;
      }
    } catch {
      // If buffers have different lengths, comparison throws - return false
      return null;
    }

    // Parse user data
    const userStr = params.get('user');
    if (!userStr) return null;

    const user = JSON.parse(userStr) as {
      id: number;
      first_name: string;
      username?: string;
      photo_url?: string;
    };

    const authDate = params.get('auth_date');
    if (!authDate) return null;

    return {
      id: user.id,
      first_name: user.first_name,
      username: user.username,
      photo_url: user.photo_url,
      auth_date: parseInt(authDate, 10),
      hash,
    };
  } catch {
    return null;
  }
}

/**
 * Request body schemas for validation
 */
interface CreateMealBody {
  projectId: string;
  recordedAt: string;
  caloriesEstimated: number;
  description?: string;
  source?: string;
}

interface UpdateMealBody {
  recordedAt?: string;
  caloriesEstimated?: number;
  description?: string;
  needsReview?: boolean;
}

interface MealsQuery {
  from?: string;
  to?: string;
}

/**
 * Registers API routes on an existing Fastify instance.
 * This allows routes to be added to either a standalone API server
 * or to the webhook server in production mode.
 */
export function registerApiRoutes(
  fastify: FastifyInstance,
  config: Config,
  logger: pino.Logger
): void {
  // JWT secret derived from bot token
  const jwtSecret = getJwtSecret(config.bot.token);

  // Auth middleware - extracts and validates Telegram auth or JWT
  fastify.decorateRequest('user', undefined);

  fastify.addHook(
    'preHandler',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      // Only require auth for API routes; everything else is frontend/public
      const apiPaths = ['/projects', '/meals', '/auth/me'];
      const isApiRoute = apiPaths.some((p) => request.url.startsWith(p));
      const isPublic = !isApiRoute;

      if (isPublic) return;

      // Try Authorization header
      const authHeader = request.headers.authorization;
      // Try X-Telegram-Init-Data header (WebApp format)
      const webAppData = request.headers['x-telegram-init-data'] as string | undefined;

      let authUser: AuthUser | null = null;

      // Priority 1: JWT Bearer token
      const bearerToken = extractBearerToken(authHeader);
      if (bearerToken) {
        const payload = verifyToken(bearerToken, jwtSecret);
        if (payload) {
          authUser = {
            telegramUserId: BigInt(payload.telegramUserId),
            firstName: payload.firstName,
            username: payload.username,
            userId: undefined,
          };
        }
      }

      // Priority 2: WebApp initData
      if (!authUser && webAppData) {
        const userData = validateTelegramWebApp(webAppData, config.bot.token);
        if (userData) {
          // Check auth_date freshness (24 hours)
          const authAge = Date.now() / 1000 - userData.auth_date;
          if (authAge <= 86400) {
            authUser = {
              telegramUserId: BigInt(userData.id),
              firstName: userData.first_name,
              username: userData.username,
              userId: undefined,
            };
          }
        }
      }

      // Priority 3: Login Widget data (legacy "tg " prefix)
      if (!authUser && authHeader?.startsWith('tg ')) {
        try {
          const jsonData = authHeader.slice(3);
          const data = JSON.parse(jsonData) as Record<string, string | number | undefined>;

          if (validateTelegramAuth(data, config.bot.token)) {
            authUser = {
              telegramUserId: BigInt(data.id as number),
              firstName: data.first_name as string,
              username: data.username as string | undefined,
              userId: undefined,
            };
          }
        } catch {
          // Invalid auth header format
        }
      }

      if (!authUser) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      // Find user in database
      const dbUser = await prisma.user.findUnique({
        where: { telegramUserId: authUser.telegramUserId },
      });

      if (dbUser) {
        authUser.userId = dbUser.id;
      }

      request.user = authUser;
    }
  );

  // Health check endpoint
  fastify.get('/health', {
    schema: {
      description: 'Health check endpoint',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
    handler: () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    },
  });

  // GET /auth/me - Current user info
  fastify.get('/auth/me', {
    schema: {
      description: 'Get current authenticated user',
      tags: ['Auth'],
      security: [{ telegramAuth: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            telegramUserId: { type: 'string' },
            firstName: { type: 'string' },
            username: { type: 'string' },
            userId: { type: 'string' },
            isRegistered: { type: 'boolean' },
          },
        },
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      return {
        telegramUserId: request.user.telegramUserId.toString(),
        firstName: request.user.firstName,
        username: request.user.username,
        userId: request.user.userId,
        isRegistered: !!request.user.userId,
      };
    },
  });

  // POST /auth/telegram - Authenticate via Telegram Login Widget and get JWT
  interface TelegramLoginBody {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
  }

  fastify.post<{ Body: TelegramLoginBody }>('/auth/telegram', {
    schema: {
      description: 'Authenticate via Telegram Login Widget and receive JWT token',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['id', 'first_name', 'auth_date', 'hash'],
        properties: {
          id: { type: 'number' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          username: { type: 'string' },
          photo_url: { type: 'string' },
          auth_date: { type: 'number' },
          hash: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                telegramUserId: { type: 'string' },
                firstName: { type: 'string' },
                username: { type: 'string' },
                isRegistered: { type: 'boolean' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    handler: async (request: FastifyRequest<{ Body: TelegramLoginBody }>, reply: FastifyReply) => {
      const data = request.body;

      // Check auth_date freshness (max 24 hours old)
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const maxAge = 24 * 60 * 60; // 24 hours
      if (currentTimestamp - data.auth_date > maxAge) {
        return reply.status(401).send({ error: 'Auth data expired' });
      }

      // Validate Telegram signature - must include ALL fields from request
      const authData: Record<string, string | number | undefined> = {
        id: data.id,
        first_name: data.first_name,
        last_name: data.last_name,
        username: data.username,
        photo_url: data.photo_url,
        auth_date: data.auth_date,
        hash: data.hash,
      };

      // Debug logging
      console.log('Telegram auth data received:', JSON.stringify(data, null, 2));
      console.log('Auth data for validation:', JSON.stringify(authData, null, 2));

      if (!validateTelegramAuth(authData, config.bot.token)) {
        return reply.status(401).send({ error: 'Invalid Telegram auth signature' });
      }

      // Find user in database
      const dbUser = await prisma.user.findUnique({
        where: { telegramUserId: BigInt(data.id) },
      });

      // If user not in system, return specific error for redirect
      if (!dbUser) {
        return reply.status(403).send({
          error: 'User not registered. Please use the bot first to create an account.',
          code: 'USER_NOT_REGISTERED',
        });
      }

      // Create JWT token
      const token = createToken(
        {
          telegramUserId: data.id.toString(),
          firstName: data.first_name,
          username: data.username,
        },
        jwtSecret
      );

      logger.info({
        event: 'user_login',
        telegramUserId: data.id,
        username: data.username,
      });

      return {
        token,
        user: {
          telegramUserId: data.id.toString(),
          firstName: data.first_name,
          username: data.username,
          isRegistered: true,
        },
      };
    },
  });

  // POST /auth/webapp - Authenticate via Telegram WebApp initData and get JWT
  interface WebAppAuthBody {
    initData: string;
  }

  fastify.post<{ Body: WebAppAuthBody }>('/auth/webapp', {
    schema: {
      description: 'Authenticate via Telegram WebApp initData and receive JWT token',
      tags: ['Auth'],
      body: {
        type: 'object',
        required: ['initData'],
        properties: {
          initData: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                telegramUserId: { type: 'string' },
                firstName: { type: 'string' },
                username: { type: 'string' },
                isRegistered: { type: 'boolean' },
              },
            },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        403: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
      },
    },
    handler: async (request: FastifyRequest<{ Body: WebAppAuthBody }>, reply: FastifyReply) => {
      const { initData } = request.body;

      // Validate WebApp initData
      const userData = validateTelegramWebApp(initData, config.bot.token);
      if (!userData) {
        return reply.status(401).send({ error: 'Invalid WebApp initData' });
      }

      // Check auth_date freshness (max 24 hours old)
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const maxAge = 24 * 60 * 60;
      if (currentTimestamp - userData.auth_date > maxAge) {
        return reply.status(401).send({ error: 'Auth data expired' });
      }

      // Find or create user in database
      await prisma.user.upsert({
        where: { telegramUserId: BigInt(userData.id) },
        update: {
          firstName: userData.first_name,
          username: userData.username ?? null,
        },
        create: {
          telegramUserId: BigInt(userData.id),
          firstName: userData.first_name,
          username: userData.username ?? null,
        },
      });

      // Create JWT token
      const token = createToken(
        {
          telegramUserId: userData.id.toString(),
          firstName: userData.first_name,
          username: userData.username,
        },
        jwtSecret
      );

      logger.info({
        event: 'user_webapp_login',
        telegramUserId: userData.id,
        username: userData.username,
      });

      return {
        token,
        user: {
          telegramUserId: userData.id.toString(),
          firstName: userData.first_name,
          username: userData.username,
          isRegistered: true,
        },
      };
    },
  });

  // GET /projects - List user's projects
  fastify.get('/projects', {
    schema: {
      description: 'Get list of projects for current user',
      tags: ['Projects'],
      security: [{ telegramAuth: [] }],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              telegramChatId: { type: 'string' },
              title: { type: 'string' },
              type: { type: 'string' },
              role: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
      },
    },
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user?.userId) {
        return reply.status(404).send({ error: 'User not found in system' });
      }

      const memberships = await prisma.membership.findMany({
        where: { userId: request.user.userId },
        include: { project: true },
      });

      return memberships.map((m) => ({
        id: m.project.id,
        telegramChatId: m.project.telegramChatId.toString(),
        title: m.project.title,
        type: m.project.type,
        role: m.role,
        createdAt: m.project.createdAt.toISOString(),
      }));
    },
  });

  // GET /projects/:id/users - Get project members
  fastify.get<{ Params: { id: string } }>('/projects/:id/users', {
    schema: {
      description: 'Get members of a project',
      tags: ['Projects'],
      security: [{ telegramAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string' },
              telegramUserId: { type: 'string' },
              firstName: { type: 'string' },
              username: { type: 'string' },
              role: { type: 'string' },
            },
          },
        },
      },
    },
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user?.userId) {
        return reply.status(404).send({ error: 'User not found in system' });
      }

      const projectId = request.params.id;

      // Check if user is a member of this project
      const membership = await prisma.membership.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: request.user.userId,
          },
        },
      });

      if (!membership) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      const members = await prisma.membership.findMany({
        where: { projectId },
        include: { user: true },
      });

      return members.map((m) => ({
        userId: m.user.id,
        telegramUserId: m.user.telegramUserId.toString(),
        firstName: m.user.firstName,
        username: m.user.username,
        role: m.role,
      }));
    },
  });

  // GET /projects/:id/meals - Get meals for a project
  fastify.get<{ Params: { id: string }; Querystring: MealsQuery }>('/projects/:id/meals', {
    schema: {
      description: 'Get meal entries for a project within a date range',
      tags: ['Meals'],
      security: [{ telegramAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          from: { type: 'string', format: 'date-time' },
          to: { type: 'string', format: 'date-time' },
        },
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              userId: { type: 'string' },
              recordedAt: { type: 'string' },
              caloriesEstimated: { type: 'number' },
              description: { type: 'string' },
              source: { type: 'string' },
              aiConfidence: { type: 'number' },
              needsReview: { type: 'boolean' },
              user: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  username: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    handler: async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: MealsQuery }>,
      reply: FastifyReply
    ) => {
      if (!request.user?.userId) {
        return reply.status(404).send({ error: 'User not found in system' });
      }

      const projectId = request.params.id;
      const { from, to } = request.query;

      // Check if user is a member of this project
      const membership = await prisma.membership.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: request.user.userId,
          },
        },
      });

      if (!membership) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      // Build date filter
      const dateFilter: { gte?: Date; lte?: Date } = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) dateFilter.lte = new Date(to);

      const meals = await prisma.mealEntry.findMany({
        where: {
          projectId,
          ...(Object.keys(dateFilter).length > 0 ? { recordedAt: dateFilter } : {}),
        },
        include: {
          user: {
            select: {
              firstName: true,
              username: true,
            },
          },
        },
        orderBy: { recordedAt: 'desc' },
      });

      return meals.map((m) => ({
        id: m.id,
        userId: m.userId,
        recordedAt: m.recordedAt.toISOString(),
        caloriesEstimated: m.caloriesEstimated,
        description: m.description,
        source: m.source,
        aiConfidence: m.aiConfidence,
        needsReview: m.needsReview,
        user: {
          firstName: m.user.firstName,
          username: m.user.username,
        },
      }));
    },
  });

  // POST /meals - Create a meal entry
  fastify.post<{ Body: CreateMealBody }>('/meals', {
    schema: {
      description: 'Create a new meal entry',
      tags: ['Meals'],
      security: [{ telegramAuth: [] }],
      body: {
        type: 'object',
        required: ['projectId', 'recordedAt', 'caloriesEstimated'],
        properties: {
          projectId: { type: 'string' },
          recordedAt: { type: 'string', format: 'date-time' },
          caloriesEstimated: { type: 'number', minimum: 1, maximum: 10000 },
          description: { type: 'string' },
          source: { type: 'string', enum: ['photo', 'manual', 'web'] },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            userId: { type: 'string' },
            recordedAt: { type: 'string' },
            caloriesEstimated: { type: 'number' },
            description: { type: 'string' },
            source: { type: 'string' },
          },
        },
      },
    },
    handler: async (request: FastifyRequest<{ Body: CreateMealBody }>, reply: FastifyReply) => {
      if (!request.user?.userId) {
        return reply.status(404).send({ error: 'User not found in system' });
      }

      const { projectId, recordedAt, caloriesEstimated, description, source } = request.body;

      // Check if user is a member of this project
      const membership = await prisma.membership.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: request.user.userId,
          },
        },
      });

      if (!membership) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      // Validate calories
      if (caloriesEstimated < 1 || caloriesEstimated > 10000) {
        return reply.status(400).send({ error: 'Calories must be between 1 and 10000' });
      }

      const meal = await prisma.mealEntry.create({
        data: {
          projectId,
          userId: request.user.userId,
          recordedAt: new Date(recordedAt),
          caloriesEstimated,
          description: description ?? null,
          source: (source ?? MealEntrySource.WEB) as typeof MealEntrySource.WEB,
        },
        include: {
          user: {
            select: {
              firstName: true,
              username: true,
            },
          },
        },
      });

      logger.info({
        event: 'meal_created',
        mealId: meal.id,
        projectId,
        userId: request.user.userId,
        calories: caloriesEstimated,
      });

      const mealWithUser = meal as typeof meal & { user: { firstName: string; username: string | null } };

      return reply.status(201).send({
        id: mealWithUser.id,
        projectId: mealWithUser.projectId,
        userId: mealWithUser.userId,
        recordedAt: mealWithUser.recordedAt.toISOString(),
        caloriesEstimated: mealWithUser.caloriesEstimated,
        description: mealWithUser.description,
        source: mealWithUser.source,
        needsReview: mealWithUser.needsReview,
        aiConfidence: mealWithUser.aiConfidence,
        user: {
          firstName: mealWithUser.user.firstName,
          username: mealWithUser.user.username,
        },
      });
    },
  });

  // POST /meals/analyze-photo - Analyze food photo and return AI results
  fastify.post<{ Body: { photo: string } }>('/meals/analyze-photo', {
    schema: {
      description: 'Analyze a food photo using AI and return calorie estimation',
      tags: ['Meals'],
      security: [{ telegramAuth: [] }],
      body: {
        type: 'object',
        required: ['photo'],
        properties: {
          photo: { type: 'string', description: 'Base64-encoded image data (without data: prefix)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            is_food: { type: 'boolean' },
            food_confidence: { type: 'number' },
            estimated_calories: { type: 'number', nullable: true },
            description: { type: 'string', nullable: true },
          },
        },
      },
    },
    handler: async (request: FastifyRequest<{ Body: { photo: string } }>, reply: FastifyReply) => {
      if (!request.user?.userId) {
        return reply.status(404).send({ error: 'User not found in system' });
      }

      const { photo } = request.body;
      if (!photo) {
        return reply.status(400).send({ error: 'Photo data is required' });
      }

      // Remove data URL prefix if present
      const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      if (imageBuffer.length === 0) {
        return reply.status(400).send({ error: 'Invalid image data' });
      }

      if (imageBuffer.length > 10 * 1024 * 1024) {
        return reply.status(400).send({ error: 'Image too large (max 10MB)' });
      }

      const foodService = getFoodVisionService(logger);
      const result = await foodService.analyze(imageBuffer);

      return reply.send(result);
    },
  });

  // PUT /meals/:id - Update a meal entry
  fastify.put<{ Params: { id: string }; Body: UpdateMealBody }>('/meals/:id', {
    schema: {
      description: 'Update a meal entry',
      tags: ['Meals'],
      security: [{ telegramAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          recordedAt: { type: 'string', format: 'date-time' },
          caloriesEstimated: { type: 'number', minimum: 1, maximum: 10000 },
          description: { type: 'string' },
          needsReview: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            recordedAt: { type: 'string' },
            caloriesEstimated: { type: 'number' },
            description: { type: 'string' },
            needsReview: { type: 'boolean' },
          },
        },
      },
    },
    handler: async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateMealBody }>,
      reply: FastifyReply
    ) => {
      if (!request.user?.userId) {
        return reply.status(404).send({ error: 'User not found in system' });
      }

      const mealId = request.params.id;

      // Find the meal
      const meal = await prisma.mealEntry.findUnique({
        where: { id: mealId },
        include: {
          project: {
            include: {
              memberships: {
                where: { userId: request.user.userId },
              },
            },
          },
        },
      });

      if (!meal) {
        return reply.status(404).send({ error: 'Meal not found' });
      }

      // Check permissions: own meal or admin
      const userMembership = meal.project.memberships[0];
      if (!userMembership) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      const isOwner = meal.userId === request.user.userId;
      const isAdmin = userMembership.role === MembershipRole.ADMIN;

      if (!isOwner && !isAdmin) {
        return reply.status(403).send({ error: 'Can only edit own meals or as admin' });
      }

      const { recordedAt, caloriesEstimated, description, needsReview } = request.body;

      // Validate calories if provided
      if (caloriesEstimated !== undefined && (caloriesEstimated < 1 || caloriesEstimated > 10000)) {
        return reply.status(400).send({ error: 'Calories must be between 1 and 10000' });
      }

      const updateData: {
        recordedAt?: Date;
        caloriesEstimated?: number;
        description?: string;
        needsReview?: boolean;
      } = {};

      if (recordedAt !== undefined) updateData.recordedAt = new Date(recordedAt);
      if (caloriesEstimated !== undefined) updateData.caloriesEstimated = caloriesEstimated;
      if (description !== undefined) updateData.description = description;
      if (needsReview !== undefined) updateData.needsReview = needsReview;

      const updatedMeal = await prisma.mealEntry.update({
        where: { id: mealId },
        data: updateData,
        include: {
          user: {
            select: {
              firstName: true,
              username: true,
            },
          },
        },
      });

      logger.info({
        event: 'meal_updated',
        mealId,
        userId: request.user.userId,
        isAdmin,
      });

      return {
        id: updatedMeal.id,
        userId: updatedMeal.userId,
        recordedAt: updatedMeal.recordedAt.toISOString(),
        caloriesEstimated: updatedMeal.caloriesEstimated,
        description: updatedMeal.description,
        source: updatedMeal.source,
        aiConfidence: updatedMeal.aiConfidence,
        needsReview: updatedMeal.needsReview,
        user: {
          firstName: updatedMeal.user.firstName,
          username: updatedMeal.user.username,
        },
      };
    },
  });

  // DELETE /meals/:id - Delete a meal entry
  fastify.delete<{ Params: { id: string } }>('/meals/:id', {
    schema: {
      description: 'Delete a meal entry',
      tags: ['Meals'],
      security: [{ telegramAuth: [] }],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
    handler: async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user?.userId) {
        return reply.status(404).send({ error: 'User not found in system' });
      }

      const mealId = request.params.id;

      // Find the meal
      const meal = await prisma.mealEntry.findUnique({
        where: { id: mealId },
        include: {
          project: {
            include: {
              memberships: {
                where: { userId: request.user.userId },
              },
            },
          },
        },
      });

      if (!meal) {
        return reply.status(404).send({ error: 'Meal not found' });
      }

      // Check permissions: own meal or admin
      const userMembership = meal.project.memberships[0];
      if (!userMembership) {
        return reply.status(403).send({ error: 'Access denied' });
      }

      const isOwner = meal.userId === request.user.userId;
      const isAdmin = userMembership.role === MembershipRole.ADMIN;

      if (!isOwner && !isAdmin) {
        return reply.status(403).send({ error: 'Can only delete own meals or as admin' });
      }

      await prisma.mealEntry.delete({
        where: { id: mealId },
      });

      logger.info({
        event: 'meal_deleted',
        mealId,
        userId: request.user.userId,
        isAdmin,
      });

      return { success: true };
    },
  });

  // Serve web frontend (SPA)
  // In dev: src/api/ → ../web/dist (works)
  // In prod: dist/api/ → ../../src/web/dist (compiled output is in dist/)
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDistPath = path.join(__dirname, '..', '..', 'src', 'web', 'dist');

  void fastify.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback: serve index.html for unmatched frontend routes (not API)
  fastify.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html', webDistPath);
  });
}

/**
 * Creates and configures the REST API server
 */
export async function createApiServer(
  config: Config,
  logger: pino.Logger
): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: false, // Use our pino logger instead
  });

  // CORS configuration for web app
  await fastify.register(cors, {
    origin: config.bot.appUrl ? [config.bot.appUrl, 'http://localhost:5173'] : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data'],
  });

  // Swagger documentation
  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Food Calories Bot API',
        description: 'REST API for Food Calories Telegram Bot',
        version: '1.0.0',
      },
      servers: [
        {
          url: config.bot.appUrl ?? 'http://localhost:3000',
          description: 'API Server',
        },
      ],
      components: {
        securitySchemes: {
          telegramAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization',
            description: 'Telegram Login Widget data or WebApp initData',
          },
        },
      },
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Register API routes
  registerApiRoutes(fastify, config, logger);

  return fastify;
}

/**
 * Starts the API server
 */
export async function startApiServer(
  config: Config,
  logger: pino.Logger
): Promise<FastifyInstance> {
  const server = await createApiServer(config, logger);

  await server.listen({
    host: config.server.host,
    port: config.server.port,
  });

  logger.info({
    event: 'api_started',
    port: config.server.port,
    docsUrl: `http://localhost:${config.server.port}/docs`,
  });

  return server;
}
