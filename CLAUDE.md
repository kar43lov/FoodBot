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

# Production deploy
/pg.foodbot.deploy           # deploy main to VPS
/pg.foodbot.deploy develop   # deploy specific branch
```

## Architecture

```
src/
├── index.ts              # Entry: graceful shutdown, logger init, access control init
├── config/               # Zod-validated environment config (getConfig singleton)
├── bot/                  # grammy Telegram bot
│   ├── commands.ts       # /start, /help, /today, /myweek, /project, /setadmin
│   ├── adminCommands.ts  # /allowchat, /denychat, /allowuser, /denyuser, /setmanager, /removemanager, /listallowed
│   ├── accessControl.ts  # AccessControl class (in-memory cache + Prisma, singleton)
│   ├── accessGuard.ts    # grammy middleware — blocks non-whitelisted chats/users
│   └── photoHandler.ts   # Photo → AI analysis → DB save
├── api/                  # Fastify REST API
│   ├── index.ts          # Routes, auth middleware, Swagger docs
│   └── jwt.ts            # JWT generation/verification (secret from BOT_TOKEN)
├── ai/                   # FoodVisionService (OpenAI Vision, exponential backoff)
├── db/                   # Prisma client export
└── web/                  # React + Vite + Tailwind frontend (separate package.json)

prisma/
├── schema.prisma          # SQLite (dev)
└── schema.prod.prisma     # PostgreSQL (prod)
```

## Key Patterns

**Database Models:**
- `Project` — Telegram chat (group or personal), has many MealEntries
- `User` — Telegram user
- `Membership` — User ↔ Project junction with role (member/admin)
- `MealEntry` — Food record with calories, photo, AI confidence
- `AllowedChat` — Whitelisted group chat (telegram_chat_id)
- `AllowedUser` — Whitelisted user for personal chat (telegram_user_id)
- `Manager` — User who can manage whitelists (telegram_user_id)

**Access Control:**
- `SUPER_ADMIN_ID` in .env — single superadmin, bypasses all checks
- Middleware chain: sequentialize → updateId dedup → accessGuard → logging → commands/handlers
- AccessControl class: in-memory Set cache, loaded from DB at startup
- Admin commands from superadmin/manager pass through guard even in non-whitelisted chats
- `ADMIN_COMMANDS` constant in accessGuard.ts — single source of truth for admin command names

**Webhook handling (prod):**
- Webhook отвечает Telegram **200 OK немедленно**, `bot.handleUpdate` выполняется в фоне. Telegram считает webhook неудачным после ~60s и шлёт retry — синхронный ACK при медленном OpenAI вызывал 5-6× обработку одного фото.
- `bot.init()` вызывается eagerly в `createWebhookServer` (через `isInited()` guard) — без него `handleUpdate` бросает `Bot not initialized!`.
- Дедупликация по `update_id` (Set+LRU 500) — защита от копий, накопленных в очереди sequentialize до фикса timeout.
- `inFlight` Set + Fastify `onClose` hook ждёт background handlers до 30 сек при SIGTERM — чтобы деплой не терял in-flight updates (Telegram больше не ретраит после нашего 200 OK).
- При изменении webhook handler'а **не возвращайся к синхронному ACK** — это вернёт баг с дубликатами.

**Auth Flow:**
1. Telegram Login Widget: validates `hash` (HMAC-SHA256 with botToken)
2. Telegram Mini App: validates `initData` WebAppData
3. Both return JWT token for subsequent API calls

**AI Service:**
- Sends base64 image to OpenAI Vision (gpt-4o default)
- Returns: `is_food`, `food_confidence`, `estimated_calories`, `description`
- Exponential backoff: 3 attempts (1s, 2s, 4s delays)

**Dual Prisma Schemas:**
- `prisma/schema.prisma` — SQLite (dev), fields like `source` are `String`
- `prisma/schema.prod.prisma` — PostgreSQL, uses proper enums (`MealEntrySource`, `MembershipRole`)
- `src/db/index.ts` — exports const objects (`MealEntrySource.WEB = 'web'`) that work with both schemas
- When adding enum-like fields: use `'value' as const` in test mocks to satisfy both schemas

**Modes:**
- `dev`: SQLite, long polling, pretty logs (pino-pretty)
- `prod`: SQLite on VPS, webhook, JSON logs

## Environment Variables

Required:
- `BOT_TOKEN` — Telegram bot token
- `BOT_NAME` — Bot username (without @)
- `SUPER_ADMIN_ID` — Telegram user ID of superadmin
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

## Deployment

**Server:** karvpn (karvpn.isgood.host), Ubuntu 24.04, 1 GB RAM — no Docker (not enough RAM for build).

```bash
# Из Claude Code
/pg.foodbot.deploy              # main branch
/pg.foodbot.deploy develop      # specific branch
```

**Workflow:** работа на `develop` → PR в `develop` → merge → локально merge `develop` → `main --no-ff` → `git push origin main` → `/pg.foodbot.deploy`. Сервер берёт код с `origin/main`.

**Stack:** Node.js 20 + systemd + SQLite + nginx reverse proxy + Let's Encrypt SSL

**Deploy flow:** git pull → npm run build → systemctl restart foodbot → health check

**Структура на сервере:**
- `/opt/foodbot/` — git repo + .env (prod-only, не в git)
- `/opt/foodbot/data/foodbot.db` — SQLite database
- systemd service: `foodbot`
- nginx: SNI routing on 443 → port 8444 → proxy_pass localhost:3000
- Domain: `cheatmealday.karlov.dev`

**WEBHOOK_URL** в .env: `https://cheatmealday.karlov.dev` (без `/webhook` — код добавляет path сам)

**Откат:** `ssh karvpn "cd /opt/foodbot && git reset --hard HEAD~1 && npm run build && systemctl restart foodbot"`

**Важно:** на сервере также работает X-Ray VPN и psychologist-bot. Не трогать nginx stream/VPN конфиги.

## Code Style

- Strict TypeScript (no implicit any)
- ESLint + Prettier enforced
- Single quotes, semicolons, 2-space indent, 100 char width
- Pino for structured logging (JSON in prod)
- Zod for runtime validation
