---
description: "Показать полный статус FoodBot на сервере"
---

# FoodBot Status

Показывает полную картину здоровья FoodBot на VPS: сервис, память, webhook, health-endpoint, последние логи.

## Steps

1. Подключиться к `karvpn` и собрать информацию одной SSH-сессией:

```bash
ssh karvpn "echo '=== SERVICE ===' && systemctl is-active foodbot && systemctl status foodbot --no-pager | head -5 && echo '' && echo '=== MEMORY ===' && free -h && echo '' && echo '=== HEALTH ===' && curl -s http://localhost:3000/health && echo '' && echo '=== LAST 5 LOGS ===' && journalctl -u foodbot --no-pager -n 5"
```

2. Проверить webhook через Telegram API (токен читать из `/opt/foodbot/.env`):

```bash
ssh karvpn "source /opt/foodbot/.env && curl -s \"https://api.telegram.org/bot\$BOT_TOKEN/getWebhookInfo\""
```

3. Сформатировать отчёт в виде таблицы:

| Компонент | Статус |
|-----------|--------|
| Service (foodbot) | active/failed + uptime |
| RAM | used / total / available |
| Health endpoint | status + timestamp |
| Webhook URL | url |
| Pending updates | count |
| Last error | message + timestamp (если есть) |

4. Если есть проблемы — выделить их явно:
   - `pending_update_count > 0` → предложить `/pg.foodbot.webhook reset`
   - `last_error_message` не пустой → показать последние ошибки из логов
   - RAM `available < 100 MB` → предупредить
   - Service не active → показать `journalctl -u foodbot -n 20`

## Ограничения

- Read-only — никаких изменений, только сбор информации
- Разрешено: `Bash(ssh karvpn:*)`
