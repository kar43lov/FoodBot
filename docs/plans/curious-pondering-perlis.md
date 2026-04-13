# Plan: КБЖУ tracking (Белки, Жиры, Углеводы)

## Context

FoodBot сейчас считает только калории. Нужно добавить БЖУ (белки, жиры, углеводы) — AI будет оценивать их вместе с калориями при анализе фото. Старые записи без БЖУ должны работать (nullable поля). Рекомендации в отчётах — комбинация статической типизированной части (цифры КБЖУ, отклонения от норм) и AI-генерации (персонализированные советы на основе реальных данных о еде).

## Step 1: DB schema

**Files:** `prisma/schema.prisma`, `prisma/schema.prod.prisma`

Добавить в MealEntry после `caloriesEstimated`:
```prisma
protein  Float? @map("protein")
fat      Float? @map("fat")
carbs    Float? @map("carbs")
```

Запустить: `npm run db:migrate` (dev), на проде `npx prisma db push`.

## Step 2: AI analysis

**File:** `src/ai/index.ts`

- Расширить `FoodAnalysisResult`: добавить `protein_g: number | null`, `fat_g: number | null`, `carbs_g: number | null`
- Расширить Zod-схему: `protein_g: z.number().nonnegative().nullable()` (аналогично fat_g, carbs_g)
- Обновить system prompt: добавить в JSON-формат ответа `protein_g`, `fat_g`, `carbs_g` (граммы, nullable)
- Обновить `createFallbackResult()`: добавить `protein_g: null, fat_g: null, carbs_g: null`
- Обновить return при низком confidence: добавить null-поля
- Добавить clamping: MAX_PROTEIN=500, MAX_FAT=500, MAX_CARBS=1000

## Step 3: Photo handler + bot response

**File:** `src/bot/photoHandler.ts`

- `createMealEntry()`: добавить `protein: analysisResult.protein_g`, `fat: analysisResult.fat_g`, `carbs: analysisResult.carbs_g` в prisma.create data
- Расширить return type: `{ id, calories, protein, fat, carbs }`
- `handlePhoto()`: изменить формат ответа:
  ```
  ✅ Записал ~500 ккал
  📊 Б: 25г · Ж: 15г · У: 55г
  📝 Куриная грудка с рисом
  ```
  Строку КБЖУ показывать только если хотя бы одно значение не null.

## Step 4: Reports + AI-рекомендации

**File:** `src/bot/commands.ts`

### 4a: КБЖУ в отчётах

- `buildTodaySummary()`: суммировать protein/fat/carbs по пользователям (`?? 0`). Формат:
  ```
  👤 @user — 1800 ккал (Б: 90г · Ж: 60г · У: 200г)
    • 09:30 — Овсянка (350 ккал)
  ```
  В итоге: `📊 КБЖУ: Б: 110г · Ж: 70г · У: 230г`

- `buildWeekSummary()`: аналогично, средние КБЖУ на пользователя

- Private chat `/today`, `/myweek`: включить КБЖУ в вывод

### 4b: Рекомендации = статика + AI-генерация

Рекомендации состоят из двух частей:

**Часть 1 — Статическая (всегда показывается):**
Типизированные данные: отклонения от общих норм. Формат:
```
📋 Баланс КБЖУ:
  Белки: 45г из 60г (↓ недобор)
  Жиры: 80г из 70г (↑ перебор)
  Углеводы: 230г из 250г (✓ норма)
```
Нормы: `{ calories: 2000, protein: 60, fat: 70, carbs: 250 }`
Пороги: ±20% от нормы = норма, иначе ↑ или ↓.

**Часть 2 — AI-генерация (персонализированная):**

Создать функцию:
```typescript
async function generateRecommendation(
  entries: Array<{ description, calories, protein, fat, carbs }>,
  period: 'day' | 'week',
  macroBalance: { protein: string, fat: string, carbs: string } // "deficit" | "excess" | "ok"
): Promise<string>
```

- Отправляет в OpenAI (gpt-4o-mini) список блюд с КБЖУ + статус баланса
- System prompt: "Дай 1-2 предложения рекомендаций на русском. Рекомендуй исходя из того, что человек реально ест — не предлагай незнакомые продукты. Например: 'В следующий раз добавь больше белка на завтрак' а не 'Ешь куриную грудку'. Учитывай баланс макронутриентов."
- Timeout 10 сек, fallback на старые getTodayTip/getWeekTip при ошибке

Итоговый формат в отчёте:
```
📋 Баланс: Б 45/60г ↓ · Ж 80/70г ↑ · У 230/250г ✓
💡 [AI-рекомендация на основе реальной еды]
```

Старые `getTodayTip()`/`getWeekTip()` остаются как fallback при ошибке OpenAI.

## Step 5: API endpoints

**File:** `src/api/index.ts`

- `CreateMealBody`: добавить `protein?: number`, `fat?: number`, `carbs?: number`
- `UpdateMealBody`: аналогично
- POST /meals: добавить в schema, create data, response
- PUT /meals/:id: добавить в schema, updateData, response
- GET /projects/:id/meals: добавить в response mapping
- POST /meals/analyze-photo: добавить protein_g, fat_g, carbs_g в response schema

## Step 6: Frontend

**Files:** `src/web/src/api/client.ts`, `src/web/src/components/MealDetailsModal.tsx`, `src/web/src/components/MealFormModal.tsx`

- `client.ts`: добавить `protein/fat/carbs` в MealEntry, CreateMealData, UpdateMealData, PhotoAnalysisResult
- `MealDetailsModal.tsx`: показать `Б: Xг · Ж: Xг · У: Xг` под калориями (если данные есть), КБЖУ в footer totals
- `MealFormModal.tsx`: добавить поля ввода Б/Ж/У, заполнять из AI-анализа

## Step 7: Tests

- `src/ai/ai.test.ts`: добавить protein_g/fat_g/carbs_g во все моки и assertions
- `src/bot/photoHandler.test.ts`: обновить моки FoodAnalysisResult и createMealEntry, проверить КБЖУ в ответе
- `src/bot/commands.test.ts`: обновить моки mealEntry.findMany, мокнуть OpenAI recommendation, проверить КБЖУ в выводе
- `src/api/api.integration.test.ts`: обновить POST/PUT/GET тесты с новыми полями

## Backward compatibility

Везде: `entry.protein ?? 0` при суммировании, условный рендер КБЖУ-строки (`if (protein != null)`), API возвращает nullable поля.

## Verification

1. `npm run typecheck` — без ошибок
2. `npm test` — все тесты зелёные
3. Отправить фото боту в dev → ответ содержит КБЖУ
4. `/today` в группе → показывает КБЖУ по участникам
5. Проверить Web App — КБЖУ отображается в MealDetailsModal
6. Deploy + проверить на проде

## Critical files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | +3 поля |
| `prisma/schema.prod.prisma` | +3 поля |
| `src/ai/index.ts` | Interface, Zod, prompt, fallback |
| `src/bot/photoHandler.ts` | createMealEntry, handlePhoto response |
| `src/bot/commands.ts` | Reports КБЖУ + AI recommendations |
| `src/api/index.ts` | CRUD endpoints |
| `src/web/src/api/client.ts` | Interfaces |
| `src/web/src/components/MealDetailsModal.tsx` | Display |
| `src/web/src/components/MealFormModal.tsx` | Form fields |
| Tests (4 files) | Mocks + assertions |
