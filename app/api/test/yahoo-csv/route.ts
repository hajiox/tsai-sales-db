// /app/api/test/yahoo-csv/route.ts（新規作成）
// CSVパーステスト用API

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const csvFile = formData.get('csvFile') as File;
    
    if (!csvFile) {
      return NextResponse.json({ error: 'No file' }, { status: 400 });
    }

    const buffer = await csvFile.arrayBuffer();
    let csvData;
    try {
      csvData = new TextDecoder('utf-8').decode(buffer, { fatal: true });
    } catch (error) {
      csvData = new TextDecoder('shift-jis').decode(buffer);
    }
    
    const lines = csvData.split('\n').filter(line => line.trim());
    const results = [];
    
    // 最初の5行を解析
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      const columns = line.split(',');
      
      results.push({
        lineNo: i + 1,
        raw: line.substring(0, 200) + '...',
        columnCount: columns.length,
        col0: columns[0],
        col5: columns[5]
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      totalLines: lines.length,
      results 
    });
    
  } catch (error) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
