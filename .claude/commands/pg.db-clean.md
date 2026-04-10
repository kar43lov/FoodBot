---
description: "Показать содержимое БД и очистить после подтверждения"
---

# Очистка базы данных

Показать текущие данные в БД, спросить подтверждение, очистить.

## Шаги

1. Показать количество записей во всех таблицах:

```bash
sqlite3 prisma/dev.db "SELECT 'projects' as tbl, count(*) FROM projects UNION ALL SELECT 'users', count(*) FROM users UNION ALL SELECT 'memberships', count(*) FROM memberships UNION ALL SELECT 'meal_entries', count(*) FROM meal_entries UNION ALL SELECT 'allowed_chats', count(*) FROM allowed_chats UNION ALL SELECT 'allowed_users', count(*) FROM allowed_users UNION ALL SELECT 'managers', count(*) FROM managers;"
```

2. Показать краткое содержимое каждой непустой таблицы (первые 10 записей).

3. Спросить через AskUserQuestion:
   - **Очистить всё** — удалить все данные из всех таблиц
   - **Выбрать таблицы** — показать список таблиц, пользователь выбирает какие чистить (multiSelect)
   - **Отмена** — ничего не делать

4. После подтверждения — выполнить DELETE и показать результат.

5. Если база PostgreSQL (prod) — предупредить отдельно и запросить двойное подтверждение.
