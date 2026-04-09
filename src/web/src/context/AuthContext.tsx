import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, TelegramAuthData, AuthUser } from '../api/client';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            username?: string;
          };
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
        };
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
        };
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
        };
      };
    };
  }
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isTelegramWebApp: boolean;
  error: string | null;
  loginWithTelegram: (data: TelegramAuthData) => Promise<void>;
  loginWithWebApp: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = 'food_calories_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isTelegramWebApp = Boolean(window.Telegram?.WebApp?.initData);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loginWithTelegram = useCallback(async (data: TelegramAuthData) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.authTelegram(data);
      setToken(response.token);
      setUser(response.user);
      localStorage.setItem(TOKEN_KEY, response.token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка авторизации';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loginWithWebApp = useCallback(async () => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp?.initData) {
      setError('Telegram WebApp не доступен');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await api.authWebApp(webApp.initData);
      setToken(response.token);
      setUser(response.user);
      localStorage.setItem(TOKEN_KEY, response.token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка авторизации';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize auth on mount
  useEffect(() => {
    const initAuth = async () => {
      // Initialize Telegram WebApp
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();

        // Apply theme colors
        const themeParams = window.Telegram.WebApp.themeParams;
        if (themeParams.bg_color) {
          document.documentElement.style.setProperty('--tg-theme-bg-color', themeParams.bg_color);
        }
        if (themeParams.text_color) {
          document.documentElement.style.setProperty('--tg-theme-text-color', themeParams.text_color);
        }
        if (themeParams.button_color) {
          document.documentElement.style.setProperty('--tg-theme-button-color', themeParams.button_color);
        }
        if (themeParams.secondary_bg_color) {
          document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', themeParams.secondary_bg_color);
        }
      }

      // If in Telegram WebApp and no token, auto-login
      if (isTelegramWebApp && !token) {
        try {
          await loginWithWebApp();
          return;
        } catch {
          // Will show login page with error
        }
      }

      // If we have a token, validate it
      if (token) {
        try {
          const userData = await api.getMe(token);
          setUser(userData);
        } catch {
          // Token invalid, clear it
          logout();
        }
      }

      setIsLoading(false);
    };

    initAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        isTelegramWebApp,
        error,
        loginWithTelegram,
        loginWithWebApp,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
