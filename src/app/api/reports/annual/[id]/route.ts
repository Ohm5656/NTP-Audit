import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth";
import { getAnnualExportJob } from "@/lib/annual-export-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.uuid() });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireRole("admin", "payroll", "viewer");
  } catch (error) {
    return authErrorResponse(error);
  }
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return Response.json({ error: "รหัสงานไม่ถูกต้อง" }, { status: 400 });

  const job = await getAnnualExportJob(parsed.data.id, user.companyId, user.id);
  if (!job) return Response.json({ error: "ไม่พบงานส่งออก" }, { status: 404 });
  return Response.json({
    id: job.id,
    year: job.year,
    status: job.status,
    errorMessage: job.errorMessage,
    ready: job.status === "ready",
  }, { headers: { "Cache-Control": "no-store" } });
}
