import { z } from "zod";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { badRequest, isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().max(500),
  taxId: z.string().trim().regex(/^(?:\d{13})?$/),
});

export async function PATCH(request: Request) {
  try {
    const user = await requireRole("admin");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const checked = schema.safeParse(await request.json().catch(() => null));
    if (!checked.success) return badRequest("กรุณาตรวจสอบชื่อบริษัท ที่อยู่ และเลขประจำตัวผู้เสียภาษี 13 หลัก");
    const result = await inTransaction(async (client) => {
      const prior = await client.query("SELECT name,address,tax_id FROM companies WHERE id=$1 FOR UPDATE", [user.companyId]);
      const company = await client.query("UPDATE companies SET name=$1,address=$2,tax_id=$3 WHERE id=$4 RETURNING id,name,address,tax_id,timezone", [checked.data.name, checked.data.address || null, checked.data.taxId || null, user.companyId]);
      await client.query("INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,'edit','company',$3,$4,$5)", [user.companyId, user.id, user.companyId, JSON.stringify(prior.rows[0]), JSON.stringify(company.rows[0])]);
      return company.rows[0];
    });
    return Response.json({ company: result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
