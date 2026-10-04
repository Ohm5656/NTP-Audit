import { z } from "zod";
import { completeAnnualExportJob } from "@/lib/annual-export-jobs";
import { isExportWorker } from "@/lib/export-worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ storageKey: z.string().regex(/^[a-f0-9-]{36}\.xlsx$/) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isExportWorker(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [id, body] = await Promise.all([params, request.json().catch(() => null)]);
  const parsedParams = paramsSchema.safeParse(id);
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedParams.success || !parsedBody.success) return Response.json({ error: "Invalid job" }, { status: 400 });
  const completed = await completeAnnualExportJob(parsedParams.data.id, parsedBody.data.storageKey);
  if (!completed) return Response.json({ error: "Job is no longer available" }, { status: 409 });
  return Response.json({ ok: true });
}
