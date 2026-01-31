import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, Project, MealEntry, ProjectUser } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [users, setUsers] = useState<ProjectUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!token || !id) return;

      try {
        // Load projects to find current one
        const projects = await api.getProjects(token);
        const currentProject = projects.find((p) => p.id === id);
        if (!currentProject) {
          setError('Проект не найден');
          return;
        }
        setProject(currentProject);

        // Load users and meals
        const [usersData, mealsData] = await Promise.all([
          api.getProjectUsers(token, id),
          api.getProjectMeals(token, id),
        ]);
        setUsers(usersData);
        setMeals(mealsData);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Ошибка загрузки данных';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [token, id]);

  // Calculate today's total
  const today = new Date().toDateString();
  const todayMeals = meals.filter(
    (m) => new Date(m.recordedAt).toDateString() === today
  );
  const todayCalories = todayMeals.reduce((sum, m) => sum + m.caloriesEstimated, 0);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mb-4" />
          <p className="text-gray-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto">
          <div className="card text-center py-12">
            <p className="text-red-700 mb-4">{error || 'Проект не найден'}</p>
            <button
              onClick={() => navigate('/projects')}
              className="btn-primary"
            >
              Вернуться к проектам
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center mb-6">
          <button
            onClick={() => navigate('/projects')}
            className="mr-4 p-2 hover:bg-gray-100 rounded-full"
          >
            <svg
              className="w-6 h-6 text-gray-600"
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
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.title}</h1>
            <p className="text-gray-500">
              {project.type === 'personal' ? 'Личный проект' : 'Группа'}
              {' • '}{users.length} участник{users.length === 1 ? '' : users.length < 5 ? 'а' : 'ов'}
            </p>
          </div>
        </div>

        {/* Today Stats */}
        <div className="card mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Сегодня</p>
              <p className="text-3xl font-bold text-gray-900">{todayCalories} ккал</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">{todayMeals.length} записей</p>
            </div>
          </div>
        </div>

        {/* Members */}
        {users.length > 1 && (
          <div className="mb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-3">Участники</h2>
            <div className="flex flex-wrap gap-2">
              {users.map((user) => (
                <div
                  key={user.userId}
                  className="inline-flex items-center px-3 py-1 bg-gray-100 rounded-full text-sm"
                >
                  <span className="font-medium">{user.firstName}</span>
                  {user.role === 'admin' && (
                    <span className="ml-1 text-telegram-blue">★</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Meals */}
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-3">Последние записи</h2>
          {meals.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500">Пока нет записей</p>
              <p className="text-sm text-gray-400 mt-1">
                Отправьте фото еды боту, чтобы добавить запись
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {meals.slice(0, 20).map((meal) => (
                <div key={meal.id} className="card">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">
                          {meal.caloriesEstimated} ккал
                        </span>
                        {meal.needsReview && (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                            Проверить
                          </span>
                        )}
                      </div>
                      {meal.description && (
                        <p className="text-gray-600 text-sm">{meal.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                        <span>{meal.user.firstName}</span>
                        <span>•</span>
                        <span>
                          {new Date(meal.recordedAt).toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        <span>•</span>
                        <span>
                          {meal.source === 'photo' ? '📷' : meal.source === 'manual' ? '✏️' : '🌐'}
                        </span>
                      </div>
                    </div>
                    {meal.aiConfidence !== undefined && meal.aiConfidence !== null && (
                      <div className="text-right ml-4">
                        <span className="text-xs text-gray-400">
                          AI: {Math.round(meal.aiConfidence * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
