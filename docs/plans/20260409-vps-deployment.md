# VPS Deployment: SSH + Docker Compose + Caddy

## Overview
- Настройка продакшн-деплоя FoodBot на VPS через Docker Compose
- Caddy как reverse proxy с автоматическим SSL (Let's Encrypt)
- deploy.sh скрипт на сервере для обновления одной командой
- Skill `/deploy` в Claude Code для запуска деплоя с локальной машины
- Не ломать существующие сервисы на VPS (Xray VPN, другой бот)

## Context (from discovery)
- files/components involved:
  - `docker-compose.yml` — уже есть, app + PostgreSQL
  - `Dockerfile` — multi-stage build, production-ready
  - `docker/entrypoint.sh` — авто-миграции при старте
  - `prisma/schema.prod.prisma` — PostgreSQL схема
- related patterns: entrypoint.sh уже делает `prisma migrate deploy`
- dependencies: Docker, Docker Compose, Caddy, git на сервере

## Development Approach
- **testing approach**: без тестов — инфраструктурные файлы, проверяем вручную при деплое
- Complete each task fully before moving to the next
- Проверять каждый файл на корректность (shellcheck для .sh, yaml-валидность)
- **CRITICAL: update this plan file when scope changes during implementation**

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix

## What Goes Where
- **Implementation Steps**: файлы в репозитории (docs, configs, scripts, skill)
- **Post-Completion**: действия на сервере (SSH, настройка, первый деплой)

## Implementation Steps

### Task 1: Обновить docker-compose.yml (SUPER_ADMIN_ID, BOT_NAME)

**Files:**
- Modify: `docker-compose.yml`

- [x] Добавить `SUPER_ADMIN_ID=${SUPER_ADMIN_ID}` в environment секцию app
- [x] Добавить `BOT_NAME=${BOT_NAME}` в environment секцию app
- [x] Проверить yaml-структуру (Docker не установлен локально, проверка при деплое)

### Task 2: Создать deploy.sh скрипт

**Files:**
- Create: `deploy.sh`

- [x] Написать скрипт с этапами: preflight checks → git pull → build → healthcheck → отчёт
- [x] Preflight: проверить что `.env` существует, docker daemon запущен
- [x] Git pull: `git fetch && git reset --hard origin/main` (гарантированный sync с remote)
- [x] Build + restart: `docker compose up -d --build --remove-orphans`
- [x] Healthcheck: ждать до 60 сек, проверять `curl -sf http://localhost:3000/health`
- [x] Отчёт: вывести статус контейнеров, версию (git hash), время деплоя
- [x] Добавить `--branch` аргумент (default: main)
- [x] `chmod +x deploy.sh`

### Task 3: Создать Caddyfile

**Files:**
- Create: `docker/Caddyfile`

- [x] Настроить reverse proxy: домен → localhost:3000
- [x] Автоматический HTTPS через Let's Encrypt
- [x] Заголовки безопасности (X-Frame-Options, etc.)
- [x] Caddy через systemd (отдельно от Docker — проще, надёжнее)

### Task 4: Создать .env.production.example

**Files:**
- Create: `.env.production.example`

- [x] Все переменные для продакшна с комментариями
- [x] BOT_TOKEN, BOT_NAME, WEBHOOK_URL, APP_URL
- [x] OPENAI_API_KEY, SUPER_ADMIN_ID
- [x] POSTGRES_USER, POSTGRES_PASSWORD

### Task 5: Создать docs/DEPLOY.md — инструкция настройки сервера

**Files:**
- Create: `docs/DEPLOY.md`

- [x] Раздел: Требования
- [x] Раздел: Первоначальная настройка
- [x] Раздел: Настройка Caddy (SSL, reverse proxy)
- [x] Раздел: Настройка Telegram webhook
- [x] Раздел: Обновление (deploy.sh)
- [x] Раздел: Откат
- [x] Раздел: Полезные команды

### Task 6: Создать skill /deploy

**Files:**
- Create: `.claude/commands/deploy.md`

- [x] YAML frontmatter: description, arguments (branch)
- [x] SSH на сервер → запуск deploy.sh
- [x] Парсинг аргументов: `/deploy` (main) или `/deploy develop`
- [x] SSH alias `foodbot-server` (через ~/.ssh/config)
- [x] Вывод результата пользователю
- [x] Обработка ошибок (нет SSH, deploy.sh failed)

### Task 7: [Final] Обновить документацию

- [ ] Обновить CLAUDE.md — добавить секцию про деплой
- [ ] Обновить README.md — добавить ссылку на docs/DEPLOY.md
- [ ] Переместить план в `docs/plans/completed/`

## Technical Details

### Структура на сервере

```
/opt/foodbot/
├── .env                  # prod-переменные (НЕ в git)
├── docker-compose.yml    # из git
├── Dockerfile            # из git
├── deploy.sh             # из git
├── docker/
│   ├── entrypoint.sh     # из git
│   └── Caddyfile         # из git (копируется в /etc/caddy/)
├── src/, prisma/, ...    # код из git
└── logs/                 # docker logs
```

### deploy.sh flow

```
1. Preflight checks
   ├── .env exists?
   ├── docker daemon running?
   └── git remote reachable?

2. Update code
   ├── git fetch origin
   └── git reset --hard origin/${BRANCH}

3. Build & restart
   └── docker compose up -d --build --remove-orphans

4. Healthcheck (60s timeout)
   └── curl -sf http://localhost:3000/health

5. Report
   ├── Container status
   ├── Git commit hash
   └── Deploy duration
```

### Caddy config

```
foodbot.example.com {
    reverse_proxy localhost:3000
    header {
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
    }
}
```

### Skill /deploy flow

```
/deploy [branch]
   │
   ├── ssh user@server "cd /opt/foodbot && ./deploy.sh --branch ${branch:-main}"
   │
   └── вывод результата
```

## Post-Completion

**Действия на сервере (первый раз):**
- Установить Docker + Docker Compose
- Установить Caddy
- `git clone git@github.com:kar43lov/FoodBot.git /opt/foodbot`
- Создать `/opt/foodbot/.env` из `.env.production.example`
- Запустить `./deploy.sh`
- Настроить Caddy для домена
- Установить Telegram webhook: `curl "https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://{DOMAIN}/webhook"`

**Проверки после первого деплоя:**
- `docker compose ps` — все контейнеры UP
- `curl https://domain/health` — 200 OK
- Telegram webhook info: `curl "https://api.telegram.org/bot{TOKEN}/getWebhookInfo"`
- Отправить фото боту — проверить что работает
