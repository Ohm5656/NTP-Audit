import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { db, inTransaction } from "@/lib/db";
import { badRequest, isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

const createSchema = z.object({
  email: z.email().max(255),
  password: z.string().min(12).max(200),
  role: z.enum(["admin", "payroll", "viewer"]),
});
const updateSchema = z.object({
  id: z.uuid(),
  role: z.enum(["admin", "payroll", "viewer"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(12).max(200).optional(),
}).refine((value) => value.role !== undefined || value.active !== undefined || value.password !== undefined);

export async function GET() {
  try {
    const user = await requireRole("admin");
    const users = await db().query("SELECT id,email::text,role,active,created_at FROM users WHERE company_id=$1 ORDER BY created_at", [user.companyId]);
    return Response.json({ users: users.rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const checked = createSchema.safeParse(await request.json().catch(() => null));
    if (!checked.success) return badRequest("กรุณาระบุอีเมล บทบาท และรหัสผ่านอย่างน้อย 12 ตัวอักษร");
    const passwordHash = await bcrypt.hash(checked.data.password, 12);
    const created = await inTransaction(async (client) => {
      const result = await client.query<{ id: string; email: string; role: string; active: boolean }>("INSERT INTO users(company_id,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email::text,role,active", [user.companyId, checked.data.email, passwordHash, checked.data.role]);
      await client.query("INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data) VALUES($1,$2,'create','user',$3,$4)", [user.companyId, user.id, result.rows[0].id, JSON.stringify({ email: result.rows[0].email, role: result.rows[0].role })]);
      return result.rows[0];
    });
    return Response.json({ user: created }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") return badRequest("อีเมลนี้มีบัญชีแล้ว", 409);
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireRole("admin");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const checked = updateSchema.safeParse(await request.json().catch(() => null));
    if (!checked.success) return badRequest("ข้อมูลบัญชีไม่ถูกต้อง");
    const input = checked.data;
    if (input.id === user.id && (input.active === false || (input.role && input.role !== "admin"))) return badRequest("ไม่สามารถปิดหรือเปลี่ยนบทบาทบัญชีตนเอง", 403);
    const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null;
    const updated = await inTransaction(async (client) => {
      const prior = await client.query<{ id: string; role: string; active: boolean; email: string }>("SELECT id,role,active,email::text FROM users WHERE id=$1 AND company_id=$2 FOR UPDATE", [input.id, user.companyId]);
      if (!prior.rows[0]) return null;
      const result = await client.query<{ id: string; role: string; active: boolean; email: string }>("UPDATE users SET role=COALESCE($1,role),active=COALESCE($2,active),password_hash=COALESCE($3,password_hash),failed_login_count=CASE WHEN $3 IS NULL THEN failed_login_count ELSE 0 END,locked_until=CASE WHEN $3 IS NULL THEN locked_until ELSE NULL END WHERE id=$4 RETURNING id,role,active,email::text", [input.role || null, input.active ?? null, passwordHash, input.id]);
      if (input.active === false || passwordHash) await client.query("DELETE FROM sessions WHERE user_id=$1", [input.id]);
      await client.query("INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,'edit','user',$3,$4,$5)", [user.companyId, user.id, input.id, JSON.stringify(prior.rows[0]), JSON.stringify({ ...result.rows[0], passwordChanged: !!passwordHash })]);
      return result.rows[0];
    });
    if (!updated) return badRequest("ไม่พบบัญชีผู้ใช้", 404);
    return Response.json({ user: updated });
  } catch (error) { return authErrorResponse(error); }
}
