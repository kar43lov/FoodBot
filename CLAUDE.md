# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Food Calories Bot — Telegram-бот для отслеживания калорийности пищи с AI-распознаванием изображений через OpenAI Vision API. Включает веб-интерфейс (React Mini App) для управления записями.

## Development Commands

```bash
# Development (two terminals)
npm run dev              # Bot + API (long polling mode)
npm run web:dev          # Frontend dev server

# Build
npm run build            # TypeScript compilation
npm run web:build        # React build → src/web/dist/

# Testing
npm test                 # All tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report

# Code quality
npm run lint             # ESLint check
npm run lint:fix         # Auto-fix
npm run format           # Prettier format
npm run typecheck        # TypeScript check only

# Database (Prisma)
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run dev migrations
npm run db:push          # Push schema changes
npm run db:seed          # Insert test data

# Production (Docker)
docker-compose up -d     # PostgreSQL + app
```

## Architecture

```
src/
├── index.ts          # Entry: graceful shutdown, logger init, bot+api startup
├── config/           # Zod-validated environment config (getConfig singleton)
├── bot/              # grammy Telegram bot
│   ├── commands.ts   # /start, /help, /today, /myweek, /project, /setadmin
│   └── photoHandler.ts  # Photo → AI analysis → DB save
├── api/              # Fastify REST API
│   ├── index.ts      # Routes, auth middleware, Swagger docs
│   └── jwt.ts        # JWT generation/verification (secret from BOT_TOKEN)
├── ai/               # FoodVisionService (OpenAI Vision, exponential backoff)
├── db/               # Prisma client export
└── web/              # React + Vite + Tailwind frontend (separate package.json)

prisma/
├── schema.prisma      # SQLite (dev)
└── schema.prod.prisma # PostgreSQL (prod)
```

## Key Patterns

**Database Models:**
- `Project` — Telegram chat (group or personal), has many MealEntries
- `User` — Telegram user
- `Membership` — User ↔ Project junction with role (member/admin)
- `MealEntry` — Food record with calories, photo, AI confidence

**Auth Flow:**
1. Telegram Login Widget: validates `hash` (HMAC-SHA256 with botToken)
2. Telegram Mini App: validates `initData` WebAppData
3. Both return JWT token for subsequent API calls

**AI Service:**
- Sends base64 image to OpenAI Vision (gpt-4o default)
- Returns: `is_food`, `food_confidence`, `estimated_calories`, `description`
- Exponential backoff: 3 attempts (1s, 2s, 4s delays)

**Modes:**
- `dev`: SQLite, long polling, pretty logs
- `prod`: PostgreSQL, webhook, JSON logs

## Environment Variables

Required:
- `BOT_TOKEN` — Telegram bot token
- `OPENAI_API_KEY` — OpenAI API key
- `DATABASE_URL` — Database connection string

Required in prod:
- `WEBHOOK_URL` — Webhook URL for Telegram
- `APP_URL` — Public app URL

Optional:
- `MODE` — dev/prod (default: dev)
- `OPENAI_MODEL` — default: gpt-4o
- `AI_FOOD_CONFIDENCE_THRESHOLD` — default: 0.6
- `LOG_LEVEL` — trace/debug/info/warn/error/fatal (default: info)
- `PORT` — default: 3000

## Code Style

- Strict TypeScript (no implicit any)
- ESLint + Prettier enforced
- Single quotes, semicolons, 2-space indent, 100 char width
- Pino for structured logging (JSON in prod)
- Zod for runtime validation
