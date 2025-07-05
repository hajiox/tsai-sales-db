// /lib/csvHelpers.ts  ver.10
// ------------------------------------------------------------
// 共通ユーティリティと簡易マッチングヘルパー（マッチング緩和版）
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
  // 一般的すぎるキーワードを除外（緩和：「セット」を除外から外す）
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
    // 追加キーワード（緩和のため）
    'ラーメン', 'セット', '醤油', '味噌', '塩', '豚骨', '鶏白湯'
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
/* 4. シンプル類似度マッチング（緩和版・重複防止機能付き）             */
/* ------------------------------------------------------------------ */
// 既にマッチ済みの商品IDを記録するSet（関数外で保持）
const matchedProductIds = new Set<string>();

// 特定キーワードの組み合わせによる専用マッチングルール
const specialMatchingRules = [
  {
    keywords: ['炊き込み', 'チャーシュー'],
    productName: 'チャーシュー 炊き込みご飯の素',
    priority: 100 // 最優先
  },
  // 今後、似た問題が発生したらここに追加
];

export function findBestMatchSimplified(
  title: string,
  products: Product[],
  learning: LearningMap[],
  resetMatches?: boolean // バッチ処理の開始時にtrueを渡してリセット
): Product | null {
  // マッチ済みIDをリセット（新しいCSV処理の開始時）
  if (resetMatches) {
    matchedProductIds.clear();
  }

  // 0. 特定キーワードによる専用マッチング（最優先）
  for (const rule of specialMatchingRules) {
    const hasAllKeywords = rule.keywords.every(keyword => title.includes(keyword));
    if (hasAllKeywords) {
      const specialProduct = products.find(p => 
        p.name.includes(rule.productName) && !matchedProductIds.has(p.id)
      );
      if (specialProduct) {
        console.log(`🎯 特殊ルールでマッチ: "${title}" → "${specialProduct.name}"`);
        matchedProductIds.add(specialProduct.id);
        return specialProduct;
      }
    }
  }

  // 4-1. 学習データ完全一致（最優先）
  const learned = learning.find((m) =>
    [m.amazon_title, m.rakuten_title, m.yahoo_title, m.mercari_title, m.base_title, m.qoo10_title].includes(title)
  );
  if (learned) {
    const product = products.find((p) => p.id === learned.product_id);
    // 既にマッチ済みの商品は除外
    if (product && !matchedProductIds.has(product.id)) {
      matchedProductIds.add(product.id);
      return product;
    }
  }

  // 4-2. 商品名の完全一致
  const direct = products.find((p) =>
    !matchedProductIds.has(p.id) && // 既にマッチ済みは除外
    [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.qoo10_title, p.name].includes(title)
  );
  if (direct) {
    matchedProductIds.add(direct.id);
    return direct;
  }

  // 4-3. 緩和版キーワードスコアリング
  const keywords = extractImportantKeywords(title);
  if (keywords.length === 0) return null;
  
  let bestMatch: { product: Product; score: number; matchRatio: number } | null = null;
  
  for (const p of products) {
    // 既にマッチ済みの商品はスキップ
    if (matchedProductIds.has(p.id)) continue;
    
    const targetTitles = [p.amazon_title, p.rakuten_title, p.yahoo_title, p.mercari_title, p.base_title, p.qoo10_title, p.name]
      .filter(Boolean);
    
    let maxScore = 0;
    let bestMatchRatio = 0;
    
    // 各タイトルと比較
    for (const targetTitle of targetTitles) {
      const targetKeywords = extractImportantKeywords(targetTitle);
      
      // 単方向マッチング（緩和：titleのキーワードがtargetTitleに含まれるかだけチェック）
      const matchedInTarget = keywords.filter(k => targetTitle.includes(k)).length;
      
      // マッチ率を計算（緩和：単方向のみ）
      const matchRatio = matchedInTarget / keywords.length;
      
      // スコア計算（マッチした数）
      const score = matchedInTarget;
      
      if (score > maxScore) {
        maxScore = score;
        bestMatchRatio = matchRatio;
      }
    }
    
    // より高いスコアを持つ商品を記録
    if (maxScore > 0 && (!bestMatch || maxScore > bestMatch.score)) {
      bestMatch = { product: p, score: maxScore, matchRatio: bestMatchRatio };
    }
  }
  
  // 緩和：最低限のマッチ率を20%に下げ、スコアも1以上でOK
  if (bestMatch && bestMatch.matchRatio >= 0.2 && bestMatch.score >= 1) {
    matchedProductIds.add(bestMatch.product.id);
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

  // 5-2. 緩和版キーワードスコアリング
  const keywords = extractImportantKeywords(title);
  if (keywords.length === 0) return null;
  
  let best: { product: Product; score: number; matchRatio: number } | null = null;
  
  for (const p of products) {
    const targetTitles = [p[channelKey], p.name].filter(Boolean);
    
    let maxScore = 0;
    let bestMatchRatio = 0;
    
    for (const targetTitle of targetTitles) {
      const targetKeywords = extractImportantKeywords(targetTitle);
      
      // 単方向マッチング（緩和）
      const matchedInTarget = keywords.filter(k => targetTitle.includes(k)).length;
      
      const matchRatio = matchedInTarget / keywords.length;
      const score = matchedInTarget;
      
      if (score > maxScore) {
        maxScore = score;
        bestMatchRatio = matchRatio;
      }
    }
    
    if (maxScore > 0 && (!best || maxScore > best.score)) {
      best = { product: p, score: maxScore, matchRatio: bestMatchRatio };
    }
  }
  
  // 信頼度計算（緩和版）
  if (best && best.matchRatio >= 0.2 && best.score >= 1) {
    const confidence = Math.min(95, Math.round(best.matchRatio * 70 + best.score * 10));
    return { product: best.product, confidence };
  }
  
  return null;
}
