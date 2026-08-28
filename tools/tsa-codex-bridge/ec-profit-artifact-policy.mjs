const ORIGINAL_REPORT = /\.original\.(csv|zip|xlsx|xls|txt|json|pdf|png|jpg|jpeg|webp)$/i;
const AUTH_OR_ERROR_EVIDENCE = /(?:login[-_. ]?(?:required|expired)|permission|captcha|mfa|account[-_. ]?selection|error)/i;
const STALE_AVAILABILITY_EVIDENCE = /(?:max[-_. ]?month|unavailable|not[-_. ]?(?:published|available)|publication[-_. ]?(?:pending|wait)|zero[-_. ]?(?:transactions?|confirmed|rows?|settlement)|no[-_. ]?(?:transactions?|data|rows?|settlement)|未公開|公開待ち|0件)/i;

export function isReusableEcProfitOriginalName(name) {
  const value = String(name || "");
  return ORIGINAL_REPORT.test(value)
    && !AUTH_OR_ERROR_EVIDENCE.test(value)
    && !STALE_AVAILABILITY_EVIDENCE.test(value);
}
