import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as ExcelJS from "exceljs";

// Интерфейсы для рекламных кампаний
interface Campaign {
  advertId: number;
  name: string;
  type: number;
  status: number;
  dailyBudget: number;
  createTime: string;
  changeTime: string;
  startTime: string;
  endTime: string;
}

interface FinancialData {
  advertId: number;
  date: string;
  sum: number;
  bill: number;
  type: string;
  docNumber: string;
  sku?: string; // Добавляем поле SKU
}

export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Начало обработки запроса на получение отчета");
    
    const { token, startDate, endDate, costPricesData } = await request.json();

    if (!token || !startDate || !endDate) {
      console.error("❌ Отсутствуют обязательные параметры");
      return NextResponse.json(
        { error: "Токен, дата начала и дата окончания обязательны" },
        { status: 400 }
      );
    }

    console.log(`📅 Период отчета: ${startDate} - ${endDate}`);
    console.log(`🔑 Токен: ${token.substring(0, 20)}...`);
    console.log(`🔑 Длина токена: ${token.length} символов`);
    console.log(`💰 Данные себестоимости: ${costPricesData ? Object.keys(costPricesData).length : 0} товаров`);
    console.log(`🌐 Окружение: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🚀 Платформа: ${process.platform}`);
    
    // Проверка формата токена
    if (token.length < 10) {
      console.error("❌ Токен слишком короткий");
      return NextResponse.json(
        { error: "Некорректный формат токена. Токен должен содержать минимум 10 символов." },
        { status: 400 }
      );
    }
    
    // Проверка на наличие недопустимых символов
    const tokenPattern = /^[a-zA-Z0-9\-_.]+$/;
    if (!tokenPattern.test(token)) {
      console.error("❌ Токен содержит недопустимые символы");
      return NextResponse.json(
        { error: "Токен содержит недопустимые символы. Используйте только буквы, цифры, дефисы и подчеркивания." },
        { status: 400 }
      );
    }

    // Валидация дат
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start > end) {
      console.error("❌ Дата начала больше даты окончания");
      return NextResponse.json(
        { error: "Дата начала не может быть больше даты окончания" },
        { status: 400 }
      );
    }

    // Проверяем максимальный период для реализации (30 дней)
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 30) {
      console.warn(`⚠️ Период ${diffDays} дней превышает лимит 30 дней для API реализации`);
      return NextResponse.json(
        { error: "Максимальный период отчета - 30 дней" },
        { status: 400 }
      );
    }

    console.log(`📊 Период: ${diffDays} дней (в пределах лимитов)`);

    // Получаем основные данные реализации
    console.log("📊 1/3 Получение данных реализации...");
    
    // Формируем URL без кодирования токена (может ломать специальные символы)
    const apiUrl = `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod?dateFrom=${startDate}&dateTo=${endDate}&key=${token}`;
    
    console.log(`📡 URL запроса реализации: ${apiUrl.replace(token, token.substring(0, 20) + '...')}`);
    console.log(`🔑 Начало токена: ${token.substring(0, 30)}...`);
    console.log(`⏰ Время запроса: ${new Date().toISOString()}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WB-API-Client/1.0)',
        'Accept': 'application/json',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      }
    });
    
    console.log(`📊 Ответ API реализации: ${response.status} ${response.statusText}`);
    console.log(`📋 Заголовки ответа:`, Object.fromEntries(response.headers.entries()));
    console.log(`📊 Content-Type: ${response.headers.get('content-type')}`);
    console.log(`📊 Response Size: ${response.headers.get('content-length')} bytes`);
    
    if (!response.ok && response.status === 401) {
      console.log("🔄 Ошибка 401 с query параметром. Пробуем Authorization заголовок...");
      
      // Пробуем альтернативный способ авторизации через заголовок
      const alternativeUrl = `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod?dateFrom=${startDate}&dateTo=${endDate}`;
      
      const alternativeResponse = await fetch(alternativeUrl, {
        method: "GET",
        headers: {
          "Authorization": token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      
      console.log(`📊 Альтернативный ответ: ${alternativeResponse.status} ${alternativeResponse.statusText}`);
      
      if (alternativeResponse.ok) {
        console.log("✅ Альтернативная авторизация сработала!");
        const data = await alternativeResponse.json();
        console.log(`✅ Получено ${data.length} записей реализации через Authorization заголовок`);
        
        // Продолжаем с полученными данными
        if (!Array.isArray(data) || data.length === 0) {
          console.warn("⚠️ Нет данных реализации за указанный период");
        }

        // Параллельно получаем данные о хранении, приемке, товарах, платежах и себестоимости
        console.log("📊 2/3 Параллельное получение данных хранения, приемки, товаров, платежей и себестоимости...");
        const [storageData, acceptanceData, productsData, paymentsData, campaigns, financialData, costPriceData] = await Promise.all([
          getStorageData(token, startDate, endDate),
          getAcceptanceData(token, startDate, endDate),
          getProductsData(token),
          getPaymentsData(token, startDate, endDate),
          fetchCampaigns(token),
          fetchFinancialData(token, startDate, endDate),
          getCostPriceData(token, costPricesData || {})
        ]);

        console.log(`📦 Итого получено:`);
        console.log(`  - Реализация: ${data.length} записей`);
        console.log(`  - Хранение: ${storageData.length} записей`);
        console.log(`  - Приемка: ${acceptanceData.length} записей`);
        console.log(`  - Товары: ${productsData.length} записей`);
        console.log(`  - Пополнения: ${paymentsData.length} записей`);
        console.log(`  - Кампании: ${campaigns.length} записей`);
        console.log(`  - Финансы кампаний: ${financialData.length} записей`);
        console.log(`  - Себестоимость: ${costPriceData.length} записей`);

        // Создаем аналитические данные по товарам
        console.log("📊 3/3 Создание аналитических данных по товарам...");
        const productAnalyticsData = await createProductAnalyticsData(data, storageData, costPriceData, financialData);
        
        // Создаем Excel файл
        console.log("📊 3/3 Создание Excel отчета...");
        const buffer = await createExcelReport(data, storageData, acceptanceData, [], productsData, paymentsData, campaigns, financialData, costPriceData, productAnalyticsData, startDate, endDate, token);
        console.log(`✅ Excel отчет создан. Размер: ${(buffer.length / 1024).toFixed(2)} KB`);

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="wildberries_full_report_${startDate}_${endDate}.xlsx"`,
            "Content-Length": buffer.length.toString(),
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
          },
        });
      }
      
      // Если и альтернативный способ не сработал, пробуем без Bearer префикса
      const thirdAttemptResponse = await fetch(alternativeUrl, {
        method: "GET",
        headers: {
          "Authorization": token,
          "Content-Type": "application/json",
        },
      });
      
      console.log(`📊 Третья попытка (без Bearer): ${thirdAttemptResponse.status} ${thirdAttemptResponse.statusText}`);
      
      if (thirdAttemptResponse.ok) {
        console.log("✅ Авторизация без Bearer префикса сработала!");
        const data = await thirdAttemptResponse.json();
        console.log(`✅ Получено ${data.length} записей реализации`);
        
        // Аналогично продолжаем...
        if (!Array.isArray(data) || data.length === 0) {
          console.warn("⚠️ Нет данных реализации за указанный период");
        }

        // Параллельно получаем данные о хранении, приемке, товарах, платежах и себестоимости
        console.log("📊 2/3 Параллельное получение данных хранения, приемки, товаров, платежей и себестоимости...");
        const [storageData, acceptanceData, productsData, paymentsData, campaigns, financialData, costPriceData] = await Promise.all([
          getStorageData(token, startDate, endDate),
          getAcceptanceData(token, startDate, endDate),
          getProductsData(token),
          getPaymentsData(token, startDate, endDate),
          fetchCampaigns(token),
          fetchFinancialData(token, startDate, endDate),
          getCostPriceData(token, costPricesData || {})
        ]);

        console.log(`📦 Итого получено:`);
        console.log(`  - Реализация: ${data.length} записей`);
        console.log(`  - Хранение: ${storageData.length} записей`);
        console.log(`  - Приемка: ${acceptanceData.length} записей`);
        console.log(`  - Товары: ${productsData.length} записей`);
        console.log(`  - Пополнения: ${paymentsData.length} записей`);
        console.log(`  - Кампании: ${campaigns.length} записей`);
        console.log(`  - Финансы кампаний: ${financialData.length} записей`);
        console.log(`  - Себестоимость: ${costPriceData.length} записей`);

        // Создаем аналитические данные по товарам
        console.log("📊 3/3 Создание аналитических данных по товарам...");
        const productAnalyticsData = await createProductAnalyticsData(data, storageData, costPriceData, financialData);
        
        // Создаем Excel файл
        console.log("📊 3/3 Создание Excel отчета...");
        const buffer = await createExcelReport(data, storageData, acceptanceData, [], productsData, paymentsData, campaigns, financialData, costPriceData, productAnalyticsData, startDate, endDate, token);
        console.log(`✅ Excel отчет создан. Размер: ${(buffer.length / 1024).toFixed(2)} KB`);

        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="wildberries_full_report_${startDate}_${endDate}.xlsx"`,
            "Content-Length": buffer.length.toString(),
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
          },
        });
      }
    }
    
    if (!response.ok) {
      console.error(`❌ Ошибка API реализации: ${response.status} ${response.statusText}`);
      
      // Получаем тело ошибки для диагностики
      let errorText = '';
      try {
        errorText = await response.text();
        console.error(`📄 Тело ошибки:`, errorText);
      } catch (e) {
        console.error(`📄 Не удалось получить тело ошибки:`, e);
      }
      
      let errorMessage = `Ошибка API Wildberries: ${response.status}`;
      let userHelp = '';
      
      if (response.status === 401) {
        errorMessage = "Неверный или недействительный API токен";
        userHelp = "Проверьте токен в личном кабинете Wildberries в разделе 'Настройки → Доступ к API'";
        console.error("🚨 Ошибка авторизации. Возможные причины:");
        console.error("   - Токен неправильный или просрочен");
        console.error("   - Токен не имеет прав на статистику");
        console.error("   - Неправильный формат токена");
      } else if (response.status === 403) {
        errorMessage = "Нет доступа к данным";
        userHelp = "Проверьте права токена. Токен должен иметь доступ к статистике.";
      } else if (response.status === 429) {
        errorMessage = "Превышен лимит запросов";
        userHelp = "Попробуйте позже. Wildberries ограничивает количество запросов в минуту.";
      } else if (response.status === 400) {
        errorMessage = "Некорректный запрос";
        userHelp = "Проверьте период дат. Максимальный период для отчета - 30 дней.";
      } else if (response.status === 500) {
        errorMessage = "Внутренняя ошибка сервера Wildberries";
        userHelp = "Попробуйте позже. Проблема на стороне Wildberries.";
      } else if (response.status === 504) {
        errorMessage = "Время ожидания истекло";
        userHelp = "Сервер Wildberries не отвечает. Попробуйте позже.";
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          help: userHelp,
          status: response.status,
          details: errorText || response.statusText
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`✅ Получено ${data.length} записей реализации`);

    if (!Array.isArray(data) || data.length === 0) {
      console.warn("⚠️ Нет данных реализации за указанный период");
    }

    // Параллельно получаем данные о хранении, приемке, товарах, платежах и себестоимости
    console.log("📊 2/3 Параллельное получение данных хранения, приемки, товаров, платежей и себестоимости...");
    const [storageData, acceptanceData, productsData, paymentsData, campaigns, financialData, costPriceData] = await Promise.all([
      getStorageData(token, startDate, endDate),
      getAcceptanceData(token, startDate, endDate),
      getProductsData(token),
      getPaymentsData(token, startDate, endDate),
      fetchCampaigns(token),
      fetchFinancialData(token, startDate, endDate),
      getCostPriceData(token, costPricesData || {})
    ]);

    console.log(`📦 Итого получено:`);
    console.log(`  - Реализация: ${data.length} записей`);
    console.log(`  - Хранение: ${storageData.length} записей`);
    console.log(`  - Приемка: ${acceptanceData.length} записей`);
    console.log(`  - Товары: ${productsData.length} записей`);
    console.log(`  - Пополнения: ${paymentsData.length} записей`);
    console.log(`  - Кампании: ${campaigns.length} записей`);
    console.log(`  - Финансы кампаний: ${financialData.length} записей`);
    console.log(`  - Себестоимость: ${costPriceData.length} записей`);

    // Создаем аналитические данные по товарам
    console.log("📊 3/3 Создание аналитических данных по товарам...");
    const productAnalyticsData = await createProductAnalyticsData(data, storageData, costPriceData, financialData);
    
    // Создаем Excel файл
    console.log("📊 3/3 Создание Excel отчета...");
    const buffer = await createExcelReport(data, storageData, acceptanceData, [], productsData, paymentsData, campaigns, financialData, costPriceData, productAnalyticsData, startDate, endDate, token);

    console.log(`✅ Excel отчет создан. Размер: ${(buffer.length / 1024).toFixed(2)} KB`);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="wildberries_full_report_${startDate}_${endDate}.xlsx"`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

  } catch (error) {
    console.error("💥 Критическая ошибка API:", error);
    
    // Более детальная обработка ошибок
    let errorMessage = "Внутренняя ошибка сервера";
    let statusCode = 500;
    
    if (error instanceof Error) {
      console.error("📄 Сообщение ошибки:", error.message);
      console.error("📄 Stack trace:", error.stack);
      
      // Анализируем тип ошибки
      if (error.message.includes('401')) {
        errorMessage = "Ошибка авторизации: Неверный или недействительный API токен. Проверьте токен в личном кабинете Wildberries.";
        statusCode = 401;
      } else if (error.message.includes('403')) {
        errorMessage = "Ошибка доступа: Нет прав на получение данных. Проверьте права токена.";
        statusCode = 403;
      } else if (error.message.includes('429')) {
        errorMessage = "Превышен лимит запросов. Попробуйте позже.";
        statusCode = 429;
      } else if (error.message.includes('timeout')) {
        errorMessage = "Превышено время ожидания ответа от API Wildberries.";
        statusCode = 408;
      } else if (error.message.includes('Network')) {
        errorMessage = "Ошибка сети. Проверьте подключение к интернету.";
        statusCode = 503;
      } else {
        errorMessage = `Ошибка: ${error.message}`;
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

// Функция создания Excel отчета
// Функции для работы с рекламными кампаниями
function mapCampaignType(type: number): string {
  switch (type) {
    case 4: return 'Кампания в каталоге';
    case 5: return 'Кампания в карточке товара';
    case 6: return 'Кампания в поиске';
    case 7: return 'Кампания в рекомендациях на главной странице';
    case 8: return 'Автоматическая кампания';
    case 9: return 'Поиск + каталог';
    default: return `Неизвестный тип (${type})`;
  }
}

function mapCampaignStatus(status: number): string {
  switch (status) {
    case 4: return 'Готова к запуску';
    case 7: return 'Кампания завершена';
    case 8: return 'Отказ';
    case 9: return 'Идут показы';
    case 11: return 'Кампания на паузе';
    default: return `Неизвестный статус (${status})`;
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function fetchCampaigns(apiKey: string): Promise<Campaign[]> {
  try {
    console.log('📊 Получение списка кампаний...');
    
    const response = await fetch('https://advert-api.wildberries.ru/adv/v1/promotion/count', {
      method: 'GET',
      headers: {
        'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Ошибка получения списка кампаний: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    console.log('📦 Ответ API кампаний:', data);
    
    if (!Array.isArray(data.adverts)) {
      console.error('❌ Ответ API не содержит массив adverts');
      return [];
    }

    const campaigns: Campaign[] = data.adverts.map((advert: any) => ({
      advertId: advert.advertId,
      name: advert.name,
      type: advert.type,
      status: advert.status,
      dailyBudget: advert.dailyBudget,
      createTime: advert.createTime,
      changeTime: advert.changeTime,
      startTime: advert.startTime,
      endTime: advert.endTime
    }));

    console.log(`✅ Получено ${campaigns.length} кампаний`);
    return campaigns;
  } catch (error) {
    console.error('❌ Ошибка при получении списка кампаний:', error);
    return [];
  }
}

async function fetchFinancialData(apiKey: string, startDate: string, endDate: string): Promise<FinancialData[]> {
  try {
    console.log(`📊 Получение финансовых данных: ${startDate} - ${endDate}`);
    
    // Добавляем буферные дни
    const originalStart = new Date(startDate);
    const originalEnd = new Date(endDate);
    const bufferStart = addDays(originalStart, -1);
    const bufferEnd = addDays(originalEnd, 1);
    
    const adjustedStartDate = formatDate(bufferStart);
    const adjustedEndDate = formatDate(bufferEnd);
    
    console.log(`📅 Расширенный период с буферными днями: ${adjustedStartDate} - ${adjustedEndDate}`);
    
    const response = await fetch(`https://advert-api.wildberries.ru/adv/v1/upd?from=${adjustedStartDate}&to=${adjustedEndDate}`, {
      method: 'GET',
      headers: {
        'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Ошибка получения финансовых данных: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    console.log(`📦 Получено ${Array.isArray(data) ? data.length : 0} финансовых записей`);
    
    if (!Array.isArray(data)) {
      console.error('❌ Ответ API не является массивом');
      return [];
    }

    // Преобразуем данные в нужный формат
    const financialData: FinancialData[] = data.map((record: any) => ({
      advertId: record.advertId,
      date: record.updTime ? new Date(record.updTime).toISOString().split('T')[0] : '',
      sum: record.updSum || 0,
      bill: record.paymentType === 'Счет' ? 1 : 0,
      type: record.type || 'Неизвестно',
      docNumber: record.updNum || ''
    }));

    console.log(`✅ Обработано ${financialData.length} финансовых записей`);
    
    // Применяем логику буферных дней
    const filteredData = applyBufferDayLogic(financialData, originalStart, originalEnd);
    console.log(`📊 После применения логики буферных дней: ${filteredData.length} записей`);
    
    return filteredData;
  } catch (error) {
    console.error('❌ Ошибка при получении финансовых данных:', error);
    return [];
  }
}

function applyBufferDayLogic(data: FinancialData[], originalStart: Date, originalEnd: Date): FinancialData[] {
  const originalStartStr = formatDate(originalStart);
  const originalEndStr = formatDate(originalEnd);
  const bufferStartStr = formatDate(addDays(originalStart, -1));
  const bufferEndStr = formatDate(addDays(originalEnd, 1));
  
  console.log(`📊 Применение логики буферных дней:`);
  console.log(`   Основной период: ${originalStartStr} - ${originalEndStr}`);
  console.log(`   Буферные дни: ${bufferStartStr} (предыдущий), ${bufferEndStr} (следующий)`);
  
  // Разделяем данные по периодам
  const mainPeriodData = data.filter(record => 
    record.date >= originalStartStr && record.date <= originalEndStr
  );
  
  const previousBufferData = data.filter(record => record.date === bufferStartStr);
  const nextBufferData = data.filter(record => record.date === bufferEndStr);
  
  console.log(`   Основной период: ${mainPeriodData.length} записей`);
  console.log(`   Предыдущий буферный день: ${previousBufferData.length} записей`);
  console.log(`   Следующий буферный день: ${nextBufferData.length} записей`);
  
  // Получаем номера документов из основного периода
  const mainDocNumbers = new Set(mainPeriodData.map(record => record.docNumber));
  console.log(`   Номера документов основного периода: ${Array.from(mainDocNumbers).join(', ')}`);
  
  // Исключаем из основного периода записи с номерами документов из следующего буферного дня
  const nextBufferDocNumbers = new Set(nextBufferData.map(record => record.docNumber));
  const filteredMainData = mainPeriodData.filter(record => !nextBufferDocNumbers.has(record.docNumber));
  
  if (nextBufferDocNumbers.size > 0) {
    console.log(`   Исключаем из основного периода записи с номерами документов: ${Array.from(nextBufferDocNumbers).join(', ')}`);
    console.log(`   Исключено записей: ${mainPeriodData.length - filteredMainData.length}`);
  }
  
  // Добавляем записи из предыдущего буферного дня, если есть совпадения по номерам документов
  const previousBufferToAdd = previousBufferData.filter(record => 
    mainDocNumbers.has(record.docNumber) && previousBufferData.filter(r => r.docNumber === record.docNumber).length >= 2
  );
  
  if (previousBufferToAdd.length > 0) {
    console.log(`   Добавляем из предыдущего буферного дня: ${previousBufferToAdd.length} записей`);
  }
  
  const result = [...filteredMainData, ...previousBufferToAdd];
  console.log(`   Итоговое количество записей: ${result.length}`);
  
  return result;
}

async function fetchCampaignSKUs(apiKey: string, campaignIds: number[]): Promise<Map<number, string>> {
  try {
    console.log('📊 Получение SKU данных для кампаний...');
    
    const skuMap = new Map<number, string>();
    const batchSize = 50;
    
    for (let i = 0; i < campaignIds.length; i += batchSize) {
      const batch = campaignIds.slice(i, i + batchSize);
      
      try {
        const response = await fetch('https://advert-api.wildberries.ru/adv/v1/promotion/adverts', {
          method: 'POST',
          headers: {
            'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(batch)
        });

        if (!response.ok) {
          console.error(`❌ Ошибка получения SKU для пакета: ${response.status} ${response.statusText}`);
          continue;
        }

        const data = await response.json();
        
        if (Array.isArray(data)) {
          data.forEach((item) => {
            try {
              let nm = '';
              
              if (item.advertId) {
                if (item.type === 9 && item.auction_multibids && Array.isArray(item.auction_multibids) && item.auction_multibids.length > 0) {
                  nm = item.auction_multibids[0].nm;
                } else if (item.type === 8 && item.autoParams && item.autoParams.nms && Array.isArray(item.autoParams.nms) && item.autoParams.nms.length > 0) {
                  nm = item.autoParams.nms[0];
                } else if (item.unitedParams && Array.isArray(item.unitedParams) && item.unitedParams.length > 0 && item.unitedParams[0].nms && Array.isArray(item.unitedParams[0].nms) && item.unitedParams[0].nms.length > 0) {
                  nm = item.unitedParams[0].nms[0];
                }

                if (nm) {
                  skuMap.set(item.advertId, nm.toString());
                }
              }
            } catch (innerError) {
              console.error('❌ Ошибка при обработке SKU записи:', innerError);
            }
          });
        }
        
        if (i + batchSize < campaignIds.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (batchError) {
        console.error('❌ Ошибка при обработке пакета SKU:', batchError);
      }
    }
    
    console.log(`✅ Получено SKU данных: ${skuMap.size} из ${campaignIds.length} кампаний`);
    return skuMap;
    
  } catch (error) {
    console.error('❌ Ошибка при получении SKU данных:', error);
    return new Map();
  }
}

async function createExcelReport(data: any[], storageData: any[], acceptanceData: any[], advertData: any[], productsData: any[], paymentsData: any[], campaigns: Campaign[], financialData: FinancialData[], costPriceData: any[], productAnalyticsData: any[], startDate: string, endDate: string, token: string): Promise<Buffer> {
  // Подготавливаем данные для Excel
  const excelData = data.map((item) => ({
    "Номер поставки": item.gi_id || "",
    "Артикул WB": item.nm_id || "",
    "Артикул продавца": item.sa_name || "",
    "Баркод": item.barcode || "",
    "Тип документа": item.doc_type_name || "",
    "Обоснование для оплаты": item.supplier_oper_name || "",
    "Дата заказа": item.order_dt || "",
    "Дата продажи": item.sale_dt || "",
    "Количество": item.quantity || 0,
    "Цена розничная с учетом согласованной скидки": item.retail_price_withdisc_rub || 0,
    "Вайлдберриз реализовал Товар (Пр)": item.retail_amount || 0,
    "К перечислению продавцу": item.ppvz_for_pay || 0,
    "Количество доставок": item.delivery_amount || 0,
    "Количество возвратов": item.return_amount || 0,
    "Услуги по доставке товара покупателю": item.delivery_rub || 0,
    "Общая сумма штрафов": item.penalty || 0,
    "Доплаты": item.additional_payment || 0,
    "Виды логистики, штрафов и доплат": item.bonus_type_name || "",
    "Склад": item.office_name || "",
    "Страна": item.site_country || "",
    "Тип коробов": item.gi_box_type_name || "",
    "Номер таможенной декларации": item.declaration_number || "",
    "Номер сборочного задания": item.assembly_id || "",
    "Код маркировки": item.kiz || "",
    "Штрихкод": item.shk_id || "",
    "Srid": item.srid || "",
    "Возмещение издержек по перевозке": item.rebill_logistic_cost || 0,
    "Хранение": item.storage_fee || 0,
    "Удержания": item.deduction || 0,
    "Платная приемка": item.acceptance || 0,
    "Дата заказа (только дата)": item.order_dt ? item.order_dt.split('T')[0] : "",
    "Дата продажи (только дата)": item.sale_dt ? item.sale_dt.split('T')[0] : "",
  }));

  // Создаем рабочую книгу
  const workbook = XLSX.utils.book_new();
  
  // Создаем лист из данных
  const worksheet = XLSX.utils.json_to_sheet(excelData);
  
  // Настраиваем ширину колонок
  const columnWidths = [
    { wch: 15 }, // Номер поставки
    { wch: 12 }, // Артикул WB
    { wch: 15 }, // Артикул продавца
    { wch: 15 }, // Баркод
    { wch: 15 }, // Тип документа
    { wch: 25 }, // Обоснование для оплаты
    { wch: 12 }, // Дата заказа
    { wch: 12 }, // Дата продажи
    { wch: 10 }, // Количество
    { wch: 20 }, // Цена розничная
    { wch: 15 }, // Реализовал товар
    { wch: 15 }, // К перечислению
    { wch: 12 }, // Количество доставок
    { wch: 12 }, // Количество возвратов
    { wch: 15 }, // Доставка
    { wch: 12 }, // Штрафы
    { wch: 12 }, // Доплаты
    { wch: 20 }, // Виды логистики
    { wch: 20 }, // Склад
    { wch: 12 }, // Страна
    { wch: 15 }, // Тип коробов
    { wch: 20 }, // Номер декларации
    { wch: 15 }, // Номер сборочного задания
    { wch: 15 }, // Код маркировки
    { wch: 15 }, // Штрихкод
    { wch: 12 }, // Srid
    { wch: 15 }, // Возмещение издержек
    { wch: 12 }, // Хранение
    { wch: 12 }, // Удержания
    { wch: 12 }, // Платная приемка
    { wch: 12 }, // Дата заказа (только дата)
    { wch: 12 }, // Дата продажи (только дата)
  ];
  
  worksheet['!cols'] = columnWidths;
  
  // Добавляем лист в книгу
  XLSX.utils.book_append_sheet(workbook, worksheet, "Отчет детализации");
  
  // Добавляем лист с данными о хранении
  console.log(`Создание листа хранения. Количество записей: ${storageData?.length || 0}`);
  
  if (storageData && storageData.length > 0) {
    const storageExcelData = storageData.map((item) => ({
      "Дата": item.date || "",
      "Склад": item.warehouse || "",
      "Артикул Wildberries": item.nmId || "",
      "Размер": item.size || "",
      "Баркод": item.barcode || "",
      "Предмет": item.subject || "",
      "Бренд": item.brand || "",
      "Артикул продавца": item.vendorCode || "",
      "Объем (дм³)": item.volume || 0,
      "Тип расчета": item.calcType || "",
      "Сумма хранения": item.warehousePrice || 0,
      "Количество баркодов": item.barcodesCount || 0,
      "Коэффициент склада": item.warehouseCoef || 0,
      "Скидка лояльности (%)": item.loyaltyDiscount || 0,
      "Дата фиксации тарифа": item.tariffFixDate || "",
      "Дата снижения тарифа": item.tariffLowerDate || "",
    }));
    
    console.log("🔍 Первая запись хранения для Excel:", JSON.stringify(storageExcelData[0], null, 2));
    
    const storageSheet = XLSX.utils.json_to_sheet(storageExcelData);
    
    // Настройка ширины колонок для листа хранения
    const storageColumnWidths = [
      { wch: 12 }, // Дата
      { wch: 15 }, // Склад
      { wch: 20 }, // Артикул Wildberries
      { wch: 10 }, // Размер
      { wch: 15 }, // Баркод
      { wch: 25 }, // Предмет
      { wch: 15 }, // Бренд
      { wch: 15 }, // Артикул продавца
      { wch: 12 }, // Объем
      { wch: 20 }, // Тип расчета
      { wch: 15 }, // Сумма хранения
      { wch: 12 }, // Количество баркодов
      { wch: 12 }, // Коэффициент склада
      { wch: 15 }, // Скидка лояльности
      { wch: 15 }, // Дата фиксации тарифа
      { wch: 15 }, // Дата снижения тарифа
    ];
    storageSheet['!cols'] = storageColumnWidths;
    
    XLSX.utils.book_append_sheet(workbook, storageSheet, "Хранение");
    console.log("✅ Лист 'Хранение' добавлен в Excel с полными данными");
  } else {
    // Добавляем лист с отладочной информацией о хранении
    const debugStorageData = [{
      "Статус": "❌ ДАННЫЕ ХРАНЕНИЯ НЕ НАЙДЕНЫ",
      "Информация": "API хранения не вернул данных",
      "Период": `${startDate} - ${endDate}`,
      "Лимит периода": "Максимум 8 дней для API хранения",
      "Время запроса": new Date().toISOString(),
      "Рекомендация": "Проверьте период запроса и токен",
      "Возможные причины": "Период > 8 дней | Нет данных | Ошибка токена | API недоступен",
      "API Endpoint": "GET /api/v1/paid_storage",
      "Лимит запросов": "1 запрос в минуту",
      "Примечание": "Лист создан для отладки",
    }];
    
    const storageSheet = XLSX.utils.json_to_sheet(debugStorageData);
    
    // Настройка ширины колонок для отладочной информации
    const debugColumnWidths = [
      { wch: 30 }, // Статус
      { wch: 35 }, // Информация
      { wch: 20 }, // Период
      { wch: 25 }, // Лимит периода
      { wch: 25 }, // Время запроса
      { wch: 30 }, // Рекомендация
      { wch: 50 }, // Возможные причины
      { wch: 25 }, // API Endpoint
      { wch: 20 }, // Лимит запросов
      { wch: 25 }, // Примечание
    ];
    storageSheet['!cols'] = debugColumnWidths;
    
    XLSX.utils.book_append_sheet(workbook, storageSheet, "Хранение");
    console.log("🔧 Добавлен отладочный лист 'Хранение' (нет данных)");
  }
  
  // Добавляем лист с данными о приемке
  console.log(`Создание листа приемки. Количество записей: ${acceptanceData?.length || 0}`);
  
  if (acceptanceData && acceptanceData.length > 0) {
    const acceptanceExcelData = acceptanceData.map((item) => ({
      "Дата создания поставки": item.giCreateDate || "",
      "Номер поставки": item.incomeId || "",
      "Артикул WB": item.nmID || "",
      "Дата приёмки": item.shkCreateDate || "",
      "Предмет": item.subjectName || "",
      "Количество товаров, шт.": item.count || 0,
      "Суммарная стоимость приёмки, ₽": item.total || 0,
    }));
    
    console.log("✅ Данные для Excel приемки (первые 3 записи):", JSON.stringify(acceptanceExcelData.slice(0, 3), null, 2));
    
    const acceptanceSheet = XLSX.utils.json_to_sheet(acceptanceExcelData);
    
    // Настройка ширины колонок для листа приемки
    const acceptanceColumnWidths = [
      { wch: 20 }, // Дата создания поставки
      { wch: 15 }, // Номер поставки
      { wch: 20 }, // Артикул WB
      { wch: 15 }, // Дата приёмки
      { wch: 25 }, // Предмет
      { wch: 20 }, // Количество товаров
      { wch: 25 }, // Суммарная стоимость приёмки
    ];
    acceptanceSheet['!cols'] = acceptanceColumnWidths;
    
    XLSX.utils.book_append_sheet(workbook, acceptanceSheet, "Приемка");
    console.log("✅ Лист 'Приемка' добавлен в Excel с новыми полями");
  } else {
    // Добавляем лист с отладочной информацией
    const debugAcceptanceData = [{
      "Статус": "❌ ДАННЫЕ ПРИЕМКИ НЕ НАЙДЕНЫ",
      "Информация": "API приемки не вернул данных",
      "Период": `${startDate} - ${endDate}`,
      "Лимит периода": "Максимум 31 день для API приемки",
      "Время запроса": new Date().toISOString(),
      "Рекомендация": "Проверьте период запроса и токен",
      "Возможные причины": "Нет данных за период | Ошибка токена | API недоступен",
      "API Endpoint": "GET /api/v1/acceptance_report",
      "Лимит запросов": "1 запрос в минуту",
      "Примечание": "Лист создан для отладки",
    }];
    
    const acceptanceSheet = XLSX.utils.json_to_sheet(debugAcceptanceData);
    
    // Настройка ширины колонок для отладочной информации
    const debugColumnWidths = [
      { wch: 30 }, // Статус
      { wch: 35 }, // Информация
      { wch: 20 }, // Период
      { wch: 25 }, // Лимит периода
      { wch: 25 }, // Время запроса
      { wch: 30 }, // Рекомендация
      { wch: 50 }, // Возможные причины
      { wch: 25 }, // API Endpoint
      { wch: 20 }, // Лимит запросов
      { wch: 25 }, // Примечание
    ];
    acceptanceSheet['!cols'] = debugColumnWidths;
    
    XLSX.utils.book_append_sheet(workbook, acceptanceSheet, "Приемка");
    console.log("🔧 Добавлен отладочный лист 'Приемка' (нет данных)");
  }
  

  // Добавляем лист с данными о товарах
  console.log(`Создание листа товаров. Количество записей: ${productsData?.length || 0}`);

  if (productsData && productsData.length > 0) {
        const productsExcelData = productsData.map((item) => ({
      "ID карточки": item.nmID || "",
      "Артикул продавца": item.vendorCode || "",
      "Название товара": item.object || "",
      "Бренд": item.brand || "",
      "Дата создания": item.createdAt || "",
      "Дата обновления": item.updatedAt || "",
      "Статус": item.status || "",
      "Субъект": item.subjectName || "",
      "Категория": item.subjectID || "",
      "Предмет": item.imtName || "",
      "ID предмета": item.imtID || "",
      "Медиафайлы": item.mediaFiles?.length || 0,
      "Теги": Array.isArray(item.tags) ? item.tags.join(", ") : "",
      "Цвета": Array.isArray(item.colors) ? item.colors.join(", ") : "",
      "Размеры": Array.isArray(item.sizes) ? item.sizes.join(", ") : "",
      "Характеристики": Array.isArray(item.characteristics) ? item.characteristics.length : 0,
    }));

    console.log("✅ Данные для Excel товаров (первые 3 записи):", JSON.stringify(productsExcelData.slice(0, 3), null, 2));

    const productsSheet = XLSX.utils.json_to_sheet(productsExcelData);

        // Настройка ширины колонок для листа товаров
    const productsColumnWidths = [
      { wch: 15 }, // ID карточки
      { wch: 20 }, // Артикул продавца
      { wch: 35 }, // Название товара
      { wch: 15 }, // Бренд
      { wch: 20 }, // Дата создания
      { wch: 20 }, // Дата обновления
      { wch: 15 }, // Статус
      { wch: 20 }, // Субъект
      { wch: 15 }, // Категория
      { wch: 20 }, // Предмет
      { wch: 15 }, // ID предмета
      { wch: 15 }, // Медиафайлы
      { wch: 30 }, // Теги
      { wch: 30 }, // Цвета
      { wch: 30 }, // Размеры
      { wch: 15 }, // Характеристики
    ];
    productsSheet['!cols'] = productsColumnWidths;

    XLSX.utils.book_append_sheet(workbook, productsSheet, "Мои товары");
    console.log("✅ Лист 'Мои товары' добавлен в Excel");
  } else {
    // Добавляем лист с отладочной информацией
         const debugProductsData = [{
       "Статус": "❌ ДАННЫЕ КАРТОЧЕК НЕ НАЙДЕНЫ",
       "Информация": "API карточек товаров не вернул данных",
       "Период": `${startDate} - ${endDate}`,
       "Лимит периода": "100 карточек за запрос",
       "Время запроса": new Date().toISOString(),
       "Рекомендация": "Проверьте токен и доступ к API контента",
       "Возможные причины": "Нет карточек | Ошибка токена | API недоступен",
       "API Endpoint": "POST /content/v2/get/cards/list",
       "Лимит запросов": "100 запросов в минуту",
       "Примечание": "Лист создан для отладки",
     }];

    const productsSheet = XLSX.utils.json_to_sheet(debugProductsData);

    // Настройка ширины колонок для отладочной информации
    const debugColumnWidths = [
      { wch: 30 }, // Статус
      { wch: 35 }, // Информация
      { wch: 20 }, // Период
      { wch: 25 }, // Лимит периода
      { wch: 25 }, // Время запроса
      { wch: 30 }, // Рекомендация
      { wch: 50 }, // Возможные причины
      { wch: 25 }, // API Endpoint
      { wch: 20 }, // Лимит запросов
      { wch: 25 }, // Примечание
    ];
    productsSheet['!cols'] = debugColumnWidths;

         XLSX.utils.book_append_sheet(workbook, productsSheet, "Мои товары");
     console.log("🔧 Добавлен отладочный лист 'Мои товары' (нет данных)");
  }

  // Добавляем лист с данными о себестоимости
  console.log(`Создание листа себестоимости. Количество записей: ${costPriceData?.length || 0}`);
  
  if (costPriceData && costPriceData.length > 0) {
    const costPriceExcelData = costPriceData.map((item) => ({
      "Артикул ВБ": item.nmID || "",
      "Артикул продавца": item.vendorCode || "",
      "Товар": item.object || "",
      "Бренд": item.brand || "",
      "Размер": item.sizeName || "",
      "Штрихкод": item.barcode || "",
      "Цена": item.price || 0,
      "Себестоимость": item.costPrice || 0,
      "Маржа": item.costPrice > 0 ? (item.price - item.costPrice) : 0,
      "Рентабельность (%)": item.costPrice > 0 && item.price > 0 ? ((item.price - item.costPrice) / item.price * 100).toFixed(2) : 0,
      "Дата создания": item.createdAt || "",
      "Дата обновления": item.updatedAt || ""
    }));

    console.log("✅ Данные для Excel себестоимости (первые 3 записи):", JSON.stringify(costPriceExcelData.slice(0, 3), null, 2));

    const costPriceSheet = XLSX.utils.json_to_sheet(costPriceExcelData);

    // Настройка ширины колонок для листа себестоимости
    const costPriceColumnWidths = [
      { wch: 15 }, // Артикул ВБ
      { wch: 20 }, // Артикул продавца
      { wch: 35 }, // Товар
      { wch: 15 }, // Бренд
      { wch: 15 }, // Размер
      { wch: 15 }, // Штрихкод
      { wch: 15 }, // Цена
      { wch: 15 }, // Себестоимость
      { wch: 15 }, // Маржа
      { wch: 20 }, // Рентабельность
      { wch: 20 }, // Дата создания
      { wch: 20 }, // Дата обновления
    ];
    costPriceSheet['!cols'] = costPriceColumnWidths;

    XLSX.utils.book_append_sheet(workbook, costPriceSheet, "Себес");
    console.log("✅ Лист 'Себес' добавлен в Excel");
  } else {
    // Добавляем лист с отладочной информацией
    const debugCostPriceData = [{
      "Статус": "❌ ДАННЫЕ СЕБЕСТОИМОСТИ НЕ НАЙДЕНЫ",
      "Информация": "API карточек товаров не вернул данных",
      "Время запроса": new Date().toISOString(),
      "Рекомендация": "Проверьте токен и доступ к API контента",
      "Возможные причины": "Нет карточек | Ошибка токена | API недоступен",
      "API Endpoint": "POST /content/v2/get/cards/list",
      "Лимит запросов": "100 запросов в минуту",
      "Примечание": "Лист создан для отладки",
      "Инструкция": "Заполните себестоимость на странице /cost-price",
      "Формула маржи": "Маржа = Цена - Себестоимость",
      "Формула рентабельности": "Рентабельность = (Цена - Себестоимость) / Цена * 100%"
    }];

    const costPriceSheet = XLSX.utils.json_to_sheet(debugCostPriceData);

    // Настройка ширины колонок для отладочной информации
    const debugColumnWidths = [
      { wch: 30 }, // Статус
      { wch: 35 }, // Информация
      { wch: 25 }, // Время запроса
      { wch: 30 }, // Рекомендация
      { wch: 50 }, // Возможные причины
      { wch: 25 }, // API Endpoint
      { wch: 20 }, // Лимит запросов
      { wch: 25 }, // Примечание
      { wch: 40 }, // Инструкция
      { wch: 30 }, // Формула маржи
      { wch: 40 }, // Формула рентабельности
    ];
    costPriceSheet['!cols'] = debugColumnWidths;

    XLSX.utils.book_append_sheet(workbook, costPriceSheet, "Себес");
    console.log("🔧 Добавлен отладочный лист 'Себес' (нет данных)");
  }

  // Добавляем лист с аналитикой по товарам
  console.log(`Создание листа аналитики по товарам. Количество записей: ${productAnalyticsData?.length || 0}`);
  
  if (productAnalyticsData && productAnalyticsData.length > 0) {
    const productAnalyticsSheet = XLSX.utils.json_to_sheet(productAnalyticsData);
    
    // Настройка ширины колонок для аналитики (много столбцов)
    const analyticsColumnWidths = Array(88).fill({ wch: 15 }); // 88 столбцов как в CSV
    productAnalyticsSheet['!cols'] = analyticsColumnWidths;
    
    XLSX.utils.book_append_sheet(workbook, productAnalyticsSheet, "По товарам");
    console.log("✅ Лист 'По товарам' добавлен в Excel");
  } else {
    // Добавляем лист с отладочной информацией
    const debugAnalyticsData = [{
      "Статус": "❌ ДАННЫЕ АНАЛИТИКИ НЕ НАЙДЕНЫ",
      "Информация": "Нет данных для создания аналитики по товарам",
      "Возможные причины": "Нет данных реализации | Нет данных о товарах | Пустые артикулы",
      "Рекомендация": "Проверьте период запроса и наличие данных",
      "Время запроса": new Date().toISOString(),
      "Примечание": "Лист создан для отладки"
    }];
    
    const productAnalyticsSheet = XLSX.utils.json_to_sheet(debugAnalyticsData);
    
    // Настройка ширины колонок для отладочной информации
    const debugColumnWidths = [
      { wch: 30 }, // Статус
      { wch: 35 }, // Информация
      { wch: 50 }, // Возможные причины
      { wch: 30 }, // Рекомендация
      { wch: 25 }, // Время запроса
      { wch: 25 }, // Примечание
    ];
    productAnalyticsSheet['!cols'] = debugColumnWidths;
    
    XLSX.utils.book_append_sheet(workbook, productAnalyticsSheet, "По товарам");
    console.log("🔧 Добавлен отладочный лист 'По товарам' (нет данных)");
  }

  // Добавляем лист с данными о пополнениях
  console.log(`Создание листа пополнений. Количество записей: ${paymentsData?.length || 0}`);

  if (paymentsData && paymentsData.length > 0) {
    const paymentsExcelData = paymentsData.map((item) => ({
      "ID пополнения": item.id || "",
      "Дата пополнения": item.date || "",
      "Сумма пополнения": item.sum || 0,
      "Тип источника": mapPaymentType(item.type),
      "Статус": mapPaymentStatus(item.statusId),
      "Статус карты": item.cardStatus || "",
    }));

    console.log("✅ Данные для Excel пополнений (первые 3 записи):", JSON.stringify(paymentsExcelData.slice(0, 3), null, 2));

    const paymentsSheet = XLSX.utils.json_to_sheet(paymentsExcelData);

    // Настройка ширины колонок для листа пополнений
    const paymentsColumnWidths = [
      { wch: 15 }, // ID пополнения
      { wch: 20 }, // Дата пополнения
      { wch: 15 }, // Сумма пополнения
      { wch: 15 }, // Тип источника
      { wch: 15 }, // Статус
      { wch: 15 }, // Статус карты
    ];
    paymentsSheet['!cols'] = paymentsColumnWidths;

    // По требованию пользователя лист "Тест" (пополнения) больше не добавляется в отчёт
    console.log("ℹ️ Лист 'Тест' не добавляется в Excel по запросу пользователя");
  } else {
    // Добавляем лист с отладочной информацией
         const debugPaymentsData = [{
       "Статус": "❌ ДАННЫЕ ПОПОЛНЕНИЙ НЕ НАЙДЕНЫ",
       "Информация": "API истории пополнений не вернул данных",
       "Период": `${startDate} - ${endDate}`,
       "Лимит периода": "Максимум 31 день для API пополнений",
       "Время запроса": new Date().toISOString(),
       "Рекомендация": "Проверьте период запроса и токен",
       "Возможные причины": "Нет данных за период | Ошибка токена | API недоступен",
       "API Endpoint": "GET /adv/v1/payments",
       "Лимит запросов": "1 запрос в секунду",
       "Примечание": "Лист создан для отладки",
     }];

    const paymentsSheet = XLSX.utils.json_to_sheet(debugPaymentsData);

    // Настройка ширины колонок для отладочной информации
    const debugColumnWidths = [
      { wch: 30 }, // Статус
      { wch: 35 }, // Информация
      { wch: 20 }, // Период
      { wch: 25 }, // Лимит периода
      { wch: 25 }, // Время запроса
      { wch: 30 }, // Рекомендация
      { wch: 50 }, // Возможные причины
      { wch: 25 }, // API Endpoint
      { wch: 20 }, // Лимит запросов
      { wch: 25 }, // Примечание
    ];
    paymentsSheet['!cols'] = debugColumnWidths;

    // По требованию пользователя отладочный лист "Тест" больше не добавляется
    console.log("ℹ️ Отладочный лист 'Тест' не добавляется (нет данных)");
  }

  // Добавляем аналитический лист "По периодам" с формулами
  console.log("📊 Создание аналитического листа 'По периодам'...");
  
  const periodsSheet = XLSX.utils.aoa_to_sheet([
    // Строка 1-2: Период дат
    ['от', startDate],
    ['до', endDate],
    [''],
    ['Движение товара в штуках', '', 'Проценты'],
    
    // Строка 5: Доставки
    ['Доставки', { f: "SUM('Отчет детализации'!M:M)", z: '#,##0.00' }],
    
    // Строка 6: Отказы без возвратов
    ['Отказы без возвратов', 
     { f: "SUMIF('Отчет детализации'!R:R,\"От клиента при отмене\",'Отчет детализации'!N:N)", z: '#,##0.00' },
     { f: "B6/B5", z: '0.00%' }],
    
    [''],
    
    // Строка 8: Продажи  
    ['Продажи',
     { f: "SUMIFS('Отчет детализации'!I:I,'Отчет детализации'!E:E,\"Продажа\",'Отчет детализации'!F:F,\"Продажа\")", z: '#,##0.00' }],
    
    // Строка 9: Возвраты
    ['Возвраты',
     { f: "SUMIF('Отчет детализации'!E:E,\"Возврат\",'Отчет детализации'!I:I)", z: '#,##0.00' },
     { f: "B9/B8", z: '0.00%' }],
    
    [''],
    
    // Строка 11: Итого количество реализованного товара
    ['Итого кол-во реализованного товара',
     { f: "B8-B9", z: '#,##0.00' },
     { f: "B11/B5", z: '0.00%' }],
    
    [''],
    
    // Строка 13: Продажи + корректировки
    ['Продажи + корректировки',
     { f: "SUMIF('Отчет детализации'!E:E,\"Продажа\",'Отчет детализации'!I:I)", z: '#,##0.00' }],
    
    // Строка 14: Корректировки в перечислении за товар шт
    ['Корректировки в перечислении за товар шт',
     { f: "SUMIF('Отчет детализации'!F:F,\"Добровольная компенсация при возврате\",'Отчет детализации'!I:I)", z: '#,##0.00' }],
    
    [''],
    
    // Строка 16: Движение товара в рублях
    ['Движение товара в рублях по цене продавца с учетом согласованной скидки (до СПП)', '', 'Проценты'],
    
    // Строка 17: Продажи до СПП
    ['Продажи до СПП',
     { f: "SUMIFS('Отчет детализации'!J:J,'Отчет детализации'!E:E,\"Продажа\",'Отчет детализации'!F:F,\"Продажа\")", z: '#,##0.00' }],
    
    // Строка 18: Возвраты до СПП
    ['Возвраты до СПП',
     { f: "SUMIFS('Отчет детализации'!J:J,'Отчет детализации'!E:E,\"Возврат\",'Отчет детализации'!F:F,\"Возврат\")", z: '#,##0.00' }],
    
    // Строка 19: Корректировка в продажах до СПП
    ['Корректировка в продажах до СПП', { v: 0, z: '#,##0.00' }],
    
    // Строка 20: Вся стоимость реализованного товара до СПП
    ['Вся стоимость реализованного товара до СПП',
     { f: "B17-B18", z: '#,##0.00' }],
    
    // Строка 21: Средний чек продажи до СПП
    ['Средний чек продажи до СПП',
     { f: "B20/B11", z: '#,##0.00' }],
    
    // Строка 22: % комиссии ВБ до СПП
    ['% комиссии ВБ до СПП',
     { f: "(B40+B34)/B20", z: '0.00%' }],
    
    [''],
    
    // Строка 24: Движение товара в рублях с учетом скидки постоянного покупателя
    ['Движение товара в рублях по цене с учетом скидки постоянного покупателя (после СПП)', '', 'Проценты'],
    
    // Строка 25: Продажи после СПП
    ['Продажи после СПП',
     { f: "SUMIF('Отчет детализации'!E:E,\"Продажа\",'Отчет детализации'!K:K)", z: '#,##0.00' }],
    
    // Строка 26: Возвраты после СП
    ['Возвраты после СП',
     { f: "SUMIF('Отчет детализации'!E:E,\"Возврат\",'Отчет детализации'!K:K)", z: '#,##0.00' }],
    
    // Строка 27: Корректировки в продажах после СПП
    ['Корректировки в продажах после СПП', { v: 0, z: '#,##0.00' }],
    
    // Строка 28: Вся стоимость реализованного товара после СПП
    ['Вся стоимость реализованного товара после СПП',
     { f: "B25-B26", z: '#,##0.00' }],
    
    // Строка 29: Средний чек продажи после СП
    ['Средний чек продажи после СП',
     { f: "B28/B11", z: '#,##0.00' }],
    
    // Строка 30: Сумма СПП
    ['Сумма СПП',
     { f: "B20-B28+0-B34", z: '#,##0.00' }],
    
    // Строка 31: % СПП
    ['% СПП',
     { f: "1-B29/B21", z: '0.00%' }],
    
    [''],
    
    // Строка 33: К перечислению за товар
    ['К перечислению за товар', '', 'Проценты'],
    
    // Строка 34: Корректировки в перечислении за товар
    ['Корректировки в перечислении за товар',
     { f: "SUMIF('Отчет детализации'!F:F,\"Добровольная компенсация при возврате\",'Отчет детализации'!L:L)", z: '#,##0.00' }],
    
    // Строка 35: Продажи фактические (цена продажи - комиссия ВБ)
    ['Продажи фактические (цена продажи - комиссия ВБ)',
     { f: "SUMIF('Отчет детализации'!E:E,\"Продажа\",'Отчет детализации'!L:L)", z: '#,##0.00' }],
    
    // Строка 36: Возвраты полученный по факту за возврат по формуле (Цена продажи - комиссия ВБ)
    ['Возвраты полученный по факту за возврат по формуле (Цена продажи - комиссия ВБ)',
     { f: "SUMIF('Отчет детализации'!E:E,\"Возврат\",'Отчет детализации'!L:L)", z: '#,##0.00' }],
    
    // Строка 37: К перечислению за товар
    ['К перечислению за товар',
     { f: "B35-B36", z: '#,##0.00' }],
    
    [''],
    
    // Строка 39: Статьи удержаний Вайлдберриз
    ['Статьи удержаний Вайлдберриз', '', 'Проценты'],
    
    // Строка 40: Плановая комиссия
    ['Плановая комиссия',
     { f: "B20-B37", z: '#,##0.00' }],
    
        // Строка 41: Фактическая комиссия
    ['Фактическая комиссия',
     { f: "B28-B37", z: '#,##0.00' }],

    // Строка 42: Стоимость логистики
    ['Стоимость логистики',
     { f: "SUM('Отчет детализации'!O:O)", z: '#,##0.00' }],
    
    // Строка 43: Логистика на единицу товар
    ['Логистика на единицу товар',
     { f: "B42/B11", z: '#,##0.00' }],

    // Строка 44: % логистики от реализациии до СПП
    ['% логистики от реализациии до СПП',
     { f: "B43/B21", z: '0.00%' }],

    // Строка 45: Штрафы
    ['Штрафы',
     { f: "SUM('Отчет детализации'!P:P)", z: '#,##0.00' }],

    // Строка 46: Доплаты
    ['Доплаты', { v: 0, z: '#,##0.00' }],

    // Строка 47: Хранение
    ['Хранение',
     { f: "SUM('Отчет детализации'!AB:AB)", z: '#,##0.00' }],
    
    // Строка 48: % хранения от реализациии до СПП
    ['% хранения от реализациии до СПП',
     { f: "B47/B20", z: '0.00%' }],

    // Строка 49: Платная приемка
    ['Платная приемка',
     { f: "SUM('Отчет детализации'!AD:AD)", z: '#,##0.00' }],

    // Строка 50: "Реклама баланс + счет"
    ['"Реклама баланс + счет"',
     { f: "SUMIF('Отчет детализации'!R:R,\"Оказание услуг «ВБ.Продвижение»\",'Отчет детализации'!AC:AC)", z: '#,##0.00' }],

    // Строка 51: % ДРР (доля рекламных расходов) от реализациии до СПП
    ['% ДРР (доля рекламных расходов) от реализациии до СПП',
     { f: "B50/B11", z: '#,##0.00' }],

    // Строка 52: % ДРР (доля рекламных расходов) от реализациии до СПП
    ['% ДРР (доля рекламных расходов) от реализациии до СПП',
     { f: "B50/B20", z: '0.00%' }],

    // Строка 53: ИМИЗР (использование механик искуственного завышения рейтинга)
    ['ИМИЗР (использование механик искуственного завышения рейтинга)', { v: 0, z: '#,##0.00' }],

    // Строка 54: Отзывы
    ['Отзывы', { v: 0, z: '#,##0.00' }],
    
    // Строка 55: Кредит
    ['Кредит',
     { f: "SUM(B56:B57)", z: '#,##0.00' }],

    // Строка 56: Тело кредита
    ['Тело кредита',
     { f: "SUMIF('Отчет детализации'!R:R,\"*Перевод на баланс заёмщика для оплаты основного долга по кредиту*\",'Отчет детализации'!AC:AC)", z: '#,##0.00' }],

    // Строка 57: Процент кредита
    ['Процент кредита',
     { f: "SUMIF('Отчет детализации'!R:R,\"*Перевод на баланс заёмщика для оплаты процентов по кредиту*\",'Отчет детализации'!AC:AC)", z: '#,##0.00' }],

    // Строка 58: % кредита от реализациии до СПП
    ['% кредита от реализациии до СПП',
     { f: "B57/B20", z: '0.00%' }],

    // Строка 59: Прочие удержания
    ['Прочие удержания',
     { f: "SUM('Отчет детализации'!AC:AC)-B57-B56-B50", z: '#,##0.00' }],

    // Строка 60: % прочих удержаний от реализациии до СПП
    ['% прочих удержаний от реализациии до СПП',
     { f: "B59/B20", z: '0.00%' }],

    // Строка 61: Итого стоимость всех услуг ВБ от реализации до СПП
    ['Итого стоимость всех услуг ВБ от реализации до СПП',
     { f: "B59+B57+B56+B50+B49+B47+B53+B54+B45+B42+B40", z: '#,##0.00' }],

    // Строка 62: % всех услуг ВБ от реализации до СПП
    ['% всех услуг ВБ от реализации до СПП',
     { f: "B61/B20", z: '0.00%' }],

    // Строка 63: % всех услуг ВБ от реализации после СПП
    ['% всех услуг ВБ от реализации после СПП',
     { f: "(B55+B50+B49+B47+B45+B42+B41+B54+B53+B46)/B28", z: '0.00%' }],
    
    [''],

    // Строка 65: Перечисления, проверка расчетов
    ['Перечисления, проверка расчетов'],

    // Строка 66: Итого к оплате
    ['Итого к оплате',
     { f: "B28-B41-B42-B45-B46-B47-B49-B50-B53-B54-B55", z: '#,##0.00' }],

    // Строка 67: Итого к оплате на единицу товара
    ['Итого к оплате на единицу товара',
     { f: "B66/B11", z: '#,##0.00' }]
  ]);
  
  // Настройка ширины колонок для аналитического листа
  const periodsColumnWidths = [
    { wch: 50 }, // Наименование показателя
    { wch: 20 }, // Значение/Формула
    { wch: 20 }, // Проценты
  ];
  periodsSheet['!cols'] = periodsColumnWidths;
  
  XLSX.utils.book_append_sheet(workbook, periodsSheet, "По периодам");
  console.log("✅ Аналитический лист 'По периодам' добавлен в Excel с формулами");
  
  // Добавляем лист "Финансы РК" с данными рекламных кампаний
  console.log(`📊 Создание листа "Финансы РК". Количество кампаний: ${campaigns.length}, финансовых записей: ${financialData.length}`);
  
  if (campaigns.length > 0 && financialData.length > 0) {
    // Получаем SKU данные для кампаний
    const uniqueCampaignIds = [...new Set(financialData.map(record => record.advertId))];
    console.log(`📊 Уникальных кампаний в финансовых данных: ${uniqueCampaignIds.length}`);
    
    // Используем ExcelJS для создания листа с рекламными данными
    const excelJSWorkbook = new ExcelJS.Workbook();
    
    // Переносим существующие листы из XLSX в ExcelJS
    const sheetNames = workbook.SheetNames;
    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      const excelJSSheet = excelJSWorkbook.addWorksheet(sheetName);
      jsonData.forEach((row: any, rowIndex: number) => {
        if (Array.isArray(row)) {
          row.forEach((cell: any, colIndex: number) => {
            const excelCell = excelJSSheet.getCell(rowIndex + 1, colIndex + 1);
            if (typeof cell === 'object' && cell !== null && 'f' in cell) {
              // Это формула
              excelCell.value = { formula: cell.f };
              if (cell.z) {
                excelCell.numFmt = cell.z;
              }
            } else {
              excelCell.value = cell;
            }
          });
        }
      });
    }
    
    // Получаем SKU данные
    const skuMap = await fetchCampaignSKUs(token, uniqueCampaignIds);
    console.log(`📊 Получено SKU данных: ${skuMap.size} кампаний`);
    
    // Сопоставляем SKU данные с финансовыми записями
    const financialDataWithSKU = financialData.map(record => ({
      ...record,
      sku: skuMap.get(record.advertId) || ''
    }));
    
    // Создаем лист "Финансы РК"
    const financeSheet = excelJSWorkbook.addWorksheet('Финансы РК');
    financeSheet.columns = [
      { header: 'ID кампании', key: 'advertId', width: 15 },
      { header: 'Название кампании', key: 'campaignName', width: 30 },
      { header: 'SKU ID', key: 'sku', width: 15 },
      { header: 'Дата', key: 'date', width: 15 },
      { header: 'Сумма', key: 'sum', width: 15 },
      { header: 'Источник списания', key: 'bill', width: 20 },
      { header: 'Тип операции', key: 'type', width: 15 },
      { header: 'Номер документа', key: 'docNumber', width: 20 }
    ];

    // Создаем карту кампаний для быстрого поиска
    const campaignMap = new Map(campaigns.map(c => [c.advertId, c]));
    
    // Добавляем данные в лист
    financialDataWithSKU.forEach(record => {
      const campaign = campaignMap.get(record.advertId);
      financeSheet.addRow({
        advertId: record.advertId,
        campaignName: campaign?.name || 'Неизвестная кампания',
        sku: record.sku || '',
        date: record.date,
        sum: record.sum,
        bill: record.bill === 1 ? 'Счет' : 'Баланс',
        type: record.type,
        docNumber: record.docNumber
      });
    });
    
    console.log(`✅ Лист "Финансы РК" создан с ${financialDataWithSKU.length} записями`);
    
    // Конвертируем ExcelJS в Buffer
    const buffer = await excelJSWorkbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  } else {
    console.log("⚠️ Нет данных для создания листа 'Финансы РК', используем стандартный Excel");
    
    // Конвертируем в Buffer
    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return excelBuffer;
  }
}

// Функция очистки названия кампании от эмодзи
function cleanCampaignName(name: string): string {
  if (!name) return "";
  // Удаляем все эмодзи-кружки и другие символы
  return name.replace(/[🟡🟢🔴⚪⚫🔵🟠🟣🟤🔶🔷⭐⚡️💎✨🎯🏆🔥💰🚀⭕❌✅❤️💙💚💛🧡💜🤍🖤💯🎪🎨🎭🎯🌟🔮]/g, '').trim();
}

// Функция маппинга статуса кампании (из кода пользователя)
function mapAdvertStatus(status: number): string {
  switch (status) {
    case 4:
      return 'готова к запуску';
    case 7:
      return 'завершена';
    case 8:
      return 'отказался';
    case 9:
      return 'активна';
    case 11:
      return 'приостановлена';
    default:
      return 'неизвестный статус';
  }
}

// Функция маппинга типа кампании (из кода пользователя)
function mapAdvertType(type: number): string {
  switch (type) {
    case 4:
      return 'кампания в каталоге';
    case 5:
      return 'кампания в карточке товара';
    case 6:
      return 'кампания в поиске';
    case 7:
      return 'кампания в рекомендациях на главной странице';
    case 8:
      return 'автоматическая кампания';
    case 9:
      return 'поиск + каталог';
    default:
      return 'неизвестный тип кампании';
  }
}

// Функция маппинга типа источника платежа
function mapPaymentType(type: number): string {
  switch (type) {
    case 0:
      return 'Счёт';
    case 1:
      return 'Баланс';
    case 3:
      return 'Картой';
    default:
      return `Неизвестный тип (${type})`;
  }
}

// Функция маппинга статуса платежа
function mapPaymentStatus(statusId: number): string {
  switch (statusId) {
    case 0:
      return 'ошибка';
    case 1:
      return 'обработано';
    default:
      return `Неизвестный статус (${statusId})`;
  }
}

// Функция получения данных о приемке
async function getAcceptanceData(token: string, startDate: string, endDate: string) {
  try {
    console.log(`🔍 Запрос данных приемки: ${startDate} - ${endDate}`);
    
    // Проверяем период (максимум 31 день согласно документации)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 31) {
      console.warn(`⚠️ Период ${diffDays} дней превышает лимит 31 день для API приемки`);
      // Ограничиваем период до 31 дня
      const limitedEndDate = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      const limitedEnd = limitedEndDate.toISOString().split('T')[0];
      console.log(`📅 Ограничиваем период до: ${startDate} - ${limitedEnd}`);
      endDate = limitedEnd;
    }
    
    // Создаем taskId для приемки
    console.log("📤 Создание задачи для отчета по приемке...");
    const taskUrl = `https://seller-analytics-api.wildberries.ru/api/v1/acceptance_report?dateFrom=${startDate}&dateTo=${endDate}`;
    
    const taskResponse = await fetch(taskUrl, {
      method: "GET",
      headers: {
        "Authorization": token,
      },
    });

    console.log(`📊 Ответ создания задачи приемки: ${taskResponse.status} ${taskResponse.statusText}`);
    
    if (!taskResponse.ok) {
      const errorText = await taskResponse.text();
      console.error(`❌ Ошибка создания задачи приемки: ${errorText}`);
      return [];
    }

    const taskResult = await taskResponse.json();
    const taskId = taskResult.data?.taskId;
    
    if (!taskId) {
      console.error("❌ Не получен taskId для приемки");
      return [];
    }

    console.log(`✅ Создана задача приемки: ${taskId}`);

    // Ждем готовности отчета (проверяем статус)
    console.log("⏳ Ожидание готовности отчета приемки...");
    let attempts = 0;
    const maxAttempts = 24; // 2 минуты ожидания (5 сек * 24)
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Ждем 5 секунд
      
      const statusResponse = await fetch(`https://seller-analytics-api.wildberries.ru/api/v1/acceptance_report/tasks/${taskId}/status`, {
        method: "GET",
        headers: {
          "Authorization": token,
        },
      });
      
      if (statusResponse.ok) {
        const statusResult = await statusResponse.json();
        console.log(`📋 Статус задачи приемки: ${statusResult.data?.status || 'unknown'}`);
        
        if (statusResult.data?.status === 'done') {
          console.log("✅ Отчет приемки готов!");
          break;
        }
      }
      
      attempts++;
      console.log(`⏳ Попытка ${attempts}/${maxAttempts}...`);
    }

    if (attempts >= maxAttempts) {
      console.warn("⚠️ Превышено время ожидания готовности отчета приемки");
      return [];
    }

    // Загружаем готовый отчет
    console.log("📥 Загрузка данных приемки...");
    const downloadResponse = await fetch(`https://seller-analytics-api.wildberries.ru/api/v1/acceptance_report/tasks/${taskId}/download`, {
      method: "GET",
      headers: {
        "Authorization": token,
      },
    });

    if (!downloadResponse.ok) {
      const errorText = await downloadResponse.text();
      console.error(`❌ Ошибка загрузки данных приемки: ${errorText}`);
      return [];
    }

    const acceptanceData = await downloadResponse.json();
    console.log(`✅ Получено ${acceptanceData.length} записей приемки`);
    
    return acceptanceData;

  } catch (error) {
    console.error("💥 Ошибка получения данных приемки:", error);
    return [];
  }
}

// Функция получения данных о хранении
async function getStorageData(token: string, startDate: string, endDate: string) {
  try {
    console.log(`🔍 Запрос данных хранения: ${startDate} - ${endDate}`);
    
    // Проверяем период (максимум 8 дней согласно документации)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 8) {
      console.warn(`⚠️ Период ${diffDays} дней превышает лимит 8 дней для API хранения`);
      // Ограничиваем период до 8 дней
      const limitedEndDate = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
      const limitedEnd = limitedEndDate.toISOString().split('T')[0];
      console.log(`📅 Ограничиваем период до: ${startDate} - ${limitedEnd}`);
      return await getStorageData(token, startDate, limitedEnd);
    }
    
    // Создаем taskId для хранения с GET запросом (согласно документации)
    console.log("📤 Создание задачи для отчета по хранению...");
    const taskUrl = `https://seller-analytics-api.wildberries.ru/api/v1/paid_storage?dateFrom=${startDate}&dateTo=${endDate}`;
    console.log(`📡 URL создания задачи: ${taskUrl}`);
    
    const taskResponse = await fetch(taskUrl, {
      method: "GET",
      headers: {
        "Authorization": token,
      },
    });

    console.log(`📊 Ответ создания задачи хранения: ${taskResponse.status} ${taskResponse.statusText}`);

    if (!taskResponse.ok) {
      const errorText = await taskResponse.text();
      console.error(`❌ Ошибка создания taskId для хранения: ${taskResponse.status}`, errorText);
      
      // Проверяем специфичные ошибки
      if (taskResponse.status === 429) {
        console.warn("⚠️ Превышен лимит запросов (1 запрос в минуту)");
      } else if (taskResponse.status === 401) {
        console.error("❌ Неверный токен авторизации");
      }
      
      return [];
    }

    const taskData = await taskResponse.json();
    console.log("📋 Ответ создания задачи:", JSON.stringify(taskData, null, 2));
    
    const taskId = taskData?.data?.taskId;

    if (!taskId) {
      console.error("❌ Не удалось получить taskId для хранения. Структура ответа:", taskData);
      return [];
    }

    console.log(`✅ Создан taskId для хранения: ${taskId}`);

    // Ждем подготовки отчета (рекомендуется проверять статус)
    console.log("⏳ Ожидание подготовки отчета о хранении...");
    
    // Проверяем статус задачи
    const maxStatusChecks = 12; // 12 проверок по 5 секунд = 1 минута
    let statusCheckCount = 0;
    
    while (statusCheckCount < maxStatusChecks) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Ждем 5 секунд
      statusCheckCount++;
      
      console.log(`🔍 Проверка статуса ${statusCheckCount}/${maxStatusChecks}...`);
      
      try {
        const statusResponse = await fetch(`https://seller-analytics-api.wildberries.ru/api/v1/paid_storage/tasks/${taskId}/status`, {
          method: "GET",
          headers: {
            "Authorization": token,
          },
        });
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          console.log(`📊 Статус задачи: ${statusData?.data?.status}`);
          
          if (statusData?.data?.status === "done") {
            console.log("✅ Отчет готов! Загружаем...");
            break;
          }
        } else {
          console.warn(`⚠️ Ошибка проверки статуса: ${statusResponse.status}`);
        }
      } catch (statusError) {
        console.warn("⚠️ Ошибка при проверке статуса:", statusError);
      }
    }

    // Загружаем отчет с повторными попытками
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      console.log(`📥 Попытка загрузки отчета ${retryCount + 1}/${maxRetries}...`);
      
      const downloadResponse = await fetch(`https://seller-analytics-api.wildberries.ru/api/v1/paid_storage/tasks/${taskId}/download`, {
        method: "GET",
        headers: {
          "Authorization": token,
        },
      });

      console.log(`📊 Ответ загрузки хранения: ${downloadResponse.status} ${downloadResponse.statusText}`);

      if (downloadResponse.ok) {
        const responseText = await downloadResponse.text();
        console.log(`📄 Сырой ответ загрузки хранения:`, responseText.substring(0, 500) + "...");
        
        let storageData;
        try {
          storageData = JSON.parse(responseText);
        } catch (parseError) {
          console.error("❌ Ошибка парсинга JSON хранения:", parseError);
          console.log("📄 Полный ответ:", responseText);
          return [];
        }
        
        console.log("📦 Структура ответа хранения:", Object.keys(storageData || {}));
        
        // Данные должны быть массивом согласно документации
        const dataArray = Array.isArray(storageData) ? storageData : [];
        
        console.log(`✅ Получено ${dataArray.length} записей о хранении`);
        
        if (dataArray.length > 0) {
          console.log("🔍 Первая запись хранения:", JSON.stringify(dataArray[0], null, 2));
          console.log("🏷️ Поля записи:", Object.keys(dataArray[0] || {}));
        }
        
        return dataArray;
      } else if (downloadResponse.status === 429) {
        console.log(`⚠️ Ошибка 429 для taskId ${taskId}. Попытка ${retryCount + 1} из ${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 60000)); // Ждем 1 минуту
        retryCount++;
      } else {
        const errorText = await downloadResponse.text();
        console.error(`❌ Ошибка загрузки отчета о хранении: ${downloadResponse.status}`, errorText);
        retryCount++;
        
        if (retryCount < maxRetries) {
          console.log(`🔄 Повторная попытка через 10 секунд...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
    }

    console.error(`❌ Не удалось загрузить отчет о хранении после ${maxRetries} попыток`);
    return [];
  } catch (error) {
    console.error("💥 Критическая ошибка при получении данных о хранении:", error);
    return [];
  }
}

// Функция получения данных о рекламе
async function getAdvertData(token: string, startDate: string, endDate: string) {
  try {
    console.log(`🔍 Запрос данных рекламы: ${startDate} - ${endDate}`);
    
    // Проверяем период (максимум 31 день согласно документации)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 31) {
      console.warn(`⚠️ Период ${diffDays} дней превышает лимит 31 день для API рекламы`);
      // Ограничиваем период до 31 дня
      const limitedEndDate = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      const limitedEnd = limitedEndDate.toISOString().split('T')[0];
      console.log(`📅 Ограничиваем период до: ${startDate} - ${limitedEnd}`);
      endDate = limitedEnd;
    }

    // Прямой запрос к API рекламы (без taskId)
    console.log("📤 Запрос данных рекламы...");
    const apiUrl = `https://advert-api.wildberries.ru/adv/v1/upd?from=${startDate}&to=${endDate}`;
    console.log(`📡 URL API рекламы: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Authorization": token,
      },
    });

    console.log(`📊 Ответ API рекламы: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Ошибка API рекламы: ${response.status}`, errorText);
      
      // Проверяем специфичные ошибки
      if (response.status === 429) {
        console.warn("⚠️ Превышен лимит запросов API рекламы");
      } else if (response.status === 401) {
        console.error("❌ Неверный токен для API рекламы");
      } else if (response.status === 403) {
        console.error("❌ Нет доступа к API рекламы");
      }
      
      return [];
    }

    const responseText = await response.text();
    console.log(`📄 Сырой ответ API рекламы:`, responseText.substring(0, 500) + "...");
    
    let advertData;
    try {
      advertData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("❌ Ошибка парсинга JSON рекламы:", parseError);
      console.log("📄 Полный ответ:", responseText);
      return [];
    }
    
    console.log("📦 Структура ответа рекламы:", Object.keys(advertData || {}));
    
    // Данные должны быть массивом
    const dataArray = Array.isArray(advertData) ? advertData : [];
    
    console.log(`✅ Получено ${dataArray.length} записей о рекламе`);
    
    if (dataArray.length > 0) {
      console.log("🔍 Первая запись рекламы:", JSON.stringify(dataArray[0], null, 2));
      console.log("🏷️ Поля записи:", Object.keys(dataArray[0] || {}));
    }
    
    return dataArray;

  } catch (error) {
    console.error("💥 Критическая ошибка при получении данных о рекламе:", error);
    return [];
  }
}

// Функция получения данных о товарах
async function getProductsData(token: string) {
  try {
    console.log(`🔍 Запрос данных карточек товаров...`);
    const apiUrl = `https://content-api.wildberries.ru/content/v2/get/cards/list`;
    console.log(`📡 URL API карточек товаров: ${apiUrl}`);

    const requestBody = {
      settings: {
        cursor: {
          limit: 100
        },
        filter: {
          withPhoto: -1
        }
      }
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`📊 Ответ API карточек товаров: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Ошибка API карточек товаров: ${response.status}`, errorText);
      
      // Проверяем специфичные ошибки
      if (response.status === 429) {
        console.warn("⚠️ Превышен лимит запросов API карточек товаров");
      } else if (response.status === 401) {
        console.error("❌ Неверный токен для API карточек товаров");
      } else if (response.status === 403) {
        console.error("❌ Нет доступа к API карточек товаров");
      }
      
      return [];
    }

    const responseText = await response.text();
    console.log(`📄 Сырой ответ API карточек товаров:`, responseText.substring(0, 500) + "...");
    
    let cardsResponse;
    try {
      cardsResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("❌ Ошибка парсинга JSON карточек товаров:", parseError);
      console.log("📄 Полный ответ:", responseText);
      return [];
    }
    
    console.log("📦 Структура ответа карточек товаров:", Object.keys(cardsResponse || {}));
    
    // Извлекаем карточки из ответа
    const cards = cardsResponse?.cards || [];
    
    console.log(`✅ Получено ${cards.length} карточек товаров`);
    
    if (cards.length > 0) {
      console.log("🔍 Первая карточка товара:", JSON.stringify(cards[0], null, 2));
      console.log("🏷️ Поля карточки:", Object.keys(cards[0] || {}));
    }
    
    return cards;

  } catch (error) {
    console.error("💥 Критическая ошибка при получении данных о карточках товаров:", error);
    return [];
  }
}

// Функция получения данных о пополнениях
async function getPaymentsData(token: string, startDate: string, endDate: string) {
  try {
    console.log(`🔍 Запрос истории пополнений счёта: ${startDate} - ${endDate}`);
    
    // Проверяем период (максимум 31 день согласно документации)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays > 31) {
      console.warn(`⚠️ Период ${diffDays} дней превышает лимит 31 день для API пополнений`);
      // Ограничиваем период до 31 дня
      const limitedEndDate = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
      const limitedEnd = limitedEndDate.toISOString().split('T')[0];
      console.log(`📅 Ограничиваем период до: ${startDate} - ${limitedEnd}`);
      endDate = limitedEnd;
    }

    // Запрос к API истории пополнений согласно документации
    console.log("📤 Запрос истории пополнений...");
    const apiUrl = `https://advert-api.wildberries.ru/adv/v1/payments?from=${startDate}&to=${endDate}`;
    console.log(`📡 URL API пополнений: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Authorization": token,
      },
    });

    console.log(`📊 Ответ API пополнений: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Ошибка API пополнений: ${response.status}`, errorText);
      
      // Проверяем специфичные ошибки
      if (response.status === 429) {
        console.warn("⚠️ Превышен лимит запросов API пополнений");
      } else if (response.status === 401) {
        console.error("❌ Неверный токен для API пополнений");
      } else if (response.status === 403) {
        console.error("❌ Нет доступа к API пополнений");
      }
      
      return [];
    }

    const responseText = await response.text();
    console.log(`📄 Сырой ответ API пополнений:`, responseText.substring(0, 500) + "...");
    
    let paymentsData;
    try {
      paymentsData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("❌ Ошибка парсинга JSON пополнений:", parseError);
      console.log("📄 Полный ответ:", responseText);
      return [];
    }
    
    console.log("📦 Структура ответа пополнений:", Object.keys(paymentsData || {}));
    
    // Данные должны быть массивом согласно документации
    const dataArray = Array.isArray(paymentsData) ? paymentsData : [];
    
    console.log(`✅ Получено ${dataArray.length} записей о пополнениях`);
    
    if (dataArray.length > 0) {
      console.log("🔍 Первая запись пополнения:", JSON.stringify(dataArray[0], null, 2));
      console.log("🏷️ Поля записи:", Object.keys(dataArray[0] || {}));
    }
    
    return dataArray;

  } catch (error) {
    console.error("💥 Критическая ошибка при получении данных о пополнениях:", error);
    return [];
  }
}

async function getCostPriceData(token: string, savedCostPrices: {[key: string]: string} = {}) {
  try {
    console.log('💰 Получение данных себестоимости товаров');
    
    const requestBody = {
      settings: {
        cursor: {
          limit: 100
        },
        filter: {
          withPhoto: -1
        }
      }
    };

    const response = await fetch('https://content-api.wildberries.ru/content/v2/get/cards/list', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error(`❌ Ошибка получения карточек товаров: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    console.log('📦 Ответ API карточек товаров:', Object.keys(data));
    
    if (!data.cards || !Array.isArray(data.cards)) {
      console.error('❌ Ответ API не содержит массив cards');
      return [];
    }

    const cards = data.cards;
    console.log(`📦 Количество карточек: ${cards.length}`);

    // Преобразуем данные, разворачивая каждый размер в отдельную строку
    const costPriceData: any[] = [];
    
    cards.forEach((card: any) => {
      const baseProduct = {
        nmID: card.nmID,
        vendorCode: card.vendorCode,
        object: card.object || '',
        brand: card.brand || '',
        createdAt: card.createdAt || '',
        updatedAt: card.updatedAt || ''
      };

      if (card.sizes && card.sizes.length > 0) {
        // Для каждого размера создаем отдельную запись
        card.sizes.forEach((size: any) => {
          if (size.skus && size.skus.length > 0) {
            // Для каждого SKU в размере создаем отдельную строку
            size.skus.forEach((sku: string) => {
              const productKey = `${card.nmID}-${sku}`;
              const savedCostPrice = savedCostPrices[productKey] ? parseFloat(savedCostPrices[productKey]) : 0;
              
              costPriceData.push({
                ...baseProduct,
                sizeName: size.techSize || size.wbSize || 'Без размера',
                barcode: sku,
                price: size.price || 0,
                costPrice: savedCostPrice // Используем сохраненную себестоимость
              });
            });
          } else {
            // Если нет SKU, все равно добавляем размер
            const productKey = `${card.nmID}-`;
            const savedCostPrice = savedCostPrices[productKey] ? parseFloat(savedCostPrices[productKey]) : 0;
            
            costPriceData.push({
              ...baseProduct,
              sizeName: size.techSize || size.wbSize || 'Без размера',
              barcode: '',
              price: size.price || 0,
              costPrice: savedCostPrice
            });
          }
        });
      } else {
        // Если нет размеров, добавляем товар без размера
        const productKey = `${card.nmID}-`;
        const savedCostPrice = savedCostPrices[productKey] ? parseFloat(savedCostPrices[productKey]) : 0;
        
        costPriceData.push({
          ...baseProduct,
          sizeName: 'Без размера',
          barcode: '',
          price: 0,
          costPrice: savedCostPrice
        });
      }
    });

    console.log(`✅ Обработано карточек: ${cards.length}, развернуто позиций: ${costPriceData.length}`);
    return costPriceData;
  } catch (error) {
    console.error('❌ Ошибка при получении данных себестоимости:', error);
    return [];
  }
}

// Функция для создания аналитических данных по товарам
async function createProductAnalyticsData(
  realizationData: any[], 
  storageData: any[], 
  costPriceData: any[], 
  financialData: FinancialData[]
): Promise<any[]> {
  console.log("📊 Создание аналитических данных по товарам...");
  
  // Группируем данные реализации по артикулу продавца
  const productGroups = new Map<string, any[]>();
  
  for (const item of realizationData) {
    const vendorCode = item.sa_name || '';
    if (!productGroups.has(vendorCode)) {
      productGroups.set(vendorCode, []);
    }
    productGroups.get(vendorCode)!.push(item);
  }

  // Создаем итоговые аналитические строки
  const analyticsData: any[] = [];
  
  for (const [vendorCode, items] of productGroups) {
    if (!vendorCode) continue; // Пропускаем пустые артикулы
    
    // Агрегированные данные по товару
    const firstItem = items[0];
    const nmId = firstItem.nm_id || '';
    
    // Движение товара в штуках
    let deliveries = 0;
    let returns = 0; 
    let sales = 0;
    let refunds = 0;
    let corrections = 0;
    let totalQuantity = 0;

    // Финансовые данные
    let totalBeforeSPP = 0;
    let returnsBeforeSPP = 0;
    let totalAfterSPP = 0;
    let returnsAfterSPP = 0;
    let commission = 0;
    let logistics = 0;
    let storage = 0;
    let advertising = 0;
    let penalties = 0;
    let additionalPayments = 0;
    let totalToPayment = 0;

    // Обрабатываем каждую операцию по товару
    for (const item of items) {
      const qty = item.quantity || 0;
      const amount = item.ppvz_for_pay || 0;
      const retail = item.retail_price_withdisc_rub || 0;
      
      totalQuantity += qty;
      totalToPayment += amount;
      
      // Определяем тип операции
      const docType = item.doc_type_name || '';
      const operName = item.supplier_oper_name || '';
      
      if (docType === 'Продажа' || operName === 'Продажа') {
        sales += qty;
        totalBeforeSPP += retail * qty;
        totalAfterSPP += retail * qty; // Упрощено, нужно учитывать СПП
      } else if (docType === 'Возврат' || operName === 'Возврат') {
        returns += qty;
        refunds += qty;
        returnsBeforeSPP += retail * qty;
        returnsAfterSPP += retail * qty;
      }
      
      // Суммируем комиссии и расходы
      commission += item.commission_percent || 0;
      logistics += item.delivery_rub || 0;
      storage += item.storage_fee || 0;
      penalties += item.penalty || 0;
      additionalPayments += item.additional_payment || 0;
    }
    
    // Ищем рекламные расходы по артикулу
    let adSpend = 0;
    for (const fin of financialData) {
      if (fin.sku === nmId || fin.sku === vendorCode) {
        adSpend += fin.sum || 0;
      }
    }
    
    // Ищем себестоимость
    let costPrice = 0;
    let totalCostPrice = 0;
    const costItem = costPriceData.find(cost => 
      cost.vendorCode === vendorCode || cost.nmID === nmId
    );
    if (costItem) {
      costPrice = costItem.costPrice || 0;
      totalCostPrice = costPrice * Math.abs(sales - refunds); // Себестоимость реализованного товара
    }

    // Расчеты показателей
    const refundRate = sales > 0 ? (refunds / sales * 100) : 0;
    const averagePrice = sales > 0 ? (totalBeforeSPP / sales) : 0;
    const marginAmount = totalToPayment - totalCostPrice;
    const marginPercent = totalBeforeSPP > 0 ? (marginAmount / totalBeforeSPP * 100) : 0;
    const profitability = totalCostPrice > 0 ? (marginAmount / totalCostPrice * 100) : 0;
    
    // Создаем строку аналитики согласно структуре CSV
    const analyticsRow = {
      "Артикул ВБ отчет реализации": nmId,
      "Артикул продавца": vendorCode,
      "Доставки": deliveries,
      "Отказы": 0, // Нет данных в API
      "% отказов": 0,
      "Продажи": sales,
      "Самовыкупы": 0, // Нет данных в API
      "Раздачи": 0, // Нет данных в API  
      "Продажи (органические)": sales, // Упрощено
      "Доля размера в продажах": 0, // Нет данных
      "Возвраты": refunds,
      "% возвратов": refundRate.toFixed(2) + '%',
      "Корректировки в продажах": corrections,
      "Итого кол-во реализованного товара": sales - refunds,
      "% выкупа": 0, // Нет данных
      "Утилизировано": 0, // Нет данных
      "Корректировки в перечислении за товар шт": 0,
      
      // Движение по цене до СПП
      "Продажи до СПП": totalBeforeSPP.toFixed(2),
      "Возвраты до СПП": returnsBeforeSPP.toFixed(2),
      "Корректировки в продажах до СПП": 0,
      "Вся стоимость реализованного товара до СПП": (totalBeforeSPP - returnsBeforeSPP).toFixed(2),
      "% от всей суммы реализации": 0, // Нужен общий итог
      "Средний чек продажи до СПП": averagePrice.toFixed(2),
      "% комиссии ВБ до СПП": 0, // Нет точных данных
      
      // Движение по цене после СПП
      "Продажи после СПП": totalAfterSPP.toFixed(2),
      "Возвраты после СПП": returnsAfterSPP.toFixed(2),
      "Корректировки в продажах после СПП": 0,
      "Вся стоимость реализованного товара после СПП": (totalAfterSPP - returnsAfterSPP).toFixed(2),
      "Средний чек продажи после СПП": averagePrice.toFixed(2),
      "Сумма СПП": 0, // Нет данных
      "% СПП": 0,
      
      // К перечислению
      "Корректировки в перечислении за товар": 0,
      "Продажи фактические (цена продажи - комиссия ВБ)": totalToPayment.toFixed(2),
      "Возвраты полученный по факту за возврат по формуле": 0,
      "К перечислению за товар": totalToPayment.toFixed(2),
      
      // Удержания ВБ
      "Плановая комиссия + эквайринг": commission.toFixed(2),
      "Фактическая комиссия": commission.toFixed(2),
      "Стоимость логистики": logistics.toFixed(2),
      "Логистика на единицу товара": sales > 0 ? (logistics / sales).toFixed(2) : '0',
      "% логистики от реализациии до СПП": totalBeforeSPP > 0 ? (logistics / totalBeforeSPP * 100).toFixed(2) + '%' : '0%',
      "Штрафы": penalties.toFixed(2),
      "Доплаты": additionalPayments.toFixed(2),
      "Хранение товаров попавших в отчет реализации": storage.toFixed(2),
      "% хранения от реализациии до СПП": totalBeforeSPP > 0 ? (storage / totalBeforeSPP * 100).toFixed(2) + '%' : '0%',
      "Платная приемка попавших в отчет реализации": 0, // Нет данных
      "Реклама баланс + счет": adSpend.toFixed(2),
      "Реклама баланс + счет на единицу товара": sales > 0 ? (adSpend / sales).toFixed(2) : '0',
      "% ДРР (доля рекламных расходов) от реализациии до СПП": totalBeforeSPP > 0 ? (adSpend / totalBeforeSPP * 100).toFixed(2) + '%' : '0%',
      "ИМИЗР (использование механик искуственного завышения рейтинга)": 0,
      "Отзывы": 0,
      "Кредит": 0,
      "% кредита от реализациии до СПП": '0%',
      "Прочие удержания": 0,
      "% прочих удержаний от реализациии до СПП": '0%',
      
      // Итоги услуг ВБ
      "Итого стоимость всех услуг ВБ от реализации до СПП": (commission + logistics + storage + penalties + adSpend).toFixed(2),
      "% всех услуг ВБ от реализации до СПП": totalBeforeSPP > 0 ? ((commission + logistics + storage + penalties + adSpend) / totalBeforeSPP * 100).toFixed(2) + '%' : '0%',
      "% всех услуг ВБ от реализации после СПП": totalAfterSPP > 0 ? ((commission + logistics + storage + penalties + adSpend) / totalAfterSPP * 100).toFixed(2) + '%' : '0%',
      
      // Итого к оплате
      "Итого к оплате": totalToPayment.toFixed(2),
      "Итого к оплате на единицу товара": sales > 0 ? (totalToPayment / sales).toFixed(2) : '0',
      "Итого к оплате без самовыкупов": totalToPayment.toFixed(2),
      
      // Налоги
      "Налог": 0, // Нет данных
      "НДС": 0,
      "НДС к возмещению от услуг": 0,
      "Итого к оплате за вычетом налога": totalToPayment.toFixed(2),
      
      // Себестоимость
      "Себестоимость реализованного товара": totalCostPrice.toFixed(2),
      "Себестоимость Шушары по СС": 0, // Нет данных
      "% себестоимости от суммы реализации до СПП": totalBeforeSPP > 0 ? (totalCostPrice / totalBeforeSPP * 100).toFixed(2) + '%' : '0%',
      "Средняя себестоимость на единицу товара": costPrice.toFixed(2),
      "Себестоимость утилизированного товара": 0,
      "Сумма кэшбека (раздачи)": 0,
      "Себестоимость самовыкупов": 0,
      "Сумма самовыкупов": 0,
      
      // Маркетинг
      "Маркетинг": adSpend.toFixed(2),
      "% маркетинга от суммы реализации до СПП": totalBeforeSPP > 0 ? (adSpend / totalBeforeSPP * 100).toFixed(2) + '%' : '0%',
      
      // Операционная прибыль
      "Операционная прибыль": marginAmount.toFixed(2),
      "% от всей операционной прибыли": 0, // Нужен общий итог
      "Операционная прибыль на единицу": sales > 0 ? (marginAmount / sales).toFixed(2) : '0',
      "% прибыли от суммы реализации до СПП": marginPercent.toFixed(2) + '%',
      "% прибыли от суммы реализации после СПП": totalAfterSPP > 0 ? (marginAmount / totalAfterSPP * 100).toFixed(2) + '%' : '0%',
      "% прибыли от себестоимости реализованного товара": profitability.toFixed(2) + '%',
      "Компенсация Шушары": 0 // Нет данных
    };
    
    analyticsData.push(analyticsRow);
  }
  
  console.log(`✅ Создано ${analyticsData.length} строк аналитики по товарам`);
  return analyticsData;
}

export async function GET() {
  return NextResponse.json({ message: "Используйте POST метод для получения отчета" });
} 