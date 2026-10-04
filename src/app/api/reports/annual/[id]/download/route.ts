import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth";
import { getAnnualExportJob } from "@/lib/annual-export-jobs";
import { createPrivateDownloadUrl } from "@/lib/import-storage";

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
  if (!job || job.status !== "ready" || !job.resultStorageKey || new Date(job.expiresAt) <= new Date()) {
    return Response.json({ error: "ไฟล์ Annual Excel ยังไม่พร้อมหรือหมดอายุแล้ว" }, { status: 404 });
  }
  try {
    const signedUrl = await createPrivateDownloadUrl(job.resultStorageKey, 300);
    return Response.redirect(signedUrl, 302);
  } catch (error) {
    console.error("Annual export download failed", error);
    return Response.json({ error: "ไม่สามารถดาวน์โหลดไฟล์ Annual Excel ได้" }, { status: 500 });
  }
}
