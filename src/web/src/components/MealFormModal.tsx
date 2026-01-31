import { useState, useEffect } from 'react';
import { MealEntry } from '../api/client';

export interface MealFormData {
  recordedAt: string;
  caloriesEstimated: number;
  description: string;
}

interface MealFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: MealFormData) => Promise<void>;
  initialData?: MealEntry | null;
  defaultDate?: string;
  isSubmitting?: boolean;
}

function formatDateTimeLocal(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getDefaultDateTime(defaultDate?: string): string {
  if (defaultDate) {
    // If we have a default date, use it with current time
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${defaultDate}T${hours}:${minutes}`;
  }
  // Default to current date and time
  return formatDateTimeLocal(new Date().toISOString());
}

export default function MealFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  defaultDate,
  isSubmitting = false,
}: MealFormModalProps) {
  const isEditMode = !!initialData;

  const [formData, setFormData] = useState<MealFormData>({
    recordedAt: getDefaultDateTime(defaultDate),
    caloriesEstimated: 0,
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens/closes or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          recordedAt: formatDateTimeLocal(initialData.recordedAt),
          caloriesEstimated: initialData.caloriesEstimated,
          description: initialData.description || '',
        });
      } else {
        setFormData({
          recordedAt: getDefaultDateTime(defaultDate),
          caloriesEstimated: 0,
          description: '',
        });
      }
      setErrors({});
    }
  }, [isOpen, initialData, defaultDate]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.recordedAt) {
      newErrors.recordedAt = 'Укажите дату и время';
    }

    if (!formData.caloriesEstimated || formData.caloriesEstimated <= 0) {
      newErrors.caloriesEstimated = 'Укажите калории (больше 0)';
    } else if (formData.caloriesEstimated > 10000) {
      newErrors.caloriesEstimated = 'Калории не могут превышать 10000';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Convert local datetime to ISO string
    const isoDate = new Date(formData.recordedAt).toISOString();

    await onSubmit({
      ...formData,
      recordedAt: isoDate,
    });
  };

  const handleInputChange = (field: keyof MealFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {isEditMode ? 'Редактировать запись' : 'Добавить запись'}
            </h2>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors -mr-2"
              aria-label="Закрыть"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
            {/* Date/Time */}
            <div>
              <label htmlFor="recordedAt" className="block text-sm font-medium text-gray-700 mb-1">
                Дата и время
              </label>
              <input
                type="datetime-local"
                id="recordedAt"
                value={formData.recordedAt}
                onChange={(e) => handleInputChange('recordedAt', e.target.value)}
                disabled={isSubmitting}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:border-transparent ${
                  errors.recordedAt ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.recordedAt && (
                <p className="mt-1 text-sm text-red-600">{errors.recordedAt}</p>
              )}
            </div>

            {/* Calories */}
            <div>
              <label htmlFor="calories" className="block text-sm font-medium text-gray-700 mb-1">
                Калории
              </label>
              <input
                type="number"
                id="calories"
                min="1"
                max="10000"
                value={formData.caloriesEstimated || ''}
                onChange={(e) => handleInputChange('caloriesEstimated', parseInt(e.target.value) || 0)}
                disabled={isSubmitting}
                placeholder="Например: 350"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:border-transparent ${
                  errors.caloriesEstimated ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.caloriesEstimated && (
                <p className="mt-1 text-sm text-red-600">{errors.caloriesEstimated}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Описание <span className="text-gray-400 font-normal">(необязательно)</span>
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                disabled={isSubmitting}
                rows={2}
                placeholder="Что вы съели?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:border-transparent resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 text-white bg-telegram-blue hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Сохранение...
                  </>
                ) : isEditMode ? (
                  'Сохранить'
                ) : (
                  'Добавить'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
