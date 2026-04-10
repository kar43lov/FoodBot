## Бриф: Deployment на VPS

**Цель:** Настроить деплой FoodBot на VPS через SSH + Docker Compose с одной команды `/deploy`.

**Выбранный подход:** SSH + Docker Compose (git pull → docker compose up --build).
Простой, надёжный, без лишних зависимостей. CI/CD — позже, если понадобится.

**Требования:**
- Docker + Docker Compose на сервере
- Caddy как reverse proxy (автоматический SSL Let's Encrypt)
- deploy.sh на сервере: pull → build → healthcheck → отчёт
- Skill `/deploy` в Claude Code: SSH → deploy.sh, вывод результата
- `.env` только на сервере, не в git
- Не ломать существующие сервисы (Xray VPN, другой бот)

**Acceptance criteria:**
- `/deploy` из Claude Code обновляет бота на сервере
- Бот доступен по HTTPS через домен
- Telegram webhook работает
- PostgreSQL данные сохраняются между обновлениями
- deploy.sh проверяет healthcheck после обновления

**Тестирование:**
- deploy.sh: проверка healthcheck (curl /health)
- Проверка что контейнеры запустились (docker compose ps)
- Проверка webhook (telegram getWebhookInfo)

**Риски:**
- Даунтайм ~30-60 сек при пересборке (приемлемо для тестового периода)
- Миграция может сломать БД → prisma migrate deploy безопасен (не дропает таблицы)
- Нет Docker на сервере → установка через apt

**Первые шаги:**
1. Документ по настройке сервера (docs/DEPLOY.md)
2. deploy.sh скрипт на сервере
3. Добавить SUPER_ADMIN_ID и BOT_NAME в docker-compose.yml
4. Настройка Caddy для домена + SSL
5. Skill `/deploy` для Claude Code

**Сложность:** medium
