type UploadOptions = {
  periodId?: string | null;
  replacePrimary?: boolean;
  onProgress?: (message: string) => void;
};

async function responseJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false)
    throw new Error(
      data.error || `決算資料の送信に失敗しました (${response.status})`,
    );
  return data;
}

/** Keep each request below the hosting platform's request-body limit. */
export async function uploadClosingPackage(
  file: File,
  options: UploadOptions = {},
) {
  const endpoint = '/api/finance/annual-statements';
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer(),
  );
  const sourceHash = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  const session = await responseJson(
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'beginUpload',
        fileName: file.name,
        fileSize: file.size,
        sourceHash,
        periodId: options.periodId || undefined,
      }),
    }),
  );
  const chunkSize = Number(session.chunkSize);
  if (
    !Number.isSafeInteger(chunkSize) ||
    chunkSize < 1 ||
    chunkSize > 3 * 1024 * 1024
  )
    throw new Error('分割送信の設定を確認できませんでした');
  const totalChunks = Math.ceil(file.size / chunkSize);
  for (let index = 0; index < totalChunks; index++) {
    options.onProgress?.(`PDFを送信中… ${index + 1}/${totalChunks}`);
    const form = new FormData();
    form.append('action', 'uploadChunk');
    form.append('uploadSessionId', session.uploadSessionId);
    form.append('uploadToken', session.uploadToken);
    form.append('chunkIndex', String(index));
    form.append(
      'file',
      file.slice(index * chunkSize, (index + 1) * chunkSize),
      'part.bin',
    );
    await responseJson(await fetch(endpoint, { method: 'POST', body: form }));
  }
  options.onProgress?.('全ページの分類・解析・検算中…');
  return responseJson(
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'completeUpload',
        uploadSessionId: session.uploadSessionId,
        uploadToken: session.uploadToken,
        replacePrimary: options.replacePrimary === true,
      }),
    }),
  );
}

export async function downloadClosingPackage(
  document: {
    downloadUrl: string;
    fileSize: number;
    fileName: string;
    sourceHash: string;
  },
  onProgress?: (message: string) => void,
) {
  const chunkSize = 2 * 1024 * 1024;
  const parts: Uint8Array[] = [];
  const total = Math.ceil(document.fileSize / chunkSize);
  for (let index = 0; index < total; index++) {
    onProgress?.(`原本を取得中… ${index + 1}/${total}`);
    const response = await fetch(`${document.downloadUrl}&chunk=${index}`, {
      cache: 'no-store',
    });
    if (!response.ok)
      throw new Error(
        (await response.json().catch(() => ({}))).error ||
          '原本PDFを取得できませんでした',
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      bytes.length !==
      Math.min(chunkSize, document.fileSize - index * chunkSize)
    )
      throw new Error('原本PDFのサイズが一致しません');
    parts.push(bytes);
  }
  const combined = new Uint8Array(document.fileSize);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', combined);
  const hash = Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
  if (hash !== document.sourceHash)
    throw new Error('原本PDFの照合に失敗しました');
  const url = URL.createObjectURL(
    new Blob([combined], { type: 'application/pdf' }),
  );
  const link = window.document.createElement('a');
  link.href = url;
  link.download = document.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
