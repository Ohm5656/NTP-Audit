import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

const schema = z.object({ email: z.email().max(255), password: z.string().min(1).max(200) });
const dummyHash = "$2b$12$wmwHI8s/AdzOxldws/zEyukPNcFg5OHAc69xvVdCwL8JWfc2.NZoq";

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง" }, { status: 400 });
  if (!process.env.DATABASE_URL) return Response.json({ error: "ยังไม่ได้ตั้งค่าฐานข้อมูล" }, { status: 503 });
  const { email, password } = parsed.data;
  const result = await db().query<{ id: string; company_id: string; password_hash: string; role: string; active: boolean; locked: boolean }>(
    "SELECT id,company_id,password_hash,role,active,(locked_until IS NOT NULL AND locked_until>now()) AS locked FROM users WHERE email=$1",
    [email],
  );
  const user = result.rows[0];
  const valid = await bcrypt.compare(password, user?.password_hash || dummyHash);
  if (!user || !valid || !user.active || user.locked) {
    if (user && !user.locked) await db().query("UPDATE users SET failed_login_count=failed_login_count+1, locked_until=CASE WHEN failed_login_count+1>=5 THEN now()+interval '15 minutes' ELSE locked_until END WHERE id=$1", [user.id]);
    return Response.json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือบัญชีถูกพักชั่วคราว" }, { status: 401 });
  }
  await db().query("UPDATE users SET failed_login_count=0,locked_until=NULL WHERE id=$1", [user.id]);
  const token = randomBytes(32).toString("base64url");
  await db().query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')", [hashToken(token), user.id]);
  const response = Response.json({ user: { id: user.id, role: user.role } });
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}
