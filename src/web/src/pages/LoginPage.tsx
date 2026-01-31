import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import TelegramLoginButton from '../components/TelegramLoginButton';
import LoadingSpinner from '../components/LoadingSpinner';
import { TelegramAuthData } from '../api/client';

const BOT_NAME = import.meta.env.VITE_BOT_NAME || 'FoodCaloriesBot';

export default function LoginPage() {
  const navigate = useNavigate();
  const {
    isAuthenticated,
    isLoading,
    isTelegramWebApp,
    error,
    loginWithTelegram,
    loginWithWebApp,
    clearError,
  } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/projects', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    // Auto-login for Telegram WebApp
    if (isTelegramWebApp && !isAuthenticated && !isLoading) {
      loginWithWebApp().catch(() => {
        // Error will be shown in UI
      });
    }
  }, [isTelegramWebApp, isAuthenticated, isLoading, loginWithWebApp]);

  const handleTelegramAuth = async (data: TelegramAuthData) => {
    clearError();
    try {
      await loginWithTelegram(data);
      navigate('/projects', { replace: true });
    } catch {
      // Error will be shown in UI
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="lg" className="mb-4" />
          <p className="text-gray-500">Проверка авторизации...</p>
        </div>
      </div>
    );
  }

  const isUserNotRegistered = error?.includes('not registered') || error?.includes('USER_NOT_REGISTERED');

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="card text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-telegram-blue rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Food Calories Tracker
            </h1>
            <p className="text-gray-500">
              Отслеживайте калорийность еды с помощью AI
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              {isUserNotRegistered ? (
                <div className="text-red-700">
                  <p className="font-medium mb-2">Вы не зарегистрированы</p>
                  <p className="text-sm">
                    Для использования приложения сначала отправьте фото еды боту{' '}
                    <a
                      href={`https://t.me/${BOT_NAME}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-telegram-blue hover:underline font-medium"
                    >
                      @{BOT_NAME}
                    </a>
                  </p>
                </div>
              ) : (
                <p className="text-red-700">{error}</p>
              )}
            </div>
          )}

          {isTelegramWebApp ? (
            <div className="space-y-4">
              <p className="text-gray-600">
                Авторизация через Telegram...
              </p>
              <LoadingSpinner />
              <button
                onClick={() => loginWithWebApp()}
                className="btn-secondary w-full"
              >
                Попробовать снова
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600 mb-4">
                Войдите через Telegram для доступа к приложению
              </p>
              <TelegramLoginButton
                botName={BOT_NAME}
                onAuth={handleTelegramAuth}
                buttonSize="large"
              />
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-sm text-gray-400">
              Отправьте фото еды боту{' '}
              <a
                href={`https://t.me/${BOT_NAME}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-telegram-blue hover:underline"
              >
                @{BOT_NAME}
              </a>
              {' '}чтобы начать отслеживать калории
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
