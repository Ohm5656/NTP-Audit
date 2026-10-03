import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { badRequest, isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const createSchema = z.object({ label: z.string().trim().min(2).max(120), kind: z.enum(["income", "deduction"]) });
const updateSchema = z.object({ id: z.uuid(), label: z.string().trim().min(2).max(120).optional(), active: z.boolean().optional() }).refine((value) => value.label !== undefined || value.active !== undefined);

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin", "payroll");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const checked = createSchema.safeParse(await request.json().catch(() => null));
    if (!checked.success) return badRequest("กรุณาระบุชื่อรายการและประเภท");
    const created = await inTransaction(async (client) => {
      const code = `custom_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      const item = await client.query("INSERT INTO payroll_item_types(company_id,code,label,kind) VALUES($1,$2,$3,$4) RETURNING id,code,label,kind,aliases,active", [user.companyId, code, checked.data.label, checked.data.kind]);
      await client.query("INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data) VALUES($1,$2,'create','payroll_item_type',$3,$4)", [user.companyId, user.id, item.rows[0].id, JSON.stringify(item.rows[0])]);
      return item.rows[0];
    });
    return Response.json({ item: created }, { status: 201 });
  } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireRole("admin", "payroll");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const checked = updateSchema.safeParse(await request.json().catch(() => null));
    if (!checked.success) return badRequest("ข้อมูลรายการไม่ถูกต้อง");
    const input = checked.data;
    const updated = await inTransaction(async (client) => {
      const prior = await client.query<{ id: string; code: string; label: string; active: boolean }>("SELECT id,code,label,active FROM payroll_item_types WHERE id=$1 AND company_id=$2 FOR UPDATE", [input.id, user.companyId]);
      if (!prior.rows[0]) return null;
      if (prior.rows[0].code === "salary" && input.active === false) return "protected";
      const result = await client.query("UPDATE payroll_item_types SET label=COALESCE($1,label),active=COALESCE($2,active) WHERE id=$3 RETURNING id,code,label,kind,aliases,active", [input.label || null, input.active ?? null, input.id]);
      await client.query("INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,'edit','payroll_item_type',$3,$4,$5)", [user.companyId, user.id, input.id, JSON.stringify(prior.rows[0]), JSON.stringify(result.rows[0])]);
      return result.rows[0];
    });
    if (!updated) return badRequest("ไม่พบรายการ", 404);
    if (updated === "protected") return badRequest("ไม่สามารถปิดรายการเงินเดือนได้");
    return Response.json({ item: updated });
  } catch (error) { return authErrorResponse(error); }
}
