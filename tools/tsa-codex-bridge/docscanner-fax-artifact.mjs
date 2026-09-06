import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

function operatorWait(message) {
  return Object.assign(new Error(message), { operatorWait: true });
}

// Only the configured DocScanner origin is contacted; job data never supplies a URL.
export async function acquireDocScannerFaxImages({ baseUrl, secret, parameters, workDir, fetchImpl = fetch }) {
  if (!secret?.trim()) throw operatorWait("DocScanner画像APIの連携認証が未設定です");
  const origin = new URL(baseUrl);
  if (origin.username || origin.password || origin.search || origin.hash
    || !["http:", "https:"].includes(origin.protocol)) {
    throw new Error("DocScanner画像APIの接続先が正しくありません");
  }
  const endpoint = new URL("/api/integrations/codex-bridge/fax-summary-artifact", origin);
  const images = [];
  for (const image of parameters.imageFiles) {
    if (!Number.isInteger(image.page) || image.page < 1 || image.page > 6
      || !Number.isInteger(image.size) || image.size < 1 || image.size > MAX_IMAGE_BYTES
      || !/^[a-f0-9]{64}$/.test(image.sha256)) {
      throw new Error("FAX画像の取得契約が正しくありません");
    }
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
        headers: { "content-type": "application/json", "x-tsg-integration-secret": secret.trim() },
        body: JSON.stringify({ sourceKey: parameters.sourceKey, page: image.page, sha256: image.sha256 }),
      });
    } catch {
      throw new Error("DocScanner画像APIへ接続できませんでした");
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ([401, 403, 503].includes(response.status)) {
        throw operatorWait(`DocScanner画像APIの認証設定を確認してください（HTTP ${response.status}）`);
      }
      throw new Error(`DocScanner画像APIが取得を拒否しました（HTTP ${response.status}）`);
    }
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
    const contentLength = response.headers.get("content-length");
    if (contentType !== "image/jpeg" || (contentLength !== null && Number(contentLength) !== image.size)) {
      await response.body?.cancel();
      throw new Error("FAX画像APIの形式またはサイズが一致しません");
    }
    if (!response.body) throw new Error("FAX画像APIの応答が空です");
    const chunks = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > image.size) throw new Error("FAX画像APIの応答サイズが上限を超えました");
        chunks.push(Buffer.from(value));
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks);
    if (length !== image.size || createHash("sha256").update(bytes).digest("hex") !== image.sha256) {
      throw new Error("FAX画像APIの内容が依頼時点と一致しません");
    }
    const copiedPath = join(workDir, `fax-page-${String(image.page).padStart(2, "0")}.jpg`);
    await writeFile(copiedPath, bytes);
    images.push({ copiedPath, page: image.page });
  }
  return images;
}

// Called only after the server has accepted the summary; never deletes arbitrary paths.
export async function deleteDocScannerFaxImages({ baseUrl, secret, parameters, fetchImpl = fetch }) {
  if (!secret?.trim()) throw operatorWait("DocScanner画像APIの連携認証が未設定です");
  const endpoint = new URL("/api/integrations/codex-bridge/fax-summary-artifact", baseUrl);
  for (const image of parameters.imageFiles) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "DELETE", redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(30_000),
        headers: { "content-type": "application/json", "x-tsg-integration-secret": secret.trim() },
        body: JSON.stringify({ sourceKey: parameters.sourceKey, page: image.page, sha256: image.sha256 }),
      });
    } catch {
      throw new Error("FAX要約画像APIの後片付けに接続できませんでした");
    }
    await response.body?.cancel();
    if (!response.ok && response.status !== 404) {
      throw new Error(`FAX要約画像APIの後片付けが完了しませんでした（HTTP ${response.status}）`);
    }
  }
}
