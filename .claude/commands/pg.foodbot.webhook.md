---
description: "Управление Telegram webhook FoodBot: info/reset/set"
---

# FoodBot Webhook

Управляет webhook бота `@CheatMealDayBot` через Telegram API. Токен читается из `/opt/foodbot/.env` на сервере.

## Arguments

`$ARGUMENTS` — действие:
- `info` или пусто — показать текущий статус webhook (default)
- `reset` — удалить + установить заново (очищает pending_updates)
- `delete` — только удалить (бот переходит в ручной режим polling)
- `set` — только установить (из APP_URL в .env)

## Steps

### info (default)

```bash
ssh karvpn "source /opt/foodbot/.env && curl -s \"https://api.telegram.org/bot\$BOT_TOKEN/getWebhookInfo\""
```

Разобрать JSON и показать:
- `url` — куда установлен
- `pending_update_count` — сколько в очереди
- `last_error_date` + `last_error_message` — если есть ошибки
- `ip_address` — куда резолвится

### reset

Сбросить с очисткой pending и установить заново:

```bash
ssh karvpn "source /opt/foodbot/.env && \
  curl -s \"https://api.telegram.org/bot\$BOT_TOKEN/deleteWebhook?drop_pending_updates=true\" && echo '' && \
  curl -s \"https://api.telegram.org/bot\$BOT_TOKEN/setWebhook?url=\$APP_URL/webhook\" && echo ''"
```

После — показать свежий `getWebhookInfo` для подтверждения.

### delete

```bash
ssh karvpn "source /opt/foodbot/.env && curl -s \"https://api.telegram.org/bot\$BOT_TOKEN/deleteWebhook\""
```

Предупредить пользователя: бот теперь не получает обновления, нужно либо `set`, либо перезапустить в polling-режиме.

### set

```bash
ssh karvpn "source /opt/foodbot/.env && curl -s \"https://api.telegram.org/bot\$BOT_TOKEN/setWebhook?url=\$APP_URL/webhook\""
```

## Когда использовать reset

- Бот "тормозит" — отвечает с задержкой или через раз
- `pending_update_count` большой (>5)
- После деплоя, когда были ошибки 500 — накопились ретраи
- Telegram показывает `last_error_message` в info

## Ограничения

- Разрешено: `Bash(ssh karvpn:*)`
