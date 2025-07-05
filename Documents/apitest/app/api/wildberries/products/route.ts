import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Начало получения карточек товаров");
    
    const { token } = await request.json();

    if (!token) {
      console.error("❌ Отсутствует токен");
      return NextResponse.json(
        { error: "Токен обязателен" },
        { status: 400 }
      );
    }

    console.log(`🔑 Токен: ${token.substring(0, 20)}...`);

    // URL API для получения карточек товаров
    const apiUrl = "https://content-api.wildberries.ru/content/v2/get/cards/list";
    
    // Тело запроса для получения карточек
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

    console.log(`📡 URL запроса: ${apiUrl}`);
    console.log(`📄 Тело запроса:`, JSON.stringify(requestBody, null, 2));
    console.log(`🔑 Заголовок авторизации: ${token.substring(0, 30)}...`);
    
    // Первая попытка с обычной авторизацией
    let response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody)
    });

    // Если не удалось, пробуем с Bearer префиксом
    if (!response.ok && response.status === 401) {
      console.log("🔄 Пробуем авторизацию с Bearer префиксом...");
      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody)
      });
    }
    
    console.log(`📊 Ответ API: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Ошибка API Wildberries: ${response.status} ${response.statusText}`);
      console.error(`❌ Тело ошибки: ${errorText}`);
      console.error(`❌ Заголовки запроса:`, Object.fromEntries(response.headers.entries()));
      
      let errorMessage = `Ошибка API Wildberries: ${response.status}`;
      if (response.status === 401) {
        errorMessage = "Неверный или недействительный API токен. Убедитесь, что токен имеет права на категорию 'Контент'";
      } else if (response.status === 403) {
        errorMessage = "Нет доступа к данным. Проверьте права токена на категорию 'Контент'";
      } else if (response.status === 429) {
        errorMessage = "Превышен лимит запросов API. Попробуйте позже";
      }
      
      return NextResponse.json(
        { error: `${errorMessage}. Детали: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log(`✅ Получено данных:`, JSON.stringify(data, null, 2));

    // Извлекаем карточки из ответа
    const cards = data.cards || [];
    console.log(`📦 Количество карточек: ${cards.length}`);

    // Преобразуем данные, разворачивая каждый размер в отдельную строку
    const products: any[] = [];
    
    cards.forEach((card: any) => {
      const baseProduct = {
        nmID: card.nmID,
        vendorCode: card.vendorCode,
        object: card.object || '',
        brand: card.brand || ''
      };

      if (card.sizes && card.sizes.length > 0) {
        // Для каждого размера создаем отдельную запись
        card.sizes.forEach((size: any) => {
          if (size.skus && size.skus.length > 0) {
            // Для каждого SKU в размере создаем отдельную строку
            size.skus.forEach((sku: string) => {
              products.push({
                ...baseProduct,
                sizeName: size.techSize || size.wbSize || 'Без размера',
                barcode: sku,
                price: size.price || 0
              });
            });
          } else {
            // Если нет SKU, все равно добавляем размер
            products.push({
              ...baseProduct,
              sizeName: size.techSize || size.wbSize || 'Без размера',
              barcode: '',
              price: size.price || 0
            });
          }
        });
      } else {
        // Если нет размеров, добавляем товар без размера
        products.push({
          ...baseProduct,
          sizeName: 'Без размера',
          barcode: '',
          price: 0
        });
      }
    });

    console.log(`✅ Обработано карточек: ${cards.length}, развернуто позиций: ${products.length}`);

    return NextResponse.json(products, { status: 200 });

  } catch (error) {
    console.error("💥 Критическая ошибка API:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: "Используйте POST запрос для получения карточек товаров" },
    { status: 405 }
  );
} 