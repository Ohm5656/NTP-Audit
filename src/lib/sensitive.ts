import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

function secretKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return createHash("sha256").update(`ntp-identity-v1:${secret}`).digest();
}

export function identityHash(value: string): string {
  return createHmac("sha256", secretKey()).update(value).digest("hex");
}

export function encryptSensitive(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSensitive(value: string): string {
  const [iv, tag, body] = value.split(".");
  if (!iv || !tag || !body) throw new Error("Invalid encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
