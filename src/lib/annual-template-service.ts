import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import ExcelJS from "exceljs";
import { db } from "./db";
import { ensureUploadDirectory, uploadPath } from "./import-storage";

type ExistingTemplate = { id: string; storage_key: string };

async function validateTemplate(buffer: Buffer) {
  if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024) {
    throw new Error("ขนาดไฟล์ไม่อยู่ในขอบเขตที่รองรับ");
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new Error("เปิดไฟล์ Excel ไม่ได้ กรุณาเลือกไฟล์ .xlsx ที่ถูกต้อง");
  }
  if (workbook.worksheets.length === 0) {
    throw new Error("ไฟล์ Annual Template ต้องมีอย่างน้อยหนึ่งแผ่นงาน");
  }
}

/** Replaces only the Annual export layout. Historical employee data is untouched. */
export async function replaceAnnualTemplate({ companyId, userId, filename, buffer }: { companyId: string; userId: string; filename: string; buffer: Buffer }) {
  await validateTemplate(buffer);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const storageKey = `${randomUUID()}.xlsx`;
  await ensureUploadDirectory();
  await fs.writeFile(uploadPath(storageKey), buffer, { mode: 0o600 });
  let replacedStorageKey: string | null = null;

  try {
    const client = await db().connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query<ExistingTemplate>("SELECT id,storage_key FROM annual_templates WHERE company_id=$1 FOR UPDATE", [companyId]);
      const previous = existing.rows[0];
      replacedStorageKey = previous?.storage_key || null;
      const template = await client.query<{ id: string }>(
        `INSERT INTO annual_templates(company_id,original_filename,storage_key,sha256,uploaded_by)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(company_id) DO UPDATE SET original_filename=EXCLUDED.original_filename,storage_key=EXCLUDED.storage_key,sha256=EXCLUDED.sha256,uploaded_by=EXCLUDED.uploaded_by,uploaded_at=now()
         RETURNING id`,
        [companyId, filename, storageKey, sha256, userId],
      );
      await client.query(
        "INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,$3,'annual_template',$4,$5,$6)",
        [companyId, userId, previous ? "replace" : "create", template.rows[0].id, previous ? JSON.stringify({ storageKey: previous.storage_key }) : null, JSON.stringify({ filename, sha256 })],
      );
      await client.query("COMMIT");
      if (replacedStorageKey) await fs.unlink(uploadPath(replacedStorageKey)).catch(() => {});
      return { originalFilename: filename };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    await fs.unlink(uploadPath(storageKey)).catch(() => {});
    throw error;
  }
}
