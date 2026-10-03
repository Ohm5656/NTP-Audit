import { requireRole, authErrorResponse } from "@/lib/auth";
import { importHistoricalAnnual } from "@/lib/historical-service";
import { badRequest } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin", "payroll");
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) return badRequest("กรุณาเลือกไฟล์ Annual Excel (.xlsx)");
    const result = await importHistoricalAnnual({ companyId: user.companyId, userId: user.id, filename: file.name, buffer: Buffer.from(await file.arrayBuffer()) });
    return Response.json(result, { status: 201 });
  } catch (error) { return authErrorResponse(error); }
}
