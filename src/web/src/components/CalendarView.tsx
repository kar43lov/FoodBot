import { useState, useMemo } from 'react';
import { MealEntry, ProjectUser } from '../api/client';

type ViewMode = 'week' | 'month';

interface CalendarViewProps {
  meals: MealEntry[];
  users: ProjectUser[];
  onCellClick: (userId: string, date: string, meals: MealEntry[]) => void;
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
  return date.toISOString().split('T')[0];
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

export default function CalendarView({ meals, users, onCellClick }: CalendarViewProps) {
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

  const weekDayHeaders = viewMode === 'week'
    ? days
    : days.slice(0, 7);

  return (
    <div className="card">
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={navigatePrev}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Предыдущий период"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-lg font-medium text-gray-900 min-w-[200px] text-center">
            {viewMode === 'week' ? formatWeekRange(days) : formatMonthYear(currentDate)}
          </h3>
          <button
            onClick={navigateNext}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Следующий период"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm text-telegram-blue hover:bg-blue-50 rounded-lg transition-colors"
          >
            Сегодня
          </button>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                viewMode === 'week'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Неделя
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
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

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-2 text-left text-xs font-medium text-gray-500 w-24 min-w-[96px]">
                Участник
              </th>
              {weekDayHeaders.map((day) => (
                <th
                  key={day.dateStr}
                  className={`p-2 text-center text-xs font-medium min-w-[80px] ${
                    day.isToday ? 'text-telegram-blue' : 'text-gray-500'
                  }`}
                >
                  <div>{formatDayHeader(day.date)}</div>
                  <div className={`text-lg ${day.isToday ? 'font-bold' : 'font-normal text-gray-700'}`}>
                    {formatDayNumber(day.date)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.userId} className="border-t border-gray-100">
                <td className="p-2 text-sm font-medium text-gray-900">
                  <div className="flex items-center gap-1">
                    <span className="truncate max-w-[80px]">{user.firstName}</span>
                    {user.role === 'admin' && (
                      <span className="text-telegram-blue text-xs">★</span>
                    )}
                  </div>
                </td>
                {(viewMode === 'week' ? days : days).map((day) => {
                  const { meals: cellMeals, totalCalories } = getCellData(user.userId, day.dateStr);
                  const hasData = cellMeals.length > 0;

                  return (
                    <td
                      key={`${user.userId}_${day.dateStr}`}
                      className={`p-1 text-center border-l border-gray-100 ${
                        !day.isCurrentMonth && viewMode === 'month' ? 'bg-gray-50' : ''
                      } ${day.isToday ? 'bg-blue-50' : ''}`}
                    >
                      <button
                        onClick={() => onCellClick(user.userId, day.dateStr, cellMeals)}
                        className={`w-full p-2 rounded-lg transition-colors ${
                          hasData
                            ? 'bg-green-100 hover:bg-green-200 cursor-pointer'
                            : 'hover:bg-gray-100 cursor-pointer'
                        }`}
                        title={hasData ? `${cellMeals.length} записей, ${totalCalories} ккал` : 'Нет записей'}
                      >
                        {hasData ? (
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {totalCalories}
                            </div>
                            <div className="text-xs text-gray-500">
                              {cellMeals.length} {cellMeals.length === 1 ? 'запись' : cellMeals.length < 5 ? 'записи' : 'записей'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-gray-300 text-sm">—</div>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
