import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, Project, MealEntry, ProjectUser, ApiError } from '../api/client';
import LoadingSpinner from '../components/LoadingSpinner';
import CalendarView from '../components/CalendarView';
import MealDetailsModal from '../components/MealDetailsModal';
import MealFormModal, { MealFormData } from '../components/MealFormModal';
import ConfirmDialog from '../components/ConfirmDialog';

interface ModalState {
  isOpen: boolean;
  userId: string;
  userName: string;
  date: string;
  meals: MealEntry[];
}

interface FormModalState {
  isOpen: boolean;
  meal: MealEntry | null;
  defaultDate?: string;
}

interface DeleteConfirmState {
  isOpen: boolean;
  meal: MealEntry | null;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [users, setUsers] = useState<ProjectUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({
    isOpen: false,
    userId: '',
    userName: '',
    date: '',
    meals: [],
  });
  const [formModalState, setFormModalState] = useState<FormModalState>({
    isOpen: false,
    meal: null,
    defaultDate: undefined,
  });
  const [deleteConfirmState, setDeleteConfirmState] = useState<DeleteConfirmState>({
    isOpen: false,
    meal: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Create a map of userId -> user for quick lookup
  const usersMap = useMemo(() => {
    const map = new Map<string, ProjectUser>();
    for (const u of users) {
      map.set(u.userId, u);
    }
    return map;
  }, [users]);

  // Get current user's project info
  const currentUserProjectInfo = useMemo(() => {
    if (!user?.userId) return null;
    return users.find((u) => u.userId === user.userId);
  }, [users, user]);

  const isAdmin = currentUserProjectInfo?.role === 'admin' || project?.role === 'admin';

  // Calculate today's total
  const todayStats = useMemo(() => {
    const today = new Date().toDateString();
    const todayMeals = meals.filter(
      (m) => new Date(m.recordedAt).toDateString() === today
    );
    const todayCalories = todayMeals.reduce((sum, m) => sum + m.caloriesEstimated, 0);
    return { meals: todayMeals, calories: todayCalories };
  }, [meals]);

  const handleCellClick = useCallback((userId: string, date: string, cellMeals: MealEntry[]) => {
    const u = usersMap.get(userId);
    setModalState({
      isOpen: true,
      userId,
      userName: u?.firstName || 'Пользователь',
      date,
      meals: cellMeals,
    });
  }, [usersMap]);

  const handleMealClick = useCallback((meal: MealEntry) => {
    const u = usersMap.get(meal.userId);
    const mealDate = new Date(meal.recordedAt);
    const dateStr = `${mealDate.getFullYear()}-${String(mealDate.getMonth() + 1).padStart(2, '0')}-${String(mealDate.getDate()).padStart(2, '0')}`;
    setModalState({
      isOpen: true,
      userId: meal.userId,
      userName: u?.firstName || meal.user.firstName || 'Пользователь',
      date: dateStr,
      meals: [meal],
    });
  }, [usersMap]);

  const handleCloseModal = useCallback(() => {
    setModalState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // CRUD Handlers
  const handleAddMeal = useCallback((date: string) => {
    // Close details modal and open form modal
    setModalState((prev) => ({ ...prev, isOpen: false }));
    setFormModalState({
      isOpen: true,
      meal: null,
      defaultDate: date,
    });
  }, []);

  const handleEditMeal = useCallback((meal: MealEntry) => {
    // Close details modal and open form modal in edit mode
    setModalState((prev) => ({ ...prev, isOpen: false }));
    setFormModalState({
      isOpen: true,
      meal,
      defaultDate: undefined,
    });
  }, []);

  const handleDeleteMeal = useCallback((meal: MealEntry) => {
    // Close details modal and open delete confirmation
    setModalState((prev) => ({ ...prev, isOpen: false }));
    setDeleteConfirmState({
      isOpen: true,
      meal,
    });
  }, []);

  const handleCloseFormModal = useCallback(() => {
    setFormModalState({ isOpen: false, meal: null, defaultDate: undefined });
  }, []);

  const handleCloseDeleteConfirm = useCallback(() => {
    setDeleteConfirmState({ isOpen: false, meal: null });
  }, []);

  const handleFormSubmit = useCallback(async (data: MealFormData) => {
    if (!token || !id) return;

    setIsSubmitting(true);
    try {
      if (formModalState.meal) {
        // Update existing meal
        const updatedMeal = await api.updateMeal(token, formModalState.meal.id, {
          recordedAt: data.recordedAt,
          caloriesEstimated: data.caloriesEstimated,
          description: data.description || undefined,
        });

        // Optimistically update the meals list
        setMeals((prev) =>
          prev.map((m) => (m.id === updatedMeal.id ? updatedMeal : m))
        );
      } else {
        // Create new meal
        const newMeal = await api.createMeal(token, {
          projectId: id,
          recordedAt: data.recordedAt,
          caloriesEstimated: data.caloriesEstimated,
          description: data.description || undefined,
          source: 'web',
        });

        // Optimistically add to the meals list
        setMeals((prev) => [newMeal, ...prev]);
      }

      handleCloseFormModal();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Ошибка сохранения';
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [token, id, formModalState.meal, handleCloseFormModal]);

  const handleConfirmDelete = useCallback(async () => {
    if (!token || !deleteConfirmState.meal) return;

    const mealToDelete = deleteConfirmState.meal;
    setIsSubmitting(true);

    // Optimistically remove from list
    setMeals((prev) => prev.filter((m) => m.id !== mealToDelete.id));

    try {
      await api.deleteMeal(token, mealToDelete.id);
      handleCloseDeleteConfirm();
    } catch (err) {
      // Rollback on error
      setMeals((prev) => [...prev, mealToDelete]);
      const message = err instanceof ApiError ? err.message : 'Ошибка удаления';
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [token, deleteConfirmState.meal, handleCloseDeleteConfirm]);

  // Recalculate modal meals when meals list changes
  useEffect(() => {
    if (modalState.isOpen && modalState.userId && modalState.date) {
      const dateKey = modalState.date;
      const filteredMeals = meals.filter((m) => {
        const d = new Date(m.recordedAt);
        // Use local date to avoid timezone shifts
        const mealDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return m.userId === modalState.userId && mealDate === dateKey;
      });
      setModalState((prev) => ({ ...prev, meals: filteredMeals }));
    }
  }, [meals, modalState.isOpen, modalState.userId, modalState.date]);

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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-2">
          <div className="flex items-center min-w-0">
            <button
              onClick={() => navigate('/projects')}
              className="mr-2 sm:mr-4 p-2 hover:bg-gray-100 rounded-full flex-shrink-0"
            >
              <svg
                className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600"
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
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{project.title}</h1>
              <p className="text-sm sm:text-base text-gray-500">
                {project.type === 'personal' ? 'Личный проект' : 'Группа'}
                {' • '}{users.length} участник{users.length === 1 ? '' : users.length < 5 ? 'а' : 'ов'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setFormModalState({ isOpen: true, meal: null, defaultDate: undefined })}
            className="px-4 py-2 bg-telegram-blue text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Добавить</span>
          </button>
        </div>

        {/* Today Stats */}
        <div className="card mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Сегодня</p>
              <p className="text-3xl font-bold text-gray-900">{todayStats.calories} ккал</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">{todayStats.meals.length} записей</p>
            </div>
          </div>
        </div>

        {/* Calendar View */}
        <div className="mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-3">Календарь</h2>
          <CalendarView
            meals={meals}
            users={users}
            onCellClick={handleCellClick}
            onMealClick={handleMealClick}
          />
        </div>

        {/* Members - only show if more than 1 user */}
        {users.length > 1 && (
          <div className="mb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-3">Участники</h2>
            <div className="flex flex-wrap gap-2">
              {users.map((u) => (
                <div
                  key={u.userId}
                  className="inline-flex items-center px-3 py-1 bg-gray-100 rounded-full text-sm"
                >
                  <span className="font-medium">{u.firstName}</span>
                  {u.role === 'admin' && (
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
                Отправьте фото еды боту или добавьте запись вручную
              </p>
              <button
                onClick={() => setFormModalState({ isOpen: true, meal: null, defaultDate: undefined })}
                className="mt-4 px-4 py-2 text-telegram-blue hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Добавить запись
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {meals.slice(0, 20).map((meal) => {
                const canModify = isAdmin || meal.userId === user?.userId;
                return (
                  <div key={meal.id} className="card group">
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
                      <div className="flex items-center gap-2">
                        {meal.aiConfidence !== undefined && meal.aiConfidence !== null && (
                          <span className="text-xs text-gray-400">
                            AI: {Math.round(meal.aiConfidence * 100)}%
                          </span>
                        )}
                        {canModify && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditMeal(meal)}
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-telegram-blue"
                              aria-label="Редактировать"
                              title="Редактировать"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteMeal(meal)}
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-red-600"
                              aria-label="Удалить"
                              title="Удалить"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal for meal details */}
      <MealDetailsModal
        isOpen={modalState.isOpen}
        onClose={handleCloseModal}
        userName={modalState.userName}
        date={modalState.date}
        meals={modalState.meals}
        currentUserId={user?.userId}
        isAdmin={isAdmin}
        onAddMeal={handleAddMeal}
        onEditMeal={handleEditMeal}
        onDeleteMeal={handleDeleteMeal}
      />

      {/* Modal for adding/editing meal */}
      <MealFormModal
        isOpen={formModalState.isOpen}
        onClose={handleCloseFormModal}
        onSubmit={handleFormSubmit}
        initialData={formModalState.meal}
        defaultDate={formModalState.defaultDate}
        isSubmitting={isSubmitting}
      />

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmState.isOpen}
        onClose={handleCloseDeleteConfirm}
        onConfirm={handleConfirmDelete}
        title="Удалить запись?"
        message={`Вы уверены, что хотите удалить запись "${deleteConfirmState.meal?.caloriesEstimated} ккал${deleteConfirmState.meal?.description ? ` - ${deleteConfirmState.meal.description}` : ''}"? Это действие нельзя отменить.`}
        confirmText="Удалить"
        cancelText="Отмена"
        isDestructive={true}
        isLoading={isSubmitting}
      />
    </div>
  );
}
