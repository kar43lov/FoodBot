---
description: "Запустить ngrok-туннель + веб-часть для локальной разработки с Telegram Login"
allowed-tools: ["Bash", "Read", "AskUserQuestion"]
---

# Web Tunnel — запуск локальной разработки через ngrok

Запускает ngrok-туннель к Vite dev-серверу и выдаёт инструкции для настройки домена в BotFather. Опционально запускает сам dev-сервер.

## Алгоритм

### Шаг 1: Проверка зависимостей

Проверь, что ngrok установлен:
```bash
which ngrok
```

Если не найден — СТОП:
> ngrok не установлен. Установи: `brew install ngrok` и настрой токен: `ngrok config add-authtoken <TOKEN>`

Проверь, что ngrok авторизован:
```bash
ngrok config check
```

### Шаг 2: Проверка, не запущен ли уже ngrok

```bash
pgrep -f "ngrok http" || echo "NOT_RUNNING"
```

Если ngrok уже запущен — получить текущий URL:
```bash
curl -s http://127.0.0.1:4040/api/tunnels
```

Извлеки `public_url` из JSON-ответа. Если туннель уже есть — пропустить запуск, перейти к шагу 4.

### Шаг 3: Запуск ngrok

Запусти ngrok в фоне на порт 5173 (Vite dev-сервер):
```bash
ngrok http 5173 --log=stdout > /tmp/ngrok.log 2>&1 &
```

Подожди 3 секунды и получи URL:
```bash
sleep 3 && curl -s http://127.0.0.1:4040/api/tunnels
```

Извлеки `public_url` — это будет NGROK_URL (формат: `https://xxxx.ngrok-free.app`).

Если не удалось получить URL — проверь лог:
```bash
tail -20 /tmp/ngrok.log
```

### Шаг 4: Проверка веб dev-сервера

Проверь, запущен ли Vite:
```bash
lsof -i :5173 -t || echo "NOT_RUNNING"
```

Если не запущен — сообщи пользователю:
> Vite dev-сервер не запущен. Запусти в отдельном терминале:
> ```
> cd src/web && npm run dev
> ```

### Шаг 5: Инструкции для BotFather

Выведи домен (без `https://`, только хост):

```
## Туннель готов!

ngrok URL: NGROK_URL

### Настройка BotFather

1. Открой @BotFather в Telegram
2. /mybots → выбери бота → Bot Settings → Domain
3. Вставь домен: `xxxx.ngrok-free.app`

### Открой в браузере

NGROK_URL

### Остановка

Когда закончишь работу, останови ngrok:
pkill -f "ngrok http"
```

## Важно

- Порт 5173 — стандартный порт Vite dev-сервера (настроен в `src/web/vite.config.ts`)
- API проксируется через Vite на порт 3001 (`/api` → `localhost:3001`)
- Бот бэкенд (`npm run dev`) должен быть запущен отдельно
- При каждом перезапуске ngrok URL меняется — нужно обновить домен в BotFather
- Для постоянного домена: `ngrok http 5173 --domain=your-domain.ngrok-free.app`
