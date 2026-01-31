# Plan: Telegram Food Calories Bot + Web App

## Overview

Система для отслеживания калорийности еды через Telegram-бота с AI-распознаванием и веб-интерфейсом.

**Ключевые решения:**
- **Стек**: TypeScript (Fastify + grammy + Prisma + React)
- **Web App**: Telegram Mini App + Standalone сайт с Login Widget
- **Личные чаты**: Поддерживаются (персональный "проект")
- **Роль админа**: Первый пользователь + команда `/setadmin`
- **Реакция на не-еду**: Эмодзи-реакция 🤷
- **AuditLog**: Пропущен в MVP

## Validation Commands

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

---

### Task 1: Инициализация проекта и базовая структура

- [x] Создать package.json с TypeScript, ESLint, Prettier
- [x] Настроить tsconfig.json (strict mode)
- [x] Создать структуру директорий: `/src/{bot,ai,db,api,web}`, `/prisma`, `/config`
- [x] Добавить .env.example со всеми переменными
- [x] Настроить ESLint + Prettier для единого стиля кода
- [x] Создать docker-compose.yml (postgres, app)
- [x] Добавить .gitignore (node_modules, .env, dist)

### Task 2: Модель данных и Prisma

- [x] Создать prisma/schema.prisma с моделями:
  - Project (id, telegram_chat_id, title, type: group|personal, created_at)
  - User (id, telegram_user_id, first_name, username)
  - Membership (id, project_id, user_id, role: member|admin)
  - MealEntry (id, project_id, user_id, date, time, calories_estimated, description, source, photo_file_id, ai_confidence, needs_review, created_at, updated_at)
- [x] Настроить dual-database: Postgres (prod) + SQLite (dev) через env
- [x] Создать начальную миграцию
- [x] Добавить seed-скрипт для тестовых данных
- [x] Экспортировать типы Prisma для использования в коде

### Task 3: Конфигурация и переменные окружения

- [x] Создать /src/config/index.ts с типизированной конфигурацией
- [x] Валидация env переменных при старте (zod или joi)
- [x] Поддержка MODE=dev|prod для переключения polling/webhook
- [x] Настройки: BOT_TOKEN, DATABASE_URL, OPENAI_API_KEY, OPENAI_MODEL, AI_FOOD_CONFIDENCE_THRESHOLD, WEBHOOK_URL, APP_URL, LOG_LEVEL, TZ
- [x] Graceful fallback для опциональных переменных

### Task 4: AI модуль (OpenAI Vision)

- [x] Создать /src/ai/FoodVisionService.ts
- [x] Метод analyze(imageBuffer: Buffer): Promise<FoodAnalysisResult>
- [x] Интерфейс результата: { is_food, food_confidence, estimated_calories, description }
- [x] Использовать OpenAI structured outputs (JSON mode)
- [x] Реализовать retry с exponential backoff
- [x] Валидация калорий в диапазоне 10-10000 ккал
- [x] Graceful fallback при ошибке API
- [x] Логирование без секретов
- [x] Unit-тесты с мок-ответами

### Task 5: Telegram Bot — базовая структура

- [x] Создать /src/bot/index.ts с grammy
- [x] Поддержка режимов: long polling (dev) и webhook (prod)
- [x] Middleware для логирования
- [x] Error handler с graceful recovery
- [x] Команды: /start, /help
- [x] Health check endpoint для webhook

### Task 6: Telegram Bot — обработка фото

- [x] Обработчик сообщений с фото (message:photo)
- [x] Определение типа чата (группа/личка)
- [x] Upsert Project (с type: group|personal)
- [x] Upsert User
- [x] Upsert Membership (первый пользователь = admin)
- [x] Скачивание фото через Telegram API
- [x] Отправка в FoodVisionService
- [x] Если еда: создать MealEntry, ответить "Записал ~XXX ккал"
- [x] Если не еда: поставить реакцию 🤷 на сообщение
- [x] Обработка ошибок AI без падения бота

### Task 7: Telegram Bot — команды

- [x] /start — приветствие + краткая инструкция
- [x] /help — описание функций бота
- [x] /today — статистика калорий за сегодня
- [x] /myweek — статистика за неделю
- [x] /project — информация о текущем проекте/группе
- [x] /setadmin @username — назначить админа (только для админов)

### Task 8: REST API Backend

