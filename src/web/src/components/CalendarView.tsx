import { useState, useMemo } from 'react';
import { MealEntry, ProjectUser } from '../api/client';

type ViewMode = 'week' | 'month';

interface CalendarViewProps {
  meals: MealEntry[];
  users: ProjectUser[];
  onCellClick: (userId: string, date: string, meals: MealEntry[]) => void;
  onMealClick?: (meal: MealEntry) => void;
}

interface DayData {
  date: Date;
  dateStr: string;
  isToday: boolean;
  isCurrentMonth: boolean;
}

function getWeekDays(baseDate: Date): DayData[] {
  const days: DayData[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get Monday of the week
  const dayOfWeek = baseDate.getDay();
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    days.push({
      date,
      dateStr: formatDateKey(date),
      isToday: date.getTime() === today.getTime(),
      isCurrentMonth: date.getMonth() === baseDate.getMonth(),
    });
  }

  return days;
}

function getMonthDays(baseDate: Date): DayData[] {
  const days: DayData[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  // First day of month
  const firstDay = new Date(year, month, 1);
  // Last day of month
  const lastDay = new Date(year, month + 1, 0);

  // Start from Monday before or on the first day
  const startDay = new Date(firstDay);
  const dayOfWeek = firstDay.getDay();
  startDay.setDate(firstDay.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  // End on Sunday after or on the last day
  const endDay = new Date(lastDay);
  const lastDayOfWeek = lastDay.getDay();
  if (lastDayOfWeek !== 0) {
    endDay.setDate(lastDay.getDate() + (7 - lastDayOfWeek));
  }

  const current = new Date(startDay);
  while (current <= endDay) {
    days.push({
      date: new Date(current),
      dateStr: formatDateKey(current),
      isToday: current.getTime() === today.getTime(),
      isCurrentMonth: current.getMonth() === month,
    });
    current.setDate(current.getDate() + 1);
  }

  return days;
}

function formatDateKey(date: Date): string {
  // Use local date to avoid timezone shifts (toISOString converts to UTC)
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayHeader(date: Date): string {
  return date.toLocaleDateString('ru-RU', { weekday: 'short' }).toUpperCase();
}

function formatDayNumber(date: Date): string {
  return date.getDate().toString();
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function formatWeekRange(days: DayData[]): string {
  if (days.length === 0) return '';
  const first = days[0].date;
  const last = days[days.length - 1].date;

  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} - ${last.getDate()} ${first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}`;
  }

  return `${first.getDate()} ${first.toLocaleDateString('ru-RU', { month: 'short' })} - ${last.getDate()} ${last.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })}`;
}

export default function CalendarView({ meals, users, onCellClick, onMealClick }: CalendarViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(() => new Date());

  // Group meals by date and user
  const mealsByDateAndUser = useMemo(() => {
    const map = new Map<string, MealEntry[]>();

    for (const meal of meals) {
      const mealDate = new Date(meal.recordedAt);
      const dateKey = formatDateKey(mealDate);
      const key = `${meal.userId}_${dateKey}`;

      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(meal);
    }

    return map;
  }, [meals]);

  const days = useMemo(() => {
    return viewMode === 'week' ? getWeekDays(currentDate) : getMonthDays(currentDate);
  }, [viewMode, currentDate]);

  const navigatePrev = () => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (viewMode === 'week') {
        newDate.setDate(prev.getDate() - 7);
      } else {
        newDate.setMonth(prev.getMonth() - 1);
      }
      return newDate;
    });
  };

  const navigateNext = () => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev);
      if (viewMode === 'week') {
        newDate.setDate(prev.getDate() + 7);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const getCellData = (userId: string, dateStr: string) => {
    const key = `${userId}_${dateStr}`;
    const cellMeals = mealsByDateAndUser.get(key) || [];
    const totalCalories = cellMeals.reduce((sum, m) => sum + m.caloriesEstimated, 0);
    return { meals: cellMeals, totalCalories };
  };

  return (
    <div className="card">
      {/* Header with navigation */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={navigatePrev}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              aria-label="Предыдущий период"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 className="text-base sm:text-lg font-medium text-gray-900 text-center truncate">
              {viewMode === 'week' ? formatWeekRange(days) : formatMonthYear(currentDate)}
            </h3>
            <button
              onClick={navigateNext}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              aria-label="Следующий период"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={goToToday}
              className="px-2 py-1.5 text-sm text-telegram-blue hover:bg-blue-50 rounded-lg transition-colors"
            >
              Сегодня
            </button>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('week')}
                className={`px-2 sm:px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'week'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Неделя
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-2 sm:px-3 py-1.5 text-sm rounded-md transition-colors ${
                  viewMode === 'month'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Месяц
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        {viewMode === 'week' ? (
          <div>
            {/* Day-of-week headers with dates */}
            <div className="grid grid-cols-7 border-b border-gray-200">
              {days.map((day) => (
                <div
                  key={day.dateStr}
                  className={`p-2 text-center text-xs font-medium ${
                    day.isToday ? 'text-telegram-blue' : 'text-gray-500'
                  }`}
                >
                  <div>{formatDayHeader(day.date)}</div>
                  <div className={`text-lg ${day.isToday ? 'font-bold' : 'font-normal text-gray-700'}`}>
                    {formatDayNumber(day.date)}
                  </div>
                </div>
              ))}
            </div>
            {/* Single row of day cells */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-7">
                {days.map((day, dayIdx) => {
                  const dayCellMeals: MealEntry[] = [];
                  for (const user of users) {
                    const { meals: userMeals } = getCellData(user.userId, day.dateStr);
                    dayCellMeals.push(...userMeals);
                  }
                  const sortedCellMeals = [...dayCellMeals].sort(
                    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
                  );

                  return (
                    <div
                      key={day.dateStr}
                      onClick={() => {
                        const userId = users[0]?.userId || '';
                        onCellClick(userId, day.dateStr, dayCellMeals);
                      }}
                      className={`p-1 sm:p-1.5 min-h-[70px] sm:min-h-[90px] text-left align-top transition-colors cursor-pointer ${
                        dayIdx > 0 ? 'border-l border-gray-200' : ''
                      } ${day.isToday ? 'bg-blue-50' : 'bg-white'} hover:bg-gray-50`}
                    >
                      {sortedCellMeals.length > 0 ? (
                        <div className="space-y-0.5">
                          {sortedCellMeals.map((meal) => {
                            const shortDesc = meal.description
                              ? meal.description.length > 15
                                ? meal.description.slice(0, 15) + '...'
                                : meal.description
                              : '';
                            return (
                              <div
                                key={meal.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMealClick?.(meal);
                                }}
                                className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded bg-green-100 text-green-800 truncate hover:bg-green-200 transition-colors cursor-pointer"
                                title={`${meal.caloriesEstimated} ккал${meal.description ? ' — ' + meal.description : ''}`}
                              >
                                <span className="font-medium">{meal.caloriesEstimated}</span>
                                {shortDesc && (
                                  <span className="text-green-600 ml-1 hidden sm:inline">({shortDesc})</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-gray-300 text-xs sm:text-sm text-center mt-4 sm:mt-6">—</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Month view: calendar grid with weeks as rows */
          <div>
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 border-b border-gray-200">
              {days.slice(0, 7).map((day) => (
                <div
                  key={day.dateStr}
                  className="p-2 text-center text-xs font-medium text-gray-500"
                >
                  {formatDayHeader(day.date)}
                </div>
              ))}
            </div>
            {/* Weeks */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {Array.from({ length: Math.ceil(days.length / 7) }, (_, weekIdx) => {
                const weekDays = days.slice(weekIdx * 7, weekIdx * 7 + 7);
                return (
                  <div key={weekIdx} className={`grid grid-cols-7 ${weekIdx > 0 ? 'border-t border-gray-200' : ''}`}>
                    {weekDays.map((day, dayIdx) => {
                      // Aggregate all users' meals for this day
                      const dayCellMeals: MealEntry[] = [];
                      for (const user of users) {
                        const { meals: userMeals } = getCellData(user.userId, day.dateStr);
                        dayCellMeals.push(...userMeals);
                      }
                      const sortedCellMeals = [...dayCellMeals].sort(
                        (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime()
                      );

                      return (
                        <div
                          key={day.dateStr}
                          onClick={() => {
                            const userId = users[0]?.userId || '';
                            onCellClick(userId, day.dateStr, dayCellMeals);
                          }}
                          className={`p-1 sm:p-1.5 min-h-[70px] sm:min-h-[90px] text-left align-top transition-colors cursor-pointer ${
                            dayIdx > 0 ? 'border-l border-gray-200' : ''
                          } ${!day.isCurrentMonth ? 'bg-gray-50' : 'bg-white'} ${
                            day.isToday ? 'bg-blue-50' : ''
                          } hover:bg-gray-50`}
                        >
                          <div className={`text-xs sm:text-sm mb-0.5 sm:mb-1 ${
                            day.isToday
                              ? 'inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-telegram-blue text-white font-bold text-[10px] sm:text-sm'
                              : !day.isCurrentMonth ? 'text-gray-400' : 'text-gray-700'
                          }`}>
                            {formatDayNumber(day.date)}
                          </div>
                          {sortedCellMeals.length > 0 && (
                            <div className="space-y-0.5">
                              {sortedCellMeals.map((meal) => {
                                const shortDesc = meal.description
                                  ? meal.description.length > 15
                                    ? meal.description.slice(0, 15) + '...'
                                    : meal.description
                                  : '';
                                return (
                                  <div
                                    key={meal.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onMealClick?.(meal);
                                    }}
                                    className="text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded bg-green-100 text-green-800 truncate hover:bg-green-200 transition-colors cursor-pointer"
                                    title={`${meal.caloriesEstimated} ккал${meal.description ? ' — ' + meal.description : ''}`}
                                  >
                                    <span className="font-medium">{meal.caloriesEstimated}</span>
                                    {shortDesc && (
                                      <span className="text-green-600 ml-1 hidden sm:inline">({shortDesc})</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {/* Per-user breakdown below calendar */}
            {users.length > 1 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-500 mb-2">По участникам:</div>
                <div className="flex flex-wrap gap-2">
                  {users.map((user) => {
                    const userTotal = days
                      .filter(d => d.isCurrentMonth)
                      .reduce((sum, d) => sum + getCellData(user.userId, d.dateStr).totalCalories, 0);
                    return (
                      <div key={user.userId} className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">
                        {user.firstName}{user.role === 'admin' ? ' ★' : ''}: {userTotal} ккал
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-100 rounded"></div>
          <span>Есть записи</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-blue-50 rounded border border-blue-200"></div>
          <span>Сегодня</span>
        </div>
      </div>
    </div>
  );
}
