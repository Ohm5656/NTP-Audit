import { requireRole, authErrorResponse } from "@/lib/auth";
import { buildPreview } from "@/lib/import-service";
import { previewSchema } from "@/lib/import-schemas";
import { badRequest, isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin", "payroll");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const parsed = previewSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return badRequest("ข้อมูลตรวจสอบการนำเข้าไม่ถูกต้อง");
    const preview = await buildPreview(user.companyId, parsed.data);
    return Response.json(preview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("ไฟล์") || error.message.includes("ชีต"))
    )
      return badRequest(error.message);
    return authErrorResponse(error);
  }
}
