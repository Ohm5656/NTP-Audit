import path from "node:path";
import fs from "node:fs/promises";

export function uploadDirectory(): string {
  const configured = process.env.PRIVATE_UPLOAD_DIR;
  if (configured) return path.resolve(/*turbopackIgnore: true*/ configured);
  return path.join(process.cwd(), ".data", "uploads");
}

export async function ensureUploadDirectory(): Promise<string> {
  const dir = uploadDirectory();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function uploadPath(key: string): string {
  if (!/^[a-f0-9-]{36}\.xlsx$/.test(key)) throw new Error("Invalid upload key");
  return path.join(/*turbopackIgnore: true*/ uploadDirectory(), key);
}
