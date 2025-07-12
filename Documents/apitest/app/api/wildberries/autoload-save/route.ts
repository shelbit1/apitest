import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";
// Импортируем обработчик генерации отчета напрямую, чтобы избежать HTTP-запроса к самому себе
import { POST as generateReport } from "../report/route";

// Увеличиваем таймаут выполнения до 10 минут для автозагрузки
export const runtime = 'nodejs';
export const maxDuration = 600; // 10 минут

export async function POST(request: NextRequest) {
  try {
    console.log("🚀 Начало автозагрузки отчета с сохранением на сервер");
    
    const { token, startDate, endDate, cabinetName, cabinetId } = await request.json();

    if (!token || !startDate || !endDate || !cabinetId) {
      console.error("❌ Отсутствуют обязательные параметры");
      return NextResponse.json(
        { error: "Токен, дата начала, дата окончания и название кабинета обязательны" },
        { status: 400 }
      );
    }

    // Создаем папку reports если её нет
    const reportsDir = path.join(process.cwd(), 'reports');
    try {
      await fs.access(reportsDir);
    } catch {
      await fs.mkdir(reportsDir, { recursive: true });
      console.log("📁 Создана папка reports/");
    }

    // Создаем подпапку для кабинета: cabinet_<id>
    const cabinetDirName = `cabinet_${cabinetId}`;
    const cabinetDir = path.join(reportsDir, cabinetDirName);
    try {
      await fs.access(cabinetDir);
    } catch {
      await fs.mkdir(cabinetDir, { recursive: true });
      console.log(`📁 Создана папка для кабинета: ${cabinetDir}`);
    }

    console.log(`📅 Период отчета: ${startDate} - ${endDate}`);
    console.log(`🏢 Кабинет: ${cabinetName}`);

    // Вызываем генератор отчета с таймаутом
    console.log("📊 Генерируем отчет локально…");

    const internalRequestBody = {
      token,
      startDate,
      endDate,
      costPricesData: {}, // Пустые данные себестоимости для автозагрузки
    };

    const internalRequest = new NextRequest(new URL('/api/wildberries/report', request.url), {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(internalRequestBody),
    });

    // Добавляем таймаут в 5 минут для генерации отчета
    const reportResponse = await Promise.race([
      generateReport(internalRequest),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Таймаут генерации отчета (5 минут)')), 5 * 60 * 1000)
      )
    ]);

    if (!reportResponse.ok) {
      console.error(`❌ Ошибка генерации отчета: ${reportResponse.status}`);
      let errorData;
      try {
        errorData = await reportResponse.json();
      } catch {
        errorData = { error: `HTTP ${reportResponse.status}` };
      }

      return NextResponse.json(
        { error: errorData.error || "Ошибка генерации отчета" },
        { status: reportResponse.status }
      );
    }

    // Получаем Excel-файл как буфер
    const buffer = Buffer.from(await reportResponse.arrayBuffer());
 
    console.log(`✅ Получен отчет размером: ${(buffer.length / 1024).toFixed(2)} KB`);

    // Сохраняем файл на сервер
    const fileName = `${cabinetId}_${startDate}_${endDate}.xlsx`;
    const filePath = path.join(cabinetDir, fileName);
    
    await fs.writeFile(filePath, buffer);
    console.log(`✅ Отчет сохранен: ${filePath}`);

    // Формируем относительный путь для доступа через URL
    const relativePath = `${cabinetDirName}/${fileName}`;

    // Возвращаем информацию об успешном сохранении
    return NextResponse.json({
      success: true,
      fileName: fileName,
      filePath: filePath,
      relativePath: relativePath,
      size: buffer.length,
      savedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("💥 Критическая ошибка автозагрузки:", error);
    
    let errorMessage = "Внутренняя ошибка сервера";
    
    if (error instanceof Error) {
      console.error("📄 Сообщение ошибки:", error.message);
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 