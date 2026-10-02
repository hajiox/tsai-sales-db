import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(value: string | undefined): Buffer {
  const key = Buffer.from(value || "", "base64");
  if (key.length !== 32) throw new Error("API接続情報の暗号化キーが未設定です");
  return key;
}

export function encryptApiCredential(name: string, value: string, key: string | undefined): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(key), iv);
  cipher.setAAD(Buffer.from(name));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptApiCredential(name: string, value: string, key: string | undefined): string {
  const [version, iv, tag, ciphertext, extra] = value.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra) throw new Error("API接続情報の形式が正しくありません");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(key), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(name));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("API接続情報を復号できません");
  }
}
