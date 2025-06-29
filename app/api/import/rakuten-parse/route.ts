// /app/api/import/rakuten/route.ts（v20250629 全面修正版）
import { NextRequest, NextResponse } from 'next/server';
import { createAuthenticatedSupabaseClient } from '@/utils/supabase';
import { findBestMatchSimplified } from '@/utils/csvHelpers';

export async function POST(req: NextRequest) {
  try {
    const supabase = createAuthenticatedSupabaseClient();
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter((line) => line.trim() !== '');
    if (lines.length === 0) {
      return NextResponse.json({ error: 'Empty CSV' }, { status: 400 });
    }

    const headers = lines[0].split(',');
    const rows = lines.slice(1).map((line) => {
      const values = line.split(',');
      const entry: Record<string, string> = {};
      headers.forEach((h, i) => (entry[h.trim()] = (values[i] || '').trim()));
      return entry;
    });

    // 商品名と個数を抽出（列名固定：A列→商品名、E列→個数）
    const parsedItems = rows.map((row) => {
      return {
        name: row[headers[0]],
        quantity: Number(row[headers[4]]) || 0,
      };
    });

    // AI補正データの読み込み（web_sales_ai_reports）
    const { data: aiReports, error: aiError } = await supabase
      .from('web_sales_ai_reports')
      .select('product_id, name');

    if (aiError) {
      return NextResponse.json({ error: 'Failed to fetch AI reports' }, { status: 500 });
    }

    const results = parsedItems.map((item) => {
      const matched = findBestMatchSimplified(item.name, aiReports || []);
      return {
        original: item.name,
        quantity: item.quantity,
        matched_product_id: matched?.product_id || null,
        matched_name: matched?.name || null,
      };
    });

    return NextResponse.json({ success: true, data: results });
  } catch (err) {
    console.error('CSV parse error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
