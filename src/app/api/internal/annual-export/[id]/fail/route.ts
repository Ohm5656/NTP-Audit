import { z } from "zod";
import { failAnnualExportJob } from "@/lib/annual-export-jobs";
import { isExportWorker } from "@/lib/export-worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ error: z.string().trim().min(1).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isExportWorker(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [id, body] = await Promise.all([params, request.json().catch(() => null)]);
  const parsedParams = paramsSchema.safeParse(id);
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedParams.success || !parsedBody.success) return Response.json({ error: "Invalid job" }, { status: 400 });
  await failAnnualExportJob(parsedParams.data.id, parsedBody.data.error);
  return Response.json({ ok: true });
}
