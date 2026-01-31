# Food Calories Bot

Telegram-бот для отслеживания калорийности еды с AI-распознаванием и веб-интерфейсом.

## Возможности

- Распознавание еды на фото через OpenAI Vision API
- Автоматическая оценка калорийности
- Статистика за день и неделю
- Поддержка групповых чатов и личных сообщений
- Веб-интерфейс с календарём (Telegram Mini App + standalone)
- CRUD операции для записей через веб

## Требования

- Node.js 20+
- PostgreSQL 16+ (для production) или SQLite (для разработки)
- OpenAI API ключ с доступом к GPT-4 Vision
- Telegram Bot Token

## Установка

```bash
# Клонировать репозиторий
git clone <repository-url>
cd FoodBot

# Установить зависимости
npm install

# Установить зависимости веб-приложения
npm run web:install

# Скопировать пример конфигурации
cp .env.example .env
```

## Настройка .env

```env
# Telegram Bot
BOT_TOKEN=your_telegram_bot_token_here
WEBHOOK_URL=https://your-domain.com/webhook
APP_URL=https://your-domain.com

# База данных
# SQLite для разработки:
DATABASE_URL=file:./dev.db
# PostgreSQL для production:
# DATABASE_URL=postgresql://user:password@localhost:5432/foodbot?schema=public

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4o
AI_FOOD_CONFIDENCE_THRESHOLD=0.6

# Приложение
MODE=dev
LOG_LEVEL=info
TZ=Europe/Moscow

# Сервер
PORT=3000
HOST=0.0.0.0
```

### Переменные окружения

| Переменная | Обязательная | Описание |
|------------|--------------|----------|
| BOT_TOKEN | Да | Токен Telegram бота от @BotFather |
| WEBHOOK_URL | Нет | URL для webhook (только prod) |
| APP_URL | Да | URL веб-приложения |
| DATABASE_URL | Да | Строка подключения к БД |
| OPENAI_API_KEY | Да | API ключ OpenAI |
| OPENAI_MODEL | Нет | Модель OpenAI (по умолчанию: gpt-4o) |
| AI_FOOD_CONFIDENCE_THRESHOLD | Нет | Порог уверенности (0-1, по умолчанию: 0.6) |
| MODE | Нет | Режим работы: dev или prod (по умолчанию: dev) |
| LOG_LEVEL | Нет | Уровень логирования (по умолчанию: info) |
| TZ | Нет | Часовой пояс (по умолчанию: Europe/Moscow) |

## Запуск

### Разработка (Long Polling)

```bash
# Инициализировать базу данных
npx prisma db push

# Заполнить тестовыми данными (опционально)
npm run db:seed

# Запустить бота и API
npm run dev

# В отдельном терминале: запустить веб-приложение
npm run web:dev
```

В режиме разработки бот использует long polling и не требует публичного URL.

### Production (Webhook)

```bash
# Установить переменные окружения
export MODE=prod
export WEBHOOK_URL=https://your-domain.com/webhook

# Собрать приложение
npm run build
npm run web:build

# Запустить миграции
npx prisma migrate deploy

# Запустить
npm start
```

### Docker

```bash
# Создать .env файл с необходимыми переменными

# Запустить
docker-compose up -d

# Посмотреть логи
docker-compose logs -f app
```

## Настройка Webhook в Telegram

Для production режима нужно настроить webhook:

```bash
# Установить webhook
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/webhook"}'

# Проверить статус
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"

# Удалить webhook (для перехода на polling)
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook"
```

## Команды бота

| Команда | Описание |
|---------|----------|
| /start | Начать работу с ботом |
| /help | Показать справку |
| /today | Статистика калорий за сегодня |
| /myweek | Статистика за неделю |
| /project | Информация о текущем проекте/группе |
| /setadmin @username | Назначить администратора |

Для записи калорий просто отправьте фото еды в чат с ботом.

## Структура проекта

```
/src
  /ai          - FoodVisionService (OpenAI Vision API)
  /api         - Fastify REST API
  /bot         - Grammy бот и обработчики
  /config      - Конфигурация и валидация env
  /db          - Prisma клиент
  /web         - React + Vite + Tailwind
/prisma
  schema.prisma     - SQLite схема (dev)
  schema.prod.prisma - PostgreSQL схема (prod)
  /migrations
/docker
  entrypoint.sh
Dockerfile
docker-compose.yml
```

## API Endpoints

API документация доступна по адресу `/documentation` (Swagger UI).

### Аутентификация

- `GET /auth/me` - Информация о текущем пользователе
- `POST /auth/telegram` - Авторизация через Telegram Login Widget

### Проекты

- `GET /projects` - Список проектов пользователя
- `GET /projects/:id/users` - Участники проекта
- `GET /projects/:id/meals` - Записи проекта (с фильтром по датам)

### Записи

- `POST /meals` - Создать запись
- `PUT /meals/:id` - Редактировать запись
- `DELETE /meals/:id` - Удалить запись

### Системные

- `GET /health` - Health check

## Скрипты npm

| Скрипт | Описание |
|--------|----------|
| `npm run dev` | Запуск в режиме разработки |
| `npm run build` | Сборка TypeScript |
| `npm start` | Запуск production |
| `npm run lint` | Проверка ESLint |
| `npm run typecheck` | Проверка типов |
| `npm test` | Запуск тестов |
| `npm run db:generate` | Генерация Prisma клиента |
| `npm run db:migrate` | Применение миграций |
| `npm run db:seed` | Заполнение тестовыми данными |
| `npm run web:dev` | Запуск веб-приложения (dev) |
| `npm run web:build` | Сборка веб-приложения |

## Технологический стек

| Компонент | Технология |
|-----------|------------|
| Runtime | Node.js 20+ |
| Language | TypeScript 5.x |
| Bot | grammy |
| API | Fastify |
| ORM | Prisma |
| Database | PostgreSQL / SQLite |
| Frontend | React + Vite + Tailwind |
| AI | OpenAI GPT-4 Vision |
| Container | Docker |

## Архитектура

### Telegram Bot

Бот работает в двух режимах:
- **dev (polling)** - постоянно опрашивает Telegram API
- **prod (webhook)** - получает обновления через HTTP

### AI распознавание

`FoodVisionService` использует OpenAI Vision API для анализа фото:
1. Определяет, содержит ли изображение еду
2. Оценивает калорийность (10-10000 ккал)
3. Генерирует описание на русском языке

При ошибках API применяется exponential backoff с 3 попытками.

### База данных

Модели:
- **Project** - Telegram чат (группа или личный)
- **User** - Пользователь Telegram
- **Membership** - Связь пользователь-проект с ролью (member/admin)
- **MealEntry** - Запись о еде

### Веб-интерфейс

Два способа авторизации:
- **Telegram Mini App** - открывается внутри Telegram
- **Login Widget** - для standalone сайта

Функции:
- Календарь с просмотром по неделям/месяцам
- CRUD операции для записей
- Просмотр статистики участников группы

## Лицензия

MIT
