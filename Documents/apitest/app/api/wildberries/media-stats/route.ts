import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

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

// Функции маппинга
function mapCampaignType(type: number): string {
  const types: { [key: number]: string } = {
    4: 'Автоматическая',
    5: 'Фразовая',
    6: 'Подмена',
    7: 'Рекомендуемая',
    8: 'Поиск + Каталог',
    9: 'Автоматическая (Поиск + Каталог)'
  };
  return types[type] || 'Неизвестный тип';
}

function mapCampaignStatus(status: number): string {
  const statuses: { [key: number]: string } = {
    4: 'Готова к запуску',
    7: 'Завершена',
    8: 'Отказ',
    9: 'Идут показы',
    11: 'Приостановлена'
  };
  return statuses[status] || 'Неизвестный статус';
}

// Функция для добавления/вычитания дней
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Функция для форматирования даты в формат YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Функция для получения списка кампаний
async function fetchCampaigns(apiKey: string): Promise<Campaign[]> {
  try {
    const response = await fetch('https://advert-api.wildberries.ru/adv/v1/promotion/count', {
      method: 'GET',
      headers: {
        'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`Ошибка получения кампаний: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    console.log('Получен ответ от API кампаний:', data);
    console.log('Тип данных:', typeof data);
    console.log('Структура:', JSON.stringify(data, null, 2));
    
    const campaigns: Campaign[] = [];
    
    // Извлекаем кампании из каждой группы
    if (data.adverts && Array.isArray(data.adverts)) {
      for (const group of data.adverts) {
        if (group.advert_list && Array.isArray(group.advert_list)) {
          for (const advert of group.advert_list) {
            campaigns.push({
              advertId: advert.advertId,
              name: `Кампания ${advert.advertId}`, // Базовое имя, будет обновлено позже
              type: group.type,
              status: group.status,
              dailyBudget: 0, // Будет обновлено позже
              createTime: '',
              changeTime: advert.changeTime || '',
              startTime: '',
              endTime: ''
            });
          }
        }
      }
    }
    
    console.log(`Извлечено кампаний из групп: ${campaigns.length}`);
    
    // Получаем подробную информацию о кампаниях
    if (campaigns.length > 0) {
      const detailedCampaigns = await fetchCampaignDetails(apiKey, campaigns);
      return detailedCampaigns;
    }
    
    return campaigns;
  } catch (error) {
    console.error('Ошибка при запросе кампаний:', error);
    return [];
  }
}

// Функция для получения подробной информации о кампаниях
async function fetchCampaignDetails(apiKey: string, campaigns: Campaign[]): Promise<Campaign[]> {
  try {
    console.log('Получаем подробную информацию о кампаниях...');
    
    const campaignIds = campaigns.map(c => c.advertId);
    
    const response = await fetch('https://advert-api.wildberries.ru/adv/v1/promotion/adverts', {
      method: 'POST',
      headers: {
        'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(campaignIds)
    });

    if (!response.ok) {
      console.error(`Ошибка получения подробной информации о кампаниях: ${response.status} ${response.statusText}`);
      return campaigns; // Возвращаем базовую информацию
    }

    const detailedData = await response.json();
    console.log('Получена подробная информация о кампаниях:', detailedData);
    
    if (Array.isArray(detailedData)) {
      // Создаем карту подробной информации
      const detailsMap = new Map(detailedData.map(detail => [detail.advertId, detail]));
      
      // Обновляем кампании с подробной информацией
      const updatedCampaigns = campaigns.map(campaign => {
        const details = detailsMap.get(campaign.advertId);
        if (details) {
          return {
            ...campaign,
            name: details.name || campaign.name,
            dailyBudget: details.dailyBudget || campaign.dailyBudget,
            createTime: details.createTime || campaign.createTime,
            startTime: details.startTime || campaign.startTime,
            endTime: details.endTime || campaign.endTime
          };
        }
        return campaign;
      });
      
      console.log(`Обновлено кампаний с подробной информацией: ${updatedCampaigns.length}`);
      return updatedCampaigns;
    }
    
    return campaigns;
  } catch (error) {
    console.error('Ошибка при получении подробной информации о кампаниях:', error);
    return campaigns; // Возвращаем базовую информацию
  }
}

// Функция для получения финансовых данных с буферными днями
async function fetchFinancialData(apiKey: string, startDate: string, endDate: string): Promise<FinancialData[]> {
  try {
    // Преобразуем даты
    const originalStart = new Date(startDate);
    const originalEnd = new Date(endDate);
    
    // Расширяем период на 1 день в каждую сторону для буферных дней
    const bufferStart = addDays(originalStart, -1);
    const bufferEnd = addDays(originalEnd, 1);
    
    console.log(`Запрашиваем данные с буферными днями: ${formatDate(bufferStart)} - ${formatDate(bufferEnd)}`);
    
    const response = await fetch(`https://advert-api.wildberries.ru/adv/v1/upd?from=${formatDate(bufferStart)}&to=${formatDate(bufferEnd)}`, {
      method: 'GET',
      headers: {
        'Authorization': apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      console.error(`Ошибка получения финансовых данных: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    console.log('Получен ответ от API:', data);
    console.log('Тип данных:', typeof data);
    console.log('Является ли массивом:', Array.isArray(data));
    
    const allFinancialData: FinancialData[] = [];
    
    // Обрабатываем данные
    if (Array.isArray(data)) {
      console.log(`Обрабатываем ${data.length} записей`);
      for (const record of data) {
        console.log('Обрабатываем запись:', record);
        // Исправляем маппинг полей согласно реальной структуре API
        if (record.advertId && record.updTime && record.updSum !== undefined) {
          // Преобразуем updTime в дату формата YYYY-MM-DD
          const dateOnly = record.updTime.split('T')[0]; // Извлекаем только дату
          
          allFinancialData.push({
            advertId: record.advertId,
            date: dateOnly,
            sum: record.updSum,
            bill: record.paymentType === 'Счет' ? 1 : 0,
            type: 'Списание',
            docNumber: record.updNum ? record.updNum.toString() : '',
            sku: '' // SKU будет получен отдельно через fetchCampaignSKUs
          });
          console.log(`✅ Запись добавлена: ID=${record.advertId}, дата=${dateOnly}, сумма=${record.updSum}, документ=${record.updNum}`);
        } else {
          console.log('Запись не прошла фильтрацию. advertId:', record.advertId, 'updTime:', record.updTime, 'updSum:', record.updSum);
        }
      }
    } else {
      console.log('Данные не являются массивом. Структура:', JSON.stringify(data, null, 2));
    }
    
    console.log(`ПЕРЕД применением логики буферных дней: ${allFinancialData.length} записей`);
    
    // Применяем исправленную логику буферных дней
    const filteredData = applyBufferDayLogic(allFinancialData, originalStart, originalEnd);
    
    return filteredData;
  } catch (error) {
    console.error('Ошибка при запросе финансовых данных:', error);
    return [];
  }
}

// Функция для применения логики буферных дней
function applyBufferDayLogic(data: FinancialData[], originalStart: Date, originalEnd: Date): FinancialData[] {
  const startStr = formatDate(originalStart);
  const endStr = formatDate(originalEnd);
  const bufferStartStr = formatDate(addDays(originalStart, -1)); // 15 июня
  const bufferEndStr = formatDate(addDays(originalEnd, 1)); // 17 июня
  
  console.log(`=== ЛОГИКА БУФЕРНЫХ ДНЕЙ ===`);
  console.log(`Основной период: ${startStr} - ${endStr}`);
  console.log(`Буферные дни: ${bufferStartStr} (предыдущий), ${bufferEndStr} (следующий)`);
  
  // Разделяем данные на основной период и буферные дни
  const mainPeriodData = data.filter(record => record.date >= startStr && record.date <= endStr);
  const prevBufferData = data.filter(record => record.date === bufferStartStr);
  const nextBufferData = data.filter(record => record.date === bufferEndStr);
  
  console.log(`Записей в основном периоде (${startStr}-${endStr}): ${mainPeriodData.length}`);
  console.log(`Записей в предыдущем буферном дне (${bufferStartStr}): ${prevBufferData.length}`);
  console.log(`Записей в следующем буферном дне (${bufferEndStr}): ${nextBufferData.length}`);
  
  // Анализируем номера документов по датам в основном периоде
  console.log('=== АНАЛИЗ НОМЕРОВ ДОКУМЕНТОВ ПО ДАТАМ ===');
  const docsByDate = new Map<string, Set<string>>();
  mainPeriodData.forEach(record => {
    if (!docsByDate.has(record.date)) {
      docsByDate.set(record.date, new Set());
    }
    if (record.docNumber) {
      docsByDate.get(record.date)!.add(record.docNumber);
    }
  });
  
  for (const [date, docNumbers] of docsByDate) {
    const sortedDocs = Array.from(docNumbers).sort();
    console.log(`Дата ${date}: номера документов [${sortedDocs.join(', ')}]`);
    
    // Показываем количество записей для каждого номера документа в этой дате
    sortedDocs.forEach(docNum => {
      const count = mainPeriodData.filter(r => r.date === date && r.docNumber === docNum).length;
      console.log(`  - Документ ${docNum}: ${count} записей`);
    });
  }
  
  // Собираем номера документов из основного периода
  const mainPeriodDocNumbers = new Set(
    mainPeriodData
      .filter(record => record.docNumber && record.docNumber.trim() !== '')
      .map(record => record.docNumber)
  );
  
  console.log(`Уникальных номеров документов в основном периоде: ${mainPeriodDocNumbers.size}`);
  console.log(`Номера документов основного периода:`, Array.from(mainPeriodDocNumbers));
  
  const validBufferData: FinancialData[] = [];
  
  // Обрабатываем предыдущий буферный день (15 июня)
  if (prevBufferData.length > 0) {
    const prevDocNumbers = new Set(
      prevBufferData
        .filter(record => record.docNumber && record.docNumber.trim() !== '')
        .map(record => record.docNumber)
    );
    
    console.log(`Номера документов в предыдущем буферном дне (${bufferStartStr}):`, Array.from(prevDocNumbers));
    
    // Добавляем записи из предыдущего дня, если их номера документов есть в основном периоде
    for (const record of prevBufferData) {
      if (record.docNumber && mainPeriodDocNumbers.has(record.docNumber)) {
        validBufferData.push(record);
        console.log(`✅ Добавлена запись из предыдущего буферного дня: ${record.date}, документ ${record.docNumber}, сумма ${record.sum}`);
      } else {
        console.log(`❌ Пропущена запись из предыдущего буферного дня: ${record.date}, документ ${record.docNumber} (нет в основном периоде)`);
      }
    }
  }
  
  // Обрабатываем следующий буферный день (23 июня)
  let filteredMainPeriodData = mainPeriodData;
  
  if (nextBufferData.length > 0) {
    const nextDocNumbers = new Set(
      nextBufferData
        .filter(record => record.docNumber && record.docNumber.trim() !== '')
        .map(record => record.docNumber)
    );
    
    console.log(`Номера документов в следующем буферном дне (${bufferEndStr}):`, Array.from(nextDocNumbers));
    
    // ИСПРАВЛЕНИЕ: Исключаем из основного периода записи с номерами документов из следующего дня
    if (nextDocNumbers.size > 0) {
      const originalMainCount = filteredMainPeriodData.length;
      filteredMainPeriodData = filteredMainPeriodData.filter(record => 
        !record.docNumber || !nextDocNumbers.has(record.docNumber)
      );
      const excludedCount = originalMainCount - filteredMainPeriodData.length;
      console.log(`🚫 Исключено из основного периода ${excludedCount} записей с номерами документов из следующего дня`);
      
      // Показываем какие записи исключены
      const excludedRecords = mainPeriodData.filter(record => 
        record.docNumber && nextDocNumbers.has(record.docNumber)
      );
      excludedRecords.forEach(record => {
        console.log(`  ❌ Исключена: дата=${record.date}, документ=${record.docNumber}, сумма=${record.sum}, ID=${record.advertId}`);
      });
    }
    
    // Проверяем, остались ли номера документов из следующего дня в основном периоде после фильтрации
    const remainingMainDocNumbers = new Set(
      filteredMainPeriodData
        .filter(record => record.docNumber && record.docNumber.trim() !== '')
        .map(record => record.docNumber)
    );
    
    // Добавляем записи из следующего дня только если их номера документов есть в отфильтрованном основном периоде
    for (const record of nextBufferData) {
      if (record.docNumber && remainingMainDocNumbers.has(record.docNumber)) {
        validBufferData.push(record);
        console.log(`✅ Добавлена запись из следующего буферного дня: ${record.date}, документ ${record.docNumber}, сумма ${record.sum}`);
      } else {
        console.log(`❌ Пропущена запись из следующего буферного дня: ${record.date}, документ ${record.docNumber} (не нужна после фильтрации)`);
      }
    }
  }
  
  console.log(`Добавлено записей из буферных дней: ${validBufferData.length}`);
  
  // Возвращаем объединенные данные (используем отфильтрованные данные основного периода)
  const result = [...filteredMainPeriodData, ...validBufferData];
  console.log(`=== ИТОГО записей после применения логики буферных дней: ${result.length} ===`);
  
  // Анализируем итоговый результат
  console.log('=== АНАЛИЗ ИТОГОВОГО РЕЗУЛЬТАТА ===');
  const finalDocsByDate = new Map<string, Map<string, number>>();
  result.forEach(record => {
    if (!finalDocsByDate.has(record.date)) {
      finalDocsByDate.set(record.date, new Map());
    }
    const dateMap = finalDocsByDate.get(record.date)!;
    const docNum = record.docNumber || 'БЕЗ_НОМЕРА';
    dateMap.set(docNum, (dateMap.get(docNum) || 0) + 1);
  });
  
  for (const [date, docCounts] of finalDocsByDate) {
    console.log(`Итого для даты ${date}:`);
    for (const [docNum, count] of docCounts) {
      console.log(`  - Документ ${docNum}: ${count} записей`);
    }
  }
  
  return result;
}

// Функция для получения SKU данных по ID кампаний
async function fetchCampaignSKUs(apiKey: string, campaignIds: number[]): Promise<Map<number, string>> {
  try {
    console.log('Получаем SKU данные для кампаний...');
    console.log(`ID кампаний для получения SKU: ${campaignIds.slice(0, 10).join(', ')}${campaignIds.length > 10 ? '...' : ''}`);
    
    const skuMap = new Map<number, string>();
    
    // Разбиваем ID кампаний на пакеты по 50 (как в Google Apps Script)
    const batchSize = 50;
    
    for (let i = 0; i < campaignIds.length; i += batchSize) {
      const batch = campaignIds.slice(i, i + batchSize);
      console.log(`Обрабатываем пакет ${Math.floor(i / batchSize) + 1}: ${batch.length} кампаний`);
      
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
          console.error(`Ошибка получения SKU для пакета ${batch.join(', ')}: ${response.status} ${response.statusText}`);
          continue;
        }

        const data = await response.json();
        console.log(`Получен ответ для пакета: ${Array.isArray(data) ? data.length : 0} записей`);
        
        if (Array.isArray(data)) {
          data.forEach((item, index) => {
            try {
              let nm = '';
              
              if (item.advertId) {
                // Извлекаем nm в зависимости от типа кампании (как в Google Apps Script)
                if (item.type === 9 && item.auction_multibids && Array.isArray(item.auction_multibids) && item.auction_multibids.length > 0) {
                  nm = item.auction_multibids[0].nm; // Тип 9: из auction_multibids
                  console.log(`Тип 9: advertId=${item.advertId}, nm=${nm}`);
                } else if (item.type === 8 && item.autoParams && item.autoParams.nms && Array.isArray(item.autoParams.nms) && item.autoParams.nms.length > 0) {
                  nm = item.autoParams.nms[0]; // Тип 8: из autoParams.nms
                  console.log(`Тип 8: advertId=${item.advertId}, nm=${nm}`);
                } else if (item.unitedParams && Array.isArray(item.unitedParams) && item.unitedParams.length > 0 && item.unitedParams[0].nms && Array.isArray(item.unitedParams[0].nms) && item.unitedParams[0].nms.length > 0) {
                  nm = item.unitedParams[0].nms[0]; // Из unitedParams.nms
                  console.log(`unitedParams: advertId=${item.advertId}, nm=${nm}`);
                } else {
                  console.log(`Пропущена запись: нет подходящих nm для advertId=${item.advertId}, type=${item.type}`);
                }

                if (nm) {
                  skuMap.set(item.advertId, nm.toString());
                  console.log(`✅ SKU сопоставлен: advertId=${item.advertId} -> nm=${nm}`);
                }
              }
            } catch (innerError) {
              console.error(`Ошибка при обработке записи ${index + 1}:`, innerError);
            }
          });
        }
        
        // Пауза для соблюдения ограничения API (5 запросов в секунду)
        if (i + batchSize < campaignIds.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
      } catch (batchError) {
        console.error(`Ошибка при обработке пакета ${batch.join(', ')}:`, batchError);
      }
    }
    
    console.log(`Получено SKU данных: ${skuMap.size} из ${campaignIds.length} кампаний`);
    return skuMap;
    
  } catch (error) {
    console.error('Ошибка при получении SKU данных:', error);
    return new Map();
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, startDate, endDate } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'API ключ обязателен' }, { status: 400 });
    }

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'Даты начала и окончания обязательны' }, { status: 400 });
    }

    console.log('Начинаем получение данных медиа-статистики...');
    console.log(`Период: ${startDate} - ${endDate}`);

    // Получаем список кампаний
    console.log('Получаем список кампаний...');
    const campaigns = await fetchCampaigns(apiKey);
    console.log(`Найдено кампаний: ${campaigns.length}`);

    // Получаем финансовые данные с буферными днями
    console.log('Получаем финансовые данные с буферными днями...');
    const financialData = await fetchFinancialData(apiKey, startDate, endDate);
    console.log(`Найдено финансовых записей: ${financialData.length}`);

    // Получаем SKU данные для кампаний, которые есть в финансовых данных
    const uniqueCampaignIds = [...new Set(financialData.map(record => record.advertId))];
    console.log(`Уникальных кампаний в финансовых данных: ${uniqueCampaignIds.length}`);
    
    const skuMap = await fetchCampaignSKUs(apiKey, uniqueCampaignIds);
    console.log(`Получено SKU данных: ${skuMap.size} кампаний`);
    
    // Сопоставляем SKU данные с финансовыми записями
    const financialDataWithSKU = financialData.map(record => ({
      ...record,
      sku: skuMap.get(record.advertId) || ''
    }));
    
    console.log('=== ПРОВЕРКА SKU ДАННЫХ ===');
    const recordsWithSKU = financialDataWithSKU.filter(record => record.sku && record.sku.trim() !== '');
    console.log(`Записей с SKU: ${recordsWithSKU.length} из ${financialDataWithSKU.length}`);
    if (recordsWithSKU.length > 0) {
      console.log('Примеры записей с SKU:', recordsWithSKU.slice(0, 3).map(r => ({ advertId: r.advertId, sku: r.sku, sum: r.sum })));
    }

    // Создаем Excel файл
    const workbook = new ExcelJS.Workbook();

    // Лист 1: Информация по РК
    const campaignSheet = workbook.addWorksheet('Информация по РК');
    campaignSheet.columns = [
      { header: 'ID кампании', key: 'advertId', width: 15 },
      { header: 'Название', key: 'name', width: 30 },
      { header: 'Тип', key: 'type', width: 20 },
      { header: 'Статус', key: 'status', width: 20 },
      { header: 'Дневной бюджет', key: 'dailyBudget', width: 15 },
      { header: 'Дата создания', key: 'createTime', width: 15 },
      { header: 'Дата изменения', key: 'changeTime', width: 15 },
      { header: 'Дата начала', key: 'startTime', width: 15 },
      { header: 'Дата окончания', key: 'endTime', width: 15 }
    ];

    campaigns.forEach(campaign => {
      campaignSheet.addRow({
        advertId: campaign.advertId,
        name: campaign.name,
        type: mapCampaignType(campaign.type),
        status: mapCampaignStatus(campaign.status),
        dailyBudget: campaign.dailyBudget,
        createTime: campaign.createTime ? new Date(campaign.createTime).toLocaleDateString() : '',
        changeTime: campaign.changeTime ? new Date(campaign.changeTime).toLocaleDateString() : '',
        startTime: campaign.startTime ? new Date(campaign.startTime).toLocaleDateString() : '',
        endTime: campaign.endTime ? new Date(campaign.endTime).toLocaleDateString() : ''
      });
    });

    // Лист 2: Финансы РК
    const financeSheet = workbook.addWorksheet('Финансы РК');
    financeSheet.columns = [
      { header: 'ID кампании', key: 'advertId', width: 15 },
      { header: 'Название кампании', key: 'campaignName', width: 30 },
      { header: 'SKU ID', key: 'sku', width: 15 }, // Добавляем столбец SKU ID
      { header: 'Дата', key: 'date', width: 15 },
      { header: 'Сумма', key: 'sum', width: 15 },
      { header: 'Источник списания', key: 'bill', width: 20 },
      { header: 'Тип операции', key: 'type', width: 15 },
      { header: 'Номер документа', key: 'docNumber', width: 20 }
    ];

    // Создаем карту кампаний для быстрого поиска
    const campaignMap = new Map(campaigns.map(c => [c.advertId, c]));
    
    console.log('=== СОПОСТАВЛЕНИЕ КАМПАНИЙ С ФИНАНСОВЫМИ ДАННЫМИ ===');
    console.log(`Кампаний в карте: ${campaignMap.size}`);
    console.log(`ID кампаний:`, Array.from(campaignMap.keys()));
    console.log(`Финансовых записей: ${financialDataWithSKU.length}`);
    
    const uniqueFinancialIds = new Set(financialDataWithSKU.map(record => record.advertId));
    console.log(`Уникальных ID в финансовых данных:`, Array.from(uniqueFinancialIds));
    
    // Проверяем совпадения
    const matchingIds = Array.from(uniqueFinancialIds).filter(id => campaignMap.has(id));
    const missingIds = Array.from(uniqueFinancialIds).filter(id => !campaignMap.has(id));
    
    console.log(`Совпадающих ID: ${matchingIds.length}`, matchingIds);
    console.log(`Отсутствующих ID: ${missingIds.length}`, missingIds);

    console.log('=== СОЗДАНИЕ ЛИСТА "ФИНАНСЫ РК" ===');
    console.log(`Финансовых записей для обработки: ${financialDataWithSKU.length}`);
    
    // Проверяем наличие SKU в данных
    const recordsWithSku = financialDataWithSKU.filter(record => record.sku && record.sku.trim() !== '');
    const recordsWithoutSku = financialDataWithSKU.filter(record => !record.sku || record.sku.trim() === '');
    
    console.log(`Записей с SKU: ${recordsWithSku.length}`);
    console.log(`Записей без SKU: ${recordsWithoutSku.length}`);
    
    if (recordsWithSku.length > 0) {
      console.log('Примеры записей с SKU:', recordsWithSku.slice(0, 3).map(r => ({ advertId: r.advertId, sku: r.sku, sum: r.sum })));
    }

    financialDataWithSKU.forEach(record => {
      const campaign = campaignMap.get(record.advertId);
      financeSheet.addRow({
        advertId: record.advertId,
        campaignName: campaign?.name || 'Неизвестная кампания',
        sku: record.sku || '', // Добавляем SKU ID
        date: record.date,
        sum: record.sum,
        bill: record.bill === 1 ? 'Счет' : 'Баланс',
        type: record.type,
        docNumber: record.docNumber
      });
    });

    // Лист 3: Сводка по кампаниям
    const summarySheet = workbook.addWorksheet('Сводка по кампаниям');
    summarySheet.columns = [
      { header: 'ID кампании', key: 'advertId', width: 15 },
      { header: 'Название кампании', key: 'campaignName', width: 30 },
      { header: 'Тип', key: 'type', width: 20 },
      { header: 'Статус', key: 'status', width: 20 },
      { header: 'Общие расходы', key: 'totalSpent', width: 15 },
      { header: 'Количество операций', key: 'operationCount', width: 20 }
    ];

    // Группируем данные по кампаниям
    const campaignSummary = new Map<number, {
      totalSpent: number,
      operationCount: number
    }>();

    financialDataWithSKU.forEach(record => {
      if (!campaignSummary.has(record.advertId)) {
        campaignSummary.set(record.advertId, {
          totalSpent: 0,
          operationCount: 0
        });
      }
      
      const summary = campaignSummary.get(record.advertId)!;
      summary.totalSpent += record.sum;
      summary.operationCount += 1;
    });

    // Добавляем данные в лист сводки
    campaigns.forEach(campaign => {
      const summary = campaignSummary.get(campaign.advertId);
      summarySheet.addRow({
        advertId: campaign.advertId,
        campaignName: campaign.name,
        type: mapCampaignType(campaign.type),
        status: mapCampaignStatus(campaign.status),
        totalSpent: summary?.totalSpent || 0,
        operationCount: summary?.operationCount || 0
      });
    });

    // Генерируем Excel файл
    const buffer = await workbook.xlsx.writeBuffer();
    
    const filename = `wildberries_media_stats_${startDate}_${endDate}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Ошибка при получении медиа-статистики:', error);
    return NextResponse.json({ 
      error: 'Ошибка при получении медиа-статистики',
      details: error instanceof Error ? error.message : 'Неизвестная ошибка'
    }, { status: 500 });
  }
} 