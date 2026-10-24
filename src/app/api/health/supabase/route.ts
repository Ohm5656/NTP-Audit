import { timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";

export const runtime = "nodejs";

function isValidToken(providedToken: string | null, expectedToken: string | undefined): boolean {
  if (!providedToken || !expectedToken) return false;

  const provided = Buffer.from(providedToken);
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  const expectedToken = process.env.HEALTHCHECK_TOKEN;
  const providedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;

  if (!expectedToken) {
    return Response.json({ error: "Health check is not configured" }, { status: 503 });
  }

  if (!isValidToken(providedToken, expectedToken)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await db().query("SELECT 1");
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Database health check failed" }, { status: 503 });
  }
}
