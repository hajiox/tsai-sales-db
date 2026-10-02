export async function apiJson<T>(label: string, url: string | URL, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(45_000) });
  } catch {
    throw new Error(`${label}に接続できません。通信状態を確認してください。`);
  }
  if (!response.ok) {
    // API bodies can echo tokens, customer details or signed download URLs.
    // Only the status is safe to return to the UI or acquisition run log.
    throw new Error(`${label}: HTTP ${response.status}。認証・権限・利用制限を確認してください。`);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error(`${label}の応答形式を確認できません。`);
  }
}

export async function downloadReport(urlValue: unknown, label: string): Promise<Buffer> {
  const url = new URL(String(urlValue || ""));
  if (url.protocol !== "https:" || !/(^|\.)amazonaws\.com$/.test(url.hostname)) {
    throw new Error(`${label}のダウンロード先が公式S3ホストではありません。`);
  }
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`${label}をダウンロードできません: HTTP ${response.status}`);
  const size = Number(response.headers.get("content-length") || 0);
  if (size > 100_000_000) throw new Error(`${label}が取込サイズ上限を超えています。`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 100_000_000) throw new Error(`${label}が取込サイズ上限を超えています。`);
  return bytes;
}
