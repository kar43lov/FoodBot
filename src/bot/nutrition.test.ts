import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing
vi.mock('../db/index.js', () => ({
  prisma: {
    userGoal: {
      findUnique: vi.fn(),
    },
  },
}));

import { calculateBMR, calculateTDEE, calculateMacros, getUserNorms, DAILY_NORMS } from './nutrition.js';
import { prisma } from '../db/index.js';

const mockPrisma = prisma as unknown as {
  userGoal: { findUnique: ReturnType<typeof vi.fn> };
};

describe('nutrition', () => {
  describe('calculateBMR', () => {
    it('should calculate BMR for male', () => {
      // 10×80 + 6.25×180 - 5×30 + 5 = 800 + 1125 - 150 + 5 = 1780
      expect(calculateBMR('male', 30, 80, 180)).toBe(1780);
    });

    it('should calculate BMR for female', () => {
      // 10×60 + 6.25×165 - 5×25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25 → 1345
      expect(calculateBMR('female', 25, 60, 165)).toBe(1345);
    });

    it('should handle edge case: young lightweight', () => {
      // 10×45 + 6.25×155 - 5×18 + 5 = 450 + 968.75 - 90 + 5 = 1333.75 → 1334
      expect(calculateBMR('male', 18, 45, 155)).toBe(1334);
    });

    it('should handle edge case: older heavier', () => {
      // 10×100 + 6.25×190 - 5×60 - 161 = 1000 + 1187.5 - 300 - 161 = 1726.5 → 1727
      expect(calculateBMR('female', 60, 100, 190)).toBe(1727);
    });
  });

  describe('calculateTDEE', () => {
    it('should apply sedentary multiplier (1.2)', () => {
      const bmr = calculateBMR('male', 30, 80, 180); // 1780
      expect(calculateTDEE('male', 30, 80, 180, 'sedentary')).toBe(Math.round(bmr * 1.2));
    });

    it('should apply light multiplier (1.375)', () => {
      const bmr = calculateBMR('female', 25, 60, 165); // 1345
      expect(calculateTDEE('female', 25, 60, 165, 'light')).toBe(Math.round(bmr * 1.375));
    });

    it('should apply moderate multiplier (1.55)', () => {
      expect(calculateTDEE('male', 35, 75, 175, 'moderate')).toBe(
        Math.round(calculateBMR('male', 35, 75, 175) * 1.55)
      );
    });

    it('should apply active multiplier (1.725)', () => {
      expect(calculateTDEE('female', 28, 65, 170, 'active')).toBe(
        Math.round(calculateBMR('female', 28, 65, 170) * 1.725)
      );
    });
  });

  describe('calculateMacros', () => {
    it('should calculate lose macros (TDEE - 500, 30/40/30 split)', () => {
      const tdee = 2000;
      const result = calculateMacros(tdee, 'lose');
      // targetCal = tdee - 500 = 1500
      expect(result.calories).toBe(1500);
      expect(result.protein).toBe(Math.round((1500 * 0.3) / 4)); // 113
      expect(result.fat).toBe(Math.round((1500 * 0.3) / 9)); // 50
      expect(result.carbs).toBe(Math.round((1500 * 0.4) / 4)); // 150
    });

    it('should calculate maintain macros (TDEE, 25/55/20 split)', () => {
      const tdee = 2200;
      const result = calculateMacros(tdee, 'maintain');
      expect(result.calories).toBe(2200);
      expect(result.protein).toBe(Math.round((2200 * 0.25) / 4)); // 138
      expect(result.fat).toBe(Math.round((2200 * 0.2) / 9)); // 49
      expect(result.carbs).toBe(Math.round((2200 * 0.55) / 4)); // 303
    });

    it('should calculate gain macros (TDEE + 300, 30/45/25 split)', () => {
      const tdee = 2000;
      const result = calculateMacros(tdee, 'gain');
      // targetCal = tdee + 300 = 2300
      expect(result.calories).toBe(2300);
      expect(result.protein).toBe(Math.round((2300 * 0.3) / 4)); // 173
      expect(result.fat).toBe(Math.round((2300 * 0.25) / 9)); // 64
      expect(result.carbs).toBe(Math.round((2300 * 0.45) / 4)); // 259
    });

    it('should enforce minimum 1200 calories for lose', () => {
      const result = calculateMacros(1400, 'lose'); // 1400 - 500 = 900 → clamp to 1200
      expect(result.calories).toBe(1200);
    });
  });

  describe('getUserNorms', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return personal norms when user has goals', async () => {
      mockPrisma.userGoal.findUnique.mockResolvedValue({
        targetCalories: 1800,
        targetProtein: 135,
        targetFat: 60,
        targetCarbs: 180,
      });

      const norms = await getUserNorms('user-123');
      expect(norms).toEqual({
        calories: 1800,
        protein: 135,
        fat: 60,
        carbs: 180,
      });
      expect(mockPrisma.userGoal.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
    });

    it('should return DAILY_NORMS when user has no goals', async () => {
      mockPrisma.userGoal.findUnique.mockResolvedValue(null);

      const norms = await getUserNorms('user-456');
      expect(norms).toEqual(DAILY_NORMS);
    });

    it('should return DAILY_NORMS when userId is undefined', async () => {
      const norms = await getUserNorms(undefined);
      expect(norms).toEqual(DAILY_NORMS);
      expect(mockPrisma.userGoal.findUnique).not.toHaveBeenCalled();
    });
  });
});
