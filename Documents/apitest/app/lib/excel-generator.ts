// Модуль для создания Excel отчетов
import * as XLSX from "xlsx";
import { cleanCampaignName, mapAdvertStatus, mapAdvertType, mapPaymentType, mapPaymentStatus } from './data-mappers';
import * as fs from "fs";
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
  sku?: string;
}

// Основная функция для создания Excel отчета
export async function createExcelReport(
  data: any[], 
  storageData: any[], 
  acceptanceData: any[], 
  advertData: any[], 
  productsData: any[], 
  paymentsData: any[], 
  campaigns: Campaign[], 
  financialData: FinancialData[], 
  costPriceData: any[], 
  productAnalyticsData: any[], 
  startDate: string, 
  endDate: string, 
  token: string, 
  includeFinanceSheet: boolean = false
): Promise<Buffer> {
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
  
  // Создаем рабочую книгу
  const workbook = XLSX.utils.book_new();
  
  // Создаем лист из данных
  const worksheet = XLSX.utils.json_to_sheet(excelData);
  
  // Добавляем лист в книгу
  XLSX.utils.book_append_sheet(workbook, worksheet, "Отчет детализации");
  
  // Добавляем лист "По периодам"
  addPeriodsSheet(workbook, startDate, endDate);
  
  // Добавляем лист с данными хранения
  if (storageData.length > 0) {
    addStorageSheet(workbook, storageData);
  }
  
  // Добавляем лист с данными приемки
  if (acceptanceData.length > 0) {
    addAcceptanceSheet(workbook, acceptanceData);
  }
  
  // Добавляем лист с данными товаров
  if (productsData.length > 0) {
    addProductsSheet(workbook, productsData);
  }
  
  // Добавляем лист с данными платежей
  if (paymentsData.length > 0) {
    addPaymentsSheet(workbook, paymentsData);
  }
  
  // Добавляем лист с рекламными кампаниями
  if (campaigns.length > 0) {
    addCampaignsSheet(workbook, campaigns);
  }
  
  // Добавляем лист с финансовыми данными РК (если запрошен)
  if (includeFinanceSheet && financialData.length > 0) {
    addFinancialSheet(workbook, financialData);
  }
  
  // Добавляем лист с себестоимостью
  if (costPriceData.length > 0) {
    addCostPriceSheet(workbook, costPriceData);
  }
  
  // Добавляем лист с аналитикой товаров
  if (productAnalyticsData.length > 0) {
    addProductAnalyticsSheet(workbook, productAnalyticsData);
  }
  
  // Генерируем Excel файл
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  
  console.log(`✅ Excel отчет создан за ${Date.now() - startTime}ms`);
  
  return buffer;
}

