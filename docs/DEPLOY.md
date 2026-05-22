# Деплой FoodBot на VPS

> ⚠️ **Устаревший документ (Docker + Caddy + PostgreSQL).**
> Реальная процедура — `systemd + nginx + SQLite + Node.js` (без Docker, не помещается в 1 GB RAM на `karvpn`). Деплой одной командой: `/pg.foodbot.deploy` (см. `CLAUDE.md` → раздел *Deployment*). Этот файл оставлен как историческая справка для альтернативного сценария Docker-based развёртывания.

## Требования

- Ubuntu 22.04+ (или Debian 12+)
- SSH-доступ с правами sudo
- Домен с DNS A-записью на IP сервера
- Telegram Bot Token (от @BotFather)
- OpenAI API Key

## Первоначальная настройка

### 1. Установить Docker + Docker Compose

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Перелогиниться для применения группы
exit
# ... ssh снова ...

# Проверка
docker --version
docker compose version
```

### 2. Установить Caddy (reverse proxy + SSL)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

### 3. Клонировать репозиторий

```bash
sudo mkdir -p /opt/foodbot
sudo chown $USER:$USER /opt/foodbot
git clone git@github.com:kar43lov/FoodBot.git /opt/foodbot
cd /opt/foodbot
```

### 4. Настроить переменные окружения

```bash
cp .env.production.example .env
nano .env
```

Заполнить все значения. Особенно:
- `BOT_TOKEN` — от @BotFather
- `BOT_NAME` — username бота без @
- `WEBHOOK_URL` — `https://ваш-домен.com/webhook`
- `APP_URL` — `https://ваш-домен.com`
- `SUPER_ADMIN_ID` — ваш Telegram user ID
- `OPENAI_API_KEY` — ключ OpenAI
- `POSTGRES_PASSWORD` — сильный пароль

### 5. Настроить Caddy

```bash
sudo cp docker/Caddyfile /etc/caddy/Caddyfile

# Заменить {$DOMAIN} на ваш домен
sudo sed -i 's/{$DOMAIN}/ваш-домен.com/' /etc/caddy/Caddyfile

sudo systemctl reload caddy
sudo systemctl enable caddy
```

Caddy автоматически получит SSL-сертификат от Let's Encrypt.

### 6. Первый запуск

```bash
./deploy.sh
```

### 7. Установить Telegram Webhook

```bash
# Подставить свой токен и домен
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<DOMAIN>/webhook"

# Проверить
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

## Обновление

```bash
cd /opt/foodbot
./deploy.sh
```

Или с локальной машины через Claude Code:

```
/deploy
```

### Обновление с конкретной ветки

```bash
./deploy.sh --branch develop
```

## Откат

```bash
cd /opt/foodbot

# Посмотреть предыдущие коммиты
git log --oneline -5

# Откатить на конкретный коммит
git reset --hard <commit-hash>
docker compose up -d --build
```

## Полезные команды

```bash
# Статус контейнеров
docker compose ps

# Логи бота (live)
docker compose logs -f app

# Логи PostgreSQL
docker compose logs -f postgres

# Перезапуск бота
docker compose restart app

# Зайти в контейнер
docker compose exec app sh

# Посмотреть БД
docker compose exec postgres psql -U foodbot -d foodbot

# Проверить health
curl http://localhost:3000/health

# Полная остановка
docker compose down

# Остановка с удалением volumes (ОСТОРОЖНО — удалит БД!)
docker compose down -v
```

## Структура на сервере

```
/opt/foodbot/
├── .env                  # prod-переменные (НЕ в git)
├── docker-compose.yml    # из git
├── Dockerfile            # из git
├── deploy.sh             # из git
├── docker/
│   ├── entrypoint.sh     # авто-миграции при старте
│   └── Caddyfile         # шаблон (копируется в /etc/caddy/)
├── src/                  # код
├── prisma/               # схемы БД
└── dist/                 # собирается в Docker
```
