import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { fromSatang } from "@/lib/money";
import { badRequest, isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const schema = z.object({ name: z.string().trim().min(2).max(200), type: z.enum(["employee", "director"]), position: z.string().trim().max(200).default(""), department: z.string().trim().max(200).default(""), startDate: z.iso.date().optional(), salary: z.number().int().safe().min(0) });

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin", "payroll");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return badRequest("ข้อมูลพนักงานไม่ถูกต้อง");
    const input = parsed.data;
    const employee = await inTransaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`employee-code:${user.companyId}`]);
      const next = await client.query<{ code: string }>("SELECT code FROM employees WHERE company_id=$1 AND code ~ '^EMP[0-9]+$' ORDER BY substring(code from 4)::int DESC LIMIT 1", [user.companyId]);
      const number = next.rows[0] ? Number(next.rows[0].code.slice(3)) + 1 : 1;
      const code = `EMP${String(number).padStart(4, "0")}`;
      const normalizedName = input.name.replace(/\s+/g, "").toLocaleLowerCase("th-TH");
      const result = await client.query("INSERT INTO employees(company_id,code,full_name,normalized_name,employee_type,position,department,hire_date,current_salary) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,code", [user.companyId, code, input.name, normalizedName, input.type, input.position, input.department, input.startDate || null, fromSatang(input.salary)]);
      await client.query("INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data) VALUES($1,$2,'create','employee',$3,$4)", [user.companyId, user.id, result.rows[0].id, JSON.stringify({ code, name: input.name, type: input.type })]);
      return result.rows[0];
    });
    return Response.json(employee, { status: 201 });
  } catch (error) { return authErrorResponse(error); }
}
