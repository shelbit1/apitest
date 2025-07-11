import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    // Ожидаем параметры (в Next.js 15+ они асинхронные)
    const resolvedParams = await params;
    
    // Получаем путь к файлу из URL и декодируем русские символы
    const rawFilePath = resolvedParams.slug.join('/');
    const filePath = decodeURIComponent(rawFilePath);
    
    console.log("📁 Raw path:", rawFilePath);
    console.log("📁 Decoded path:", filePath);
    
    if (!filePath) {
      return new NextResponse("Файл не найден", { status: 404 });
    }

    // Проверяем безопасность пути
    if (filePath.includes('..') || filePath.includes('\\')) {
      return new NextResponse("Недопустимый путь к файлу", { status: 403 });
    }

    // Полный путь к файлу
    const reportsDir = path.join(process.cwd(), 'reports');
    const fullPath = path.join(reportsDir, filePath);
    
    console.log("📁 Reports dir:", reportsDir);
    console.log("📁 Full path:", fullPath);
    
    // Проверяем что файл находится в папке reports
    if (!fullPath.startsWith(reportsDir)) {
      return new NextResponse("Доступ запрещен", { status: 403 });
    }

    try {
      // Проверяем существование файла
      await fs.access(fullPath);
      
      // Читаем файл
      const fileBuffer = await fs.readFile(fullPath);
      const fileName = path.basename(fullPath);
      
      // Определяем Content-Type по расширению
      let contentType = 'application/octet-stream';
      const ext = path.extname(fileName).toLowerCase();
      
      switch (ext) {
        case '.xlsx':
        case '.xls':
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;
        case '.json':
          contentType = 'application/json';
          break;
        case '.csv':
          contentType = 'text/csv';
          break;
        case '.pdf':
          contentType = 'application/pdf';
          break;
      }
      
      // Возвращаем файл
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
          'Cache-Control': 'public, max-age=3600', // Кешируем на 1 час
        },
      });
      
    } catch (fileError) {
      console.error("❌ Файл не найден:", fullPath);
      return new NextResponse("Файл не найден", { status: 404 });
    }
    
  } catch (error) {
    console.error("❌ Ошибка обработки запроса файла:", error);
    return new NextResponse("Внутренняя ошибка сервера", { status: 500 });
  }
} 