const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface TelegramAuthData {
  id: number;
  first_name: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface AuthUser {
  telegramUserId: string;
  firstName: string;
  username?: string;
  userId?: string;
  isRegistered: boolean;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface Project {
  id: string;
  telegramChatId: string;
  title: string;
  type: 'group' | 'personal';
  role: 'admin' | 'member';
  createdAt: string;
}

export interface ProjectUser {
  userId: string;
  telegramUserId: string;
  firstName: string;
  username?: string;
  role: 'admin' | 'member';
}

export interface MealEntry {
  id: string;
  userId: string;
  recordedAt: string;
  caloriesEstimated: number;
  description?: string;
  source: 'photo' | 'manual' | 'web';
  aiConfidence?: number;
  needsReview: boolean;
  user: {
    firstName: string;
    username?: string;
  };
}

export interface CreateMealData {
  projectId: string;
  recordedAt: string;
  caloriesEstimated: number;
  description?: string;
  source?: 'web' | 'manual';
}

export interface UpdateMealData {
  recordedAt?: string;
  caloriesEstimated?: number;
  description?: string;
  needsReview?: boolean;
}

class ApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error || 'Произошла ошибка',
      response.status,
      data.code
    );
  }

  return data as T;
}

export const api = {
  authTelegram: (data: TelegramAuthData): Promise<AuthResponse> =>
    request<AuthResponse>('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  authWebApp: (initData: string): Promise<AuthResponse> =>
    request<AuthResponse>('/auth/webapp', {
      method: 'POST',
      body: JSON.stringify({ initData }),
    }),

  getMe: (token: string): Promise<AuthUser> =>
    request<AuthUser>('/auth/me', {}, token),

  getProjects: (token: string): Promise<Project[]> =>
    request<Project[]>('/projects', {}, token),

  getProjectUsers: (token: string, projectId: string): Promise<ProjectUser[]> =>
    request<ProjectUser[]>(`/projects/${projectId}/users`, {}, token),

  getProjectMeals: (
    token: string,
    projectId: string,
    from?: string,
    to?: string
  ): Promise<MealEntry[]> => {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const query = params.toString();
    return request<MealEntry[]>(
      `/projects/${projectId}/meals${query ? `?${query}` : ''}`,
      {},
      token
    );
  },

  createMeal: (token: string, data: CreateMealData): Promise<MealEntry> =>
    request<MealEntry>('/meals', {
      method: 'POST',
      body: JSON.stringify(data),
    }, token),

  updateMeal: (token: string, mealId: string, data: UpdateMealData): Promise<MealEntry> =>
    request<MealEntry>(`/meals/${mealId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }, token),

  deleteMeal: (token: string, mealId: string): Promise<{ success: boolean }> =>
    request<{ success: boolean }>(`/meals/${mealId}`, {
      method: 'DELETE',
    }, token),
};

export { ApiError };
