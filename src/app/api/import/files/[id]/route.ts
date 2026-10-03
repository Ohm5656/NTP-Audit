import fs from "node:fs/promises";
import { z } from "zod";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadPath } from "@/lib/import-storage";
import { badRequest } from "@/lib/request";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("admin", "payroll", "viewer");
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return badRequest("รหัสไฟล์ไม่ถูกต้อง");
    const found = await db().query<{ storage_key: string; original_filename: string }>("SELECT storage_key,original_filename FROM imports WHERE id=$1 AND company_id=$2", [id, user.companyId]);
    if (!found.rows[0]) return badRequest("ไม่พบไฟล์ต้นฉบับ", 404);
    const file = await fs.readFile(uploadPath(found.rows[0].storage_key));
    const safeName = found.rows[0].original_filename.replace(/[\r\n"\\]/g, "_");
    return new Response(new Uint8Array(file), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Length": String(file.length), "Content-Disposition": `attachment; filename="payroll.xlsx"; filename*=UTF-8''${encodeURIComponent(safeName)}`, "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error); }
}
