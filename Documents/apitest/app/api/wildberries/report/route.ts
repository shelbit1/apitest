import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import * as ExcelJS from "exceljs";
import { validateWildberriesToken } from "../../../lib/wildberries-api";
import { createExcelReport as createExcelReportFromLib } from "../../../lib/excel-generator";
import { addDays, formatDate, mapCampaignType, mapCampaignStatus } from "../../../lib/data-mappers";
import * as path from "path";

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
    
    // Очистка токена от пробелов и лишних символов
    const cleanToken = token.trim();
    console.log(`🔍 Токен после очистки: ${cleanToken.substring(0, 20)}...`);
    console.log(`🔍 Длина очищенного токена: ${cleanToken.length} символов`);
    
    // Проверка формата токена
    if (!validateWildberriesToken(cleanToken)) {
      console.error("❌ Некорректный формат токена");
      return NextResponse.json(
        { 
          error: "Некорректный формат токена",
          help: "Проверьте токен в личном кабинете Wildberries в разделе 'Настройки → Доступ к API'"
        },
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
    
    // Формируем URL и отправляем токен в заголовке Authorization
    const apiUrl = `https://statistics-api.wildberries.ru/api/v5/supplier/reportDetailByPeriod?dateFrom=${startDate}&dateTo=${endDate}`;
    
    console.log(`📡 URL запроса реализации: ${apiUrl}`);
    console.log(`🔑 Начало токена: ${cleanToken.substring(0, 30)}...`);
    console.log(`⏰ Время запроса: ${new Date().toISOString()}`);
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': cleanToken,
        'User-Agent': 'Mozilla/5.0 (compatible; WB-API-Client/1.0)',
        'Accept': 'application/json',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      }
    });
    
    console.log(`📊 Ответ API реализации: ${response.status} ${response.statusText}`);
    console.log(`📋 Заголовки ответа:`, Object.fromEntries(response.headers.entries()));
    console.log(`📊 Content-Type: ${response.headers.get('content-type')}`);
    console.log(`📊 Response Size: ${response.headers.get('content-length')} bytes`);
    
    // Убираем дублирующую логику альтернативной авторизации
    
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
        userHelp = "Попробуйте позже. Wildberries ограничивает количество запросов в минуту. Рекомендуется подождать 2-3 минуты перед повторной попыткой.";
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
    console.log("📊 2/3 Параллельное получение данных хранения, приемки, платежей и себестоимости...");
    const [storageData, acceptanceData, paymentsData, campaigns, financialData] = await Promise.all([
      getStorageData(cleanToken, startDate, endDate),
      getAcceptanceData(cleanToken, startDate, endDate),
      getPaymentsData(cleanToken, startDate, endDate),
      fetchCampaigns(cleanToken),
      fetchFinancialData(cleanToken, startDate, endDate)
    ]);

    // Получаем данные себестоимости, включая товары из реализации
    console.log("📊 Получение данных себестоимости с дополнением из реализации...");
    const costPriceData = await getCostPriceData(cleanToken, costPricesData || {}, data);

    // Получаем SKU данные для финансовых записей (если есть кампании и финансовые данные)
    console.log("📊 3/3 Получение SKU данных для листа 'Финансы РК'...");
    let skuMap = new Map<number, string>();
    if (campaigns.length > 0 && financialData.length > 0) {
      const uniqueCampaignIds = [...new Set(financialData.map(record => record.advertId))];
      console.log(`📊 Получение SKU для ${uniqueCampaignIds.length} уникальных кампаний...`);
      
      try {
        skuMap = await fetchCampaignSKUs(cleanToken, uniqueCampaignIds);
        console.log(`✅ Получено SKU данных: ${skuMap.size} кампаний`);
      } catch (error) {
        console.error(`❌ Ошибка получения SKU данных:`, error);
        console.log("ℹ️ Лист 'Финансы РК' будет создан без SKU ID");
      }
    }

    console.log(`📦 Итого получено:`);
    console.log(`  - Реализация: ${data.length} записей`);
    console.log(`  - Хранение: ${storageData.length} записей`);
    console.log(`  - Приемка: ${acceptanceData.length} записей`);
    console.log(`  - Пополнения: ${paymentsData.length} записей`);
    console.log(`  - Кампании: ${campaigns.length} записей`);
    console.log(`  - Финансы кампаний: ${financialData.length} записей`);
    console.log(`  - Себестоимость: ${costPriceData.length} записей`);


    
    // Создаем Excel файл
    console.log("📊 Создание Excel отчета...");
    const buffer = await createExcelReport(data, storageData, acceptanceData, [], paymentsData, campaigns, financialData, costPriceData, startDate, endDate, cleanToken, skuMap);

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

