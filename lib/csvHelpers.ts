// /lib/csvHelpers.ts  ver.8
// ------------------------------------------------------------
// 共通ユーティリティと簡易マッチングヘルパー（BASE対応追加）
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
/* 2. 商品データ型（BASE対応追加）                                     */
/* ------------------------------------------------------------------ */
export interface Product {
  id: string;
  name: string;
  series?: string;
  amazon_title?: string;
  rakuten_title?: string;
  yahoo_title?: string;
  mercari_title?: string;
  base_title?: string;        // 🏪 BASE対応追加
}

interface LearningMap {
  amazon_title?: string;
  rakuten_title?: string;
  yahoo_title?: string;
  mercari_title?: string;
  base_title?: string;        // 🏪 BASE対応追加
  product_id: string;
}

/* ------------------------------------------------------------------ */
/* 3. タイトルから重要キーワード抽出（BASE商品特有キーワード追加）      */
/* ------------------------------------------------------------------ */
export function extractImportantKeywords(title: string): string[] {
  const brands = [
    '激辛', 'チャーシュー', '訳あり', 'レトルト', '極厚', 'カット', '650g',
    '個包装', '冷凍発送', '焼豚', 'ラーメン', '炒飯', 'トッピング', '送料無料',
    '会津ブランド館', 'プロ仕様', '二郎インスパイア系',
    // 🏪 BASE特有キーワード追加
    'つけ麺', 'パーフェクトラーメン', '極にぼし', '魚介豚骨', 'オーション',
    '極太麺', '付け麺', 'どろスープ', '魚粉', '喜多方', '山塩', 'BUTA', 'IE-K'
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
/* 4. シンプル類似度マッチング（BASE対応追加）                        */
/* ------------------------------------------------------------------ */
export function findBestMatchSimplified(
  title: string,
  products: Product[],
  learning: LearningMap[]
): Product | null {
  // 4-1. 学習データ完全一致（BASE対応追加）
  const learned = learning.find((m) =>
    [m.amazon_title, m.rakuten_title, m.yahoo_title, m.mercari_title, m.base_title].includes(title)
  );
  if (learned) {
    return products.find((p) => p.id === learned.product_id) || null;
  }

  // 4-2. 商品名の完全一致（BASE対応追加）
  const direct = products.find((p) =>
    [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.name].includes(title)
  );
  if (direct) return direct;

  // 4-3. キーワードスコアリング（BASE対応追加）
  const keywords = extractImportantKeywords(title);
  let best: Product | null = null;
  let maxScore = 0;
  for (const p of products) {
    const target = [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.name]
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

/* ------------------------------------------------------------------ */
/* 5. チャネル別シンプルマッチング（メルカリ・BASE用）                 */
/* ------------------------------------------------------------------ */
export function findBestMatchByChannel(
  title: string,
  products: Product[],
  channel: string
): { product: Product; confidence: number } | null {
  // 4-1. 商品名の完全一致
  const channelKey = `${channel}_title` as keyof Product;
  const direct = products.find((p) =>
    [p[channelKey], p.name].includes(title)
  );
  if (direct) return { product: direct, confidence: 100 };

  // 4-2. キーワードスコアリング
  const keywords = extractImportantKeywords(title);
  let best: Product | null = null;
  let maxScore = 0;
  
  for (const p of products) {
    const target = [p[channelKey], p.name]
      .filter(Boolean)
      .join(' ');
    const score = keywords.filter((k) => target.includes(k)).length;
    if (score > maxScore && score >= 2) { // 最低2キーワード一致
      best = p;
      maxScore = score;
    }
  }
  
  if (best && maxScore >= 2) {
    const confidence = Math.min(95, maxScore * 15 + 50); // スコアベースの信頼度
    return { product: best, confidence };
  }
  
  return null;
}
