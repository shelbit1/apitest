import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');
    
    if (!filePath) {
      return NextResponse.json(
        { error: "Путь к файлу не указан" },
        { status: 400 }
      );
    }

    // Проверяем, что путь находится в папке reports
    const reportsDir = path.join(process.cwd(), 'reports');
    const fullPath = path.resolve(filePath);
    
    if (!fullPath.startsWith(reportsDir)) {
      return NextResponse.json(
        { error: "Доступ к файлу запрещен" },
        { status: 403 }
      );
    }

    try {
      const fileBuffer = await fs.readFile(fullPath);
      const fileName = path.basename(fullPath);
      
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': fileBuffer.length.toString(),
        },
      });
    } catch (fileError) {
      console.error("❌ Ошибка чтения файла:", fileError);
      return NextResponse.json(
        { error: "Файл не найден" },
        { status: 404 }
      );
    }
    
  } catch (error) {
    console.error("❌ Ошибка скачивания файла:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
} 