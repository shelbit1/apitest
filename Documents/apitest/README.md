# Wildberries API Integration

Простой API для интеграции с Wildberries и генерации Excel отчетов.

## Основные возможности

- Получение данных о продажах с Wildberries API
- Генерация Excel отчетов с подробной статистикой
- Получение данных о периодах отчетности
- Медиа-статистика продуктов

## Установка

```bash
npm install
npm run dev
```

## API Endpoints

### Wildberries API

- `GET /api/wildberries/report` - Получение отчета о продажах
- `GET /api/wildberries/periods` - Получение периодов отчетности
- `GET /api/wildberries/products` - Получение данных о продуктах
- `GET /api/wildberries/media-stats` - Получение медиа-статистики

## Технологии

- Next.js 15.1.6
- TypeScript
- ExcelJS для генерации отчетов
- Tailwind CSS
