# Access Control: Superadmin + Manager + Whitelist

## Overview
- Система контроля доступа для ограничения использования бота только разрешёнными группами и пользователями
- Решает проблему: бот сейчас open — любой может добавить его в группу и тратить OpenAI API токены
- 3-уровневая иерархия: superadmin (из .env) → manager (назначается superadmin) → обычный пользователь
- Whitelist управляется через Telegram-команды бота (не веб, не .env)

## Context (from discovery)
- Middleware chain: `src/bot/index.ts:30-61` — вставка гейта после sequentialize, перед командами
- Существующие роли: `MembershipRole` (member/admin) в `src/db/index.ts:14-18`
- Паттерн проверки ролей: `commands.ts:315-321` (setadmin)
- Конфиг: `src/config/index.ts:17-47` — Zod-схема, расширяем SUPER_ADMIN_ID
- Prisma: `prisma/schema.prisma` — добавляем новые модели
- Тесты: vitest, `vi.mock()` для Prisma, `createMockContext()` для grammy Context

## Development Approach
- **Testing approach**: TDD (тесты сначала)
- Complete each task fully before moving to the next
- Make small, focused changes
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
- **CRITICAL: all tests must pass before starting next task**
- **CRITICAL: update this plan file when scope changes during implementation**
- Run tests after each change
- Maintain backward compatibility

## Testing Strategy
- **Unit tests**: required for every task
- Мокаем Prisma через `vi.mock()`, grammy Context через `createMockContext()`
- Тестируем и success, и denied сценарии для каждой команды и middleware

## Progress Tracking
- Mark completed items with `[x]` immediately when done
- Add newly discovered tasks with ➕ prefix
- Document issues/blockers with ⚠️ prefix
- Update plan if implementation deviates from original scope

## Implementation Steps

### Task 1: Добавить SUPER_ADMIN_ID в конфиг

**Files:**
- Modify: `src/config/index.ts`
- Modify: `.env`
- Modify: `.env.example`
- Modify: `src/config/config.test.ts` (файл уже существует — добавляем тесты)

- [x] Добавить `SUPER_ADMIN_ID` в `beforeEach` существующих тестов (чтобы они не сломались от обязательного поля)
- [x] Написать тесты: SUPER_ADMIN_ID парсится как число, валидация (обязательное поле, должно быть числом)
- [x] Написать тест: getConfig().superAdminId возвращает число
- [x] Добавить `SUPER_ADMIN_ID` в Zod-схему (`z.coerce.number()`) в `src/config/index.ts`
- [x] Добавить `superAdminId` в тип `Config` и `createConfig()`
- [x] Добавить `SUPER_ADMIN_ID` в `.env` и `.env.example`
- [x] Запустить все тесты (включая существующие) — должны пройти
- ➕ Добавить `SUPER_ADMIN_ID` в `ai.test.ts` `beforeEach` (зависимость через getConfig)

### Task 2: Добавить Prisma-модели AllowedChat, AllowedUser, Manager

**Files:**
- Modify: `prisma/schema.prisma` (dev — SQLite)
- Modify: `prisma/schema.prod.prisma` (prod — PostgreSQL)
- Modify: `src/db/index.ts`

- [x] Добавить модели `AllowedChat`, `AllowedUser`, `Manager` в `prisma/schema.prisma`
- [x] Добавить те же модели в `prisma/schema.prod.prisma` (PostgreSQL-синтаксис)
- [x] Запустить `npx prisma db push` для применения схемы
- [x] Запустить `npx prisma generate` для генерации клиента
- [x] Запустить существующие тесты — не должны сломаться

### Task 3: Создать модуль AccessControl (кэш + хелперы)

**Files:**
- Create: `src/bot/accessControl.ts`
- Create: `src/bot/accessControl.test.ts`

- [x] Написать тесты для `AccessControl` класса (19 тестов)
- [x] Реализовать класс `AccessControl` с кэшем и мутациями
- [x] Экспортировать singleton `getAccessControl()` + `resetAccessControl()`
- [x] Добавить вызов инициализации в `src/index.ts` — `main()` после `loadConfig()`, перед `createBot()`
- [x] Запустить тесты — 173/173 пройдено
- ➕ Добавить `superAdminId` в тестовые Config-объекты (api.integration.test.ts, bot.test.ts)

### Task 4: Создать middleware-гейт

**Files:**
- Modify: `src/bot/index.ts`
- Create: `src/bot/accessGuard.ts`
- Create: `src/bot/accessGuard.test.ts`

- [x] Написать тесты для middleware (11 тестов)
- [x] Вынести список admin-команд в константу `ADMIN_COMMANDS`
- [x] Реализовать `createAccessGuard()` — grammy middleware с BigInt-конвертацией
- [x] Подключить в `createBot()` между sequentialize и logging middleware
- [x] Обновить bot.test.ts (middleware index, accessGuard mock)
- [x] Запустить все тесты — 184/184 пройдено

### Task 5: Реализовать админ-команды (allowchat, denychat)

