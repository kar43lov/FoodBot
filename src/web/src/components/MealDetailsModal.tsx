import { MealEntry } from '../api/client';

interface MealDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  date: string;
  meals: MealEntry[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MealDetailsModal({
  isOpen,
  onClose,
  userName,
  date,
  meals,
}: MealDetailsModalProps) {
  if (!isOpen) return null;

  const totalCalories = meals.reduce((sum, m) => sum + m.caloriesEstimated, 0);
  const sortedMeals = [...meals].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{userName}</h2>
              <p className="text-sm text-gray-500">{formatDate(date)}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors -mr-2 -mt-1"
              aria-label="Закрыть"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-140px)]">
            {meals.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🍽️</div>
                <p className="text-gray-500">Нет записей за этот день</p>
                <p className="text-sm text-gray-400 mt-1">
                  Отправьте фото еды боту, чтобы добавить запись
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedMeals.map((meal) => (
                  <div
                    key={meal.id}
                    className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-gray-900">
                            {meal.caloriesEstimated} ккал
                          </span>
                          {meal.needsReview && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                              Проверить
                            </span>
                          )}
                        </div>
                        {meal.description && (
                          <p className="text-gray-600 text-sm mt-1">{meal.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                          <span>{formatTime(meal.recordedAt)}</span>
                          <span>•</span>
                          <span>
                            {meal.source === 'photo' ? '📷 Фото' : meal.source === 'manual' ? '✏️ Вручную' : '🌐 Веб'}
                          </span>
                          {meal.aiConfidence !== undefined && meal.aiConfidence !== null && (
                            <>
                              <span>•</span>
                              <span>AI: {Math.round(meal.aiConfidence * 100)}%</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {meals.length > 0 && (
            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">
                    Всего: {meals.length} {meals.length === 1 ? 'запись' : meals.length < 5 ? 'записи' : 'записей'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{totalCalories} ккал</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
