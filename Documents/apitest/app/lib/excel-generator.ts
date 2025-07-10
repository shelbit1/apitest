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