import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { fromSatang, toSatang } from "@/lib/money";
import { badRequest, isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({ employeeId: z.string().min(1), effectiveDate: z.iso.date(), newSalary: z.number().int().safe().min(0), reason: z.string().trim().max(1000).default(""), note: z.string().trim().max(1000).default("") });

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin", "payroll");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("ข้อมูลปรับเงินเดือนไม่ถูกต้อง");
    const input = parsed.data;
    const record = await inTransaction(async client => {
      const employee = await client.query("SELECT id,current_salary FROM employees WHERE company_id=$1 AND code=$2 FOR UPDATE", [user.companyId, input.employeeId]);
      if (!employee.rows[0] || employee.rows[0].current_salary === null) return null;
      const oldSalary = toSatang(employee.rows[0].current_salary);
      const result = await client.query("INSERT INTO salary_adjustments(company_id,employee_id,effective_date,old_salary,new_salary,reason,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", [user.companyId, employee.rows[0].id, input.effectiveDate, fromSatang(oldSalary), fromSatang(input.newSalary), input.reason, input.note, user.id]);
      await client.query("UPDATE employees SET current_salary=$1,updated_at=now() WHERE id=$2", [fromSatang(input.newSalary), employee.rows[0].id]);
      await client.query("INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,'create','salary_adjustment',$3,$4,$5)", [user.companyId, user.id, result.rows[0].id, JSON.stringify({ salary: oldSalary }), JSON.stringify(input)]);
      return result.rows[0];
    });
    if (!record) return badRequest("ไม่พบพนักงานหรือยังไม่มีเงินเดือนปัจจุบัน", 404);
    return Response.json(record, { status: 201 });
  } catch (error) { return authErrorResponse(error); }
}
