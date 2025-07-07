// /lib/csvHelpers.ts ver.15
// ------------------------------------------------------------
// 共通ユーティリティ（文字列正規化機能を追加）
// ------------------------------------------------------------
import iconv from 'iconv-lite';

/**
 * 文字列を正規化（クリーニング）する。
 * - 前後の空白を削除
 * - 連続する空白を1つにまとめる
 * - 目に見えない制御文字や特殊文字を削除
 * @param str - 対象の文字列
 * @returns 正規化された文字列
 */
function normalizeTitle(str: string | null | undefined): string {
  if (!str) return '';
  // 全角スペースを半角に統一し、前後の空白を削除、連続する空白を1つにまとめる
  return str
    .trim()
    .replace(/　/g, ' ') // 全角スペースを半角に
    .replace(/\s+/g, ' '); // 連続する空白を1つに
}


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
  const commonWords = ['送料無料', '個', '食'];
  const importantBrands = [ '激辛', 'チャーシュー', '訳あり', 'レトルト', '極厚', 'カット', '650g', '個包装', '冷凍発送', '焼豚', '炒飯', 'トッピング', '会津ブランド館', 'プロ仕様', '二郎インスパイア系', 'つけ麺', 'パーフェクトラーメン', '極にぼし', '魚介豚骨', 'オーション', '極太麺', '付け麺', 'どろスープ', '魚粉', '喜多方', '山塩', 'BUTA', 'IE-K', 'インスパイア系', 'チャーシュー付き', '備蓄食', '非常食', 'アウトドア', '常温発送', 'ラーメン', 'セット', '醤油', '味噌', '塩', '豚骨', '鶏白湯', 'つけめん' ];
  const quantityPattern = /\d+[gkgKG個枚袋本]|[\d]+×[\d]+/g;
  const quantities = title.match(quantityPattern) || [];
  const words = title.replace(/[「」【】［］\[\]\(\)、。,.]/g, ' ').split(/\s+/).filter(Boolean);
  const keywords = Array.from(new Set([...words.filter(w => !commonWords.includes(w)), ...importantBrands.filter(b => title.includes(b)), ...quantities]));
  return keywords;
}

/* ------------------------------------------------------------------ */
/* 4. ★★★【重要修正】シンプル類似度マッチング（正規化対応）★★★   */
/* ------------------------------------------------------------------ */
const specialMatchingRules = [ { keywords: ['炊き込み', 'チャーシュー'], productName: 'チャーシュー 炊き込みご飯の素', priority: 100 }, ];

type Channel = 'amazon' | 'rakuten' | 'yahoo' | 'mercari' | 'base' | 'qoo10';

