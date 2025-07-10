"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// Интерфейсы для всех данных
interface AllWebData {
  "Отчет детализации": any[];
  "Хранение": any[];
  "Приемка": any[];
  "Мои товары": any[];
  "По товарам": any[];
  "По периодам": {
    [key: string]: {
      value: number | string;
      formula?: string;
      comment?: string;
      percent?: number;
    };
  };
}

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
  const [showWebData, setShowWebData] = useState(false);
  const [webData, setWebData] = useState<AllWebData | null>(null);
  const [isLoadingWebData, setIsLoadingWebData] = useState(false);
  const [activeSheet, setActiveSheet] = useState<string>("По периодам");
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

  // Получение данных для веб-версии
  const handleShowWebData = async () => {
    if (!selectedCabinet) {
      alert("Выберите ВБ кабинет для просмотра аналитики");
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

    try {
      console.log("🔍 Начинаем получение данных для веб-версии...");
      console.log("📅 Период:", { startDate, endDate });
      console.log("🔐 Кабинет:", selectedCabinet.name);
      
      setIsLoadingWebData(true);
      setWebData(null);
      setShowWebData(false);
      
      const response = await fetch('/api/wildberries/periods', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: selectedCabinet.token,
          startDate,
          endDate
        })
      });

      console.log("📡 Ответ от сервера:", response.status);
      
      if (!response.ok) {
        // Получаем детальную информацию об ошибке
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        
        console.error("❌ Ошибка от сервера:", errorData);
        
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

      const data = await response.json();
      console.log("📊 Полученные данные:", data);
      
      setWebData(data);
      setShowWebData(true);
      
    } catch (error) {
      console.error("❌ Ошибка при получении данных веб-версии:", error);
      alert(`Ошибка при получении данных: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    } finally {
      setIsLoadingWebData(false);
    }
  };

  // Переход на страницу себестоимости
  const handleUploadCostPrice = () => {
    window.location.href = '/cost-price';
  };

  // Функция отображения данных "По периодам"
  const renderPeriodsData = (data: any) => {
    const sections = [
      {
        title: "Поставки клиентов",
        color: "bg-blue-100",
        borderColor: "border-blue-300",
        textColor: "text-blue-800",
        items: ["Доставки", "Отказы без возвратов", "Итого поставок клиентам"]
      },
      {
        title: "Показатели за период",
        color: "bg-orange-100", 
        borderColor: "border-orange-300",
        textColor: "text-orange-800",
        items: ["Продажи", "Возвраты", "Итого кол-во реализованного товара", "Продажи + корректировки", "Корректировки", "Заказано товаров", "Корректировки в перечислении за товар шт"]
      },
      {
        title: "Движение товара в рублях по цене продавца с учетом согласованной скидки (до СПП)",
        color: "bg-blue-100",
        borderColor: "border-blue-300", 
        textColor: "text-blue-800",
        items: ["Продажи до СПП", "Возвраты до СПП", "Корректировка в продажах до СПП", "Вся стоимость реализованного товара до СПП", "Вся стоимость до СПП", "Средний чек продажи до СПП", "% комиссии ВБ до СПП"]
      },
      {
        title: "Движение товара в рублях по цене с учетом скидки постоянного покупателя (после СПП)",
        color: "bg-orange-100",
        borderColor: "border-orange-300",
        textColor: "text-orange-800",
        items: ["Продажи после СПП", "Возвраты после СП", "Корректировка в продажах после СПП", "Вся стоимость реализованного товара после СПП", "Вся стоимость после СПП", "Средний чек продажи после СП", "Сумма СПП", "% СПП"]
      },
      {
        title: "К перечислению за товар",
        color: "bg-orange-100",
        borderColor: "border-orange-300",
        textColor: "text-orange-800",
        items: ["Корректировки в перечислении за товар", "Продажи фактические (цена продажи - комиссия ВБ)", "Возвраты полученный по факту за возврат по формуле (Цена продажи - комиссия ВБ)", "К перечислению за товар"]
      },
      {
        title: "Статьи удержаний Вайлдберриз",
        color: "bg-purple-100",
        borderColor: "border-purple-300", 
        textColor: "text-purple-800",
        items: ["Плановая комиссия", "Фактическая комиссия", "Стоимость логистики", "Логистика на единицу товар", "% логистики от реализациии до СПП", "Штрафы", "Доплаты", "Хранение", "% хранения от реализациии до СПП", "Платная приемка", "Реклама баланс + счет", "% ДРР (доля рекламных расходов) от реализациии до СПП (на единицу)", "% ДРР (доля рекламных расходов) от реализациии до СПП", "ИМИЗР (использование механик искуственного завышения рейтинга)", "Отзывы", "Кредит", "Тело кредита", "Процент кредита", "% кредита от реализациии до СПП", "Прочие удержания", "% прочих удержаний от реализациии до СПП", "Итого стоимость всех услуг ВБ от реализации до СПП", "% всех услуг ВБ от реализации до СПП", "% всех услуг ВБ от реализации после СПП"]
      },
      {
        title: "Перечисления, проверка расчетов",
        color: "bg-green-100",
        borderColor: "border-green-300",
        textColor: "text-green-800",
        items: ["ИТОГО к выплате", "Итого к оплате на единицу товара"]
      }
    ];

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Наименование</th>
              <th className="border border-gray-300 px-4 py-2 text-right font-semibold">Значение</th>
              <th className="border border-gray-300 px-4 py-2 text-right font-semibold">%</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section, sectionIndex) => (
              <React.Fragment key={sectionIndex}>
                <tr>
                  <td colSpan={3} className={`${section.color} ${section.borderColor} ${section.textColor} border px-4 py-2 font-bold text-center`}>
                    {section.title}
                  </td>
                </tr>
                {section.items.map((itemKey, itemIndex) => {
                  const item = data[itemKey];
                  if (!item) return null;
                  
                  const value = typeof item.value === 'number' ? 
                    (item.value === 0 ? item.value : item.value.toLocaleString('ru-RU')) : 
                    item.value;
                  
                  const isZero = typeof item.value === 'number' && item.value === 0;
                  const percent = item.percent !== undefined ? 
                    `${(item.percent * 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : 
                    '';
                  
                  return (
                    <tr key={itemIndex}>
                      <td className="border border-gray-300 px-4 py-2">{itemKey}</td>
                      <td className={`border border-gray-300 px-4 py-2 text-right ${isZero ? 'text-red-600 font-semibold' : ''}`}>
                        {value}
                      </td>
                      <td className="border border-gray-300 px-4 py-2 text-right">{percent}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Функция отображения данных в виде таблицы
  const renderTableData = (data: any[], title: string) => {
    if (!data || data.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          Нет данных для отображения
        </div>
      );
    }

    // Собираем все уникальные ключи из первых 50 строк (или меньше)
    const maxRowsForHeaders = 50;
    const headerSet: Set<string> = new Set();
    data.slice(0, maxRowsForHeaders).forEach((row) => {
      Object.keys(row).forEach((key) => headerSet.add(key));
    });
    const headers = Array.from(headerSet);
    
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-50">
              {headers.map((header, index) => (
                <th key={index} className="border border-gray-300 px-4 py-2 text-left font-semibold">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 100).map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                {headers.map((header, cellIndex) => (
                  <td key={cellIndex} className="border border-gray-300 px-4 py-2">
                    {row[header] !== undefined ? row[header] : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.length > 100 && (
          <div className="text-center py-4 text-gray-600">
            Показано первые 100 записей из {data.length}
          </div>
        )}
      </div>
    );
  };

  const sheetTabs = [
    "Отчет детализации",
    "Хранение", 
    "Приемка",
    "Мои товары",
    "По товарам",
    "По периодам"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className={`mx-auto transition-all duration-300 ${showWebData ? 'max-w-7xl' : 'max-w-2xl'}`}>
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
                disabled={isLoading}
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
                onClick={handleShowWebData}
                disabled={isLoadingWebData}
                className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition-colors flex items-center justify-center gap-2"
              >
                {isLoadingWebData ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Загрузка данных...
                  </>
                ) : (
                  <>📊 Показать аналитику</>
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
              <p><strong>6.</strong> Или нажмите "Показать аналитику" для просмотра данных на веб-странице</p>
              <p className="text-sm mt-3">💡 <strong>Веб-версия включает:</strong> Отчет детализации, Хранение, Приемка, Мои товары, По товарам</p>
            </div>
          </div>

          {/* Веб-данные */}
          {showWebData && webData && (
            <div className="border-t pt-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-800">📊 Веб-версия аналитики</h2>
                <button
                  onClick={() => setShowWebData(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  ✕ Скрыть
                </button>
              </div>

              {/* Табы */}
              <div className="mb-6 border-b border-gray-200">
                <div className="flex flex-wrap gap-1">
                  {sheetTabs.map((sheet) => (
                    <button
                      key={sheet}
                      onClick={() => setActiveSheet(sheet)}
                      className={`px-4 py-2 font-medium rounded-t-lg transition-colors ${
                        activeSheet === sheet
                          ? 'bg-blue-600 text-white border-b-2 border-blue-600'
                          : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                      }`}
                    >
                      {sheet}
                    </button>
                  ))}
                </div>
              </div>

              {/* Содержимое активного листа */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">{activeSheet}</h3>
                
                {activeSheet === "По периодам" ? (
                  renderPeriodsData(webData["По периодам"])
                ) : (
                  renderTableData(webData[activeSheet as keyof AllWebData] as any[], activeSheet)
                )}
              </div>
            </div>
          )}

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