// Функция для добавления листа "Полный отчет" с разделением по realizationreport_id
function addFullReportSheet(workbook: XLSX.WorkBook, data: any[]) {
  console.log("📊 Создание листа 'Полный отчет' с разделением по realizationreport_id...");
  
  // Группируем данные по realizationreport_id
  const reportGroups: { [key: string]: any[] } = {};
  
  data.forEach(item => {
    const reportId = item.realizationreport_id || 'Без ID';
    if (!reportGroups[reportId]) {
      reportGroups[reportId] = [];
    }
    reportGroups[reportId].push(item);
  });
  
  console.log(`📋 Найдено ${Object.keys(reportGroups).length} уникальных отчетов реализации`);
  
  // Создаем массив данных для Excel с разделительными строками
  const fullReportData: any[] = [];
  
  Object.keys(reportGroups).forEach((reportId, index) => {
    const group = reportGroups[reportId];
    
    // Добавляем заголовок группы
    if (index > 0) {
      // Пустая строка для разделения
      fullReportData.push({});
    }
    
    fullReportData.push({
      "Номер отчёта": `=== ОТЧЕТ РЕАЛИЗАЦИИ ID: ${reportId} ===`,
      "Дата начала отчётного периода": group[0]?.date_from || '',
      "Дата конца отчётного периода": group[0]?.date_to || '',
      "Дата формирования отчёта": group[0]?.create_dt || '',
      "Количество записей": group.length,
      "Валюта": group[0]?.currency_name || ''
    });
    
    // Добавляем все записи из этой группы
    group.forEach(item => {
      fullReportData.push({
        "Номер отчёта": item.realizationreport_id || "",
        "Дата начала отчётного периода": item.date_from || "",
        "Дата конца отчётного периода": item.date_to || "",
        "Дата формирования отчёта": item.create_dt || "",
        "Валюта": item.currency_name || "",
        "Код договора поставщика": item.suppliercontract_code || "",
        "ID записи": item.rrd_id || "",
        "Номер поставки": item.gi_id || "",
        "Процент логистики": item.dlv_prc || 0,
        "Дата фиксации тарифа с": item.fix_tariff_date_from || "",
        "Дата фиксации тарифа по": item.fix_tariff_date_to || "",
        "Предмет": item.subject_name || "",
        "Артикул WB": item.nm_id || "",
        "Бренд": item.brand_name || "",
        "Артикул продавца": item.sa_name || "",
        "Размер": item.ts_name || "",
        "Баркод": item.barcode || "",
        "Тип документа": item.doc_type_name || "",
        "Количество": item.quantity || 0,
        "Розничная цена": item.retail_price || 0,
        "Сумма продаж": item.retail_amount || 0,
        "Согласованная скидка (%)": item.sale_percent || 0,
        "Процент комиссии": item.commission_percent || 0,
        "Склад": item.office_name || "",
        "Обоснование для оплаты": item.supplier_oper_name || "",
        "Дата заказа": item.order_dt || "",
        "Дата продажи": item.sale_dt || "",
        "Дата отчета": item.rr_dt || "",
        "Штрихкод": item.shk_id || "",
        "Цена розничная с учетом согласованной скидки": item.retail_price_withdisc_rub || 0,
        "Количество доставок": item.delivery_amount || 0,
        "Количество возвратов": item.return_amount || 0,
        "Стоимость логистики": item.delivery_rub || 0,
        "Тип коробки": item.gi_box_type_name || "",
        "Скидка товара для отчета": item.product_discount_for_report || 0,
        "Промо от поставщика": item.supplier_promo || 0,
        "Rid": item.rid || "",
        "SPP процент": item.ppvz_spp_prc || 0,
        "КВВ процент базовый": item.ppvz_kvw_prc_base || 0,
        "КВВ процент": item.ppvz_kvw_prc || 0,
        "Процент повышения рейтинга": item.sup_rating_prc_up || 0,
        "Флаг KGVP v2": item.is_kgvp_v2 || 0,
        "Комиссия за продажи": item.ppvz_sales_commission || 0,
        "К доплате": item.ppvz_for_pay || 0,
        "Вознаграждение": item.ppvz_reward || 0,
        "Комиссия эквайринга": item.acquiring_fee || 0,
        "Процент эквайринга": item.acquiring_percent || 0,
        "Обработка платежей": item.payment_processing || "",
        "Банк эквайринга": item.acquiring_bank || "",
        "PPVZ VW": item.ppvz_vw || 0,
        "PPVZ VW НДС": item.ppvz_vw_nds || 0,
        "Название офиса PPVZ": item.ppvz_office_name || "",
        "ID офиса PPVZ": item.ppvz_office_id || "",
        "ID поставщика PPVZ": item.ppvz_supplier_id || "",
        "Имя поставщика PPVZ": item.ppvz_supplier_name || "",
        "ИНН PPVZ": item.ppvz_inn || "",
        "Номер декларации": item.declaration_number || "",
        "Тип бонуса": item.bonus_type_name || "",
        "ID стикера": item.sticker_id || "",
        "Страна сайта": item.site_country || "",
        "Флаг DBS": item.srv_dbs ? "Да" : "Нет",
        "Штраф": item.penalty || 0,
        "Доплата": item.additional_payment || 0,
        "Перерасчет логистики": item.rebill_logistic_cost || 0,
        "Организация перерасчета": item.rebill_logistic_org || "",
        "Стоимость хранения": item.storage_fee || 0,
        "Удержания": item.deduction || 0,
        "Приемка": item.acceptance || 0,
        "ID сборочного задания": item.assembly_id || "",
        "КИЗ": item.kiz || "",
        "SRID": item.srid || "",
        "Тип отчета": item.report_type || 0,
        "Юридическое лицо": item.is_legal_entity ? "Да" : "Нет",
        "ID TRBX": item.trbx_id || "",
        "Сумма рассрочки": item.installment_cofinancing_amount || 0,
        "Процент скидки WB": item.wibes_wb_discount_percent || 0
      });
    });
  });
  
  // Создаем лист с данными
  const fullReportSheet = XLSX.utils.json_to_sheet(fullReportData);
  
  // Настраиваем ширину колонок
  const columnWidths = Array(60).fill({ wch: 15 }); // 60 колонок по 15 символов
  fullReportSheet['!cols'] = columnWidths;
  
  // Добавляем лист в книгу
  XLSX.utils.book_append_sheet(workbook, fullReportSheet, "Полный отчет");
  
  console.log(`✅ Лист 'Полный отчет' создан с ${fullReportData.length} строками данных`);
  console.log(`📊 Статистика по отчетам реализации:`);
  Object.keys(reportGroups).forEach(reportId => {
    console.log(`   - Отчет ${reportId}: ${reportGroups[reportId].length} записей`);
  });
}

