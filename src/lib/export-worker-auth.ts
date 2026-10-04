import { timingSafeEqual } from "node:crypto";

export function isExportWorker(request: Request): boolean {
  const expected = process.env.EXPORT_WORKER_TOKEN;
  const supplied = request.headers.get("x-ntp-export-worker") || "";
  if (!expected || expected.length < 32 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
