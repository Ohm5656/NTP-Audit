import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { inTransaction } from "@/lib/db";
import { normalizeHeader } from "@/lib/excel-import";
import { confirmSchema } from "@/lib/import-schemas";
import { buildPreview, parseStaged, recordIssues } from "@/lib/import-service";
import { fromSatang } from "@/lib/money";
import { identityHash, encryptSensitive } from "@/lib/sensitive";
import { badRequest, isSameOrigin } from "@/lib/request";

export const runtime = "nodejs";

class ImportProblem extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

async function nextEmployeeCode(
  client: PoolClient,
  companyId: string,
  prefix: string,
): Promise<string> {
  const result = await client.query<{ code: string }>(
    "SELECT code FROM employees WHERE company_id=$1 AND code ~ $2 ORDER BY substring(code from 4)::int DESC LIMIT 1",
    [companyId, `^${prefix}[0-9]+$`],
  );
  const number = result.rows[0] ? Number(result.rows[0].code.slice(3)) + 1 : 1;
  return `${prefix}${String(number).padStart(4, "0")}`;
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin", "payroll");
    if (!isSameOrigin(request)) return badRequest("คำขอไม่ตรงกับเว็บไซต์", 403);
    const checked = confirmSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!checked.success) return badRequest("ข้อมูลยืนยันการนำเข้าไม่ถูกต้อง");
    const input = checked.data;
    const preview = await buildPreview(user.companyId, input);
    const { upload, parsed } = await parseStaged(
      input.uploadId,
      user.companyId,
      input.sheetName,
    );
    if (!parsed.source.year || !parsed.source.month)
      throw new ImportProblem("กรุณาเลือกชีตที่ระบุเดือนและปีชัดเจน");
    const blocking = preview.issues.filter(
      (issue) => issue.severity === "error",
    );
    if (blocking.length)
      throw new ImportProblem(
        `ยังมีข้อผิดพลาด ${blocking.length} รายการ กรุณาตรวจสอบก่อนบันทึก`,
      );
    const previewByRow = new Map(preview.rows.map((row) => [row.row, row]));
    const selectedCodes = new Set<string>();
    for (const row of parsed.rows) {
      const match = previewByRow.get(row.row)?.match;
      if (!match) throw new ImportProblem("จับคู่พนักงานไม่ครบ");
      if (
        match.status === "new" &&
        input.employees?.[String(row.row)]?.action !== "create"
      )
        throw new ImportProblem(
          `กรุณายืนยันการสร้างพนักงานใหม่ที่แถว ${row.row}`,
        );
      if (match.status === "matched") {
        if (!match.code || selectedCodes.has(match.code))
          throw new ImportProblem("พนักงานหนึ่งคนถูกจับคู่ซ้ำในงวดเดียวกัน");
        selectedCodes.add(match.code);
      }
    }
    const result = await inTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `payroll:${user.companyId}:${parsed.source.year}:${parsed.source.month}`,
      ]);
      const stage = await client.query(
        "SELECT status,sha256 FROM import_uploads WHERE id=$1 AND company_id=$2 FOR UPDATE",
        [upload.id, user.companyId],
      );
      if (stage.rows[0]?.status !== "staged")
        throw new ImportProblem("ไฟล์นี้ถูกบันทึกไปแล้ว", 409);
      await client.query(
        "INSERT INTO payroll_periods(company_id,year,month,payment_date) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,year,month) DO NOTHING",
        [
          user.companyId,
          parsed.source.year,
          parsed.source.month,
          parsed.source.paymentDate,
        ],
      );
      const periodResult = await client.query<{
        id: string;
        active_import_id: string | null;
      }>(
        "SELECT id,active_import_id FROM payroll_periods WHERE company_id=$1 AND year=$2 AND month=$3 FOR UPDATE",
        [user.companyId, parsed.source.year, parsed.source.month],
      );
      const period = periodResult.rows[0];
      if (period.active_import_id && !input.replace)
        throw new ImportProblem(
          "งวดนี้มีข้อมูลแล้ว กรุณาเปรียบเทียบและเลือกแทนที่",
          409,
        );
      const oldImportId = period.active_import_id;
      const versionResult = await client.query<{ version: number }>(
        "SELECT COALESCE(MAX(version),0)+1 AS version FROM imports WHERE period_id=$1",
        [period.id],
      );
      const version = Number(versionResult.rows[0].version);
      const typesResult = await client.query<{
        id: string;
        code: string;
        kind: "income" | "deduction";
      }>(
        "SELECT id,code,kind FROM payroll_item_types WHERE company_id=$1 AND active=true",
        [user.companyId],
      );
      const types = new Map(typesResult.rows.map((type) => [type.code, type]));
      const resolvedHeaders = new Map<
        string,
        { id: string; code: string; kind: "income" | "deduction" } | null
      >();
      for (const unknown of parsed.unknownHeaders) {
        const normalized = normalizeHeader(unknown.header);
        const choice = input.mappings?.[normalized];
        if (!choice)
          throw new ImportProblem(`ยังไม่ได้จับคู่รายการ ${unknown.header}`);
        if (choice.action === "ignore") {
          if (
            parsed.rows.some((row) =>
              row.items.some(
                (item) =>
                  normalizeHeader(item.header) === normalized &&
                  item.amount !== 0,
              ),
            )
          )
            throw new ImportProblem(
              `รายการ ${unknown.header} มียอดเงิน ต้องจับคู่หรือสร้างรายการใหม่`,
            );
          resolvedHeaders.set(normalized, null);
          continue;
        }
        let type;
        if (choice.action === "existing") {
          type = types.get(choice.code);
          if (!type || type.kind !== unknown.kind)
            throw new ImportProblem(
              `ประเภทการจับคู่ ${unknown.header} ไม่ถูกต้อง`,
            );
        } else {
          if (choice.kind !== unknown.kind)
            throw new ImportProblem(
              `ประเภทของรายการ ${unknown.header} ไม่ตรงกับหัวตาราง`,
            );
          const code = `custom_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
          const created = await client.query<{
            id: string;
            code: string;
            kind: "income" | "deduction";
          }>(
            "INSERT INTO payroll_item_types(company_id,code,label,kind,aliases) VALUES($1,$2,$3,$4,$5) RETURNING id,code,kind",
            [user.companyId, code, choice.label, choice.kind, [unknown.header]],
          );
          type = created.rows[0];
          types.set(code, type);
        }
        resolvedHeaders.set(normalized, type);
        await client.query(
          "INSERT INTO import_mappings(company_id,normalized_header,item_type_id) VALUES($1,$2,$3) ON CONFLICT(company_id,normalized_header) DO UPDATE SET item_type_id=EXCLUDED.item_type_id",
          [user.companyId, normalized, type.id],
        );
      }
      const existing = await client.query<{
        id: string;
        code: string;
        employee_type: string;
      }>(
        "SELECT id,code,employee_type FROM employees WHERE company_id=$1 FOR UPDATE",
        [user.companyId],
      );
      const existingByCode = new Map(
        existing.rows.map((employee) => [employee.code, employee]),
      );
      const createdCodes: string[] = [];
      let employeeCount = 0;
      const prepared: {
        source: (typeof parsed.rows)[number];
        employeeId: string;
        items: {
          itemTypeId: string;
          item: (typeof parsed.rows)[number]["items"][number];
        }[];
        gross: number;
        deductions: number;
        net: number;
      }[] = [];
      for (const source of parsed.rows) {
        const match = previewByRow.get(source.row)!.match;
        if (match.status === "ignored") continue;
        let employeeId: string;
        if (match.status === "matched") {
          const employee = existingByCode.get(match.code!);
          if (!employee || employee.employee_type !== source.employeeType)
            throw new ImportProblem(
              `พนักงานแถว ${source.row} ไม่ตรงกับประเภทที่เลือก`,
            );
          employeeId = employee.id;
        } else {
          const prefix = source.employeeType === "director" ? "DIR" : "EMP";
          const code = await nextEmployeeCode(client, user.companyId, prefix);
          const salary =
            source.items.find((item) => item.code === "salary")?.amount || 0;
          const nationalHash = source.nationalId
            ? identityHash(source.nationalId)
            : null;
          const nationalEncrypted = source.nationalId
            ? encryptSensitive(source.nationalId)
            : null;
          const created = await client.query<{ id: string }>(
            "INSERT INTO employees(company_id,code,full_name,normalized_name,national_id_hash,national_id_encrypted,employee_type,current_salary) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
            [
              user.companyId,
              code,
              source.name,
              source.normalizedName,
              nationalHash,
              nationalEncrypted,
              source.employeeType,
              fromSatang(salary),
            ],
          );
          employeeId = created.rows[0].id;
          createdCodes.push(code);
          existingByCode.set(code, {
            id: employeeId,
            code,
            employee_type: source.employeeType,
          });
          await client.query(
            "INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data) VALUES($1,$2,'create_from_import','employee',$3,$4)",
            [
              user.companyId,
              user.id,
              employeeId,
              JSON.stringify({ code, sourceRow: source.row }),
            ],
          );
        }
        const items = source.items.flatMap((item) => {
          const type = item.code
            ? types.get(item.code)
            : resolvedHeaders.get(normalizeHeader(item.header));
          if (!type) return [];
          if (type.kind !== item.kind)
            throw new ImportProblem(`ประเภทของรายการ ${item.header} ไม่ตรงกัน`);
          return [{ itemTypeId: type.id, item }];
        });
        const gross = items
          .filter((value) => value.item.kind === "income")
          .reduce((sum, value) => sum + value.item.amount, 0);
        const deductions = items
          .filter((value) => value.item.kind === "deduction")
          .reduce((sum, value) => sum + value.item.amount, 0);
        prepared.push({
          source,
          employeeId,
          items,
          gross,
          deductions,
          net: gross - deductions,
        });
        employeeCount++;
      }
      if (!employeeCount) throw new ImportProblem("ไม่มีพนักงานที่จะบันทึก");
      const newImport = await client.query<{ id: string }>(
        "INSERT INTO imports(company_id,period_id,version,original_filename,storage_key,sha256,source_sheet,status,imported_by,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8,$9) RETURNING id",
        [
          user.companyId,
          period.id,
          version,
          upload.original_filename,
          upload.storage_key,
          stage.rows[0].sha256,
          parsed.source.name,
          user.id,
          JSON.stringify({
            rowCount: employeeCount,
            employeeCodesCreated: createdCodes,
            warnings: preview.issues.filter(
              (issue) => issue.severity === "warning",
            ).length,
          }),
        ],
      );
      const importId = newImport.rows[0].id;
      for (const entry of prepared) {
        const inserted = await client.query<{ id: string }>(
          "INSERT INTO payroll_entries(import_id,period_id,employee_id,source_row,excel_gross,excel_net,gross,deductions,net,warnings) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
          [
            importId,
            period.id,
            entry.employeeId,
            entry.source.row,
            entry.source.excelGross === null
              ? null
              : fromSatang(entry.source.excelGross),
            entry.source.excelNet === null
              ? null
              : fromSatang(entry.source.excelNet),
            fromSatang(entry.gross),
            fromSatang(entry.deductions),
            fromSatang(entry.net),
            JSON.stringify(
              entry.source.issues.filter(
                (issue) => issue.severity === "warning",
              ),
            ),
          ],
        );
        for (const item of entry.items)
          await client.query(
            "INSERT INTO payroll_items(entry_id,item_type_id,amount,source_header,source_cell,raw_formula,raw_value,source_type) VALUES($1,$2,$3,$4,$5,$6,$7,'imported')",
            [
              inserted.rows[0].id,
              item.itemTypeId,
              fromSatang(item.item.amount),
              item.item.header,
              item.item.cell,
              item.item.formula,
              item.item.rawValue,
            ],
          );
      }
      await recordIssues(
        client,
        importId,
        preview.issues.filter((issue) => issue.severity === "warning"),
      );
      if (oldImportId)
        await client.query("UPDATE imports SET status='replaced' WHERE id=$1", [
          oldImportId,
        ]);
      await client.query(
        "UPDATE payroll_periods SET active_import_id=$1,payment_date=$2 WHERE id=$3",
        [importId, parsed.source.paymentDate, period.id],
      );
      await client.query(
        "UPDATE import_uploads SET status='committed' WHERE id=$1",
        [upload.id],
      );
      await client.query(
        "INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,before_data,after_data) VALUES($1,$2,$3,'import',$4,$5,$6)",
        [
          user.companyId,
          user.id,
          oldImportId ? "replace" : "create",
          importId,
          oldImportId ? JSON.stringify({ activeImportId: oldImportId }) : null,
          JSON.stringify({
            version,
            year: parsed.source.year,
            month: parsed.source.month,
            employeeCount,
          }),
        ],
      );
      return {
        importId,
        year: parsed.source.year,
        month: parsed.source.month,
        version,
        employeeCount,
        createdCodes,
        gross: prepared.reduce((sum, entry) => sum + entry.gross, 0),
        deductions: prepared.reduce((sum, entry) => sum + entry.deductions, 0),
        net: prepared.reduce((sum, entry) => sum + entry.net, 0),
      };
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ImportProblem)
      return badRequest(error.message, error.status);
    if (
      error instanceof Error &&
      (error.message.includes("ไฟล์") || error.message.includes("ชีต"))
    )
      return badRequest(error.message);
    return authErrorResponse(error);
  }
}
