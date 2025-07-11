import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const fileName = body.fileName;
    
    if (!fileName) {
      return NextResponse.json(
        { error: "Имя файла не указано" },
        { status: 400 }
      );
    }

    // Проверяем, что имя файла безопасно
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return NextResponse.json(
        { error: "Недопустимое имя файла" },
        { status: 400 }
      );
    }

    // Ищем файл в папке reports и её подпапках
    const reportsDir = path.join(process.cwd(), 'reports');
    
    try {
      // Рекурсивно ищем файл в папке reports
      const fileInfo = await findFileWithPath(reportsDir, fileName);
      
      return NextResponse.json({
        exists: fileInfo.exists,
        fileName,
        relativePath: fileInfo.relativePath
      });
    } catch (error) {
      console.error("❌ Ошибка поиска файла:", error);
      return NextResponse.json({
        exists: false,
        fileName,
        relativePath: null
      });
    }
    
  } catch (error) {
    console.error("❌ Ошибка проверки файла:", error);
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

// Рекурсивно ищем файл в папке и подпапках, возвращаем относительный путь
async function findFileWithPath(dir: string, fileName: string, relativePath: string = ''): Promise<{exists: boolean, relativePath: string | null}> {
  try {
    const items = await fs.readdir(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const newRelativePath = relativePath ? `${relativePath}/${item.name}` : item.name;
      
      if (item.isFile() && item.name === fileName) {
        // Файл найден
        return {
          exists: true,
          relativePath: newRelativePath
        };
      } else if (item.isDirectory()) {
        // Рекурсивно ищем в подпапке
        const result = await findFileWithPath(fullPath, fileName, newRelativePath);
        if (result.exists) return result;
      }
    }
    
    return { exists: false, relativePath: null };
  } catch (error) {
    console.error(`❌ Ошибка чтения папки ${dir}:`, error);
    return { exists: false, relativePath: null };
  }
} 