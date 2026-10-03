import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

export type Role = "admin" | "payroll" | "viewer";
export type AppUser = { id: string; companyId: string; email: string; role: Role };
export const SESSION_COOKIE = "ntp_session";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !process.env.DATABASE_URL) return null;
  const result = await db().query<{ id: string; company_id: string; email: string; role: Role }>(
    "SELECT u.id,u.company_id,u.email::text,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true",
    [hashToken(token)],
  );
  if (!result.rows[0]) return null;
  const user = result.rows[0];
  return { id: user.id, companyId: user.company_id, email: user.email, role: user.role };
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") { super(message); }
}

export async function requireRole(...roles: Role[]): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || (roles.length && !roles.includes(user.role))) throw new UnauthorizedError();
  return user;
}

export function authErrorResponse(error: unknown): Response {
  if (error instanceof UnauthorizedError) return Response.json({ error: "ไม่มีสิทธิ์ใช้งาน" }, { status: 403 });
  throw error;
}
