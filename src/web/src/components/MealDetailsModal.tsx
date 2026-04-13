import { MealEntry } from '../api/client';

interface MealDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userName: string;
  date: string;
  meals: MealEntry[];
  currentUserId?: string;
  isAdmin?: boolean;
  onAddMeal?: (date: string) => void;
  onEditMeal?: (meal: MealEntry) => void;
  onDeleteMeal?: (meal: MealEntry) => void;
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
  currentUserId,
  isAdmin = false,
  onAddMeal,
  onEditMeal,
  onDeleteMeal,
}: MealDetailsModalProps) {
  if (!isOpen) return null;

  const totalCalories = meals.reduce((sum, m) => sum + m.caloriesEstimated, 0);
  const totalProtein = Math.round(meals.reduce((sum, m) => sum + (m.protein ?? 0), 0));
  const totalFat = Math.round(meals.reduce((sum, m) => sum + (m.fat ?? 0), 0));
  const totalCarbs = Math.round(meals.reduce((sum, m) => sum + (m.carbs ?? 0), 0));
  const hasMacros = totalProtein > 0 || totalFat > 0 || totalCarbs > 0;
  const sortedMeals = [...meals].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
  );

  // Check if user can edit/delete a meal
  const canModifyMeal = (meal: MealEntry): boolean => {
    return isAdmin || meal.userId === currentUserId;
  };

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
            <div className="flex items-center gap-2">
              {onAddMeal && (
                <button
                  onClick={() => onAddMeal(date)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-telegram-blue"
                  aria-label="Добавить запись"
                  title="Добавить запись"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors -mr-2"
                aria-label="Закрыть"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 overflow-y-auto max-h-[calc(80vh-140px)]">
            {meals.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-2">🍽️</div>
                <p className="text-gray-500">Нет записей за этот день</p>
                {onAddMeal && (
                  <button
                    onClick={() => onAddMeal(date)}
                    className="mt-4 px-4 py-2 text-telegram-blue hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Добавить запись
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {sortedMeals.map((meal) => {
                  const canModify = canModifyMeal(meal);
                  return (
                    <div
                      key={meal.id}
                      className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
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
                          {(meal.protein != null || meal.fat != null || meal.carbs != null) && (
                            <p className="text-sm text-gray-500">
                              Б: {Math.round(meal.protein ?? 0)}г · Ж: {Math.round(meal.fat ?? 0)}г · У: {Math.round(meal.carbs ?? 0)}г
                            </p>
                          )}
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

                        {/* Action buttons */}
                        {canModify && (onEditMeal || onDeleteMeal) && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                            {onEditMeal && (
                              <button
                                onClick={() => onEditMeal(meal)}
                                className="p-1.5 hover:bg-white rounded-lg transition-colors text-gray-500 hover:text-telegram-blue"
                                aria-label="Редактировать"
                                title="Редактировать"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            )}
                            {onDeleteMeal && (
                              <button
                                onClick={() => onDeleteMeal(meal)}
                                className="p-1.5 hover:bg-white rounded-lg transition-colors text-gray-500 hover:text-red-600"
                                aria-label="Удалить"
                                title="Удалить"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                  {hasMacros && (
                    <p className="text-sm text-gray-500">
                      Б: {totalProtein}г · Ж: {totalFat}г · У: {totalCarbs}г
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
