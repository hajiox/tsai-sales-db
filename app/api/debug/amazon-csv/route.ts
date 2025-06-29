// /app/api/debug/amazon-csv/route.ts ver.1

import { NextRequest, NextResponse } from 'next/server';

// Amazon CSVパース（TSV形式）
function parseAmazonCsvLine(line: string): string[] {
  const columns: string[] = [];
  let currentColumn = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && inQuotes && line[i + 1] === '"') {
      currentColumn += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === '\t' && !inQuotes) {
      columns.push(currentColumn.trim());
      currentColumn = '';
    } else {
      currentColumn += char;
    }
  }
  columns.push(currentColumn.trim());
  return columns;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('csvFile') as File;
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'ファイルが見つかりません' });
    }

    const csvContent = await file.text();
    const lines = csvContent.split('\n').filter((line: string) => line.trim() !== '');
    
    console.log('=== Amazon CSV デバッグ解析 ===');
    console.log('総行数:', lines.length);
    
    // ヘッダー行を表示
    if (lines.length > 0) {
      const headerColumns = parseAmazonCsvLine(lines[0]);
      console.log('ヘッダー行の列数:', headerColumns.length);
      console.log('ヘッダー列:');
      headerColumns.forEach((col, index) => {
        console.log(`  ${String.fromCharCode(65 + index)}列(${index}): "${col}"`);
      });
    }
    
    // データ行の最初の5行を表示
    console.log('\n=== データ行サンプル ===');
    const dataLines = lines.slice(1, 6);
    dataLines.forEach((line, index) => {
      const columns = parseAmazonCsvLine(line);
      console.log(`\n行${index + 2}:`);
      console.log(`  C列(2): "${columns[2] || ''}"`);
      console.log(`  N列(13): "${columns[13] || ''}"`);
      console.log(`  総列数: ${columns.length}`);
    });
    
    // C列とN列の有効データをカウント
    const allDataLines = lines.slice(1);
    let validCount = 0;
    const sampleValidData: any[] = [];
    
    allDataLines.forEach((line, index) => {
      const columns = parseAmazonCsvLine(line);
      const title = columns[2]?.replace(/"/g, '').trim();
      const quantity = parseInt(columns[13]?.replace(/"/g, '').trim() || '0', 10);
      
      if (title && quantity > 0) {
        validCount++;
        if (sampleValidData.length < 10) {
          sampleValidData.push({ title, quantity, row: index + 2 });
        }
      }
    });
    
    console.log('\n=== 有効データ統計 ===');
    console.log('有効データ件数:', validCount);
    console.log('有効データサンプル:');
    sampleValidData.forEach(item => {
      console.log(`  行${item.row}: "${item.title}" (数量: ${item.quantity})`);
    });

    return NextResponse.json({
      success: true,
      totalLines: lines.length,
      validDataCount: validCount,
      sampleData: sampleValidData,
      headerInfo: lines.length > 0 ? parseAmazonCsvLine(lines[0]).length : 0
    });

  } catch (error) {
    console.error('CSV解析エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}
