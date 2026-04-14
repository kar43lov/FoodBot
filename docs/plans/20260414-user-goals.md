# Персонализированные цели КБЖУ

## Overview

Добавить возможность задавать персональные физические параметры (пол, возраст, вес, рост, активность) и цель (похудеть/набрать/поддержать). На основе формулы Mifflin-St Jeor рассчитываются индивидуальные нормы КБЖУ, которые используются в рекомендациях вместо общих `DAILY_NORMS`.

**Что меняется:**
- Новая модель `UserGoal` в Prisma
- API: GET/PUT `/profile/goals`
- Web App: страница `/profile` с формой + расчёт норм
- Bot: `getUserNorms(userId)` вместо константы `DAILY_NORMS`
- Подсказки в /start и отчётах о настройке целей

## Context

- **DAILY_NORMS**: `src/bot/commands.ts:8` — `{ calories: 2000, protein: 60, fat: 70, carbs: 250 }`
- Используется в: `formatMacroBalance()` (L232), `generatePersonRecommendation()` (L324)
- **User model**: `prisma/schema.prisma:30-41` — минимальный, без целей
- **API auth**: `src/api/index.ts:193-275` — `request.user.userId` доступен в handlers
- **Web router**: `src/web/src/App.tsx:39-59` — `/login`, `/projects`, `/projects/:id`
- **API client**: `src/web/src/api/client.ts` — паттерн `api.method(token, ...)` + `request<T>()`

## Development Approach

- **Testing approach**: TDD — сначала тесты, потом реализация
- Каждый таск полностью завершается до начала следующего
- **CRITICAL: каждый таск включает тесты как обязательную часть**
- **CRITICAL: все тесты должны проходить перед переходом к следующему таску**
- Backward compat: без профиля — fallback на DAILY_NORMS

## Testing Strategy

- **Unit tests**: расчёт TDEE, макросов, getUserNorms
- **API tests**: GET/PUT /profile/goals — авторизация, валидация, CRUD
- **Frontend**: форма, валидация, preview расчётных норм

## Progress Tracking

- `[x]` — завершено
- ➕ — обнаружено в процессе
- ⚠️ — блокер

## Implementation Steps

