import { X509Certificate } from "node:crypto";
import { open } from "node:fs/promises";
import path from "node:path";

export const DOCSCANNER_STAFF_CERTIFICATE_DOWNLOAD = "/api/docscanner-staff-setup/certificate";
export const DOCSCANNER_STAFF_INPUT_URL = "http://192.168.110.200:8444/staff/char-siu-production";
export const DOCSCANNER_STAFF_REGISTRATION_URL = "http://192.168.110.200:8444/staff/register";
export const DOCSCANNER_STAFF_CERTIFICATE_FILENAME = "staff-root-ca.cer";
export const DOCSCANNER_STAFF_SETUP_UNAVAILABLE = "証明書の配布準備ができていません。管理者に確認してください。";

export const DOCSCANNER_STAFF_SETUP_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
} as const;

export type DocscannerStaffCertificate = {
  der: Buffer;
  subject: string;
  fingerprint256: string;
  validFrom: string;
  validTo: string;
};

// Accept exactly one public DER certificate. Parsing alone can accept trailing data.
export function validateDocscannerStaffCertificate(bytes: Uint8Array, nowMs = Date.now()): DocscannerStaffCertificate {
  if (bytes.byteLength < 1 || bytes.byteLength > 16 * 1024 || !Number.isFinite(nowMs)) {
    throw new Error(DOCSCANNER_STAFF_SETUP_UNAVAILABLE);
  }
  const der = Buffer.from(bytes);
  try {
    const certificate = new X509Certificate(der);
    const validFrom = Date.parse(certificate.validFrom);
    const validTo = Date.parse(certificate.validTo);
    if (!certificate.raw.equals(der) || !certificate.ca || certificate.subject !== certificate.issuer ||
      !certificate.verify(certificate.publicKey) || !Number.isFinite(validFrom) || !Number.isFinite(validTo) ||
      nowMs < validFrom || nowMs >= validTo) {
      throw new Error(DOCSCANNER_STAFF_SETUP_UNAVAILABLE);
    }
    return {
      der: certificate.raw,
      subject: certificate.subject,
      fingerprint256: certificate.fingerprint256,
      validFrom: new Date(validFrom).toISOString(),
      validTo: new Date(validTo).toISOString(),
    };
  } catch {
    throw new Error(DOCSCANNER_STAFF_SETUP_UNAVAILABLE);
  }
}

export async function loadDocscannerStaffCertificate(): Promise<DocscannerStaffCertificate | null> {
  // This deployment asset is fixed and never selected from a request or environment value.
  const certificatePath = path.join(process.cwd(), "assets", "docscanner-staff", DOCSCANNER_STAFF_CERTIFICATE_FILENAME);
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(certificatePath, "r");
    const stat = await file.stat();
    if (!stat.isFile() || stat.size < 1 || stat.size > 16 * 1024) return null;
    const buffer = Buffer.alloc(16 * 1024 + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== stat.size) return null;
    return validateDocscannerStaffCertificate(buffer.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => undefined);
  }
}

export function renderDocscannerStaffSetupPage(): string {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DocScanner チャーシュー製造入力</title>
<style>
:root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#172b3a;background:#f3f6f8}*{box-sizing:border-box}body{margin:0;padding:24px 16px}main{max-width:560px;margin:auto;background:white;border:1px solid #d8e1e7;border-radius:12px;padding:24px}h1{font-size:1.5rem;line-height:1.5;margin:0 0 16px}p{line-height:1.8;margin:12px 0}a:focus-visible{outline:3px solid #0369a1;outline-offset:4px}.button{display:block;text-align:center;background:#075985;color:white;border-radius:8px;padding:14px;text-decoration:none;font-weight:700;margin:20px 0;min-height:48px}.secondary{background:#e7f0f5;color:#075985}@media(max-width:420px){main{padding:20px}h1{font-size:1.3rem}}
</style></head><body><main><h1>DocScanner チャーシュー製造入力</h1>
<p>社内Wi-Fiで開くページです。証明書追加・VPN設定不要です。</p>
<a class="button" href="${DOCSCANNER_STAFF_INPUT_URL}">製造入力を開く</a>
<p>未登録/期限切れ端末は管理者が登録します。</p>
<a class="button secondary" href="${DOCSCANNER_STAFF_REGISTRATION_URL}">端末登録を開く</a>
</main></body></html>`;
}
