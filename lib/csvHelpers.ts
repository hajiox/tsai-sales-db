// /lib/csvHelpers.ts ver.13
// ------------------------------------------------------------
// 共通ユーティリティ（ステートレス化・安定性向上版）
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
/* 2. 商品データ型（変更なし）                                        */
/* ------------------------------------------------------------------ */
export interface Product {
  id: string;
  name: string;
  series?: string;
  amazon_title?: string;
  rakuten_title?: string;
  yahoo_title?: string;
  mercari_title?: string;
  base_title?: string;
  qoo10_title?: string;
}

interface LearningMap {
  amazon_title?: string;
  rakuten_title?: string;
  yahoo_title?: string;
  mercari_title?: string;
  base_title?: string;
  qoo10_title?: string;
  product_id: string;
}

/* ------------------------------------------------------------------ */
/* 3. タイトルから重要キーワード抽出（変更なし）                     */
/* ------------------------------------------------------------------ */
export function extractImportantKeywords(title: string): string[] {
  // 一般的すぎるキーワードを除外（ただし「ラーメン」「セット」は重要）
  const commonWords = ['送料無料', '個', '食'];
  
  // ブランド・商品特有のキーワード（重要度高）
  const importantBrands = [
    '激辛', 'チャーシュー', '訳あり', 'レトルト', '極厚', 'カット', '650g',
    '個包装', '冷凍発送', '焼豚', '炒飯', 'トッピング',
    '会津ブランド館', 'プロ仕様', '二郎インスパイア系',
    // BASE特有キーワード
    'つけ麺', 'パーフェクトラーメン', '極にぼし', '魚介豚骨', 'オーション',
    '極太麺', '付け麺', 'どろスープ', '魚粉', '喜多方', '山塩', 'BUTA', 'IE-K',
    // Qoo10特有キーワード
    'インスパイア系', 'チャーシュー付き', '備蓄食', '非常食', 'アウトドア', '常温発送',
    // 味のキーワード（重要）
    'ラーメン', 'セット', '醤油', '味噌', '塩', '豚骨', '鶏白湯', 'つけめん'
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
/* 4. ★★★【重要修正】シンプル類似度マッチング（ステートレス化）★★★ */
/* ------------------------------------------------------------------ */
const specialMatchingRules = [
  { keywords: ['炊き込み', 'チャーシュー'], productName: 'チャーシュー 炊き込みご飯の素', priority: 100 },
];

export function findBestMatchSimplified(
  title: string,
  products: Product[],
  learning: LearningMap[],
  // ★修正点1: `resetMatches`を廃止し、代わりにマッチ済みIDのSetを引数で受け取る
  matchedIds: Set<string> 
): { product: Product, matchType: 'special' | 'learned' | 'direct' | 'keyword' } | null {
  
  // 0. 特定キーワードによる専用マッチング
  for (const rule of specialMatchingRules) {
    const hasAllKeywords = rule.keywords.every(keyword => title.includes(keyword));
    if (hasAllKeywords) {
      const specialProduct = products.find(p => 
        p.name.includes(rule.productName) && !matchedIds.has(p.id)
      );
      if (specialProduct) {
        // ★修正点2: 受け取ったSetにIDを追加して、呼び出し元に返す
        matchedIds.add(specialProduct.id);
        return { product: specialProduct, matchType: 'special' };
      }
    }
  }

  // 4-1. 学習データ完全一致
  const learnedMatch = learning.find(m => m.product_id && (m.yahoo_title === title));
  if (learnedMatch) {
    const product = products.find(p => p.id === learnedMatch.product_id);
    if (product && !matchedIds.has(product.id)) {
      matchedIds.add(product.id);
      return { product, matchType: 'learned' };
    }
  }

  // 4-2. 商品名の完全一致
  const direct = products.find((p) =>
    !matchedIds.has(p.id) &&
    [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.qoo10_title, p.name].includes(title)
  );
  if (direct) {
    matchedIds.add(direct.id);
    return { product: direct, matchType: 'direct' };
  }

  // 4-3. キーワードスコアリング
  const keywords = extractImportantKeywords(title);
  if (keywords.length === 0) return null;
  
  let bestMatch: { product: Product; score: number; matchRatio: number } | null = null;
  
  for (const p of products) {
    if (matchedIds.has(p.id)) continue;
    
    const targetTitles = [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.qoo10_title, p.name].filter(Boolean);
    let maxScore = 0;
    let bestMatchRatio = 0;
    
    for (const targetTitle of targetTitles) {
      const targetKeywords = extractImportantKeywords(targetTitle);
      const matchedKeywords = keywords.filter(k => {
        if (targetTitle.includes(k)) return true;
        if (k.length >= 3) return targetTitle.toLowerCase().includes(k.toLowerCase());
        return false;
      });
      
      const matchRatio = matchedKeywords.length / keywords.length;
      let score = matchedKeywords.length;
      
      if (matchedKeywords.some(k => ['チャーシュー', '激辛', 'つけ麺', 'パーフェクトラーメン'].includes(k))) score += 2;
      
      if (score > maxScore) {
        maxScore = score;
        bestMatchRatio = matchRatio;
      }
    }
    
    if (maxScore > 0 && (!bestMatch || maxScore > bestMatch.score)) {
      bestMatch = { product: p, score: maxScore, matchRatio: bestMatchRatio };
    }
  }
  
  if (bestMatch && bestMatch.matchRatio >= 0.35 && bestMatch.score >= 2) {
    matchedIds.add(bestMatch.product.id);
    return { product: bestMatch.product, matchType: 'keyword' };
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

  // 5-2. バランス版キーワードスコアリング
  const keywords = extractImportantKeywords(title);
  if (keywords.length === 0) return null;
  
  let best: { product: Product; score: number; matchRatio: number } | null = null;
  
  for (const p of products) {
    const targetTitles = [p[channelKey], p.name].filter(Boolean);
    
    let maxScore = 0;
    let bestMatchRatio = 0;
    
    for (const targetTitle of targetTitles) {
      const matchedKeywords = keywords.filter(k => {
        if (targetTitle.includes(k)) return true;
        if (k.length >= 3) {
          return targetTitle.toLowerCase().includes(k.toLowerCase());
        }
        return false;
      });
      
      const matchRatio = matchedKeywords.length / keywords.length;
      let score = matchedKeywords.length;
      
      // 重要キーワードボーナス
      if (matchedKeywords.some(k => ['チャーシュー', '激辛', 'つけ麺', 'パーフェクトラーメン'].includes(k))) {
        score += 2;
      }
      
      if (score > maxScore) {
        maxScore = score;
        bestMatchRatio = matchRatio;
      }
    }
    
    if (maxScore > 0 && (!best || maxScore > best.score)) {
      best = { product: p, score: maxScore, matchRatio: bestMatchRatio };
    }
  }
  
  // 信頼度計算（バランス版）
  if (best && best.matchRatio >= 0.35 && best.score >= 2) {
    const confidence = Math.min(95, Math.round(best.matchRatio * 75 + best.score * 8));
    return { product: best.product, confidence };
  }
  
  return null;
}
