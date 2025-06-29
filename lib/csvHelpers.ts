// ✅ csvHelpers.ts（全文）
import { getSimilarity } from 'string-similarity-js';

// シンプルなシリーズ名ベースのマッチング関数
export function findBestMatchSimplified(name: string, aiReports: any[]) {
  let bestScore = 0;
  let bestMatch = null;

  for (const report of aiReports) {
    const target = report.series_name || report.product_name || '';
    const score = getSimilarity(name, target);

    if (score > bestScore && score > 0.5) {
      bestScore = score;
      bestMatch = report;
    }
  }

  return bestMatch;
}
