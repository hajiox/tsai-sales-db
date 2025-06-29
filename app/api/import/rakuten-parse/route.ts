問題を発見しました。

`parseCsvLine`関数が`// ...（parseCsvLine関数は変更なし）...`というコメントに置き換えられており、実際の関数定義が削除されています。これが`Cannot read properties of undefined (reading 'length')`エラーの原因です。

以下が修正版です：

```typescript
// /app/api/import/rakuten-parse/route.ts ver.11 (parseCsvLine関数復元版)
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

export const dynamic = 'force-dynamic';

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const { csvContent } = await request.json();
    if (!csvContent) {
        return NextResponse.json({ success: false, error: 'CSVデータがありません' }, { status: 400 });
    }

    const lines = csvContent.split('\n').slice(7).filter((line: string) => line.trim() !== '');

    const { data: products, error: productsError } = await supabase.from('products').select('*');
    if (productsError) throw new Error(`商品マスターの取得に失敗: ${productsError.message}`);

    const { data: learningData } = await supabase.from('rakuten_product_mapping').select('rakuten_title, product_id');

    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    let blankTitleRows: any[] = [];

    for (let i = 0; i < lines.length; i++) {
        const columns = parseCsvLine(lines[i]);
        if (columns.length < 5) continue;

        const rakutenTitle = columns[0]?.trim();
        const quantity = parseInt(columns[4], 10) || 0;

        if (quantity <= 0) continue;

        if (!rakutenTitle) {
            blankTitleRows.push({ rowNumber: i + 8, quantity });
            continue;
        }

        const productInfo = findBestMatchSimplified(rakutenTitle, products || [], learningData || []);

        if (productInfo) {
            matchedProducts.push({ rakutenTitle, quantity, productInfo, matchType: productInfo.matchType });
        } else {
            unmatchedProducts.push({ rakutenTitle, quantity });
        }
    }

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const unmatchQuantity = unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const blankTitleQuantity = blankTitleRows.reduce((sum, r) => sum + r.quantity, 0);

    return NextResponse.json({
        success: true,
        totalProducts: matchedProducts.length + unmatchedProducts.length,
        totalQuantity: processableQuantity + unmatchQuantity,
        matchedProducts,
        unmatchedProducts,
        processableQuantity,
        blankTitleInfo: {
            count: blankTitleRows.length,
            quantity: blankTitleQuantity
        }
    });
  } catch (error) {
      console.error('楽天CSV解析エラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
```

`parseCsvLine`関数を復元しました。これで楽天CSVインポートが正常に動作するはずです。
