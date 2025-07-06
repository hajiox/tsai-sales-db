// /lib/csvHelpers.ts ver.14
// ------------------------------------------------------------
// 共通ユーティリティ（チャネル対応・超汎用版）
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
  const commonWords = ['送料無料', '個', '食'];
  const importantBrands = [ '激辛', 'チャーシュー', '訳あり', 'レトルト', '極厚', 'カット', '650g', '個包装', '冷凍発送', '焼豚', '炒飯', 'トッピング', '会津ブランド館', 'プロ仕様', '二郎インスパイア系', 'つけ麺', 'パーフェクトラーメン', '極にぼし', '魚介豚骨', 'オーション', '極太麺', '付け麺', 'どろスープ', '魚粉', '喜多方', '山塩', 'BUTA', 'IE-K', 'インスパイア系', 'チャーシュー付き', '備蓄食', '非常食', 'アウトドア', '常温発送', 'ラーメン', 'セット', '醤油', '味噌', '塩', '豚骨', '鶏白湯', 'つけめん' ];
  const quantityPattern = /\d+[gkgKG個枚袋本]|[\d]+×[\d]+/g;
  const quantities = title.match(quantityPattern) || [];
  const words = title.replace(/[「」【】［］\[\]\(\)、。,.]/g, ' ').split(/\s+/).filter(Boolean);
  const keywords = Array.from(new Set([...words.filter(w => !commonWords.includes(w)), ...importantBrands.filter(b => title.includes(b)), ...quantities]));
  return keywords;
}

/* ------------------------------------------------------------------ */
/* 4. ★★★【重要修正】シンプル類似度マッチング（チャネル対応）★★★   */
/* ------------------------------------------------------------------ */
const specialMatchingRules = [ { keywords: ['炊き込み', 'チャーシュー'], productName: 'チャーシュー 炊き込みご飯の素', priority: 100 }, ];

type Channel = 'amazon' | 'rakuten' | 'yahoo' | 'mercari' | 'base' | 'qoo10';

export function findBestMatchSimplified(
  title: string,
  products: Product[],
  learning: LearningMap[],
  matchedIds: Set<string>,
  // ★修正点1: どのECサイトからの呼び出しかを明確にする引数を追加
  channel: Channel
): { product: Product, matchType: 'special' | 'learned' | 'direct' | 'keyword' } | null {
  
  // 0. 特定キーワードによる専用マッチング
  for (const rule of specialMatchingRules) {
    const hasAllKeywords = rule.keywords.every(keyword => title.includes(keyword));
    if (hasAllKeywords) {
      const specialProduct = products.find(p => p.name.includes(rule.productName) && !matchedIds.has(p.id));
      if (specialProduct) {
        matchedIds.add(specialProduct.id);
        return { product: specialProduct, matchType: 'special' };
      }
    }
  }

  // 4-1. 学習データ完全一致
  // ★修正点2: channel引数を使って、正しい学習データの列を参照する
  const learningKey = `${channel}_title` as keyof LearningMap;
  const learnedMatch = learning.find(m => m.product_id && m[learningKey] === title);
  if (learnedMatch) {
    const product = products.find(p => p.id === learnedMatch.product_id);
    if (product && !matchedIds.has(product.id)) {
      matchedIds.add(product.id);
      return { product, matchType: 'learned' };
    }
  }

  // 4-2. 商品名の完全一致（ここは元々汎用的だったので変更なし）
  const direct = products.find((p) => !matchedIds.has(p.id) && [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.qoo10_title, p.name].includes(title));
  if (direct) {
    matchedIds.add(direct.id);
    return { product: direct, matchType: 'direct' };
  }

  // 4-3. キーワードスコアリング（変更なし）
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
/* 5. チャネル別シンプルマッチング（変更なし）                        */
/* ------------------------------------------------------------------ */
export function findBestMatchByChannel( title: string, products: Product[], channel: string ): { product: Product; confidence: number } | null {
  const channelKey = `${channel}_title` as keyof Product;
  const direct = products.find((p) => [p[channelKey], p.name].includes(title));
  if (direct) return { product: direct, confidence: 100 };
  const keywords = extractImportantKeywords(title);
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
