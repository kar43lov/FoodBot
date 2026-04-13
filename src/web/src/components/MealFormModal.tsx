import { useState, useEffect, useRef } from 'react';
import { MealEntry, api, PhotoAnalysisResult } from '../api/client';
import { useAuth } from '../context/AuthContext';

export interface MealFormData {
  recordedAt: string;
  caloriesEstimated: number;
  description: string;
  protein?: number;
  fat?: number;
  carbs?: number;
}

interface MealFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: MealFormData) => Promise<void>;
  initialData?: MealEntry | null;
  defaultDate?: string;
  isSubmitting?: boolean;
}

type InputMode = 'choose' | 'manual' | 'photo';

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
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${defaultDate}T${hours}:${minutes}`;
  }
  return formatDateTimeLocal(new Date().toISOString());
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const { token } = useAuth();

  const [inputMode, setInputMode] = useState<InputMode>('choose');
  const [formData, setFormData] = useState<MealFormData>({
    recordedAt: getDefaultDateTime(defaultDate),
    caloriesEstimated: 0,
    description: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<PhotoAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setInputMode('manual');
        setFormData({
          recordedAt: formatDateTimeLocal(initialData.recordedAt),
          caloriesEstimated: initialData.caloriesEstimated,
          description: initialData.description || '',
          protein: initialData.protein ?? undefined,
          fat: initialData.fat ?? undefined,
          carbs: initialData.carbs ?? undefined,
        });
      } else {
        setInputMode('choose');
        setFormData({
          recordedAt: getDefaultDateTime(defaultDate),
          caloriesEstimated: 0,
          description: '',
          protein: undefined,
          fat: undefined,
          carbs: undefined,
        });
      }
      setErrors({});
      setPhotoPreview(null);
      setAnalysisResult(null);
      setAnalysisError(null);
    }
  }, [isOpen, initialData, defaultDate]);

  const handlePhotoSelected = async (file: File) => {
    if (!token) return;

    const base64 = await fileToBase64(file);
    setPhotoPreview(base64);
    setAnalysisError(null);
    setAnalysisResult(null);
    setIsAnalyzing(true);

    try {
      const result = await api.analyzePhoto(token, base64);
      setAnalysisResult(result);

      if (result.is_food && result.estimated_calories) {
        setFormData((prev) => ({
          ...prev,
          caloriesEstimated: result.estimated_calories!,
          description: result.description || '',
          protein: result.protein_g ?? undefined,
          fat: result.fat_g ?? undefined,
          carbs: result.carbs_g ?? undefined,
        }));
      } else {
        setAnalysisError('AI не распознал еду на фото. Попробуйте другое фото или введите данные вручную.');
      }
    } catch {
      setAnalysisError('Ошибка анализа фото. Попробуйте ещё раз.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePhotoSelected(file);
    }
  };

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

    const isoDate = new Date(formData.recordedAt).toISOString();

    await onSubmit({
      ...formData,
      recordedAt: isoDate,
    });
  };

  const handleInputChange = (field: keyof MealFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  if (!isOpen) return null;

  const showForm = inputMode === 'manual' || (inputMode === 'photo' && analysisResult?.is_food);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full">
          {/* Header */}
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {inputMode !== 'choose' && !isEditMode && (
                <button
                  onClick={() => {
                    setInputMode('choose');
                    setPhotoPreview(null);
                    setAnalysisResult(null);
                    setAnalysisError(null);
                  }}
                  disabled={isSubmitting || isAnalyzing}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              )}
              <h2 className="text-lg font-semibold text-gray-900">
                {isEditMode ? 'Редактировать запись' : inputMode === 'choose' ? 'Добавить запись' : inputMode === 'photo' ? 'Фото еды' : 'Ввести вручную'}
              </h2>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting || isAnalyzing}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors -mr-2"
              aria-label="Закрыть"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mode selection */}
          {inputMode === 'choose' && (
            <div className="px-6 py-6 space-y-3">
              <button
                onClick={() => setInputMode('photo')}
                className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-telegram-blue hover:bg-blue-50 transition-colors text-left"
              >
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Сфотографировать еду</div>
                  <div className="text-sm text-gray-500">AI определит калории автоматически</div>
                </div>
              </button>

              <button
                onClick={() => setInputMode('manual')}
                className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-telegram-blue hover:bg-blue-50 transition-colors text-left"
              >
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <div className="font-medium text-gray-900">Ввести вручную</div>
                  <div className="text-sm text-gray-500">Указать калории и описание самостоятельно</div>
                </div>
              </button>
            </div>
          )}

          {/* Photo input */}
          {inputMode === 'photo' && !analysisResult?.is_food && (
            <div className="px-6 py-6">
              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />

              {!photoPreview && !isAnalyzing && (
                <div className="space-y-3">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">Сделать фото</div>
                      <div className="text-sm text-gray-500">Открыть камеру</div>
                    </div>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">Выбрать из галереи</div>
                      <div className="text-sm text-gray-500">Прикрепить существующее фото</div>
                    </div>
                  </button>
                </div>
              )}

              {/* Analyzing state */}
              {isAnalyzing && (
                <div className="text-center py-8">
                  {photoPreview && (
                    <img src={photoPreview} alt="Фото еды" className="w-48 h-48 object-cover rounded-xl mx-auto mb-4" />
                  )}
                  <svg className="animate-spin h-8 w-8 text-telegram-blue mx-auto mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-gray-600 font-medium">AI анализирует фото...</p>
                  <p className="text-sm text-gray-400 mt-1">Определяем блюдо и калории</p>
                </div>
              )}

              {/* Error state */}
              {analysisError && !isAnalyzing && (
                <div className="text-center py-4">
                  {photoPreview && (
                    <img src={photoPreview} alt="Фото" className="w-48 h-48 object-cover rounded-xl mx-auto mb-4" />
                  )}
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
                    <p className="text-sm text-red-700">{analysisError}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setPhotoPreview(null);
                        setAnalysisError(null);
                        fileInputRef.current?.click();
                      }}
                      className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-sm"
                    >
                      Другое фото
                    </button>
                    <button
                      onClick={() => setInputMode('manual')}
                      className="flex-1 px-4 py-2 text-white bg-telegram-blue hover:bg-blue-600 rounded-lg transition-colors text-sm"
                    >
                      Ввести вручную
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form (manual or after successful photo analysis) */}
          {showForm && (
            <form key={initialData?.id ?? 'new'} onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {/* Photo preview with AI result */}
              {inputMode === 'photo' && photoPreview && analysisResult && (
                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <img src={photoPreview} alt="Фото еды" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-1.5 py-0.5 bg-green-200 text-green-800 rounded font-medium">AI</span>
                      <span className="text-xs text-gray-500">
                        {Math.round(analysisResult.food_confidence * 100)}% уверенность
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1 truncate">
                      {analysisResult.description}
                    </p>
                  </div>
                </div>
              )}

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
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:border-transparent text-gray-900 bg-white ${
                    errors.recordedAt ? 'border-red-300' : 'border-gray-300'
                  }`}
                  style={{ colorScheme: 'light' }}
                />
                {errors.recordedAt && (
                  <p className="mt-1 text-sm text-red-600">{errors.recordedAt}</p>
                )}
              </div>

              {/* Calories */}
              <div>
                <label htmlFor="calories" className="block text-sm font-medium text-gray-700 mb-1">
                  Калории
                  {inputMode === 'photo' && (
                    <span className="text-xs text-green-600 ml-2">заполнено AI</span>
                  )}
                </label>
                <input
                  type="number"
                  id="calories"
                  inputMode="numeric"
                  min="1"
                  max="10000"
                  value={formData.caloriesEstimated > 0 ? String(formData.caloriesEstimated) : ''}
                  onChange={(e) => handleInputChange('caloriesEstimated', parseInt(e.target.value) || 0)}
                  disabled={isSubmitting}
                  placeholder="Например: 350"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:border-transparent text-gray-900 bg-white ${
                    errors.caloriesEstimated ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {errors.caloriesEstimated && (
                  <p className="mt-1 text-sm text-red-600">{errors.caloriesEstimated}</p>
                )}
              </div>

              {/* Macros (protein/fat/carbs) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  БЖУ
                  {inputMode === 'photo' && formData.protein != null && (
                    <span className="text-xs text-green-600 ml-2">заполнено AI</span>
                  )}
                  <span className="text-gray-400 font-normal ml-1">(необязательно)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="protein" className="block text-xs text-gray-500 mb-0.5">Б</label>
                    <input
                      type="number"
                      id="protein"
                      min="0"
                      max="1000"
                      value={formData.protein ?? ''}
                      onChange={(e) => handleInputChange('protein' as keyof MealFormData, e.target.value ? parseInt(e.target.value) : 0)}
                      disabled={isSubmitting}
                      placeholder="г"
                      className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="fat" className="block text-xs text-gray-500 mb-0.5">Ж</label>
                    <input
                      type="number"
                      id="fat"
                      min="0"
                      max="1000"
                      value={formData.fat ?? ''}
                      onChange={(e) => handleInputChange('fat' as keyof MealFormData, e.target.value ? parseInt(e.target.value) : 0)}
                      disabled={isSubmitting}
                      placeholder="г"
                      className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="carbs" className="block text-xs text-gray-500 mb-0.5">У</label>
                    <input
                      type="number"
                      id="carbs"
                      min="0"
                      max="1000"
                      value={formData.carbs ?? ''}
                      onChange={(e) => handleInputChange('carbs' as keyof MealFormData, e.target.value ? parseInt(e.target.value) : 0)}
                      disabled={isSubmitting}
                      placeholder="г"
                      className="w-full px-2 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Описание
                  {inputMode === 'photo' ? (
                    <span className="text-xs text-green-600 ml-2">заполнено AI</span>
                  ) : (
                    <span className="text-gray-400 font-normal ml-1">(необязательно)</span>
                  )}
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  disabled={isSubmitting}
                  rows={2}
                  placeholder="Что вы съели?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-telegram-blue focus:border-transparent resize-none text-gray-900 bg-white"
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
          )}
        </div>
      </div>
    </div>
  );
}
