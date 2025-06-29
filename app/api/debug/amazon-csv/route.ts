// /app/api/debug/amazon-csv/route.ts ver.2 (TSV/CSV両対応版)

import { NextRequest, NextResponse } from 'next/server';

// Amazon CSVパース（TSV/CSV自動判定）
function parseAmazonCsvLine(line: string, delimiter: string = '\t'): string[] {
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
    } else if (char === delimiter && !inQuotes) {
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
    
    // 区切り文字を自動判定
    const firstLine = lines[0] || '';
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    const delimiter = tabCount > commaCount ? '\t' : ',';
    
    console.log(`区切り文字判定: ${delimiter === '\t' ? 'TSV(タブ)' : 'CSV(カンマ)'}`);
    console.log(`タブ数: ${tabCount}, カンマ数: ${commaCount}`);
    
    // ヘッダー行を表示
    if (lines.length > 0) {
      const headerColumns = parseAmazonCsvLine(lines[0], delimiter);
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
      const columns = parseAmazonCsvLine(line, delimiter);
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
      const columns = parseAmazonCsvLine(line, delimiter);
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
      delimiter: delimiter === '\t' ? 'TSV' : 'CSV',
      totalLines: lines.length,
      validDataCount: validCount,
      sampleData: sampleValidData,
      headerInfo: lines.length > 0 ? parseAmazonCsvLine(lines[0], delimiter).length : 0
    });

  } catch (error) {
    console.error('CSV解析エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    }, { status: 500 });
  }
}
