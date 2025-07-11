"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Cabinet {
  id: string;
  name: string;
  token: string;
  createdAt: string;
}

export default function Home() {
  const [apiToken, setApiToken] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [savedToken, setSavedToken] = useState("");
  const [googleSheetsLink, setGoogleSheetsLink] = useState("");
  const [selectedCabinet, setSelectedCabinet] = useState<Cabinet | null>(null);
  const router = useRouter();

  // Загружаем выбранный кабинет при инициализации
  useEffect(() => {
    const savedCabinet = localStorage.getItem("selected-cabinet");
    if (savedCabinet) {
      try {
        const cabinet = JSON.parse(savedCabinet);
        setSelectedCabinet(cabinet);
        setApiToken(cabinet.token);
        setSavedToken(cabinet.token);
      } catch (error) {
        console.error("Ошибка загрузки кабинета:", error);
      }
    }
  }, []);

  // Сохранение токена
  const handleSaveToken = () => {
    if (apiToken.trim()) {
      localStorage.setItem("wb_api_token", apiToken);
      setSavedToken(apiToken);
      alert("Токен успешно сохранен!");
    } else {
      alert("Введите токен для сохранения");
    }
  };

  // Удаление токена (legacy)
  const handleDeleteToken = () => {
    localStorage.removeItem("wb_api_token");
    setSavedToken("");
    setApiToken("");
    alert("Токен удален");
  };

  // Переход к управлению кабинетами
  const goToCabinets = () => {
    router.push('/cabinets');
  };

  // Смена кабинета
  const changeCabinet = () => {
    localStorage.removeItem('selected-cabinet');
    setSelectedCabinet(null);
    setApiToken('');
    setSavedToken('');
    router.push('/cabinets');
  };

  // Скачивание отчета
  const handleDownloadReport = async () => {
    if (!selectedCabinet) {
      alert("Выберите ВБ кабинет для создания отчета");
      return;
    }
    
    if (!startDate || !endDate) {
      alert("Выберите период дат");
      return;
    }

    if (new Date(startDate) > new Date(endDate)) {
      alert("Дата начала не может быть больше даты окончания");
      return;
    }

    setIsLoading(true);
    
    try {
      // Получаем сохраненные данные себестоимости
      const savedCostPrices = localStorage.getItem("wb_cost_prices");
      let costPricesData = {};
      
      if (savedCostPrices) {
        try {
          costPricesData = JSON.parse(savedCostPrices);
          console.log(`💰 Используем сохраненные данные себестоимости: ${Object.keys(costPricesData).length} товаров`);
        } catch (error) {
          console.error("Ошибка загрузки данных себестоимости:", error);
        }
      }
      
      const response = await fetch("/api/wildberries/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: selectedCabinet.token,
          startDate,
          endDate,
          costPricesData,
        }),
      });

      if (!response.ok) {
        // Получаем детальную информацию об ошибке
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        
        console.error("❌ Ошибка API:", errorData);
        
        // Формируем подробное сообщение об ошибке
        let errorMessage = errorData.error || `Ошибка API: ${response.status}`;
        if (errorData.help) {
          errorMessage += `\n\n💡 Решение: ${errorData.help}`;
        }
        if (errorData.details) {
          errorMessage += `\n\n📄 Детали: ${errorData.details}`;
        }
        
        throw new Error(errorMessage);
      }

      // Получаем файл как blob
      const blob = await response.blob();
      
      // Создаем ссылку для скачивания
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wildberries_full_report_${startDate}_${endDate}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert("Отчет успешно скачан!");
    } catch (error) {
      console.error("Ошибка скачивания отчета:", error);
      
      // Извлекаем детальную информацию об ошибке
      const errorMessage = (error as Error).message;
      const errorLines = errorMessage.split('\n');
      
      // Создаем более красивое сообщение об ошибке
      let displayMessage = errorLines[0]; // Основное сообщение
      
      if (errorLines.length > 1) {
        // Добавляем дополнительную информацию в новые строки
        displayMessage = errorLines.join('\n');
      }
      
      // Показываем alert с форматированным сообщением
      alert(`❌ ${displayMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Переход на страницу себестоимости
  const handleUploadCostPrice = () => {
    window.location.href = '/cost-price';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">
            📊 Wildberries Полный Отчет
          </h1>
          
          {/* Секция выбора кабинета */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">🏢 Выбранный ВБ кабинет</h2>
            
            {selectedCabinet ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-green-800">{selectedCabinet.name}</h3>
                    <p className="text-green-600 text-sm">
                      Токен: ****{selectedCabinet.token.slice(-10)}
                    </p>
                    <p className="text-green-500 text-xs">
                      Добавлен: {new Date(selectedCabinet.createdAt).toLocaleDateString('ru-RU')}
                </p>
              </div>
                  <button
                    onClick={changeCabinet}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Сменить кабинет
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-600 mb-4">Выберите ВБ кабинет для работы</p>
                <button
                  onClick={goToCabinets}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                  🏢 Управление кабинетами
                </button>
              </div>
            )}
          </div>

          {/* Секция периода */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">📅 Период отчета</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Дата начала
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Дата окончания
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>



          {/* Кнопки действий */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">⚡ Действия</h2>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleDownloadReport}
                disabled={isLoading || !selectedCabinet}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Создание Excel отчета...
                  </>
                ) : (
                  <>📥 Скачать Excel отчет</>
                )}
              </button>

              <button
                onClick={handleUploadCostPrice}
                className="flex-1 px-6 py-3 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
              >
                💰 Загрузить себестоимость
              </button>

            </div>
          </div>

          {/* Инструкции */}
          <div className="mb-8 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="text-lg font-semibold text-yellow-800 mb-3">📋 Инструкции</h3>
            <div className="text-yellow-700 space-y-2">
              <p><strong>1.</strong> Нажмите "Управление кабинетами" чтобы добавить свои ВБ кабинеты</p>
              <p><strong>2.</strong> Получите API токен в личном кабинете Wildberries в разделе "Настройки" → "Доступ к API"</p>
              <p><strong>3.</strong> Добавьте кабинет с названием и токеном для удобного управления</p>
              <p><strong>4.</strong> Выберите период дат (максимум 30 дней)</p>
              <p><strong>5.</strong> Нажмите "Скачать Excel отчет" для получения полного отчета в формате Excel</p>
              <p><strong>6.</strong> Или нажмите "Загрузить себестоимость" для настройки цен</p>
            </div>
          </div>

          {/* Блок BASIO */}
          <div className="mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            {/* Заголовок с аватаром и иконками */}
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-xl">wb</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-800">BASIO</h3>
              </div>
              <div className="flex items-center gap-3">
                <button className="p-2 text-gray-500 hover:text-gray-700 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button className="p-2 text-gray-500 hover:text-gray-700 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button className="p-2 text-gray-500 hover:text-gray-700 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Статус подключения */}
            <div className="mb-8">
              <p className="text-gray-600 mb-2">Подключен:</p>
              <p className="text-gray-800 font-semibold">19/06/2025 17:23</p>
            </div>

            {/* Поле для ссылки на Google Таблицы */}
            <div className="mb-8">
              {!googleSheetsLink ? (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Обратитесь к вашему менеджеру для добавления ссылки, самостоятельно добавлять ничего не надо
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={googleSheetsLink}
                      onChange={(e) => setGoogleSheetsLink(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                    <button
                      onClick={() => {
                        if (googleSheetsLink.trim()) {
                          // Проверяем, что это валидная ссылка на Google Sheets
                          if (googleSheetsLink.includes('docs.google.com/spreadsheets')) {
                            alert('Ссылка на Google Таблицы добавлена!');
                          } else {
                            alert('Пожалуйста, введите корректную ссылку на Google Таблицы');
                            setGoogleSheetsLink('');
                          }
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      Добавить
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                                     <a
                     href={googleSheetsLink}
                     target="_blank"
                     rel="noopener noreferrer"
                     className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                   >
                     📊 ГУГЛ-ТАБЛИЦА
                   </a>
                  <button
                    onClick={() => setGoogleSheetsLink('')}
                    className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Удалить
                  </button>
                </div>
              )}
            </div>

            {/* Кнопки */}
            <div className="flex gap-4">
              <button className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors">
                Проверить подключение
              </button>
              <button className="flex-1 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors">
                Отчет реализации
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
