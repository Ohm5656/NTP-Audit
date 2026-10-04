import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { getAnnualExportInput } from "@/lib/annual-export";
import { withPrivateUploadPath } from "@/lib/import-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const run = promisify(execFile);
const querySchema = z.object({ year: z.coerce.number().int().min(1900).max(2200) });

export async function GET(request: Request) {
  let user;
  try { user = await requireRole("admin", "payroll", "viewer"); }
  catch (error) { return authErrorResponse(error); }
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "ปีสำหรับส่งออกรายงานไม่ถูกต้อง" }, { status: 400 });
  const id = randomUUID();
  const exportDirectory = path.join(process.cwd(), ".data", "exports");
  const dataPath = path.join(exportDirectory, `${id}.json`);
  const outputPath = path.join(exportDirectory, `${id}.xlsx`);
  try {
    const { templateStorageKey, input } = await getAnnualExportInput(user.companyId, parsed.data.year);
    await fs.mkdir(exportDirectory, { recursive: true, mode: 0o700 });
    await fs.writeFile(dataPath, JSON.stringify(input), { mode: 0o600 });
    await withPrivateUploadPath(templateStorageKey, async (templatePath) => {
      await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(process.cwd(), "scripts", "generate-annual-export.ps1"), "-TemplatePath", templatePath, "-DataPath", dataPath, "-OutputPath", outputPath], { windowsHide: true, maxBuffer: 1024 * 1024 });
    });
    const bytes = await fs.readFile(outputPath);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ntp-annual-${parsed.data.year + 543}.xlsx"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    console.error("Annual export failed", error);
    const message = error instanceof Error && error.message.includes("ยังไม่มี") ? error.message : "ไม่สามารถสร้างไฟล์ Annual Excel ได้";
    return Response.json({ error: message }, { status: 500 });
  } finally {
    await Promise.all([fs.unlink(dataPath).catch(() => {}), fs.unlink(outputPath).catch(() => {})]);
  }
}
