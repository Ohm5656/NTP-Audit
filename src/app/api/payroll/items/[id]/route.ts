import Decimal from "decimal.js";
import { z } from "zod";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { fromSatang, toSatang } from "@/lib/money";
import { badRequest, isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({
  amount: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/),
  reason: z.string().trim().min(3).max(500),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole("admin", "payroll");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return badRequest("รหัสรายการไม่ถูกต้อง");
    const checked = schema.safeParse(await request.json().catch(() => null));
    if (!checked.success) return badRequest("กรุณาระบุจำนวนเงินและเหตุผลอย่างน้อย 3 ตัวอักษร");
    const newAmount = new Decimal(checked.data.amount).mul(100).toNumber();
    if (!Number.isSafeInteger(newAmount)) return badRequest("จำนวนเงินเกินขอบเขตที่รองรับ");
    const result = await inTransaction(async (client) => {
      const found = await client.query<{ entry_id: string; amount: string; original_amount: string | null; source_type: string; label: string }>(
        "SELECT pi.entry_id,pi.amount,pi.original_amount,pi.source_type,t.label FROM payroll_items pi JOIN payroll_entries e ON e.id=pi.entry_id JOIN payroll_periods p ON p.id=e.period_id AND p.active_import_id=e.import_id JOIN payroll_item_types t ON t.id=pi.item_type_id WHERE pi.id=$1 AND p.company_id=$2 FOR UPDATE OF pi,e",
        [id, user.companyId],
      );
      const item = found.rows[0];
      if (!item) return null;
      const before = toSatang(item.amount);
      if (before === newAmount) return { amount: before, unchanged: true };
      await client.query("UPDATE payroll_items SET amount=$1,original_amount=COALESCE(original_amount,amount),source_type='manual',edited_at=now() WHERE id=$2", [fromSatang(newAmount), id]);
      const totals = await client.query<{ kind: string; amount: string }>(
        "SELECT t.kind,COALESCE(SUM(pi.amount),0)::text AS amount FROM payroll_items pi JOIN payroll_item_types t ON t.id=pi.item_type_id WHERE pi.entry_id=$1 GROUP BY t.kind",
        [item.entry_id],
      );
      const gross = toSatang(totals.rows.find((row) => row.kind === "income")?.amount || "0");
      const deductions = toSatang(totals.rows.find((row) => row.kind === "deduction")?.amount || "0");
      await client.query("UPDATE payroll_entries SET gross=$1,deductions=$2,net=$3 WHERE id=$4", [fromSatang(gross), fromSatang(deductions), fromSatang(gross - deductions), item.entry_id]);
      await client.query(
        "INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,'edit','payroll_item',$3,$4,$5)",
        [user.companyId, user.id, id, JSON.stringify({ amount: before, sourceType: item.source_type }), JSON.stringify({ amount: newAmount, reason: checked.data.reason, entryId: item.entry_id })],
      );
      return { amount: newAmount, gross, deductions, net: gross - deductions, unchanged: false };
    });
    if (!result) return badRequest("ไม่พบรายการในงวดที่ใช้งานอยู่", 404);
    return Response.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}
