import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hashToken, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token && process.env.DATABASE_URL) await db().query("DELETE FROM sessions WHERE token_hash=$1", [hashToken(token)]);
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}
