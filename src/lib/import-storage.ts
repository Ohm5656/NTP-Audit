import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let storageClient: SupabaseClient | null | undefined;

function validateKey(key: string) {
  if (!/^[a-f0-9-]{36}\.xlsx$/.test(key)) throw new Error("Invalid upload key");
}

function getStorageClient(): SupabaseClient | null {
  if (storageClient !== undefined) return storageClient;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url && !serviceRoleKey) return (storageClient = null);
  if (!url || !serviceRoleKey)
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together");
  return (storageClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }));
}

function bucketName() {
  return process.env.SUPABASE_STORAGE_BUCKET || "ntp-private-uploads";
}

export function uploadDirectory(): string {
  const configured = process.env.PRIVATE_UPLOAD_DIR;
  if (configured) return path.resolve(/*turbopackIgnore: true*/ configured);
  return path.join(process.cwd(), ".data", "uploads");
}

/** The local directory is retained only for development and migration fallback. */
export async function ensureUploadDirectory(): Promise<string> {
  const dir = uploadDirectory();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function uploadPath(key: string): string {
  validateKey(key);
  return path.join(/*turbopackIgnore: true*/ uploadDirectory(), key);
}

/** Saves original payroll and historical-workbook files to private Supabase Storage when configured. */
export async function writePrivateFile(key: string, content: Buffer): Promise<void> {
  validateKey(key);
  const client = getStorageClient();
  if (!client) {
    await ensureUploadDirectory();
    await fs.writeFile(uploadPath(key), content, { flag: "wx", mode: 0o600 });
    return;
  }
  const { error } = await client.storage.from(bucketName()).upload(key, content, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: false,
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
}

export async function readPrivateFile(key: string): Promise<Buffer> {
  validateKey(key);
  const client = getStorageClient();
  if (!client) return fs.readFile(uploadPath(key));
  const { data, error } = await client.storage.from(bucketName()).download(key);
  if (error || !data)
    throw new Error(`Supabase Storage download failed: ${error?.message || "file not found"}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deletePrivateFile(key: string): Promise<void> {
  validateKey(key);
  const client = getStorageClient();
  if (!client) {
    await fs.unlink(uploadPath(key)).catch(() => {});
    return;
  }
  const { error } = await client.storage.from(bucketName()).remove([key]);
  if (error) throw new Error(`Supabase Storage deletion failed: ${error.message}`);
}

/** Materializes a private file briefly when an Excel library needs a filesystem path. */
export async function withPrivateUploadPath<T>(key: string, action: (filePath: string) => Promise<T>): Promise<T> {
  validateKey(key);
  if (!getStorageClient()) return action(uploadPath(key));
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ntp-audit-"));
  const filePath = path.join(temporaryDirectory, `${randomUUID()}.xlsx`);
  try {
    await fs.writeFile(filePath, await readPrivateFile(key), { mode: 0o600 });
    return await action(filePath);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  }
}
