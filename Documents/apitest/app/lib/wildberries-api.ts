// Общая библиотека для работы с Wildberries API

// Интерфейсы для данных Wildberries
export interface WildberriesRequestOptions {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

// Базовые URL для разных API
const API_URLS = {
  statistics: 'https://statistics-api.wildberries.ru',
  advert: 'https://advert-api.wildberries.ru'
};

// Общие заголовки для всех запросов
const getCommonHeaders = (token: string): Record<string, string> => ({
  'Authorization': token,
  'User-Agent': 'Mozilla/5.0 (compatible; WB-API-Client/1.0)',
  'Accept': 'application/json',
  'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
});

// Функция для выполнения запроса к API Wildberries с повторными попытками
async function makeWildberriesRequest(
  url: string,
  token: string,
  maxRetries: number = 3
): Promise<any> {
  const options: RequestInit = {
    method: 'GET',
    headers: getCommonHeaders(token)
  };

  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        // Если превышен лимит запросов, ждем и повторяем
        const delay = Math.pow(2, i) * 1000; // Экспоненциальная задержка
        console.log(`⏱️ Превышен лимит запросов, ожидание ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Ошибка API Wildberries: ${response.status} ${response.statusText}`);
      }

      return await response.json();

    } catch (error) {
      lastError = error as Error;
      console.error(`❌ Попытка ${i + 1}/${maxRetries} не удалась:`, error);

      if (i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Все попытки запроса не удались');
}

// Функция для получения данных реализации
export async function getRealizationData(token: string, startDate: string, endDate: string) {
  const url = `${API_URLS.statistics}/api/v5/supplier/reportDetailByPeriod?dateFrom=${startDate}&dateTo=${endDate}`;
  console.log(`📊 Получение данных реализации за период: ${startDate} - ${endDate}`);
  
  try {
    const data = await makeWildberriesRequest(url, token);
    console.log(`✅ Получено ${Array.isArray(data) ? data.length : 0} записей реализации`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('❌ Ошибка получения данных реализации:', error);
    throw error;
  }
}

// Функция для получения данных о хранении
export async function getStorageData(token: string, startDate: string) {
  const url = `${API_URLS.statistics}/api/v1/supplier/stocks?dateFrom=${startDate}`;
  console.log(`📦 Получение данных хранения с ${startDate}`);
  
  try {
    const data = await makeWildberriesRequest(url, token);
    console.log(`✅ Получено ${Array.isArray(data) ? data.length : 0} записей хранения`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('❌ Ошибка получения данных хранения:', error);
    throw error;
  }
}

// Функция для получения данных о приемке
export async function getAcceptanceData(token: string, startDate: string, endDate: string) {
  const url = `${API_URLS.statistics}/api/v1/supplier/incomes?dateFrom=${startDate}&dateTo=${endDate}`;
  console.log(`📥 Получение данных приемки за период: ${startDate} - ${endDate}`);
  
  try {
    const data = await makeWildberriesRequest(url, token);
    console.log(`✅ Получено ${Array.isArray(data) ? data.length : 0} записей приемки`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('❌ Ошибка получения данных приемки:', error);
    throw error;
  }
}

// Функция для получения финансовых данных
export async function getFinancialData(token: string, startDate: string, endDate: string) {
  const url = `${API_URLS.advert}/adv/v2/finance/wallet/daily?date=${startDate}&toDate=${endDate}`;
  console.log(`💰 Получение финансовых данных за период: ${startDate} - ${endDate}`);
  
  try {
    const data = await makeWildberriesRequest(url, token);
    console.log(`✅ Получено ${Array.isArray(data) ? data.length : 0} записей финансовых данных`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('⚠️ Не удалось получить финансовые данные:', error);
    return []; // Возвращаем пустой массив если данные недоступны
  }
}

// Функция для получения данных о товарах
export async function getProductsData(token: string) {
  const url = `${API_URLS.statistics}/api/v1/supplier/cards`;
  console.log(`🛍️ Получение данных товаров`);
  
  try {
    const data = await makeWildberriesRequest(url, token);
    console.log(`✅ Получено ${Array.isArray(data) ? data.length : 0} записей товаров`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('❌ Ошибка получения данных товаров:', error);
    return []; // Возвращаем пустой массив если данные недоступны
  }
}

// Функция для получения данных о платежах
export async function getPaymentsData(token: string, startDate: string, endDate: string) {
  const url = `${API_URLS.statistics}/api/v1/supplier/reportDetailByPeriod?dateFrom=${startDate}&dateTo=${endDate}`;
  console.log(`💳 Получение данных платежей за период: ${startDate} - ${endDate}`);
  
  try {
    const data = await makeWildberriesRequest(url, token);
    console.log(`✅ Получено ${Array.isArray(data) ? data.length : 0} записей платежей`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('❌ Ошибка получения данных платежей:', error);
    return []; // Возвращаем пустой массив если данные недоступны
  }
}

// Функция для получения всех данных одновременно
export async function getAllWildberriesData(
  token: string,
  startDate: string,
  endDate: string
) {
  console.log(`🔄 Получение всех данных Wildberries за период: ${startDate} - ${endDate}`);
  
  const [
    realizationData,
    storageData,
    acceptanceData,
    financialData,
    productsData,
    paymentsData
  ] = await Promise.all([
    getRealizationData(token, startDate, endDate),
    getStorageData(token, startDate),
    getAcceptanceData(token, startDate, endDate),
    getFinancialData(token, startDate, endDate),
    getProductsData(token),
    getPaymentsData(token, startDate, endDate)
  ]);

  return {
    realizationData,
    storageData,
    acceptanceData,
    financialData,
    productsData,
    paymentsData,
    campaigns: [],
    advertData: [],
    costPriceData: [],
    productAnalyticsData: []
  };
}

// Функция для валидации токена
export function validateWildberriesToken(token: string): boolean {
  if (!token || token.length < 10) {
    return false;
  }
  
  // Проверяем на наличие недопустимых символов
  const invalidChars = token.match(/[^A-Za-z0-9+/=\-_.]/g);
  return !invalidChars;
} 