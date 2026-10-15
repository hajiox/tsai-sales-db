import { X509Certificate } from "node:crypto";
import { open } from "node:fs/promises";
import path from "node:path";

export const DOCSCANNER_STAFF_CERTIFICATE_DOWNLOAD = "/api/docscanner-staff-setup/certificate";
export const DOCSCANNER_STAFF_REGISTRATION_URL = "https://192.168.110.200:8444/staff/register";
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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function documentHtml(content: string): string {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>厨房スタッフ端末の設定</title>
<style>
:root{color-scheme:light;font-family:system-ui,-apple-system,sans-serif;color:#172b3a;background:#f3f6f8}*{box-sizing:border-box}body{margin:0;padding:24px 16px 48px}main{max-width:720px;margin:auto}h1{font-size:1.6rem;line-height:1.4;margin:8px 0 12px}h2{font-size:1.15rem;margin:0 0 12px}h3{font-size:1rem;margin:20px 0 8px}p,li{line-height:1.8}p{margin:8px 0}section{background:white;border:1px solid #d8e1e7;border-radius:12px;padding:20px;margin-top:20px}ol{padding-left:24px}li{padding-left:4px;margin:8px 0}a{color:#075985;overflow-wrap:anywhere}a:focus-visible{outline:3px solid #0369a1;outline-offset:4px}.button{display:block;text-align:center;background:#075985;color:white;border-radius:8px;padding:14px;text-decoration:none;font-weight:700;margin-top:16px;min-height:48px}.notice{background:#fff8e7;border:1px solid #e7cc8b;border-radius:8px;padding:14px;font-size:.94rem}.meta{font-size:.9rem;overflow-wrap:anywhere}dt{font-weight:700;margin-top:10px}dd{margin:4px 0;white-space:pre-wrap}code{font-family:ui-monospace,monospace;overflow-wrap:anywhere}small{font-size:.85rem;color:#475569}@media(max-width:420px){body{padding:16px 12px 36px}section{padding:16px}h1{font-size:1.4rem}}
</style></head><body><main>${content}</main></body></html>`;
}

export function renderDocscannerStaffSetupUnavailable(): string {
  return documentHtml(`<h1>厨房スタッフ端末の設定</h1><section><p>${DOCSCANNER_STAFF_SETUP_UNAVAILABLE}</p></section>`);
}

export function renderDocscannerStaffSetupPage(certificate: Omit<DocscannerStaffCertificate, "der">): string {
  return documentHtml(`<h1>厨房スタッフ端末の設定</h1>
<p>会社管理の iPad・iPhone・Android 端末を、スタッフ入力画面へ接続するための設定です。管理者立会いで行ってください。</p>
<p class="notice">CAの信頼は端末のHTTPS通信に関わる設定で、接続先や8444ポートだけに限定されません。管理者と証明書の名前・指紋を確認し、会社が管理する端末だけに導入してください。</p>
<section aria-labelledby="save-certificate"><h2 id="save-certificate">1. 公開CA証明書を保存する</h2>
<p>管理者が案内した証明書と、次の名前・SHA-256指紋が一致することを確認してください。</p>
<p>iPad・iPhoneはSafariでこのページを開いてください。</p>
<dl class="meta"><dt>証明書の名前</dt><dd>${escapeHtml(certificate.subject)}</dd><dt>SHA-256指紋</dt><dd><code>${escapeHtml(certificate.fingerprint256)}</code></dd><dt>有効期間（UTC）</dt><dd>${escapeHtml(certificate.validFrom)} ～ ${escapeHtml(certificate.validTo)}</dd></dl>
<a class="button" href="${DOCSCANNER_STAFF_CERTIFICATE_DOWNLOAD}" download="${DOCSCANNER_STAFF_CERTIFICATE_FILENAME}">公開CA証明書を保存</a>
</section>
<section aria-labelledby="trust-certificate"><h2 id="trust-certificate">2. 端末の設定で証明書を信頼する</h2>
<h3>iPad / iPhone</h3><ol><li>Safariから保存した証明書を開き、設定の「ダウンロード済みのプロファイル」または「一般」→「VPNとデバイス管理」から、管理者と名前を確認してインストールします。プロファイルはダウンロード後8分以内にインストールしてください。</li><li>「設定」→「一般」→「情報」→「証明書信頼設定」を開き、この証明書のルート証明書を完全に信頼する設定を本人が行います。</li></ol>
<p><a href="https://support.apple.com/en-us/102390" rel="noopener noreferrer">Apple公式：証明書の信頼設定</a> / <a href="https://support.apple.com/en-us/102400" rel="noopener noreferrer">プロファイルのインストール</a></p>
<h3>Android</h3><ol><li>設定のセキュリティ関連項目から「暗号化と認証情報」などを開き、「証明書のインストール」→「CA証明書」を選びます。機種・OSで項目名が異なります。</li><li>保存した <code>${DOCSCANNER_STAFF_CERTIFICATE_FILENAME}</code> を選択し、管理者と証明書を確認して、端末の持ち主が導入操作を行います。</li></ol>
<p>「Wi-Fi証明書」や「VPNとアプリのユーザー証明書」とは種類が異なります。CA証明書の項目が見つからない場合は管理者へ確認してください。</p>
<p class="notice">信頼設定や端末の確認操作は本人が行います。接続時に証明書の警告が残る場合は先へ進まず、管理者へ確認してください。</p>
</section>
<section aria-labelledby="register-device"><h2 id="register-device">3. 社内Wi-Fiで端末を登録する</h2>
<ol><li>会社のWi-Fiへ接続します。</li><li>管理者からこの端末専用の登録コードを個別に受け取ります。コードは発行から10分間・1回限り有効です。</li><li>下のスタッフ登録画面を開き、登録コードを入力します。</li></ol>
<a class="button" href="${DOCSCANNER_STAFF_REGISTRATION_URL}">スタッフ登録画面を開く</a>
<p class="meta"><code>${DOCSCANNER_STAFF_REGISTRATION_URL}</code></p>
<p>登録後の端末資格は30日間有効です。期限が切れた場合は管理者へ連絡してください。</p>
</section><p><small>このページには登録コード・端末資格・秘密鍵を含みません。</small></p>`);
}
