## Бриф: Система контроля доступа (superadmin + manager + whitelist)

**Цель:** Ограничить доступ к боту только разрешённым группам и пользователям с управлением через Telegram-команды.

**Выбранный подход:** grammy middleware + Prisma whitelist + in-memory кэш.
SUPER_ADMIN_ID в .env, whitelist и менеджеры в БД, управление через команды бота.

**Требования:**
- SUPER_ADMIN_ID в .env — единственный суперадмин
- Новые Prisma-модели: AllowedChat, AllowedUser, Manager
- Middleware-гейт перед всеми хендлерами — блокирует неразрешённых
- Superadmin обходит все проверки
- Superadmin команды: /allowchat, /denychat, /allowuser, /denyuser, /setmanager, /removemanager, /listallowed
- Manager команды: /allowchat, /denychat, /allowuser, /denyuser, /listallowed
- Добавление группы: из самой группы (/allowchat) и из личка по chat_id (/allowchat -100123...)
- In-memory кэш whitelist'ов, загружаемый при старте и обновляемый при изменениях

**Acceptance criteria:**
- Бот молчит в неразрешённых чатах и личках
- Superadmin может управлять всеми списками
- Manager может управлять whitelist'ами, но не менеджерами
- Команды работают и из группы, и из лички
- Кэш обновляется при каждом /allow* и /deny*

**Тестирование:**
- Unit: middleware (allow/deny по ролям и спискам)
- Unit: команды (success/permission denied/invalid args)
- Unit: кэш (загрузка, обновление, invalidation)
- Integration: полный flow — добавить в whitelist → бот отвечает, удалить → молчит

**Риски:**
- Кэш рассинхронизируется при крэше → загрузка из БД при старте
- Суперадмин один → если потеряет доступ к Telegram, управление невозможно (ок для тестового периода)

**Что НЕ входит:**
- Подписки, оплаты, rate limiting
- Веб-интерфейс для управления
- Авто-выход из неразрешённых групп

**Первые шаги:**
1. Добавить SUPER_ADMIN_ID в .env и Zod-схему конфига
2. Добавить модели AllowedChat, AllowedUser, Manager в schema.prisma
3. Создать модуль accessControl (middleware + кэш + хелперы)
4. Реализовать команды суперадмина/менеджера
5. Написать тесты

**Сложность:** medium
