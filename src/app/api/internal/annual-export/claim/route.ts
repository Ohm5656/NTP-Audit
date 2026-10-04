import { claimAnnualExportJob, expiredAnnualExportStorageKeys, failAnnualExportJob } from "@/lib/annual-export-jobs";
import { getAnnualExportInput } from "@/lib/annual-export";
import { createPrivateDownloadUrl, createPrivateUploadUrl, deletePrivateFile } from "@/lib/import-storage";
import { isExportWorker } from "@/lib/export-worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isExportWorker(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const expiredKeys = await expiredAnnualExportStorageKeys();
  await Promise.all(expiredKeys.map((key) => deletePrivateFile(key).catch((error) => console.error("Expired export cleanup failed", error))));

  const job = await claimAnnualExportJob();
  if (!job || !job.resultStorageKey) return new Response(null, { status: 204 });

  try {
    const { templateStorageKey, input } = await getAnnualExportInput(job.companyId, job.year);
    const [templateUrl, resultUploadUrl] = await Promise.all([
      createPrivateDownloadUrl(templateStorageKey, 600),
      createPrivateUploadUrl(job.resultStorageKey),
    ]);
    return Response.json({
      job: { id: job.id, year: job.year, storageKey: job.resultStorageKey },
      input,
      templateUrl,
      resultUploadUrl,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Annual export Worker claim preparation failed", error);
    await failAnnualExportJob(job.id, "ไม่สามารถเตรียมข้อมูลสำหรับสร้าง Annual Excel ได้");
    return Response.json({ error: "Unable to prepare export" }, { status: 500 });
  }
}