// Функция для добавления листа с периодами (точная копия из Google таблицы)
export function addPeriodsSheet(workbook: XLSX.WorkBook, startDate: string, endDate: string) {
  console.log("📊 Создание листа 'По периодам'...");
  const periodsSheet = XLSX.utils.aoa_to_sheet([
    // Строки 1-2: Период дат
    ['от', startDate],
    ['до', endDate],
    [''],
    ['------------------------------------------'],
    [''],
    
    // Строка 6: Заголовок
    ['Движение товара в штуках'],
    // Строки 7-19: Движение в штуках
    ['Доставки', { f: "SUMIF('Отчет детализации'!M:M,\">0\",'Отчет детализации'!M:M)", z: '#,##0.00' }],
    ['Отказы без возвратов', 
     { f: "SUMIF('Отчет детализации'!R:R,\"От клиента при отмене\",'Отчет детализации'!N:N)", z: '#,##0.00' },
     'От клиента при отмене'],
    ['% отказов', { f: "B8/B7", z: '0.00%' }],
    [''],
    ['Продажи',
     { f: "SUMIF('Отчет детализации'!E:E,\"Продажа\",'Отчет детализации'!I:I)", z: '#,##0.00' },
     'Продажа'],
    ['Возвраты',
     { f: "SUMIF('Отчет детализации'!E:E,\"Возврат\",'Отчет детализации'!I:I)", z: '#,##0.00' },
     'Возврат'],
    ['% возвратов', { f: "B12/B11", z: '0.00%' }],
    [''],
    ['Итого кол-во реализованного товара', { f: "B11-B12", z: '#,##0.00' }],
    ['% выкупа', { f: "B15/B7", z: '0.00%' }],
    [''],
    ['Продажи + корректировки',
     { f: "SUMIF('Отчет детализации'!E:E,\"Продажа\",'Отчет детализации'!I:I)", z: '#,##0.00' },
     'Продажа'],
    ['Корректировки в перечислении за товар шт',
     { f: "SUMIF('Отчет детализации'!F:F,\"Добровольная компенсация при возврате\",'Отчет детализации'!I:I)", z: '#,##0.00' },
     'Добровольная компенсация при возврате'],
    [''],
    ['------------------------------------------'],
    [''],
    
    // Строка 23: Движение товара в рублях до СПП
    ['Движение товара в рублях по цене продавца с учетом согласованной скидки (до СПП)'],
    ['Продажи до СПП', 
     { f: "SUMIF('Отчет детализации'!E:E,\"Продажа\",'Отчет детализации'!J:J)", z: '#,##0.00' },
     'Продажа'],
    ['Возвраты до СПП',
     { f: "SUMIF('Отчет детализации'!E:E,\"Возврат\",'Отчет детализации'!J:J)", z: '#,##0.00' },
     'Возврат'],
    ['Корректировка в продажах до СПП', { v: 0, z: '#,##0.00' }],
         ['Вся стоимость реализованного товара до СПП', { f: "B24-B25", z: '#,##0.00' }],
     ['Средний чек продажи до СПП', { f: "B27/B15", z: '#,##0.00' }],
    ['% комиссии ВБ до СПП', { f: "(B24-B34)/B24", z: '0.00%' }],
    [''],
    ['------------------------------------------'],
    [''],
    
    // Строка 33: Движение товара в рублях после СПП
    ['Движение товара в рублях по цене с учетом скидки постоянного покупателя (после СПП)'],
    ['Продажи после СПП',
     { f: "SUMIF('Отчет детализации'!E:E,\"Продажа\",'Отчет детализации'!L:L)", z: '#,##0.00' },
     'Продажа'],
    ['Возвраты после СПП',
     { f: "SUMIF('Отчет детализации'!E:E,\"Возврат\",'Отчет детализации'!L:L)", z: '#,##0.00' },
     'Возврат'],
    ['Корректировки в продажах после СПП', { v: 0, z: '#,##0.00' }, 'Коррекция продаж'],
    ['Вся стоимость реализованного товара после СПП', { f: "B34-B35", z: '#,##0.00' }],
    ['Средний чек продажи после СПП', { f: "B34/B11", z: '#,##0.00' }],
         ['Сумма СПП', { f: "B24-B34", z: '#,##0.00' }],
     ['% СПП', { f: "1-B38/B28", z: '0.00%' }],
    [''],
    ['------------------------------------------'],
    [''],
    
    // Строка 44: К перечислению за товар
    ['К перечислению за товар'],
    ['Корректировки в перечислении за товар',
     { f: "SUMIF('Отчет детализации'!F:F,\"Добровольная компенсация при возврате\",'Отчет детализации'!L:L)", z: '#,##0.00' },
     'Добровольная компенсация при возврате'],
    ['Продажи фактические (цена продажи - комиссия ВБ)',
     { f: "SUMIF('Отчет детализации'!E:E,\"Продажа\",'Отчет детализации'!L:L)", z: '#,##0.00' },
     'Продажа'],
    ['Возвраты полученный по факту за возврат по формуле (Цена продажи - комиссия ВБ)',
     { f: "SUMIF('Отчет детализации'!E:E,\"Возврат\",'Отчет детализации'!L:L)", z: '#,##0.00' },
     'Возврат'],
    ['К перечислению за товар', { f: "B46-B47", z: '#,##0.00' }],
    [''],
    ['------------------------------------------'],
    [''],
    
    // Строка 52: Статьи удержаний Вайлдберриз
    ['Статьи удержаний Вайлдберриз'],
    ['Плановая комиссия + эквайринг', { f: "B24-B48", z: '#,##0.00' }],
    ['Фактическая комиссия', { f: "B34-B48", z: '#,##0.00' }],
    ['Стоимость логистики',
     { f: "SUM('Отчет детализации'!O:O)", z: '#,##0.00' }],
    ['Логистика на единицу товара', { f: "B55/B15", z: '#,##0.00' }],
    ['% логистики от реализации до СПП', { f: "B55/B24", z: '0.00%' }],
    ['Штрафы',
     { f: "SUM('Отчет детализации'!P:P)", z: '#,##0.00' }],
    ['Доплаты', { v: 0, z: '#,##0.00' }],
    ['Хранение',
     { f: "SUM('Отчет детализации'!AB:AB)", z: '#,##0.00' }],
    ['% хранения от реализации до СПП', { f: "B60/B24", z: '0.00%' }],
    ['Платная приемка',
     { f: "SUM('Отчет детализации'!AD:AD)", z: '#,##0.00' }],
    [''],
    ['"Реклама баланс + счет"',
     { f: "SUMIF('Отчет детализации'!R:R,\"Оказание услуг «ВБ.Продвижение»\",'Отчет детализации'!AC:AC)", z: '#,##0.00' },
     'Оказание услуг «ВБ.Продвижение»'],
    ['% ДРР (доля рекламных расходов) от реализации до СПП', { f: "B63/B15", z: '#,##0.00' }],
    ['% ДРР (доля рекламных расходов) от реализации до СПП', { f: "B63/B24", z: '0.00%' }],
    [''],
    ['ИМИЗР (использование механик искусственного завышения рейтинга)', { v: 0, z: '#,##0.00' }],
    [''],
    ['Отзывы', { v: 0, z: '#,##0.00' }, 'Списание за отзыв'],
    ['Кредит', { f: "B69+B70", z: '#,##0.00' }],
    ['Тело кредита', { f: "B69*0.82", z: '#,##0.00' }],
    ['Процент кредита', { f: "B69*0.18", z: '#,##0.00' }],
    ['% кредита от реализации до СПП', { f: "B69/B24", z: '0.00%' }],
    ['Прочие удержания', { v: 0, z: '#,##0.00' }],
    ['% прочих удержаний от реализации до СПП', { f: "B73/B24", z: '0.00%' }],
    ['Итого стоимость всех услуг ВБ от реализации до СПП',
     { f: "B55+B58+B60+B62+B63+B67+B69+B73", z: '#,##0.00' }],
    ['% всех услуг ВБ от реализации до СПП', { f: "B75/B24", z: '0.00%' }],
    ['Итого стоимость всех услуг ВБ от реализации после СПП', { f: "B55+B60", z: '#,##0.00' }],
    ['% всех услуг ВБ от реализации после СПП', { f: "B77/B37", z: '0.00%' }],
    [''],
    ['------------------------------------------'],
    [''],
    
    // Строка 81: Перечисления, проверка расчетов
    ['Перечисления, проверка расчетов'],
    ['Итого к оплате', { f: "B48", z: '#,##0.00' }],
    ['Итого к оплате на единицу товара', { f: "B82/B15", z: '#,##0.00' }],
    [''],
    ['------------------------------------------'],
    [''],
    
    // Строка 87: Прямые расходы
    ['Прямые расходы'],
    ['Себестоимость реализованного товара', { f: "B15*700", z: '#,##0.00' }],
    ['% себестоимости от суммы реализации до СПП', { f: "B88/B24", z: '0.00%' }],
    ['Средняя себестоимость на единицу товара', { f: "B88/B15", z: '#,##0.00' }],
    ['Себестоимость утилизированного товара', { v: 0, z: '#,##0.00' }],
    [''],
    ['------------------------------------------'],
    [''],
    
    // Строка 95: Итоги
    ['Итоги'],
    ['Прибыль МП (без внешки)', { f: "B82-B88", z: '#,##0.00' }],
    ['Операционная прибыль МП на единицу', { f: "B96/B15", z: '#,##0.00' }],
    ['Маржа до СПП', { f: "B96/B24", z: '0.00%' }],
    ['Маржа после СПП', { f: "B96/B37", z: '0.00%' }],
    ['Рентабельность', { f: "B96/B88", z: '0.00%' }],
  ]);
  
  XLSX.utils.book_append_sheet(workbook, periodsSheet, "По периодам");
  console.log("✅ Лист 'По периодам' создан успешно");
}