export function findBestMatchSimplified(
  title: string,
  products: Product[],
  learning: LearningMap[],
  matchedIds: Set<string>,
  channel: Channel
): { product: Product, matchType: 'special' | 'learned' | 'direct' | 'keyword' } | null {
  
  const normalizedTitle = normalizeTitle(title);

  // 0. 特定キーワードによる専用マッチング
  for (const rule of specialMatchingRules) {
    const hasAllKeywords = rule.keywords.every(keyword => normalizedTitle.includes(keyword));
    if (hasAllKeywords) {
      const specialProduct = products.find(p => p.name.includes(rule.productName) && !matchedIds.has(p.id));
      if (specialProduct) {
        matchedIds.add(specialProduct.id);
        return { product: specialProduct, matchType: 'special' };
      }
    }
  }

  // 4-1. 学習データ完全一致
  const learningKey = `${channel}_title` as keyof LearningMap;
  // ★★★【最重要修正】★★★
  // 比較前に両方の文字列を正規化する
  const learnedMatch = learning.find(m => {
    if (!m.product_id) return false;
    const normalizedLearnedTitle = normalizeTitle(m[learningKey]);
    return normalizedLearnedTitle === normalizedTitle && normalizedLearnedTitle !== '';
  });

  if (learnedMatch) {
    const product = products.find(p => p.id === learnedMatch.product_id);
    if (product && !matchedIds.has(product.id)) {
      matchedIds.add(product.id);
      return { product, matchType: 'learned' };
    }
  }

  // 4-2. 商品名の完全一致
  const direct = products.find((p) => {
    if (matchedIds.has(p.id)) return false;
    const titlesToCompare = [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.qoo10_title, p.name]
        .filter(Boolean)
        .map(t => normalizeTitle(t));
    return titlesToCompare.includes(normalizedTitle);
  });

  if (direct) {
    matchedIds.add(direct.id);
    return { product: direct, matchType: 'direct' };
  }

  // 4-3. キーワードスコアリング
  const keywords = extractImportantKeywords(normalizedTitle);
  if (keywords.length === 0) return null;
  
  let bestMatch: { product: Product; score: number; matchRatio: number } | null = null;
  
  for (const p of products) {
    if (matchedIds.has(p.id)) continue;
    const targetTitles = [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.qoo10_title, p.name].filter(Boolean);
    let maxScore = 0;
    let bestMatchRatio = 0;
    for (const targetTitle of targetTitles) {
      const targetKeywords = extractImportantKeywords(targetTitle);
      const matchedKeywords = keywords.filter(k => { if (targetTitle.includes(k)) return true; if (k.length >= 3) return targetTitle.toLowerCase().includes(k.toLowerCase()); return false; });
      const matchRatio = matchedKeywords.length / keywords.length;
      let score = matchedKeywords.length;
      if (matchedKeywords.some(k => ['チャーシュー', '激辛', 'つけ麺', 'パーフェクトラーメン'].includes(k))) score += 2;
      if (score > maxScore) { maxScore = score; bestMatchRatio = matchRatio; }
    }
    if (maxScore > 0 && (!bestMatch || maxScore > bestMatch.score)) { bestMatch = { product: p, score: maxScore, matchRatio: bestMatchRatio }; }
  }
  
  if (bestMatch && bestMatch.matchRatio >= 0.35 && bestMatch.score >= 2) {
    matchedIds.add(bestMatch.product.id);
    return { product: bestMatch.product, matchType: 'keyword' };
  }
  
  return null;
}

/* ------------------------------------------------------------------ */
/* 5. チャネル別シンプルマッチング（正規化対応）                       */
/* ------------------------------------------------------------------ */
export function findBestMatchByChannel( title: string, products: Product[], channel: string ): { product: Product; confidence: number } | null {
  const normalizedTitle = normalizeTitle(title);
  const channelKey = `${channel}_title` as keyof Product;
  
  const direct = products.find((p) => {
    const titlesToCompare = [p[channelKey], p.name].filter(Boolean).map(t => normalizeTitle(t));
    return titlesToCompare.includes(normalizedTitle);
  });

  if (direct) return { product: direct, confidence: 100 };
  
  const keywords = extractImportantKeywords(normalizedTitle);
  if (keywords.length === 0) return null;
  let best: { product: Product; score: number; matchRatio: number } | null = null;
  for (const p of products) {
    const targetTitles = [p[channelKey], p.name].filter(Boolean);
    let maxScore = 0;
    let bestMatchRatio = 0;
    for (const targetTitle of targetTitles) {
      const matchedKeywords = keywords.filter(k => { if (targetTitle.includes(k)) return true; if (k.length >= 3) { return targetTitle.toLowerCase().includes(k.toLowerCase()); } return false; });
      const matchRatio = matchedKeywords.length / keywords.length;
      let score = matchedKeywords.length;
      if (matchedKeywords.some(k => ['チャーシュー', '激辛', 'つけ麺', 'パーフェクトラーメン'].includes(k))) { score += 2; }
      if (score > maxScore) { maxScore = score; bestMatchRatio = matchRatio; }
    }
    if (maxScore > 0 && (!best || maxScore > best.score)) { best = { product: p, score: maxScore, matchRatio: bestMatchRatio }; }
  }
  if (best && best.matchRatio >= 0.35 && best.score >= 2) {
    const confidence = Math.min(95, Math.round(best.matchRatio * 75 + best.score * 8));
    return { product: best.product, confidence };
  }
  return null;
}