- [x] Создать /src/api/index.ts с Fastify
- [x] CORS настройка для web app
- [x] Middleware авторизации (Telegram WebApp/Login Widget)
- [x] Эндпоинты:
  - GET /auth/me — текущий пользователь
  - GET /projects — список проектов пользователя
  - GET /projects/:id/users — участники проекта
  - GET /projects/:id/meals?from=&to= — записи за период
  - POST /meals — создать запись
  - PUT /meals/:id — редактировать запись
  - DELETE /meals/:id — удалить запись
- [x] Валидация прав: пользователь — свои записи, админ — все
- [x] Swagger/OpenAPI документация

### Task 9: Web App — авторизация

- [x] Telegram Mini App авторизация (WebApp.initData)
- [x] Telegram Login Widget для standalone сайта
- [x] Верификация подписи от Telegram
- [x] JWT токены для сессии
- [x] Endpoint /auth/telegram для обработки Login Widget
- [x] Редирект "Нет данных" если пользователь не в системе

### Task 10: Web App — Frontend (React)

- [x] Создать /src/web с Vite + React + TypeScript
- [x] Роутинг: /login, /projects, /projects/:id
- [x] Компонент авторизации (Mini App + Login Widget)
- [x] Список проектов (1 проект → сразу открыть)
- [x] UI kit: простой, без тяжёлых библиотек (Tailwind CSS)

### Task 11: Web App — Календарь

- [ ] Компонент календаря (неделя по умолчанию)
- [ ] Переключение неделя/месяц
- [ ] Строки: пользователи проекта
- [ ] Столбцы: дни
- [ ] Ячейки: записи + сумма ккал за день
- [ ] Клик на ячейку → детали записей

### Task 12: Web App — CRUD операции

- [ ] Модальное окно добавления записи (дата, время, калории, описание)
- [ ] Редактирование существующей записи
- [ ] Удаление записи с подтверждением
- [ ] Проверка прав: свои записи или админ
- [ ] Оптимистичные обновления UI

### Task 13: Docker и деплой

- [ ] Dockerfile для приложения (multi-stage build)
- [ ] docker-compose.yml: app + postgres
- [ ] Healthcheck endpoint (/health)
- [ ] Скрипт миграций при старте контейнера
- [ ] Структурные логи (pino)
- [ ] Graceful shutdown

### Task 14: README и документация

- [ ] README.md с полным описанием:
  - Установка зависимостей
  - Настройка .env
  - Запуск dev (polling)
  - Запуск prod (webhook)
  - Настройка webhook в Telegram
  - Структура проекта
  - Примеры использования
- [ ] Комментарии к сложным частям кода
- [ ] API документация (Swagger)

### Task 15: Тестирование и финализация

- [ ] Unit-тесты для AI модуля
- [ ] Integration-тесты для API endpoints
- [ ] E2E тест: фото → распознавание → сохранение
- [ ] Проверка Definition of Done:
  - [ ] Бот распознаёт еду
  - [ ] Сохраняет калории
  - [ ] Работает polling + webhook
  - [ ] Веб открывается через Telegram
  - [ ] Календарь показывает данные
  - [ ] CRUD работает
  - [ ] README есть
  - [ ] Проект запускается одной командой

---

## Архитектура

```
/src
  /bot          — grammy handlers, commands
  /ai           — FoodVisionService (OpenAI)
  /db           — Prisma client, queries
  /api          — Fastify REST API
  /web          — React frontend (Vite)
  /config       — env validation, settings
/prisma
  schema.prisma
  /migrations
/docker
  Dockerfile
docker-compose.yml
.env.example
README.md
```

## Технологический стек

| Компонент | Технология |
|-----------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript 5.x |
| Bot | grammy |
| API | Fastify |
| ORM | Prisma |
| Database | PostgreSQL (prod) / SQLite (dev) |
| Frontend | React + Vite + Tailwind |
| AI | OpenAI GPT-4 Vision |
| Container | Docker + docker-compose |

## Переменные окружения

```env
# Telegram
BOT_TOKEN=
WEBHOOK_URL=
APP_URL=

# Database
DATABASE_URL=

# OpenAI
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
AI_FOOD_CONFIDENCE_THRESHOLD=0.6

# App
MODE=dev
LOG_LEVEL=info
TZ=Europe/Moscow
```