// Функции для работы с рекламными кампаниями импортированы из data-mappers.ts

async function fetchCampaigns(apiKey: string): Promise<Campaign[]> {
  try {
    console.log('📊 Получение списка кампаний...');
    
    const response = await fetch('https://advert-api.wildberries.ru/adv/v1/promotion/count', {
      method: 'GET',
      headers: {
        'Authorization': apiKey,
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
        'Authorization': apiKey,
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
    console.log(`📊 Получение SKU данных для ${campaignIds.length} кампаний...`);
    const startTime = Date.now();
    
    const skuMap = new Map<number, string>();
    
    // Проверяем валидность входных данных
    if (!campaignIds || campaignIds.length === 0) {
      console.warn('⚠️ Нет кампаний для получения SKU данных');
      return skuMap;
    }
    
    const batchSize = 50; // Уменьшаем размер батча для большей надежности
    const batches = Math.ceil(campaignIds.length / batchSize);
    
    console.log(`📦 Обработка в ${batches} батчах по ${batchSize} кампаний`);
    
    for (let i = 0; i < campaignIds.length; i += batchSize) {
      const batch = campaignIds.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      
      console.log(`📤 Обработка батча ${batchNum}/${batches} (${batch.length} кампаний)`);
      const batchStartTime = Date.now();
      
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
      try {
        // Добавляем таймаут для запроса
        const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 45000); // Увеличиваем таймаут до 45 секунд
        
        const response = await fetch('https://advert-api.wildberries.ru/adv/v1/promotion/adverts', {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
          },
          body: JSON.stringify(batch),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`❌ Ошибка получения SKU для батча ${batchNum} (попытка ${retryCount + 1}): ${response.status} ${response.statusText}`);
          
          // Обрабатываем ошибку 429 (Rate Limit)
          if (response.status === 429) {
              const waitTime = Math.min(60000 * (retryCount + 1), 180000); // Увеличиваем время ожидания с каждой попыткой
              console.warn(`⚠️ Превышен лимит запросов для батча ${batchNum}. Ожидание ${waitTime / 1000} секунд...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              retryCount++;
              continue;
            }
            
            // Для других ошибок пробуем ещё раз
            if (retryCount < maxRetries - 1) {
              const waitTime = 5000 * (retryCount + 1); // 5, 10, 15 секунд
              console.warn(`⚠️ Ожидание ${waitTime / 1000} секунд перед повторной попыткой...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              retryCount++;
              continue;
            } else {
              console.error(`❌ Батч ${batchNum} пропущен после ${maxRetries} попыток`);
              break;
            }
        }

        const data = await response.json();
        
        if (Array.isArray(data)) {
          processSKUData(data, skuMap);
          console.log(`✅ Батч ${batchNum} обработан за ${Date.now() - batchStartTime}ms`);
          } else {
            console.warn(`⚠️ Неожиданный формат ответа для батча ${batchNum}:`, typeof data);
        }
        
          break; // Успешно обработали батч, выходим из цикла retry
        
      } catch (batchError: any) {
        if (batchError.name === 'AbortError') {
            console.error(`❌ Таймаут при обработке батча ${batchNum} (попытка ${retryCount + 1})`);
        } else {
            console.error(`❌ Ошибка при обработке батча ${batchNum} (попытка ${retryCount + 1}):`, batchError.message);
        }
          
          if (retryCount < maxRetries - 1) {
            const waitTime = 5000 * (retryCount + 1);
            console.log(`⏳ Ожидание ${waitTime / 1000} секунд перед повторной попыткой...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            retryCount++;
          } else {
            console.error(`❌ Батч ${batchNum} окончательно пропущен после ${maxRetries} попыток`);
            break;
          }
        }
      }
      
      // Добавляем паузу между батчами
      if (i + batchSize < campaignIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Увеличиваем паузу до 1 секунды
      }
    }
    
    const totalTime = Date.now() - startTime;
    const successRate = ((skuMap.size / campaignIds.length) * 100).toFixed(1);
    console.log(`✅ Получено SKU данных: ${skuMap.size} из ${campaignIds.length} кампаний за ${totalTime}ms (${successRate}% успешных)`);
    
    if (skuMap.size === 0) {
      console.warn('⚠️ Не удалось получить ни одного SKU. Лист "Финансы РК" будет создан без SKU ID');
    }
    
    return skuMap;
    
  } catch (error: any) {
    console.error('❌ Критическая ошибка при получении SKU данных:', error.message);
    console.log('ℹ️ Возвращаем пустую карту SKU. Лист "Финансы РК" будет создан без SKU ID');
    return new Map();
  }
}

// Вспомогательная функция для обработки SKU данных
function processSKUData(data: any[], skuMap: Map<number, string>) {
  let processed = 0;
  
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
          processed++;
        }
      }
    } catch (innerError) {
      console.error('❌ Ошибка при обработке SKU записи:', innerError);
    }
  });
  
  console.log(`📊 Обработано ${processed} SKU записей в батче`);
}

async function createExcelReport(data: any[], storageData: any[], acceptanceData: any[], advertData: any[], paymentsData: any[], campaigns: Campaign[], financialData: FinancialData[], costPriceData: any[], startDate: string, endDate: string, token: string, skuMap: Map<number, string> = new Map()): Promise<Buffer> {
  const startTime = Date.now();
  console.log("🚀 Начинаем создание Excel отчета...");
  
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

  console.log(`⏱️ Подготовка данных завершена за ${Date.now() - startTime}ms`);
  const dataTime = Date.now();

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
  
  // Добавляем лист с данными о хранении (только если есть данные)
  console.log(`📊 Создание листа хранения. Количество записей: ${storageData?.length || 0}`);
  
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
    console.log("✅ Лист 'Хранение' добавлен в Excel с данными");
  }
  
  // Добавляем лист с данными о приемке (только если есть данные)
  console.log(`📊 Создание листа приемки. Количество записей: ${acceptanceData?.length || 0}`);
  
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
    console.log("✅ Лист 'Приемка' добавлен в Excel с данными");
  }



  // Добавляем лист "Полный отчет" с разделением по realizationreport_id
  console.log(`📊 Создание листа "Полный отчет". Количество записей: ${data?.length || 0}`);
  
  if (data && data.length > 0) {
    addFullReportSheet(workbook, data);
  }

  // Добавляем лист с данными о себестоимости (только если есть данные)
  console.log(`📊 Создание листа себестоимости. Количество записей: ${costPriceData?.length || 0}`);
  
  if (costPriceData && costPriceData.length > 0) {
    const costPriceExcelData = costPriceData.map((item) => ({
      "Артикул ВБ": item.nmID || "",
      "Артикул продавца": item.vendorCode || "",
      "Предмет": item.object || "",
      "Бренд": item.brand || "",
      "Размер": item.sizeName || "",
      "Штрихкод": item.barcode || "",
      "Цена": item.price || 0,
      "Себестоимость": item.costPrice || 0,
      "Маржа": item.costPrice > 0 ? (item.price - item.costPrice) : 0,
      "Рентабельность (%)": item.costPrice > 0 && item.price > 0 ? ((item.price - item.costPrice) / item.price * 100).toFixed(2) : 0,
      "Источник данных": item.source === 'realization' ? 'Из реализации' : 'Из карточек API',
      "Дата создания": item.createdAt || "",
      "Дата обновления": item.updatedAt || ""
    }));

    const costPriceSheet = XLSX.utils.json_to_sheet(costPriceExcelData);

    // Настройка ширины колонок для листа себестоимости
    const costPriceColumnWidths = [
      { wch: 15 }, // Артикул ВБ
      { wch: 20 }, // Артикул продавца
      { wch: 35 }, // Предмет
      { wch: 15 }, // Бренд
      { wch: 15 }, // Размер
      { wch: 15 }, // Штрихкод
      { wch: 15 }, // Цена
      { wch: 15 }, // Себестоимость
      { wch: 15 }, // Маржа
      { wch: 20 }, // Рентабельность
      { wch: 20 }, // Источник данных
      { wch: 20 }, // Дата создания
      { wch: 20 }, // Дата обновления
    ];
    costPriceSheet['!cols'] = costPriceColumnWidths;

    XLSX.utils.book_append_sheet(workbook, costPriceSheet, "Себес");
    console.log("✅ Лист 'Себес' добавлен в Excel с данными");
  }



  console.log(`⏱️ Создание листов завершено за ${Date.now() - dataTime}ms`);
  const sheetsTime = Date.now();

  const formulasTime = Date.now();

  // 🚀 Создаем лист "Финансы РК" (SKU данные уже получены заранее)
  console.log(`📊 Проверка данных для листа "Финансы РК". Кампаний: ${campaigns.length}, финансовых записей: ${financialData.length}`);
  
  if (campaigns.length > 0 && financialData.length > 0) {
    console.log("🚀 Создание листа 'Финансы РК'...");
    const financeStartTime = Date.now();
    
    console.log(`📊 Использование готовых SKU данных: ${skuMap.size} кампаний`);
    
    // Создаем карту кампаний для быстрого поиска
    const campaignMap = new Map(campaigns.map(c => [c.advertId, c]));
    
    // Подготавливаем данные для листа "Финансы РК"
    const financeExcelData = financialData.map(record => {
      const campaign = campaignMap.get(record.advertId);
      return {
        "ID кампании": record.advertId,
        "Название кампании": campaign?.name || 'Неизвестная кампания',
        "SKU ID": skuMap.get(record.advertId) || '',
        "Дата": record.date,
        "Сумма": record.sum,
        "Источник списания": record.bill === 1 ? 'Счет' : 'Баланс',
        "Тип операции": record.type,
        "Номер документа": record.docNumber
      };
    });
    
    // Создаем лист "Финансы РК" через обычный XLSX
    const financeSheet = XLSX.utils.json_to_sheet(financeExcelData);
    
    // Настройка ширины колонок для листа "Финансы РК"
    const financeColumnWidths = [
      { wch: 15 }, // ID кампании
      { wch: 30 }, // Название кампании
      { wch: 15 }, // SKU ID
      { wch: 15 }, // Дата
      { wch: 15 }, // Сумма
      { wch: 20 }, // Источник списания
      { wch: 15 }, // Тип операции
      { wch: 20 }, // Номер документа
    ];
    financeSheet['!cols'] = financeColumnWidths;
    
    XLSX.utils.book_append_sheet(workbook, financeSheet, "Финансы РК");
    console.log(`✅ Лист "Финансы РК" создан за ${Date.now() - financeStartTime}ms с ${financeExcelData.length} записями`);
    
  } else {
    console.log("ℹ️ Нет данных для создания листа 'Финансы РК'");
  }

  // Конвертируем в Buffer (быстрая операция)
  console.log("🔄 Конвертация в Excel Buffer...");
  const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  
  const totalTime = Date.now() - startTime;
  console.log(`✅ Excel отчет создан за ${totalTime}ms. Размер: ${(excelBuffer.length / 1024).toFixed(2)} KB`);
  console.log(`📊 Время по этапам: подготовка ${dataTime - startTime}ms, листы ${sheetsTime - dataTime}ms, формулы ${formulasTime - sheetsTime}ms, конвертация ${Date.now() - formulasTime}ms`);
  
  return excelBuffer;
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
    
    let taskId: string | undefined;
    
    if (!taskResponse.ok) {
      const errorText = await taskResponse.text();
      console.error(`❌ Ошибка создания задачи приемки: ${taskResponse.status}`, errorText);
      
      // Проверяем ошибку 429
      if (taskResponse.status === 429) {
        console.warn("⚠️ Превышен лимит запросов для приемки (1 запрос в минуту)");
        console.log("⏳ Ожидание 2 минуты перед повторной попыткой...");
        
        // Ждем 2 минуты и повторяем попытку
        await new Promise(resolve => setTimeout(resolve, 120000));
        
        console.log("🔄 Повторная попытка создания задачи приемки...");
        const retryTaskResponse = await fetch(taskUrl, {
          method: "GET",
          headers: {
            "Authorization": token,
          },
        });
        
        if (retryTaskResponse.ok) {
          const retryTaskResult = await retryTaskResponse.json();
          taskId = retryTaskResult.data?.taskId;
          
          if (taskId) {
            console.log(`✅ Создана задача приемки после повторной попытки: ${taskId}`);
          } else {
            console.error("❌ Не удалось получить taskId приемки после повторной попытки");
            return [];
          }
        } else {
          console.error(`❌ Повторная попытка создания задачи приемки не удалась: ${retryTaskResponse.status}`);
          return [];
        }
      } else {
        return [];
      }
    } else {
      const taskResult = await taskResponse.json();
      taskId = taskResult.data?.taskId;
      
      if (!taskId) {
        console.error("❌ Не получен taskId для приемки");
        return [];
      }
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

    let taskId: string | undefined;

    if (!taskResponse.ok) {
      const errorText = await taskResponse.text();
      console.error(`❌ Ошибка создания taskId для хранения: ${taskResponse.status}`, errorText);
      
      // Проверяем специфичные ошибки
      if (taskResponse.status === 429) {
        console.warn("⚠️ Превышен лимит запросов (1 запрос в минуту)");
        console.log("⏳ Ожидание 2 минуты перед повторной попыткой...");
        
        // Ждем 2 минуты и повторяем попытку
        await new Promise(resolve => setTimeout(resolve, 120000));
        
        console.log("🔄 Повторная попытка создания taskId...");
        const retryTaskResponse = await fetch(taskUrl, {
          method: "GET",
          headers: {
            "Authorization": token,
          },
        });
        
        if (retryTaskResponse.ok) {
          const retryTaskData = await retryTaskResponse.json();
          taskId = retryTaskData?.data?.taskId;
          
          if (taskId) {
            console.log(`✅ Создан taskId после повторной попытки: ${taskId}`);
          } else {
            console.error("❌ Не удалось получить taskId после повторной попытки");
            return [];
          }
        } else {
          console.error(`❌ Повторная попытка создания taskId не удалась: ${retryTaskResponse.status}`);
          return [];
        }
      } else if (taskResponse.status === 401) {
        console.error("❌ Неверный токен авторизации");
        return [];
      } else {
        return [];
      }
    } else {
      const taskData = await taskResponse.json();
      console.log("📋 Ответ создания задачи:", JSON.stringify(taskData, null, 2));
      
      taskId = taskData?.data?.taskId;

      if (!taskId) {
        console.error("❌ Не удалось получить taskId для хранения. Структура ответа:", taskData);
        return [];
      }
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

    // Загружаем отчет с повторными попытками (увеличено для 429 ошибок)
    const maxRetries = 5;
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
        console.log(`📄 Сырой ответ загрузки хранения (длина: ${responseText.length}):`, responseText.substring(0, 500) + "...");
        
        // Дополнительные проверки перед парсингом JSON
        if (!responseText || responseText.trim().length === 0) {
          console.warn("⚠️ API хранения вернул пустой ответ");
          return [];
        }
        
        const trimmedResponse = responseText.trim();
        if (!trimmedResponse.startsWith('{') && !trimmedResponse.startsWith('[')) {
          console.warn("⚠️ API хранения вернул не-JSON ответ:", trimmedResponse.substring(0, 100));
          return [];
        }
        
        let storageData;
        try {
          storageData = JSON.parse(responseText);
        } catch (parseError) {
          console.error("❌ Ошибка парсинга JSON хранения:", parseError);
          console.log("📄 Полный ответ для отладки:", responseText);
          console.log("📏 Длина ответа:", responseText.length);
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
        // Экспоненциальная задержка для 429 ошибок
        const delayMinutes = Math.min(2 ** retryCount, 8); // 2, 4, 8 минут максимум
        const delayMs = delayMinutes * 60 * 1000;
        
        console.log(`⚠️ Ошибка 429 для taskId ${taskId}. Попытка ${retryCount + 1} из ${maxRetries}`);
        console.log(`⏳ Ожидание ${delayMinutes} минут перед повторной попыткой...`);
        
        await new Promise(resolve => setTimeout(resolve, delayMs));
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
    console.log(`📄 Сырой ответ API рекламы (длина: ${responseText.length}):`, responseText.substring(0, 500) + "...");
    
    // Дополнительные проверки перед парсингом JSON
    if (!responseText || responseText.trim().length === 0) {
      console.warn("⚠️ API рекламы вернул пустой ответ");
      return [];
    }
    
    const trimmedResponse = responseText.trim();
    if (!trimmedResponse.startsWith('{') && !trimmedResponse.startsWith('[')) {
      console.warn("⚠️ API рекламы вернул не-JSON ответ:", trimmedResponse.substring(0, 100));
      return [];
    }
    
    let advertData;
    try {
      advertData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("❌ Ошибка парсинга JSON рекламы:", parseError);
      console.log("📄 Полный ответ для отладки:", responseText);
      console.log("📏 Длина ответа:", responseText.length);
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
    console.log(`📄 Сырой ответ API карточек товаров (длина: ${responseText.length}):`, responseText.substring(0, 500) + "...");
    
    // Дополнительные проверки перед парсингом JSON
    if (!responseText || responseText.trim().length === 0) {
      console.warn("⚠️ API карточек товаров вернул пустой ответ");
      return [];
    }
    
    const trimmedResponse = responseText.trim();
    if (!trimmedResponse.startsWith('{') && !trimmedResponse.startsWith('[')) {
      console.warn("⚠️ API карточек товаров вернул не-JSON ответ:", trimmedResponse.substring(0, 100));
      return [];
    }
    
    let cardsResponse;
    try {
      cardsResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error("❌ Ошибка парсинга JSON карточек товаров:", parseError);
      console.log("📄 Полный ответ для отладки:", responseText);
      console.log("📏 Длина ответа:", responseText.length);
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
    console.log(`📄 Сырой ответ API пополнений (длина: ${responseText.length}):`, responseText.substring(0, 500) + "...");
    
    // Дополнительные проверки перед парсингом JSON
    if (!responseText || responseText.trim().length === 0) {
      console.warn("⚠️ API пополнений вернул пустой ответ");
      return [];
    }
    
    // Проверяем что ответ начинается с { или [
    const trimmedResponse = responseText.trim();
    if (!trimmedResponse.startsWith('{') && !trimmedResponse.startsWith('[')) {
      console.warn("⚠️ API пополнений вернул не-JSON ответ:", trimmedResponse.substring(0, 100));
      return [];
    }
    
    let paymentsData;
    try {
      paymentsData = JSON.parse(responseText);
    } catch (parseError) {
      console.error("❌ Ошибка парсинга JSON пополнений:", parseError);
      console.log("📄 Полный ответ для отладки:", responseText);
      console.log("📏 Длина ответа:", responseText.length);
      console.log("🔤 Первые 100 символов:", responseText.substring(0, 100));
      console.log("🔤 Последние 100 символов:", responseText.substring(-100));
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

async function getCostPriceData(token: string, savedCostPrices: {[key: string]: string} = {}, realizationData: any[] = []) {
  try {
    console.log('💰 Получение данных себестоимости товаров');
    
    const costPriceData: any[] = [];
    
    // Шаг 1: Получаем карточки товаров из API контента
    let cards: any[] = [];
    try {
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

      if (response.ok) {
    const data = await response.json();
    console.log('📦 Ответ API карточек товаров:', Object.keys(data));
    
        if (data.cards && Array.isArray(data.cards)) {
          cards = data.cards;
          console.log(`📦 Количество карточек из API контента: ${cards.length}`);
        }
      } else {
        console.warn(`⚠️ Не удалось получить карточки товаров из API контента: ${response.status}`);
      }
    } catch (error) {
      console.warn('⚠️ Ошибка при получении карточек из API контента:', error);
    }

    // Получаем данные о хранении для получения предметов
    let storageData: any[] = [];
    try {
      const today = new Date().toISOString().split('T')[0];
      storageData = await getStorageData(token, today, today);
      console.log(`📦 Получено данных хранения: ${storageData.length} записей`);
    } catch (error) {
      console.warn('⚠️ Не удалось получить данные хранения:', error);
    }

    // Создаем карту предметов из данных хранения
    const subjectMap = new Map<string, string>();
    storageData.forEach((item: any) => {
      const nmId = item.nmId?.toString() || '';
      const vendorCode = item.vendorCode || '';
      const subject = item.subject || '';
      
      if (subject && nmId) {
        subjectMap.set(nmId, subject);
      }
      if (subject && vendorCode) {
        subjectMap.set(vendorCode, subject);
      }
    });

    // Создаем карту существующих карточек для быстрого поиска
    const cardsMap = new Map<string, any>();
    cards.forEach((card: any) => {
      cardsMap.set(card.nmID?.toString() || '', card);
      cardsMap.set(card.vendorCode || '', card);
    });

    // Шаг 2: Преобразуем карточки в данные себестоимости
    cards.forEach((card: any) => {
      const nmId = card.nmID?.toString() || '';
      const vendorCode = card.vendorCode || '';
      
      // Получаем предмет из разных источников
      const subject = card.object || card.subjectName || 
                     subjectMap.get(nmId) || subjectMap.get(vendorCode) || '';
      
      const baseProduct = {
        nmID: card.nmID,
        vendorCode: card.vendorCode,
        object: subject,
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

    // Шаг 3: Добавляем товары из реализации, которых нет в карточках
    console.log('📦 Добавление товаров из реализации, отсутствующих в карточках...');
    const existingProducts = new Set();
    costPriceData.forEach(item => {
      existingProducts.add(`${item.nmID}-${item.barcode}`);
      existingProducts.add(`${item.vendorCode}-${item.barcode}`);
    });

    const missingProducts = new Map<string, any>();
    
    realizationData.forEach((item: any) => {
      const nmId = item.nm_id?.toString() || '';
      const vendorCode = item.sa_name || '';
      const barcode = item.barcode || '';
      
      if (!vendorCode) return; // Пропускаем товары без артикула продавца
      
      const productKey1 = `${nmId}-${barcode}`;
      const productKey2 = `${vendorCode}-${barcode}`;
      
      // Если товара нет среди карточек, добавляем его
      if (!existingProducts.has(productKey1) && !existingProducts.has(productKey2)) {
        const uniqueKey = vendorCode; // Используем артикул продавца как уникальный ключ
        
        if (!missingProducts.has(uniqueKey)) {
          const costKey = `${nmId}-${barcode}`;
          const savedCostPrice = savedCostPrices[costKey] ? parseFloat(savedCostPrices[costKey]) : 0;
          
          // Получаем предмет из карты субъектов или используем артикул как fallback
          const subject = subjectMap.get(nmId) || subjectMap.get(vendorCode) || vendorCode;
          
          missingProducts.set(uniqueKey, {
            nmID: nmId,
            vendorCode: vendorCode,
            object: subject,
            brand: 'Неизвестный бренд',
            sizeName: 'Размер не указан',
            barcode: barcode,
            price: item.retail_price_withdisc_rub || 0,
            costPrice: savedCostPrice,
            createdAt: '',
            updatedAt: '',
            source: 'realization' // Помечаем источник данных
          });
        }
      }
    });

    // Добавляем отсутствующие товары
    missingProducts.forEach((product) => {
      costPriceData.push(product);
    });

    console.log(`✅ Обработано карточек из API: ${cards.length}`);
    console.log(`📦 Добавлено товаров из реализации: ${missingProducts.size}`);
    console.log(`📊 Итого позиций в листе "Себес": ${costPriceData.length}`);
    
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