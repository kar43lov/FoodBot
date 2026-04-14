import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, UserGoals, ApiError } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';

const ACTIVITY_LEVELS = [
  { value: 'sedentary', label: 'Сидячий' },
  { value: 'light', label: 'Лёгкая' },
  { value: 'moderate', label: 'Умеренная' },
  { value: 'active', label: 'Высокая' },
] as const;

const GOALS = [
  { value: 'lose', label: 'Похудеть' },
  { value: 'maintain', label: 'Поддержать' },
  { value: 'gain', label: 'Набрать' },
] as const;

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

const GOAL_ADJUSTMENTS: Record<string, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

// Macro split: protein% / carbs% / fat%
const MACRO_SPLITS: Record<string, [number, number, number]> = {
  lose: [30, 40, 30],
  maintain: [25, 55, 20],
  gain: [30, 45, 25],
};

function calculateNorms(goals: UserGoals) {
  const { sex, age, weight, height, activityLevel, goal } = goals;

  if (!age || !weight || !height) return null;

  const bmr =
    sex === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161;

  const multiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.2;
  const adjustment = GOAL_ADJUSTMENTS[goal] ?? 0;

  const calories = Math.max(1200, Math.round(bmr * multiplier + adjustment));

  const [proteinPct, carbsPct, fatPct] = MACRO_SPLITS[goal] ?? [25, 55, 20];
  const protein = Math.round((calories * proteinPct) / 100 / 4);
  const carbs = Math.round((calories * carbsPct) / 100 / 4);
  const fat = Math.round((calories * fatPct) / 100 / 9);

  return { calories, protein, fat, carbs };
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { token } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [sex, setSex] = useState('male');
  const [age, setAge] = useState<number | ''>('');
  const [weight, setWeight] = useState<number | ''>('');
  const [height, setHeight] = useState<number | ''>('');
  const [activityLevel, setActivityLevel] = useState('sedentary');
  const [goal, setGoal] = useState('maintain');

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      try {
        const res = await api.getGoals(token);
        if (res.goals) {
          setSex(res.goals.sex || 'male');
          setAge(res.goals.age || '');
          setWeight(res.goals.weight || '');
          setHeight(res.goals.height || '');
          setActivityLevel(res.goals.activityLevel || 'sedentary');
          setGoal(res.goals.goal || 'maintain');
        }
      } catch {
        // No saved goals — use defaults
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [token]);

  const norms = useMemo(() => {
    if (age === '' || weight === '' || height === '') return null;
    return calculateNorms({
      sex,
      age: age as number,
      weight: weight as number,
      height: height as number,
      activityLevel,
      goal,
    });
  }, [sex, age, weight, height, activityLevel, goal]);

  const isFormValid = age !== '' && weight !== '' && height !== '';

  const handleSave = useCallback(async () => {
    if (!token || !isFormValid) return;

    setIsSaving(true);
    try {
      await api.updateGoals(token, {
        sex,
        age: age as number,
        weight: weight as number,
        height: height as number,
        activityLevel,
        goal,
      });
      setToast('Цели сохранены');
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Ошибка сохранения';
      setToast(message);
      setTimeout(() => setToast(null), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [token, isFormValid, sex, age, weight, height, activityLevel, goal]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 pb-24">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center mb-6">
          <button
            onClick={() => navigate('/projects')}
            className="mr-3 p-2 hover:bg-gray-100 rounded-full flex-shrink-0"
          >
            <svg
              className="w-5 h-5 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-gray-900">Мои цели</h1>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-5">
          {/* Sex */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Пол</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSex('male')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  sex === 'male'
                    ? 'bg-telegram-blue text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Муж
              </button>
              <button
                type="button"
                onClick={() => setSex('female')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  sex === 'female'
                    ? 'bg-telegram-blue text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Жен
              </button>
            </div>
          </div>

          {/* Age */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Возраст</label>
            <input
              type="number"
              inputMode="numeric"
              min={10}
              max={120}
              placeholder="25"
              value={age}
              onChange={(e) => setAge(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-telegram-blue focus:border-transparent outline-none"
            />
          </div>

          {/* Weight */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Вес, кг</label>
            <input
              type="number"
              inputMode="decimal"
              min={30}
              max={300}
              step={0.1}
              placeholder="70"
              value={weight}
              onChange={(e) => setWeight(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-telegram-blue focus:border-transparent outline-none"
            />
          </div>

          {/* Height */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Рост, см</label>
            <input
              type="number"
              inputMode="numeric"
              min={100}
              max={250}
              placeholder="175"
              value={height}
              onChange={(e) => setHeight(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-telegram-blue focus:border-transparent outline-none"
            />
          </div>

          {/* Activity Level */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Активность</label>
            <select
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-telegram-blue focus:border-transparent outline-none"
            >
              {ACTIVITY_LEVELS.map((lvl) => (
                <option key={lvl.value} value={lvl.value}>
                  {lvl.label}
                </option>
              ))}
            </select>
          </div>

          {/* Goal */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Цель</label>
            <select
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-telegram-blue focus:border-transparent outline-none"
            >
              {GOALS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Norms Preview */}
        {norms && (
          <div className="mt-4 bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm font-medium text-gray-500 mb-2">Ваши нормы</p>
            <p className="text-2xl font-bold text-gray-900">{norms.calories} ккал</p>
            <div className="flex gap-4 mt-2 text-sm text-gray-600">
              <span>
                Б <span className="font-medium text-gray-900">{norms.protein}г</span>
              </span>
              <span>
                Ж <span className="font-medium text-gray-900">{norms.fat}г</span>
              </span>
              <span>
                У <span className="font-medium text-gray-900">{norms.carbs}г</span>
              </span>
            </div>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={!isFormValid || isSaving}
          className="mt-6 w-full py-3 bg-telegram-blue text-white rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSaving ? <LoadingSpinner size="sm" /> : null}
          {isSaving ? 'Сохранение...' : 'Сохранить'}
        </button>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg shadow-lg z-50 animate-fade-in">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
