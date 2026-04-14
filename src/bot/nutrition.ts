import { prisma } from '../db/index.js';

export const DAILY_NORMS = { calories: 2000, protein: 60, fat: 70, carbs: 250 };

export interface NutritionNorms {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

const MACRO_SPLITS: Record<string, { protein: number; fat: number; carbs: number }> = {
  lose: { protein: 0.3, fat: 0.3, carbs: 0.4 },
  maintain: { protein: 0.25, fat: 0.2, carbs: 0.55 },
  gain: { protein: 0.3, fat: 0.25, carbs: 0.45 },
};

const CALORIE_ADJUSTMENTS: Record<string, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

const MIN_CALORIES = 1200;

export function calculateBMR(sex: string, age: number, weight: number, height: number): number {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

export function calculateTDEE(
  sex: string,
  age: number,
  weight: number,
  height: number,
  activityLevel: string
): number {
  const bmr = calculateBMR(sex, age, weight, height);
  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.2;
  return Math.round(bmr * multiplier);
}

export function calculateMacros(tdee: number, goal: string): NutritionNorms {
  const adjustment = CALORIE_ADJUSTMENTS[goal] ?? 0;
  const calories = Math.max(MIN_CALORIES, tdee + adjustment);
  const split = MACRO_SPLITS[goal] ?? MACRO_SPLITS.maintain!;

  return {
    calories,
    protein: Math.round((calories * split.protein) / 4),
    fat: Math.round((calories * split.fat) / 9),
    carbs: Math.round((calories * split.carbs) / 4),
  };
}

export async function getUserNorms(userId: string | undefined): Promise<NutritionNorms> {
  if (!userId) return DAILY_NORMS;

  const goal = await prisma.userGoal.findUnique({ where: { userId } });
  if (!goal) return DAILY_NORMS;

  return {
    calories: goal.targetCalories,
    protein: goal.targetProtein,
    fat: goal.targetFat,
    carbs: goal.targetCarbs,
  };
}
