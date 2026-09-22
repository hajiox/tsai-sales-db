const key = row => JSON.stringify([row.channel, row.productKey]);
const transport = /(?:Chrome|ブラウザ|browser|タブ|tab|DevTools|MCP)[\s\S]{0,100}(?:タイムアウト|timeout|timed out|接続不可|利用不可|取得できず|競合|unavailable|owned by|not available)/i;
const operatorWait = /(?:ログイン(?:が必要|画面|待ち|切れ)|認証(?:画面|待ち)|MFA|CAPTCHA|リモートデバッグを許可|必須許可|許可拒否|承認拒否|permission (?:dialog|denied)|login required|sign.in required|access denied|approval.*(?:denied|reject))/i;

export function reviewRecoverySources(packet, result) {
  const rows = new Map((result.sources || []).map(row => [key(row), row]));
  return packet.sources.filter(source => {
    const row = rows.get(key(source));
    return row && ['blocked', 'partial'].includes(row.status)
      && transport.test(row.message) && !operatorWait.test(row.message);
  });
}

export function mergeReviewRecovery(first, second, targets) {
  const allowed = new Set(targets.map(key));
  const recovered = new Map();
  for (const row of second.sources || []) {
    if (!allowed.has(key(row)) || recovered.has(key(row))) throw new Error('レビュー再試行の対象が一致しません');
    recovered.set(key(row), row);
  }
  if (recovered.size !== allowed.size) throw new Error('レビュー再試行の結果が不足しています');
  const sources = first.sources.map(row => {
    const next = recovered.get(key(row));
    if (!next) return row;
    const reviews = [...new Map([...next.reviews, ...row.reviews].map(review => [review.externalId, review])).values()];
    // An unsuccessful retry must never erase the reviews already collected.
    let status = next.status;
    if (reviews.length && ['blocked', 'no_reviews'].includes(status)) status = 'partial';
    if (reviews.length > 200) status = 'partial';
    return {...next, status, reviews: reviews.slice(0, 200), message: `${row.message.slice(0, 650)} / DevTools再試行: ${next.message.slice(0, 700)}${reviews.length > 200 ? ' / 合計200件の上限で部分取得' : ''}`};
  });
  const status = sources.every(row => ['complete', 'no_reviews'].includes(row.status)) ? 'completed'
    : sources.some(row => row.reviews.length || ['complete', 'no_reviews'].includes(row.status)) ? 'partial' : 'blocked';
  return {status, message: 'Chrome連係の結果を保持し、接続障害の対象だけDevToolsで1回再試行しました', sources};
}