### Task 1: Модель UserGoal в Prisma + миграция

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/schema.prod.prisma`

- [x] Добавить модель `UserGoal` в `prisma/schema.prisma`
- [x] Добавить обратную связь `userGoal UserGoal?` в модель `User`
- [x] Дублировать в `prisma/schema.prod.prisma` (с enum `Sex`, `ActivityLevel`, `GoalType`)
- [x] Запустить `npx prisma db push` для dev
- [x] Запустить `npx prisma generate` — client сгенерирован

### Task 2: Функция calculateTDEE + тесты

**Files:**
- Create: `src/bot/nutrition.ts`
- Create: `src/bot/nutrition.test.ts`

- [ ] Написать тесты для `calculateTDEE()`:
  - Муж 30 лет 80кг 180см sedentary → BMR 1780, TDEE ~2136
  - Жен 25 лет 60кг 165см moderate → BMR 1351, TDEE ~2094
  - Edge cases: min/max возраст, вес
- [ ] Написать тесты для `calculateMacros()`:
  - lose: 30% protein / 40% carbs / 30% fat
  - maintain: 25% protein / 55% carbs / 20% fat
  - gain: 30% protein / 45% carbs / 25% fat
  - Проверить: protein(г) = calories×ratio / 4, fat(г) = calories×ratio / 9, carbs(г) = calories×ratio / 4
- [ ] Написать тесты для `getUserNorms(userId)`:
  - С профилем → персональные нормы
  - Без профиля → DAILY_NORMS fallback
- [ ] Реализовать `calculateTDEE(sex, age, weight, height, activityLevel)` по Mifflin-St Jeor
- [ ] Реализовать `calculateMacros(tdee, goal)` — возвращает `{ calories, protein, fat, carbs }`
- [ ] Реализовать `getUserNorms(userId)` — ищет UserGoal в БД, fallback на DAILY_NORMS
- [ ] Экспортировать `DAILY_NORMS` как fallback-константу
- [ ] Запустить тесты — все должны пройти

### Task 3: API endpoint GET/PUT /profile/goals

**Files:**
- Modify: `src/api/index.ts`
- Modify: `src/api/api.integration.test.ts`

- [ ] Написать тесты для GET /profile/goals:
  - Без профиля → 200 с null + default нормы
  - С профилем → 200 с данными + рассчитанные нормы
  - Без авторизации → 401
- [ ] Написать тесты для PUT /profile/goals:
  - Валидные данные → 200, сохраняет + возвращает рассчитанные нормы
  - Невалидные данные (вес 0, возраст -1) → 400
  - Повторный PUT → обновляет существующий
- [ ] Добавить `/profile/goals` в список protected routes (preHandler)
- [ ] Реализовать GET /profile/goals:
  - Найти UserGoal по `request.user.userId`
  - Если нет — вернуть `{ goals: null, norms: DAILY_NORMS }`
  - Если есть — вернуть `{ goals: {...}, norms: { calories, protein, fat, carbs } }`
- [ ] Реализовать PUT /profile/goals:
  - Принять: `{ sex, age, weight, height, activityLevel, goal }`
  - Валидировать: sex ∈ [male,female], age 10-120, weight 20-300, height 100-250
  - Рассчитать TDEE → macros через calculateTDEE/calculateMacros
  - Upsert UserGoal с рассчитанными target*
  - Вернуть `{ goals: {...}, norms: { calories, protein, fat, carbs } }`
- [ ] Запустить тесты — все должны пройти

### Task 4: Интеграция getUserNorms в commands.ts

**Files:**
- Modify: `src/bot/commands.ts`
- Modify: `src/bot/commands.test.ts`

- [ ] Написать тесты: formatMacroBalance с пользовательскими нормами отличается от DAILY_NORMS
- [ ] Написать тесты: generatePersonRecommendation передаёт персональные нормы в промпт
- [ ] Рефакторить `formatMacroBalance()`: принимать `norms` параметром вместо DAILY_NORMS
- [ ] Рефакторить `generatePersonRecommendation()`: принимать `norms` параметром
- [ ] В `buildTodaySummary()`: для каждого user вызывать `getUserNorms(userId)` и передавать в функции
- [ ] В `buildWeekSummary()`: аналогично
- [ ] В `handleTodayCommand()` (private chat): использовать getUserNorms
- [ ] В `handleMyWeekCommand()` (private chat): использовать getUserNorms
- [ ] Запустить тесты — все должны пройти

### Task 5: Web App — страница /profile

**Files:**
- Create: `src/web/src/pages/ProfilePage.tsx`
- Modify: `src/web/src/App.tsx`
- Modify: `src/web/src/api/client.ts`
- Modify: `src/web/src/pages/ProjectsPage.tsx`

- [ ] Добавить типы в `client.ts`: `UserGoals`, `UserNorms`, `GoalsResponse`
- [ ] Добавить в api object: `getGoals(token)`, `updateGoals(token, data)`
- [ ] Добавить route `/profile` в `App.tsx` (PrivateRoute)
- [ ] Создать `ProfilePage.tsx`:
  - Форма: пол (toggle муж/жен), возраст (number), вес (number, кг), рост (number, см), активность (select), цель (select)
  - При загрузке: GET /profile/goals → заполнить если есть
  - Preview рассчитанных норм под формой (рассчитывать локально при изменении полей)
  - Кнопка "Сохранить" → PUT /profile/goals
  - После сохранения: показать success + обновлённые нормы
- [ ] Добавить ссылку на /profile в `ProjectsPage.tsx` (иконка профиля рядом с logout)
- [ ] Запустить `npm run typecheck` в src/web — без ошибок

### Task 6: Подсказки в боте о настройке целей

**Files:**
- Modify: `src/bot/commands.ts`

- [ ] В handleStartCommand: добавить строку `🎯 Настройте цели → откройте приложение (кнопка «Открыть») → Профиль`
- [ ] В buildTodaySummary: если у пользователя нет UserGoal — добавить подсказку `🎯 Для персональных рекомендаций настройте цели в приложении`
- [ ] Запустить тесты — все должны пройти

### Task 7: Verify acceptance criteria

- [ ] Пользователь может открыть /profile в Web App и заполнить 6 полей
- [ ] После сохранения видит рассчитанные нормы КБЖУ
- [ ] В отчётах /today используются персональные нормы
- [ ] AI-рекомендации учитывают персональные нормы
- [ ] Без профиля — работает как раньше (общие нормы)
- [ ] Бот подсказывает про настройку целей
- [ ] Запустить полный тест suite: `npm test`
- [ ] `npm run typecheck` — без ошибок

### Task 8: [Final] Документация и cleanup

- [ ] Обновить CLAUDE.md: добавить UserGoal в Database Models
- [ ] Переместить план в `docs/plans/completed/`

## Technical Details

**Формула Mifflin-St Jeor:**
- Муж: `BMR = 10×вес(кг) + 6.25×рост(см) – 5×возраст + 5`
- Жен: `BMR = 10×вес(кг) + 6.25×рост(см) – 5×возраст – 161`

**Activity multipliers:**
- sedentary: 1.2
- light: 1.375
- moderate: 1.55
- active: 1.725

**Goal adjustments:**
- lose: TDEE – 500 ккал
- maintain: TDEE
- gain: TDEE + 300 ккал

**Macro splits (% от целевых калорий):**
- lose: Б 30% / У 40% / Ж 30%
- maintain: Б 25% / У 55% / Ж 20%
- gain: Б 30% / У 45% / Ж 25%

**Conversion:** protein/carbs = cal×ratio/4 (г), fat = cal×ratio/9 (г)

## Post-Completion

**Manual verification:**
- Открыть Web App на мобилке в Telegram — заполнить профиль
- Отправить фото еды → проверить что рекомендации персональные
- `/today` в группе → баланс КБЖУ по индивидуальным нормам
- Пользователь без профиля → общие нормы, подсказка настроить

**Deploy:**
- `npx prisma db push` на проде (добавляет таблицу user_goals)
- Стандартный deploy через `/pg.foodbot.deploy`
