import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { badRequest, isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({ employeeId: z.string().min(1), dateFrom: z.iso.date(), dateTo: z.iso.date(), type: z.enum(["personal", "vacation", "sick", "unpaid", "absence"]), days: z.number().positive().max(366), reason: z.string().trim().max(1000).default(""), note: z.string().trim().max(1000).default("") }).refine(value => value.dateTo >= value.dateFrom);

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin", "payroll");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("ข้อมูลวันลาไม่ถูกต้อง");
    const input = parsed.data;
    const record = await inTransaction(async client => {
      const employee = await client.query("SELECT id FROM employees WHERE company_id=$1 AND code=$2", [user.companyId, input.employeeId]);
      if (!employee.rows[0]) return null;
      const result = await client.query("INSERT INTO leave_records(company_id,employee_id,date_from,date_to,leave_type,days,reason,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", [user.companyId, employee.rows[0].id, input.dateFrom, input.dateTo, input.type, input.days, input.reason, input.note, user.id]);
      await client.query("INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data) VALUES($1,$2,'create','leave',$3,$4)", [user.companyId, user.id, result.rows[0].id, JSON.stringify(input)]);
      return result.rows[0];
    });
    if (!record) return badRequest("ไม่พบพนักงาน", 404);
    return Response.json(record, { status: 201 });
  } catch (error) { return authErrorResponse(error); }
}
