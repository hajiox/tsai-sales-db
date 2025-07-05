// /lib/csvHelpers.ts  ver.9
// ------------------------------------------------------------
// 共通ユーティリティと簡易マッチングヘルパー（マッチング精度改善版）
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
/* 2. 商品データ型（Qoo10対応追加）                                     */
/* ------------------------------------------------------------------ */
export interface Product {
  id: string;
  name: string;
  series?: string;
  amazon_title?: string;
  rakuten_title?: string;
  yahoo_title?: string;
  mercari_title?: string;
  base_title?: string;        // 🏪 BASE対応
  qoo10_title?: string;       // 🟣 Qoo10対応追加
}

interface LearningMap {
  amazon_title?: string;
  rakuten_title?: string;
  yahoo_title?: string;
  mercari_title?: string;
  base_title?: string;        // 🏪 BASE対応
  qoo10_title?: string;       // 🟣 Qoo10対応追加
  product_id: string;
}

/* ------------------------------------------------------------------ */
/* 3. タイトルから重要キーワード抽出（改善版）                         */
/* ------------------------------------------------------------------ */
export function extractImportantKeywords(title: string): string[] {
  // 一般的すぎるキーワードを除外
  const commonWords = ['ラーメン', '送料無料', 'セット', '個', '食'];
  
  // ブランド・商品特有のキーワード（重要度高）
  const importantBrands = [
    '激辛', 'チャーシュー', '訳あり', 'レトルト', '極厚', 'カット', '650g',
    '個包装', '冷凍発送', '焼豚', '炒飯', 'トッピング',
    '会津ブランド館', 'プロ仕様', '二郎インスパイア系',
    // BASE特有キーワード
    'つけ麺', 'パーフェクトラーメン', '極にぼし', '魚介豚骨', 'オーション',
    '極太麺', '付け麺', 'どろスープ', '魚粉', '喜多方', '山塩', 'BUTA', 'IE-K',
    // Qoo10特有キーワード
    'インスパイア系', 'チャーシュー付き', '備蓄食', '非常食', 'アウトドア', '常温発送'
  ];
  
  // 数量・重量パターンを抽出（例: 800g, 1Kg, 200g×5個）
  const quantityPattern = /\d+[gkgKG個枚袋本]|[\d]+×[\d]+/g;
  const quantities = title.match(quantityPattern) || [];
  
  const words = title
    .replace(/[「」【】［］\[\]\(\)、。,.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  
  // 重要キーワードと数量を組み合わせ
  const keywords = Array.from(new Set([
    ...words.filter(w => !commonWords.includes(w)),
    ...importantBrands.filter(b => title.includes(b)),
    ...quantities
  ]));
  
  return keywords;
}

/* ------------------------------------------------------------------ */
/* 4. シンプル類似度マッチング（精度改善版）                           */
/* ------------------------------------------------------------------ */
export function findBestMatchSimplified(
  title: string,
  products: Product[],
  learning: LearningMap[]
): Product | null {
  // 4-1. 学習データ完全一致（最優先）
  const learned = learning.find((m) =>
    [m.amazon_title, m.rakuten_title, m.yahoo_title, m.mercari_title, m.base_title, m.qoo10_title].includes(title)
  );
  if (learned) {
    return products.find((p) => p.id === learned.product_id) || null;
  }

  // 4-2. 商品名の完全一致
  const direct = products.find((p) =>
    [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.qoo10_title, p.name].includes(title)
  );
  if (direct) return direct;

  // 4-3. 改善版キーワードスコアリング
  const keywords = extractImportantKeywords(title);
  if (keywords.length === 0) return null;
  
  let bestMatch: { product: Product; score: number; matchRatio: number } | null = null;
  
  for (const p of products) {
    const targetTitles = [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.qoo10_title, p.name]
      .filter(Boolean);
    
    let maxScore = 0;
    let bestMatchRatio = 0;
    
    // 各タイトルと比較
    for (const targetTitle of targetTitles) {
      const targetKeywords = extractImportantKeywords(targetTitle);
      
      // 双方向マッチング（より厳密）
      const matchedInTitle = keywords.filter(k => targetTitle.includes(k)).length;
      const matchedInTarget = targetKeywords.filter(k => title.includes(k)).length;
      
      // マッチ率を計算
      const matchRatio = Math.min(
        matchedInTitle / keywords.length,
        matchedInTarget / targetKeywords.length
      );
      
      // スコア計算（マッチした数 × マッチ率）
      const score = Math.min(matchedInTitle, matchedInTarget) * matchRatio;
      
      if (score > maxScore) {
        maxScore = score;
        bestMatchRatio = matchRatio;
      }
    }
    
    // より高いスコアとマッチ率を要求
    if (maxScore > 0 && (!bestMatch || maxScore > bestMatch.score)) {
      bestMatch = { product: p, score: maxScore, matchRatio: bestMatchRatio };
    }
  }
  
  // 最低限のマッチ率（30%以上）を要求
  if (bestMatch && bestMatch.matchRatio >= 0.3 && bestMatch.score >= 2) {
    return bestMatch.product;
  }
  
  return null;
}

/* ------------------------------------------------------------------ */
/* 5. チャネル別シンプルマッチング（メルカリ・BASE用）                 */
/* ------------------------------------------------------------------ */
export function findBestMatchByChannel(
  title: string,
  products: Product[],
  channel: string
): { product: Product; confidence: number } | null {
  // 5-1. 商品名の完全一致
  const channelKey = `${channel}_title` as keyof Product;
  const direct = products.find((p) =>
    [p[channelKey], p.name].includes(title)
  );
  if (direct) return { product: direct, confidence: 100 };

  // 5-2. 改善版キーワードスコアリング
  const keywords = extractImportantKeywords(title);
  if (keywords.length === 0) return null;
  
  let best: { product: Product; score: number; matchRatio: number } | null = null;
  
  for (const p of products) {
    const targetTitles = [p[channelKey], p.name].filter(Boolean);
    
    let maxScore = 0;
    let bestMatchRatio = 0;
    
    for (const targetTitle of targetTitles) {
      const targetKeywords = extractImportantKeywords(targetTitle);
      
      const matchedInTitle = keywords.filter(k => targetTitle.includes(k)).length;
      const matchedInTarget = targetKeywords.filter(k => title.includes(k)).length;
      
      const matchRatio = Math.min(
        matchedInTitle / keywords.length,
        matchedInTarget / targetKeywords.length
      );
      
      const score = Math.min(matchedInTitle, matchedInTarget) * matchRatio;
      
      if (score > maxScore) {
        maxScore = score;
        bestMatchRatio = matchRatio;
      }
    }
    
    if (maxScore > 0 && (!best || maxScore > best.score)) {
      best = { product: p, score: maxScore, matchRatio: bestMatchRatio };
    }
  }
  
  // 信頼度計算（マッチ率とスコアを考慮）
  if (best && best.matchRatio >= 0.3 && best.score >= 2) {
    const confidence = Math.min(95, Math.round(best.matchRatio * 80 + best.score * 5));
    return { product: best.product, confidence };
  }
  
  return null;
}
