'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Cabinet {
  id: string
  name: string
  token: string
  createdAt: string
}

interface WeekPeriod {
  id: string
  start: string
  end: string
  status: 'pending' | 'downloading' | 'completed' | 'error'
  fileName?: string
  errorMessage?: string
  downloadedAt?: string
  serverPath?: string
  relativePath?: string
  fileExists?: boolean
}

interface AutoloadProgress {
  cabinetId: string
  periods: WeekPeriod[]
  isActive: boolean
  lastUpdate: string
}

export default function AutoloadPage() {
  const router = useRouter()
  const [cabinet, setCabinet] = useState<Cabinet | null>(null)
  const [periods, setPeriods] = useState<WeekPeriod[]>([])
  const [loadingPeriods, setLoadingPeriods] = useState<Set<string>>(new Set())

  useEffect(() => {
    const initPage = async () => {
      const path = window.location.pathname
      const cabinetId = path.split('/')[2]
      
      if (!cabinetId) {
        router.push('/cabinets')
        return
      }

      // Загружаем информацию о кабинете
      const cabinets = JSON.parse(localStorage.getItem('wildberries_cabinets') || '[]')
      const cabinetData = cabinets.find((c: Cabinet) => c.id === cabinetId)
      
      if (!cabinetData) {
        router.push('/cabinets')
        return
      }

      setCabinet(cabinetData)
      await initializeReports(cabinetData)
    }

    initPage()
  }, [router])

  const initializeReports = async (cabinetData: Cabinet) => {
    // Загружаем сохраненный прогресс
    const savedProgress = localStorage.getItem(`autoload_progress_${cabinetData.id}`)
    
    if (savedProgress) {
      const progress: AutoloadProgress = JSON.parse(savedProgress)
      setPeriods(progress.periods)
      await updateFileExistenceStatus(progress.periods)
    } else {
      // Генерируем новые периоды
      const weeklyPeriods = generateWeeklyPeriods()
      setPeriods(weeklyPeriods)
      saveProgress(weeklyPeriods)
    }
  }

  const generateWeeklyPeriods = (): WeekPeriod[] => {
    const periods: WeekPeriod[] = []
    const now = new Date()
    const currentDate = new Date(now)
    
    // Начинаем с текущей недели и идем назад на 24 недели
    for (let i = 0; i < 24; i++) {
      // Находим понедельник текущей недели
      const monday = new Date(currentDate)
      const dayOfWeek = monday.getDay()
      const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      monday.setDate(monday.getDate() - daysSinceMonday)
      
      // Воскресенье той же недели
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      
      periods.push({
        id: `week-${i}`,
        start: formatDate(monday),
        end: formatDate(sunday),
        status: 'pending'
      })
      
      // Переходим к предыдущей неделе
      currentDate.setDate(currentDate.getDate() - 7)
    }
    
    return periods
  }

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0]
  }

  const getDayOfWeek = (dateStr: string): string => {
    const date = new Date(dateStr)
    const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
    return days[date.getDay()]
  }

  const saveProgress = (updatedPeriods: WeekPeriod[]) => {
    if (!cabinet) return
    
    const progress: AutoloadProgress = {
      cabinetId: cabinet.id,
      periods: updatedPeriods,
      isActive: false,
      lastUpdate: new Date().toISOString()
    }
    
    localStorage.setItem(`autoload_progress_${cabinet.id}`, JSON.stringify(progress))
    setPeriods(updatedPeriods)
  }

  // Функция для загрузки одного отчета
  const loadSingleReport = async (period: WeekPeriod) => {
    if (!cabinet || loadingPeriods.has(period.id)) return

    // Проверяем доступность периода
    if (!isPeriodAvailable(period.end)) {
      alert(`Период еще недоступен. Доступно с ${getAvailableDate(period.end)}`)
      return
    }

    // Добавляем в загружающиеся
    setLoadingPeriods(prev => new Set([...prev, period.id]))

    // Обновляем статус на "downloading"
    const updatedPeriods = periods.map(p => 
      p.id === period.id ? { ...p, status: 'downloading' as const } : p
    )
    saveProgress(updatedPeriods)

    try {
      const response = await fetch('/api/wildberries/autoload-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cabinetId: cabinet.id,
          token: cabinet.token,
          startDate: period.start,
          endDate: period.end,
          cabinetName: cabinet.name
        })
      })

      // Пытаемся извлечь тело ответа независимо от статуса
      let result: any = {};
      try {
        result = await response.json();
      } catch (e) {
        // Игнорируем ошибки парсинга JSON
      }

      if (!response.ok) {
        const message = result?.error || `HTTP error! status: ${response.status}`
        throw new Error(message)
      }

      // Если success === false также считаем это ошибкой и выводим сообщение
      if (!result.success) {
        throw new Error(result.error || 'Неизвестная ошибка')
      }
 
      // Успешно загружено
      const completedPeriods = periods.map(p => 
        p.id === period.id ? {
          ...p,
          status: 'completed' as const,
          fileName: result.fileName,
          downloadedAt: new Date().toISOString(),
          serverPath: result.serverPath,
          relativePath: result.relativePath,
          fileExists: true
        } : p
      )
      saveProgress(completedPeriods)
    } catch (error) {
      console.error('Ошибка загрузки отчета:', error)
      
      // Обновляем статус на "error"
      const errorPeriods = periods.map(p => 
        p.id === period.id ? {
          ...p,
          status: 'error' as const,
          errorMessage: error instanceof Error ? error.message : 'Неизвестная ошибка'
        } : p
      )
      saveProgress(errorPeriods)
    } finally {
      // Убираем из загружающихся
      setLoadingPeriods(prev => {
        const newSet = new Set(prev)
        newSet.delete(period.id)
        return newSet
      })
    }
  }

  const checkFileExists = async (fileName: string): Promise<{exists: boolean, relativePath: string | null}> => {
    try {
      const response = await fetch('/api/wildberries/check-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName })
      })
      
      if (!response.ok) return { exists: false, relativePath: null }
      
      const result = await response.json()
      return {
        exists: result.exists || false,
        relativePath: result.relativePath || null
      }
    } catch (error) {
      console.error('Ошибка проверки файла:', error)
      return { exists: false, relativePath: null }
    }
  }

  const updateFileExistenceStatus = async (periodsToCheck?: WeekPeriod[]) => {
    const targetPeriods = periodsToCheck || periods
    const completedPeriods = targetPeriods.filter(p => p.status === 'completed' && p.fileName)
    
    if (completedPeriods.length === 0) return

    for (const period of completedPeriods) {
      if (period.fileName) {
        const fileInfo = await checkFileExists(period.fileName)
        if (period.fileExists !== fileInfo.exists || period.relativePath !== fileInfo.relativePath) {
                      const updatedPeriods = targetPeriods.map(p => 
              p.id === period.id ? { 
                ...p, 
                fileExists: fileInfo.exists,
                relativePath: fileInfo.relativePath || undefined
              } : p
            )
          saveProgress(updatedPeriods)
        }
      }
    }
  }

  const resetPeriod = (periodId: string) => {
    const updatedPeriods = periods.map(period => 
      period.id === periodId 
        ? { 
            ...period, 
            status: 'pending' as const, 
            errorMessage: undefined,
            fileName: undefined,
            downloadedAt: undefined,
            serverPath: undefined,
            relativePath: undefined,
            fileExists: undefined
          } 
        : period
    )
    saveProgress(updatedPeriods)
  }

  const formatDisplayDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit'
    })
  }

  const isPeriodAvailable = (endDate: string): boolean => {
    const end = new Date(endDate)
    const today = new Date()
    const daysDiff = Math.floor((today.getTime() - end.getTime()) / (1000 * 60 * 60 * 24))
    return daysDiff >= 3
  }

  const getAvailableDate = (endDate: string): string => {
    const end = new Date(endDate)
    const availableDate = new Date(end)
    availableDate.setDate(end.getDate() + 3)
    return availableDate.toLocaleDateString('ru-RU')
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return '⏳'
      case 'downloading': return '🔄'
      case 'completed': return '✅'
      case 'error': return '❌'
      default: return '⏳'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ожидает'
      case 'downloading': return 'Загружается'
      case 'completed': return 'Готов'
      case 'error': return 'Ошибка'
      default: return 'Ожидает'
    }
  }

  if (!cabinet) {
    return <div className="p-8">Загрузка...</div>
  }

  const completedCount = periods.filter(p => p.status === 'completed').length
  const errorCount = periods.filter(p => p.status === 'error').length
  const pendingCount = periods.filter(p => p.status === 'pending').length
  const downloadingCount = periods.filter(p => p.status === 'downloading').length

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Мои отчеты</h1>
              <p className="text-gray-600">Кабинет: {cabinet.name}</p>
            </div>
            <button
              onClick={() => router.push('/cabinets')}
              className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors"
            >
              ← Назад к кабинетам
            </button>
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{periods.length}</div>
              <div className="text-sm text-blue-800">Всего недель</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{completedCount}</div>
              <div className="text-sm text-green-800">Готово</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
              <div className="text-sm text-yellow-800">Ожидает</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{errorCount}</div>
              <div className="text-sm text-red-800">Ошибки</div>
            </div>
          </div>

          {/* Информация */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-blue-800">
              <div className="font-semibold mb-2">ℹ️ Как работает:</div>
              <ul className="space-y-1">
                <li>• Нажмите "Загрузить отчет" рядом с нужным периодом</li>
                <li>• Отчеты готовятся индивидуально по запросу</li>
                <li>• Готовые отчеты сохраняются на сервере</li>
                <li>• Скачивайте готовые отчеты кнопкой "📥 Скачать"</li>
                <li>• Период доступен для загрузки через 3 дня после окончания недели</li>
              </ul>
            </div>
          </div>

          {/* Список периодов */}
          <div className="space-y-2">
            <h3 className="font-semibold mb-4">Еженедельные периоды ({periods.length})</h3>
            <div className="max-h-96 overflow-y-auto border rounded-lg">
              {periods.map((period) => {
                const isAvailable = isPeriodAvailable(period.end)
                const isUnavailable = period.status === 'pending' && !isAvailable
                const isLoading = loadingPeriods.has(period.id) || period.status === 'downloading'
                
                return (
                  <div key={period.id} className={`p-3 border-b last:border-b-0 flex justify-between items-center ${
                    isLoading ? 'bg-blue-50 border-blue-200' : ''
                  } ${isUnavailable ? 'opacity-60 bg-gray-50' : ''}`}>
                    <div className="flex items-center gap-3">
                      {/* Кнопки действий слева от даты */}
                      {period.status === 'completed' && period.fileName && (
                        period.fileExists === false ? (
                          <button 
                            className="bg-gray-400 text-white px-3 py-1 rounded text-sm cursor-not-allowed flex items-center gap-1"
                            disabled
                            title="Файл не найден на сервере"
                          >
                            ❌ Недоступен
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <a 
                              href={period.relativePath ? `/reports/${period.relativePath}` : `/reports/${period.fileName}`} 
                              download={period.fileName}
                            >
                              <button className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 font-medium flex items-center gap-1">
                                📥 Скачать
                              </button>
                            </a>
                            <button
                              onClick={() => loadSingleReport(period)}
                              disabled={isLoading}
                              className={`px-3 py-1 rounded text-sm font-medium flex items-center gap-1 ${
                                isLoading 
                                  ? 'bg-blue-400 text-white cursor-not-allowed' 
                                  : 'bg-orange-500 text-white hover:bg-orange-600'
                              }`}
                            >
                              {isLoading ? '⏳ Загружается...' : '🔄 Перезагрузить'}
                            </button>
                          </div>
                        )
                      )}
                      
                      {/* Кнопка загрузить отчет для pending и error периодов */}
                      {(period.status === 'pending' || period.status === 'error') && isAvailable && (
                        <button
                          onClick={() => loadSingleReport(period)}
                          disabled={isLoading}
                          className={`px-3 py-1 rounded text-sm font-medium flex items-center gap-1 ${
                            isLoading 
                              ? 'bg-blue-400 text-white cursor-not-allowed' 
                              : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {isLoading ? '⏳ Загружается...' : '📄 Загрузить отчет'}
                        </button>
                      )}

                      <span className="text-xl">{getStatusIcon(period.status)}</span>
                      <div>
                        <div className="font-medium">
                          {formatDisplayDate(period.start)} ({getDayOfWeek(period.start)}) - {formatDisplayDate(period.end)} ({getDayOfWeek(period.end)})
                        </div>
                        <div className="text-sm text-gray-600">
                          Статус: {getStatusText(period.status)}
                          {period.status === 'pending' && !isPeriodAvailable(period.end) && (
                            <span className="ml-2 text-orange-600">• Доступно с {getAvailableDate(period.end)}</span>
                          )}
                          {period.fileName && (
                            <span className="ml-2 text-green-600">• {period.fileName}</span>
                          )}
                          {period.downloadedAt && (
                            <span className="ml-2 text-gray-500">
                              • Готов: {new Date(period.downloadedAt).toLocaleDateString('ru-RU')}
                            </span>
                          )}
                        </div>
                        {period.errorMessage && (
                          <div className="text-sm text-red-600 mt-1">
                            Ошибка: {period.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {period.status === 'error' && (
                        <button
                          onClick={() => resetPeriod(period.id)}
                          className="text-sm bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
                        >
                          Сбросить
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 
