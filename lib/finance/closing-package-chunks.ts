import { createHash } from 'node:crypto';

export function closingChunkExpectedSize(fileSize: number, chunkSize: number, index: number) {
  const totalChunks = Math.ceil(fileSize / chunkSize);
  if (!Number.isInteger(fileSize) || fileSize <= 0 || !Number.isInteger(chunkSize) || chunkSize <= 0
    || !Number.isInteger(index) || index < 0 || index >= totalChunks) throw new Error('分割番号が不正です');
  return index === totalChunks - 1 ? fileSize - index * chunkSize : chunkSize;
}

export function assembleClosingChunks(
  chunks: { index: number; bytes: Buffer; hash: string }[],
  fileSize: number, sourceHash: string, chunkSize: number,
) {
  const totalChunks = Math.ceil(fileSize / chunkSize);
  if (chunks.length !== totalChunks) throw new Error('PDF分割データが未完了です');
  for (let index = 0; index < chunks.length; index++) {
    const part = chunks[index];
    if (part.index !== index || part.bytes.length !== closingChunkExpectedSize(fileSize, chunkSize, index)
      || createHash('sha256').update(part.bytes).digest('hex') !== part.hash) throw new Error('PDF分割データが不一致です');
  }
  const bytes = Buffer.concat(chunks.map(part => part.bytes));
  if (bytes.length !== fileSize || createHash('sha256').update(bytes).digest('hex') !== sourceHash) throw new Error('PDF全体のサイズまたはハッシュが一致しません');
  return bytes;
}
