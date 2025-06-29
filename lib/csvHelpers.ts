import stringSimilarity from 'string-similarity';

/**
 * 商品名を簡易化する関数
 * @param name 商品名
 * @returns 簡易化された商品名
 */
export const simplifyName = (name: string): string => {
  return name
    .replace(/[\s\u3000]/g, '') // 半角・全角スペース除去
    .replace(/[\(（].*?[\)）]/g, '') // カッコ内削除
    .replace(/[-‐―ー−]/g, '') // ハイフン・長音記号除去
    .replace(/[【】『』「」]/g, '') // 特殊記号除去
    .replace(/[A-Za-z0-9０-９]/g, '') // 英数字除去
    .replace(/[.,。、・:：]/g, '') // 句読点除去
    .toLowerCase();
};

/**
 * 商品名同士の類似度を計算して最も近いものを返す
 * @param name 比較対象の名前
 * @param targets ターゲットの配列（オブジェクトで name プロパティがあるもの）
 * @returns 最もマッチ度の高いオブジェクト（類似度が0.5未満なら null）
 */
export const findBestMatchSimplified = <T extends { name: string }>(
  name: string,
  targets: T[]
): T | null => {
  const simplifiedName = simplifyName(name);
  const simplifiedTargets = targets.map((t) => simplifyName(t.name));
  const result = stringSimilarity.findBestMatch(simplifiedName, simplifiedTargets);
  const bestIndex = result.bestMatchIndex;
  const bestRating = result.bestMatch.rating;

  if (bestRating >= 0.5) {
    return targets[bestIndex];
  } else {
    return null;
  }
};
