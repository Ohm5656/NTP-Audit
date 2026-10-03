import { authErrorResponse, requireRole } from "@/lib/auth";
import { badRequest, isSameOrigin } from "@/lib/request";
export const runtime = "nodejs";
// Employees are created only when a verified monthly Payroll workbook is confirmed.
export async function POST(request: Request) { try { await requireRole("admin", "payroll"); if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403); return badRequest("เพิ่มพนักงานผ่านการนำเข้า Payroll รายเดือนเท่านั้น", 409); } catch (error) { return authErrorResponse(error); } }