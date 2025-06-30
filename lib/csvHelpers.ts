// /lib/csvHelpers.ts  ver.6
// ------------------------------------------------------------
// 共通ユーティリティと簡易マッチングヘルパー
// ------------------------------------------------------------
import iconv from 'iconv-lite';

/* ------------------------------------------------------------------ */
/* 1. バイナリ → UTF-8 自動判定デコード                               */
/* ------------------------------------------------------------------ */
export function detectAndDecode(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  const bad  = (utf8.match(/\uFFFD/g) || []).length;
  if (bad / utf8.length > 0.03) {
    return iconv.decode(buf, 'shift_jis');
  }
  return utf8;
}

/* ------------------------------------------------------------------ */
/* 2. 商品データ型                                                    */
/* ------------------------------------------------------------------ */
export interface Product {
  id: string;
  name: string;
  series?: string;
  amazon_title?: string;
  rakuten_title?: string;
  yahoo_title?: string;
}

interface LearningMap {
  amazon_title?: string;
  rakuten_title?: string;
  yahoo_title?: string;
  product_id: string;
}

/* ------------------------------------------------------------------ */
/* 3. タイトルから重要キーワード抽出                                  */
/* ------------------------------------------------------------------ */
export function extractImportantKeywords(title: string): string[] {
  const brands = [
    '激辛', 'チャーシュー', '訳あり', 'レトルト', '極厚', 'カット', '650g',
  ];
  return Array.from(
    new Set(
      title
        .replace(/[「」【】［］\[\]\(\)、。,.]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
        .concat(brands.filter((b) => title.includes(b)))
    )
  );
}

/* ------------------------------------------------------------------ */
/* 4. シンプル類似度マッチング                                        */
/* ------------------------------------------------------------------ */
export function findBestMatchSimplified(
  title: string,
  products: Product[],
  learning: LearningMap[]
): Product | null {
  // 4-1. 学習データ完全一致
  const learned = learning.find((m) =>
    [m.amazon_title, m.rakuten_title, m.yahoo_title].includes(title)
  );
  if (learned) {
    return products.find((p) => p.id === learned.product_id) || null;
  }

  // 4-2. 商品名の完全一致
  const direct = products.find((p) =>
    [p.amazon_title, p.rakuten_title, p.yahoo_title, p.name].includes(title)
  );
  if (direct) return direct;

  // 4-3. キーワードスコアリング
  const keywords = extractImportantKeywords(title);
  let best: Product | null = null;
  let maxScore = 0;
  for (const p of products) {
    const target = [p.amazon_title, p.rakuten_title, p.yahoo_title, p.name]
      .filter(Boolean)
      .join(' ');
    const score = keywords.filter((k) => target.includes(k)).length;
    if (score > maxScore) {
      best = p;
      maxScore = score;
    }
  }
  return best;
}
