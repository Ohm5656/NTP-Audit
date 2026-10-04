import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseWorkbook } from "@/lib/excel-import";
import { deletePrivateFile, withPrivateUploadPath, writePrivateFile } from "@/lib/import-storage";
import { badRequest, isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin", "payroll");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 16 * 1024 * 1024)
      return badRequest("ไฟล์ต้องมีขนาดไม่เกิน 15 MB", 413);
    const form = await request.formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith(".xlsx") ||
      file.size < 100 ||
      file.size > 15 * 1024 * 1024
    )
      return badRequest("กรุณาเลือกไฟล์ .xlsx ขนาดไม่เกิน 15 MB");
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b)
      return badRequest("ไฟล์นี้ไม่ใช่ Excel .xlsx");
    const id = randomUUID();
    const key = `${id}.xlsx`;
    const originalFilename = path
      .basename(file.name)
      .replace(/[\x00-\x1f\x7f]/g, "")
      .slice(0, 240);
    await writePrivateFile(key, buffer);
    try {
      const types = await db().query<{ code: string; aliases: string[] }>(
        "SELECT code,aliases FROM payroll_item_types WHERE company_id=$1 AND active=true",
        [user.companyId],
      );
      const parsed = await withPrivateUploadPath(key, (filePath) => parseWorkbook(filePath, undefined, types.rows));
      const sha256 = createHash("sha256").update(buffer).digest("hex");
      await db().query(
        "INSERT INTO import_uploads(id,company_id,uploaded_by,original_filename,storage_key,sha256) VALUES($1,$2,$3,$4,$5,$6)",
        [id, user.companyId, user.id, originalFilename, key, sha256],
      );
      return Response.json({
        uploadId: id,
        originalFilename,
        suggestedSheet: parsed.source.name,
        sheets: parsed.sheets.filter((sheet) => sheet.score > 0),
        rowCount: parsed.rows.length,
        employeeCount: parsed.rows.filter(
          (row) => row.employeeType === "employee",
        ).length,
        directorCount: parsed.rows.filter(
          (row) => row.employeeType === "director",
        ).length,
        year: parsed.source.year,
        month: parsed.source.month,
        paymentDate: parsed.source.paymentDate,
        issueCount: parsed.issues.length,
      });
    } catch (error) {
      await deletePrivateFile(key).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("ชีต") || error.message.includes("Excel"))
    )
      return badRequest(error.message);
    return authErrorResponse(error);
  }
}
