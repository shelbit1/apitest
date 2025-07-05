// Модуль для мапинга различных типов и статусов данных Wildberries

// Функция маппинга типа кампании
export function mapCampaignType(type: number): string {
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

// Функция маппинга статуса кампании
export function mapCampaignStatus(status: number): string {
  switch (status) {
    case 4: return 'Готова к запуску';
    case 7: return 'Завершена';
    case 8: return 'Отклонена';
    case 9: return 'Активна';
    case 11: return 'Приостановлена';
    default: return `Неизвестный статус (${status})`;
  }
}

// Функция маппинга статуса рекламы
export function mapAdvertStatus(status: number): string {
  switch (status) {
    case 4: return 'готова к запуску';
    case 7: return 'завершена';
    case 8: return 'отказался';
    case 9: return 'активна';
    case 11: return 'приостановлена';
    default: return 'неизвестный статус';
  }
}

// Функция маппинга типа рекламы
export function mapAdvertType(type: number): string {
  switch (type) {
    case 4: return 'кампания в каталоге';
    case 5: return 'кампания в карточке товара';
    case 6: return 'кампания в поиске';
    case 7: return 'кампания в рекомендациях на главной странице';
    case 8: return 'автоматическая кампания';
    case 9: return 'поиск + каталог';
    default: return 'неизвестный тип кампании';
  }
}

// Функция маппинга типа источника платежа
export function mapPaymentType(type: number): string {
  switch (type) {
    case 0: return 'Счёт';
    case 1: return 'Баланс';
    case 3: return 'Картой';
    default: return `Неизвестный тип (${type})`;
  }
}

// Функция маппинга статуса платежа
export function mapPaymentStatus(statusId: number): string {
  switch (statusId) {
    case 1: return 'Проведен';
    case 2: return 'Отклонен';
    case 3: return 'В обработке';
    default: return `Неизвестный статус (${statusId})`;
  }
}

// Функция очистки названия кампании от эмодзи
export function cleanCampaignName(name: string): string {
  if (!name) return "";
  // Удаляем все эмодзи-кружки и другие символы
  return name.replace(/[🟡🟢🔴⚪⚫🔵🟠🟣🟤🔶🔷⭐⚡️💎✨🎯🏆🔥💰🚀⭕❌✅❤️💙💚💛🧡💜🤍🖤💯🎪🎨🎭🎯🌟🔮]/g, '').trim();
}

// Функция добавления дней к дате
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Функция форматирования даты
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
} 