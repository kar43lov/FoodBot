---
description: "Запустить локального бота в dev-режиме (long polling + SQLite)"
allowed-tools: ["Bash", "Read", "Grep", "Glob"]
---

# Dev Bot — локальный запуск FoodBot

Запускает бота локально в dev-режиме: long polling, SQLite, pino-pretty логи.

## Предварительные проверки

### 1. Убедиться, что .env настроен для dev

Проверь `.env`:
```bash
grep -E '^(MODE|DATABASE_URL|BOT_TOKEN|BOT_NAME)' .env
```

Ожидаемые значения:
- `MODE=dev`
- `DATABASE_URL=file:./dev.db` (SQLite)
- `BOT_TOKEN=...` (должен быть заполнен)
- `BOT_NAME=...` (должен быть заполнен)

Если MODE не `dev` — СТОП, предупреди пользователя.

### 2. Убедиться, что Prisma client актуален

```bash
npx prisma generate 2>&1
```

Если были изменения в schema — применить:
```bash
npx prisma db push 2>&1
```

### 3. Убедиться, что зависимости установлены

```bash
npm ls --depth=0 2>&1 | tail -5
```

Если ошибки — запустить `npm install`.

### 4. Проверить, не запущен ли уже бот

```bash
pgrep -f "tsx watch src/index.ts" || pgrep -f "node dist/index.js" || echo "NOT_RUNNING"
```

Если запущен — предупредить и спросить, остановить ли.

### 5. Проверить, что webhook не мешает

В dev-режиме бот использует long polling. Если на prod-боте стоит webhook на тот же токен — будет конфликт. Dev-бот при старте сам удаляет webhook (`bot.api.deleteWebhook()`), так что всё ОК.

**Но если это тот же токен что и в проде — предупредить:**
> ⚠️ Запуск dev-бота отключит webhook на продакшн-боте. Если прод-бот сейчас работает, лучше использовать отдельный тестовый бот-токен.

## Запуск

Запустить бота в фоне через Bash (run_in_background):

```bash
npm run dev
```

Это запустит `tsx watch src/index.ts` — hot-reload при изменениях в src/.

## После запуска

Подождать 3 секунды и проверить:
```bash
sleep 3 && curl -s http://localhost:3000/health 2>/dev/null || echo "Health endpoint not ready yet"
```

Сообщить пользователю:
- Бот запущен в режиме long polling
- SQLite БД: `prisma/dev.db`
- Логи в pretty-формате в консоли
- Hot-reload включен
- Для остановки: Ctrl+C или `pkill -f "tsx watch"`

## Для запуска с веб-частью

Если нужен и фронтенд:
```bash
cd src/web && npm run dev
```
Vite dev-сервер на http://localhost:5173 с proxy `/api` → `localhost:3000`.

## Важно

- **НЕ** менять .env на сервере
- **НЕ** запускать `npm run start` (это для production)
- Если нужен webhook для тестирования Mini App — используй `/pg.foodbot.web-tunnel`
- Dev-бот и prod-бот могут конфликтовать если используют один BOT_TOKEN
