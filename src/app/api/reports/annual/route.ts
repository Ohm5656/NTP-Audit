import { z } from "zod";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { createAnnualExportJob } from "@/lib/annual-export-jobs";
import { isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ year: z.coerce.number().int().min(1900).max(2200) });

/** Queues a template-preserved Annual Excel export for the Windows Export Worker. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole("admin", "payroll", "viewer");
  } catch (error) {
    return authErrorResponse(error);
  }
  if (!isSameOrigin(request)) {
    return Response.json({ error: "แหล่งที่มาของคำขอไม่ถูกต้อง" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "ปีสำหรับส่งออกรายงานไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const job = await createAnnualExportJob(user.companyId, user.id, parsed.data.year);
    return Response.json({
      id: job.id,
      year: job.year,
      status: job.status,
      errorMessage: job.errorMessage,
    }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Annual export queue failed", error);
    return Response.json({ error: "ไม่สามารถเตรียมงาน Annual Excel ได้" }, { status: 500 });
  }
}