// Функция для добавления листа с периодами из шаблона
export function addPeriodsSheetFromTemplate(workbook: XLSX.WorkBook, templatePath: string, startDate: string, endDate: string): boolean {
  console.log(`📊 Попытка добавить лист 'По периодам' из шаблона: ${templatePath}`);
  try {
    const templateWorkbook = XLSX.readFile(templatePath, { cellFormula: true, cellNF: true, cellStyles: true });
    const templateSheet = templateWorkbook.Sheets["По периодам"];
    if (templateSheet) {
      // Добавляем копию листа в новую книгу
      const sheetCopy: XLSX.WorkSheet = JSON.parse(JSON.stringify(templateSheet));
      // Обновляем даты периода в ячейках B1 и B2, если они существуют
      const startCell = sheetCopy["B1"];
      if (startCell) startCell.v = startDate;
      const endCell = sheetCopy["B2"];
      if (endCell) endCell.v = endDate;
      XLSX.utils.book_append_sheet(workbook, sheetCopy, "По периодам");
      console.log("✅ Лист 'По периодам' добавлен из шаблона");
      return true;
    } else {
      console.warn(`⚠️ Лист \"По периодам\" не найден в шаблоне по пути: ${templatePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Ошибка при попытке добавить лист 'По периодам' из шаблона:`, error);
    return false;
  }
}

// Функция для добавления листа с данными хранения
function addStorageSheet(workbook: XLSX.WorkBook, storageData: any[]) {
  const storageSheet = XLSX.utils.json_to_sheet(storageData.map(item => ({
    "Артикул WB": item.nmId || "",
    "Артикул продавца": item.vendorCode || "",
    "Склад": item.warehouseName || "",
    "Количество": item.quantity || 0,
    "Цена": item.price || 0,
    "Дата и время обновления": item.lastChangeDate || "",
    "Баркод": item.barcode || "",
    "Предмет": item.subject || "",
    "Категория": item.category || "",
    "Бренд": item.brand || ""
  })));
  
  XLSX.utils.book_append_sheet(workbook, storageSheet, "Хранение");
}

// Функция для добавления листа с данными приемки
function addAcceptanceSheet(workbook: XLSX.WorkBook, acceptanceData: any[]) {
  const acceptanceSheet = XLSX.utils.json_to_sheet(acceptanceData.map(item => ({
    "Номер поставки": item.incomeId || "",
    "Артикул WB": item.nmId || "",
    "Артикул продавца": item.vendorCode || "",
    "Баркод": item.barcode || "",
    "Количество": item.quantity || 0,
    "Цена": item.totalPrice || 0,
    "Дата поступления": item.dateClose || "",
    "Склад": item.warehouseName || "",
    "Статус": item.status || ""
  })));
  
  XLSX.utils.book_append_sheet(workbook, acceptanceSheet, "Приемка");
}

// Функция для добавления листа с данными товаров
function addProductsSheet(workbook: XLSX.WorkBook, productsData: any[]) {
  const productsSheet = XLSX.utils.json_to_sheet(productsData.map(item => ({
    "Артикул WB": item.nmId || "",
    "Артикул продавца": item.vendorCode || "",
    "Предмет": item.object || "",
    "Бренд": item.brand || "",
    "Название": item.title || "",
    "Фото": item.photo || "",
    "Размеры": item.dimensions || "",
    "Характеристики": item.characteristics || "",
    "Цена": item.price || 0,
    "Скидка": item.discount || 0,
    "Рейтинг": item.rating || 0,
    "Отзывы": item.reviewsCount || 0
  })));
  
  XLSX.utils.book_append_sheet(workbook, productsSheet, "Товары");
}

// Функция для добавления листа с данными платежей
function addPaymentsSheet(workbook: XLSX.WorkBook, paymentsData: any[]) {
  const paymentsSheet = XLSX.utils.json_to_sheet(paymentsData.map(item => ({
    "Номер операции": item.operationId || "",
    "Дата операции": item.date || "",
    "Тип операции": item.type || "",
    "Сумма": item.amount || 0,
    "Баланс": item.balance || 0,
    "Комментарий": item.comment || "",
    "Тип платежа": mapPaymentType(item.paymentType || 0),
    "Статус": mapPaymentStatus(item.status || 0)
  })));
  
  XLSX.utils.book_append_sheet(workbook, paymentsSheet, "Платежи");
}

// Функция для добавления листа с рекламными кампаниями
function addCampaignsSheet(workbook: XLSX.WorkBook, campaigns: Campaign[]) {
  const campaignsSheet = XLSX.utils.json_to_sheet(campaigns.map(item => ({
    "ID кампании": item.advertId || "",
    "Название": cleanCampaignName(item.name || ""),
    "Тип": mapAdvertType(item.type || 0),
    "Статус": mapAdvertStatus(item.status || 0),
    "Дневной бюджет": item.dailyBudget || 0,
    "Дата создания": item.createTime || "",
    "Дата изменения": item.changeTime || "",
    "Дата запуска": item.startTime || "",
    "Дата завершения": item.endTime || ""
  })));
  
  XLSX.utils.book_append_sheet(workbook, campaignsSheet, "Кампании");
}

// Функция для добавления листа с финансовыми данными РК
function addFinancialSheet(workbook: XLSX.WorkBook, financialData: FinancialData[]) {
  const financialSheet = XLSX.utils.json_to_sheet(financialData.map(item => ({
    "ID кампании": item.advertId || "",
    "Дата": item.date || "",
    "Сумма": item.sum || 0,
    "Счет": item.bill ? "Да" : "Нет",
    "Тип": item.type || "",
    "Номер документа": item.docNumber || "",
    "SKU": item.sku || ""
  })));
  
  XLSX.utils.book_append_sheet(workbook, financialSheet, "Финансы РК");
}

// Функция для добавления листа с себестоимостью
function addCostPriceSheet(workbook: XLSX.WorkBook, costPriceData: any[]) {
  const costPriceSheet = XLSX.utils.json_to_sheet(costPriceData.map(item => ({
    "Артикул продавца": item.vendorCode || "",
    "Название": item.name || "",
    "Себестоимость": item.costPrice || 0,
    "Валюта": item.currency || "RUB",
    "Дата обновления": item.lastUpdated || ""
  })));
  
  XLSX.utils.book_append_sheet(workbook, costPriceSheet, "Себестоимость");
}

// Функция для добавления листа с аналитикой товаров
function addProductAnalyticsSheet(workbook: XLSX.WorkBook, productAnalyticsData: any[]) {
  const analyticsSheet = XLSX.utils.json_to_sheet(productAnalyticsData);
  XLSX.utils.book_append_sheet(workbook, analyticsSheet, "Аналитика");
} 