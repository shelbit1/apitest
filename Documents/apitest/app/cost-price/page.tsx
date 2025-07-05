"use client";

import React, { useState, useEffect } from "react";

interface ProductCard {
  nmID: number;
  vendorCode: string;
  object: string;
  brand: string;
  sizeName: string;
  barcode: string;
  price: number;
}

export default function CostPricePage() {
  const [apiToken, setApiToken] = useState("");
  const [products, setProducts] = useState<ProductCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [costPrices, setCostPrices] = useState<{[key: string]: string}>({});

  // Загружаем сохраненные данные
  useEffect(() => {
    const token = localStorage.getItem("wb_api_token");
    if (token) {
      setApiToken(token);
    }
    
    // Загружаем сохраненные товары и себестоимости
    const savedProducts = localStorage.getItem("wb_cost_products");
    const savedCostPrices = localStorage.getItem("wb_cost_prices");
    
    if (savedProducts) {
      try {
        setProducts(JSON.parse(savedProducts));
      } catch (error) {
        console.error("Ошибка загрузки товаров:", error);
      }
    }
    
    if (savedCostPrices) {
      try {
        setCostPrices(JSON.parse(savedCostPrices));
      } catch (error) {
        console.error("Ошибка загрузки себестоимости:", error);
      }
    }
  }, []);

  // Получение карточек товаров
  const fetchProducts = async () => {
    if (!apiToken.trim()) {
      alert("Введите API токен");
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch("/api/wildberries/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: apiToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("❌ Ошибка API:", errorData);
        throw new Error(errorData.error || `Ошибка API: ${response.status}`);
      }

      const data = await response.json();
      console.log("✅ Получены товары:", data);
      
      // Объединяем новые товары с существующими (без дубликатов)
      const existingKeys = new Set(products.map(p => getProductKey(p)));
      const newProducts = data.filter((product: ProductCard) => !existingKeys.has(getProductKey(product)));
      
      const updatedProducts = [...products, ...newProducts];
      setProducts(updatedProducts);
      
      // Сохраняем товары в localStorage
      localStorage.setItem("wb_cost_products", JSON.stringify(updatedProducts));
      
      console.log(`✅ Добавлено ${newProducts.length} новых товаров. Всего: ${updatedProducts.length}`);
    } catch (error) {
      console.error("❌ Ошибка получения товаров:", error);
      alert("Ошибка при получении товаров: " + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Обновление себестоимости
  const updateCostPrice = (key: string, value: string) => {
    const newCostPrices = {
      ...costPrices,
      [key]: value
    };
    setCostPrices(newCostPrices);
    
    // Сохраняем в localStorage при каждом изменении
    localStorage.setItem("wb_cost_prices", JSON.stringify(newCostPrices));
  };

  // Получение уникального ключа для каждого товара
  const getProductKey = (product: ProductCard): string => {
    return `${product.nmID}-${product.barcode}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-800">
              💰 Управление себестоимостью
            </h1>
            <button
              onClick={() => window.location.href = '/'}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              ← Назад
            </button>
          </div>

          {/* Секция API токена */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">🔑 API Токен</h2>
            <div className="flex gap-4">
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="eyJhbGciOiJFUzI1NiIs..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={fetchProducts}
                disabled={isLoading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                {isLoading ? "Загрузка..." : "Загрузить товары"}
              </button>
            </div>
          </div>

          {/* Таблица товаров */}
          {products.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Артикул ВБ</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Артикул продавца</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Товар</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Бренд</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Размер</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Штрихкод</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Цена</th>
                    <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Себестоимость</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr key={getProductKey(product)} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border border-gray-300 px-4 py-2">{product.nmID}</td>
                      <td className="border border-gray-300 px-4 py-2">{product.vendorCode}</td>
                      <td className="border border-gray-300 px-4 py-2">{product.object}</td>
                      <td className="border border-gray-300 px-4 py-2">{product.brand}</td>
                      <td className="border border-gray-300 px-4 py-2">{product.sizeName}</td>
                      <td className="border border-gray-300 px-4 py-2">{product.barcode}</td>
                      <td className="border border-gray-300 px-4 py-2">{product.price} ₽</td>
                      <td className="border border-gray-300 px-4 py-2">
                        <input
                          type="number"
                          value={costPrices[getProductKey(product)] || ''}
                          onChange={(e) => updateCostPrice(getProductKey(product), e.target.value)}
                          placeholder="0.00"
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Информация о сохранении */}
          {products.length > 0 && (
            <div className="mt-8 text-center">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                <p className="text-green-800 font-semibold">✅ Данные автоматически сохраняются</p>
                <p className="text-green-600 text-sm mt-2">
                  Всего товаров: {products.length} | Заполнено себестоимостей: {Object.keys(costPrices).filter(key => costPrices[key] && costPrices[key] !== '0').length}
                </p>
              </div>
              <button
                onClick={() => {
                  const filledCount = Object.keys(costPrices).filter(key => costPrices[key] && costPrices[key] !== '0').length;
                  alert(`Данные сохранены!\n\nВсего товаров: ${products.length}\nЗаполнено себестоимостей: ${filledCount}\n\nДанные будут использованы в основном отчете.`);
                }}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
              >
                📊 Статистика сохранения
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 