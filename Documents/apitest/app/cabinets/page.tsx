'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Cabinet {
  id: string
  name: string
  token: string
  createdAt: string
}

export default function CabinetsPage() {
  const [cabinets, setCabinets] = useState<Cabinet[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', token: '' })
  const router = useRouter()

  // Загружаем кабинеты из localStorage
  useEffect(() => {
    const savedCabinets = localStorage.getItem('wb-cabinets')
    if (savedCabinets) {
      setCabinets(JSON.parse(savedCabinets))
    }
  }, [])

  // Сохраняем кабинеты в localStorage
  const saveCabinets = (newCabinets: Cabinet[]) => {
    localStorage.setItem('wb-cabinets', JSON.stringify(newCabinets))
    setCabinets(newCabinets)
  }

  // Добавляем новый кабинет
  const addCabinet = () => {
    if (!formData.name.trim() || !formData.token.trim()) return

    const newCabinet: Cabinet = {
      id: Date.now().toString(),
      name: formData.name.trim(),
      token: formData.token.trim(),
      createdAt: new Date().toISOString()
    }

    const updatedCabinets = [...cabinets, newCabinet]
    saveCabinets(updatedCabinets)
    setFormData({ name: '', token: '' })
    setShowAddForm(false)
  }

  // Удаляем кабинет
  const deleteCabinet = (id: string) => {
    const updatedCabinets = cabinets.filter(cabinet => cabinet.id !== id)
    saveCabinets(updatedCabinets)
  }

  // Переходим к генерации отчета для выбранного кабинета
  const selectCabinet = (cabinet: Cabinet) => {
    localStorage.setItem('selected-cabinet', JSON.stringify(cabinet))
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Мои ВБ кабинеты</h1>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Добавить кабинет
            </button>
          </div>

          {/* Форма добавления кабинета */}
          {showAddForm && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
              <h3 className="font-semibold mb-4">Добавить новый кабинет</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название кабинета
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Например: Основной магазин"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    API токен Wildberries
                  </label>
                  <input
                    type="password"
                    value={formData.token}
                    onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                    placeholder="Вставьте токен из личного кабинета ВБ"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addCabinet}
                    disabled={!formData.name.trim() || !formData.token.trim()}
                    className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    Сохранить
                  </button>
                  <button
                    onClick={() => {
                      setShowAddForm(false)
                      setFormData({ name: '', token: '' })
                    }}
                    className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Список кабинетов */}
          {cabinets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>У вас пока нет добавленных кабинетов</p>
              <p className="text-sm">Нажмите "Добавить кабинет" чтобы начать</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {cabinets.map((cabinet) => (
                <div key={cabinet.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-center">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg text-gray-900">{cabinet.name}</h3>
                      <p className="text-sm text-gray-500">
                        Токен: ****{cabinet.token.slice(-10)}
                      </p>
                      <p className="text-xs text-gray-400">
                        Добавлен: {new Date(cabinet.createdAt).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => selectCabinet(cabinet)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                      >
                        Создать отчет
                      </button>
                      <button
                        onClick={() => deleteCabinet(cabinet.id)}
                        className="bg-red-500 text-white px-3 py-2 rounded-md hover:bg-red-600 transition-colors"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 