**Files:**
- Create: `src/bot/adminCommands.ts`
- Create: `src/bot/adminCommands.test.ts`
- Modify: `src/bot/index.ts`

- [x] Написать тесты для `/allowchat` (5 тестов) и `/denychat` (4 теста)
- [x] Реализовать `handleAllowChatCommand` и `handleDenyChatCommand`
- [x] Зарегистрировать команды в `createBot()`
- [x] Запустить тесты — пройдено

### Task 6: Реализовать админ-команды (allowuser, denyuser)

**Files:**
- Modify: `src/bot/adminCommands.ts`
- Modify: `src/bot/adminCommands.test.ts`

- [x] Написать тесты для `/allowuser` (5 тестов) и `/denyuser` (3 теста)
- [x] Реализовать `handleAllowUserCommand` и `handleDenyUserCommand`
- [x] Зарегистрировать команды в `createBot()`
- [x] Запустить тесты — пройдено

### Task 7: Реализовать админ-команды (setmanager, removemanager, listallowed)

**Files:**
- Modify: `src/bot/adminCommands.ts`
- Modify: `src/bot/adminCommands.test.ts`

- [x] Написать тесты для `/setmanager` (3), `/removemanager` (2), `/listallowed` (3)
- [x] Реализовать все три команды
- [x] Зарегистрировать в `createBot()`
- [x] Запустить тесты — 209/209 пройдено

### Task 8: Финальная проверка и integration test

**Files:**
- Modify: `src/bot/accessControl.test.ts` (или отдельный integration test)

- [x] Integration flow покрыт unit-тестами AccessControl (addChat → isChatAllowed → removeChat → !isChatAllowed)
- [x] Integration flow покрыт unit-тестами (addUser → isUserAllowed → removeUser → !isUserAllowed)

- [x] Бот молчит в неразрешённых чатах (accessGuard тесты)
- [x] Бот молчит в неразрешённых личках (accessGuard тесты)
- [x] Superadmin может: все 7 команд (adminCommands тесты)
- [x] Manager может: allowchat, denychat, allowuser, denyuser, listallowed
- [x] Manager НЕ может: setmanager, removemanager (adminCommands тесты)
- [x] Команды работают и из группы, и из лички
- [x] Кэш обновляется при каждом allow/deny (accessControl тесты)
- [x] Полный test suite: 209/209 пройдено
- [x] typecheck: чисто
- [x] lint: чисто для новых файлов

### Task 10: [Final] Обновить документацию

- [ ] Обновить CLAUDE.md — добавить описание access control
- [ ] Обновить README.md — новые env-переменные и команды
- [ ] Переместить план в `docs/plans/completed/`

## Technical Details

### Новые модели Prisma

```prisma
model AllowedChat {
  id             String   @id @default(cuid())
  telegramChatId BigInt   @unique @map("telegram_chat_id")
  title          String?
  addedByUserId  BigInt   @map("added_by_user_id")
  createdAt      DateTime @default(now()) @map("created_at")
  @@map("allowed_chats")
}

model AllowedUser {
  id             String   @id @default(cuid())
  telegramUserId BigInt   @unique @map("telegram_user_id")
  addedByUserId  BigInt   @map("added_by_user_id")
  createdAt      DateTime @default(now()) @map("created_at")
  @@map("allowed_users")
}

model Manager {
  id             String   @id @default(cuid())
  telegramUserId BigInt   @unique @map("telegram_user_id")
  addedByUserId  BigInt   @map("added_by_user_id")
  createdAt      DateTime @default(now()) @map("created_at")
  @@map("managers")
}
```

### Middleware flow

```
update → sequentialize → accessGuard → logging → commands/handlers
                            ↓
                     canAccess()?
                     ├─ superadmin → pass
                     ├─ manager → pass
                     ├─ admin command from super/mgr → pass
                     ├─ private + userId in allowedUsers → pass
                     ├─ group + chatId in allowedChats → pass
                     └─ else → silent drop
```

### Конфиг (.env)

```
SUPER_ADMIN_ID=123456789  # Telegram user ID суперадмина
```

### Команды бота

| Команда | Кто может | Описание |
|---------|-----------|----------|
| `/allowchat` | superadmin, manager | Добавить текущую группу (или по ID) в whitelist |
| `/denychat` | superadmin, manager | Удалить группу из whitelist |
| `/allowuser <id/@user>` | superadmin, manager | Добавить пользователя в whitelist личных сообщений |
| `/denyuser <id/@user>` | superadmin, manager | Удалить пользователя из whitelist |
| `/setmanager <id>` | только superadmin | Назначить менеджера |
| `/removemanager <id>` | только superadmin | Удалить менеджера |
| `/listallowed` | superadmin, manager | Показать все списки |

## Post-Completion

**Manual verification:**
- Отправить фото боту из неразрешённой лички — бот молчит
- Добавить бота в неразрешённую группу — бот молчит
- `/allowchat` из группы от superadmin — бот начинает работать
- `/allowuser` из лички — пользователь получает доступ
- `/denychat` — бот снова молчит в группе
