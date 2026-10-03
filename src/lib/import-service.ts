import type { PoolClient } from "pg";
import { db } from "./db";
import {
  parseWorkbook,
  normalizeHeader,
  type ParsedImport,
  type SourceRow,
  type ImportIssue,
} from "./excel-import";
import { uploadPath } from "./import-storage";
import { identityHash } from "./sensitive";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";

export type MappingChoice =
  | { action: "existing"; code: string }
  | { action: "create"; label: string; kind: "income" | "deduction" }
  | { action: "ignore" };
export type EmployeeChoice =
  | { action: "match"; employeeCode: string }
  | { action: "create" }
  | { action: "ignore" };
export type PreviewRequest = {
  uploadId: string;
  sheetName?: string;
  mappings?: Record<string, MappingChoice>;
  employees?: Record<string, EmployeeChoice>;
};
export type EmployeeMatch = {
  status: "matched" | "new" | "ambiguous" | "ignored";
  code: string | null;
  method: "code" | "national_id" | "name" | "manual" | null;
};
export type PreviewRow = Omit<SourceRow, "nationalId" | "items"> & {
  match: EmployeeMatch;
  itemCount: number;
};

type ExistingEmployee = {
  id: string;
  code: string;
  normalized_name: string;
  national_id_hash: string | null;
  employee_type: "employee" | "director";
};

export async function getStagedUpload(uploadId: string, companyId: string) {
  const result = await db().query<{
    id: string;
    original_filename: string;
    storage_key: string;
    sha256: string;
    status: string;
    uploaded_by: string;
  }>(
    "SELECT id,original_filename,storage_key,sha256,status,uploaded_by FROM import_uploads WHERE id=$1 AND company_id=$2",
    [uploadId, companyId],
  );
  return result.rows[0] || null;
}

export async function parseStaged(
  uploadId: string,
  companyId: string,
  sheetName?: string,
) {
  const upload = await getStagedUpload(uploadId, companyId);
  if (!upload || upload.status !== "staged")
    throw new Error("ไม่พบไฟล์ที่รอตรวจสอบ");
  const file = await fs.readFile(uploadPath(upload.storage_key));
  if (createHash("sha256").update(file).digest("hex") !== upload.sha256)
    throw new Error("ไฟล์ต้นฉบับเปลี่ยนไปหลังอัปโหลด");
  const types = await db().query<{ code: string; aliases: string[] }>(
    "SELECT code,aliases FROM payroll_item_types WHERE company_id=$1 AND active=true",
    [companyId],
  );
  const mappings = await db().query<{
    normalized_header: string;
    code: string;
  }>(
    "SELECT m.normalized_header,t.code FROM import_mappings m JOIN payroll_item_types t ON t.id=m.item_type_id AND t.active=true WHERE m.company_id=$1",
    [companyId],
  );
  const aliasRows = types.rows.map((type) => ({
    ...type,
    aliases: [
      ...type.aliases,
      ...mappings.rows
        .filter((m) => m.code === type.code)
        .map((m) => m.normalized_header),
    ],
  }));
  const parsed = await parseWorkbook(
    uploadPath(upload.storage_key),
    sheetName,
    aliasRows,
  );
  return { upload, parsed };
}

function autoMatch(
  row: SourceRow,
  existing: ExistingEmployee[],
): EmployeeMatch {
  if (row.employeeCode) {
    const byCode = existing.filter(
      (employee) => employee.code === row.employeeCode,
    );
    if (byCode.length === 1)
      return { status: "matched", code: byCode[0].code, method: "code" };
  }
  if (row.nationalId) {
    const byId = existing.filter(
      (employee) => employee.national_id_hash === identityHash(row.nationalId!),
    );
    if (byId.length === 1)
      return { status: "matched", code: byId[0].code, method: "national_id" };
    if (byId.length > 1)
      return { status: "ambiguous", code: null, method: null };
  }
  const byName = existing.filter(
    (employee) => employee.normalized_name === row.normalizedName,
  );
  if (byName.length === 1) {
    if (
      row.nationalId &&
      byName[0].national_id_hash &&
      byName[0].national_id_hash !== identityHash(row.nationalId)
    )
      return { status: "ambiguous", code: null, method: null };
    return { status: "matched", code: byName[0].code, method: "name" };
  }
  if (byName.length > 1)
    return { status: "ambiguous", code: null, method: null };
  return { status: "new", code: null, method: null };
}

export async function buildPreview(companyId: string, request: PreviewRequest) {
  const { upload, parsed } = await parseStaged(
    request.uploadId,
    companyId,
    request.sheetName,
  );
  const existing = await db().query<ExistingEmployee>(
    "SELECT id,code,normalized_name,national_id_hash,employee_type FROM employees WHERE company_id=$1",
    [companyId],
  );
  const period =
    parsed.source.year && parsed.source.month
      ? await db().query<{
          id: string;
          active_import_id: string | null;
          version: number | null;
          gross: string | null;
          net: string | null;
        }>(
          "SELECT p.id,p.active_import_id,i.version,(SELECT SUM(e.gross)::text FROM payroll_entries e WHERE e.import_id=p.active_import_id) AS gross,(SELECT SUM(e.net)::text FROM payroll_entries e WHERE e.import_id=p.active_import_id) AS net FROM payroll_periods p LEFT JOIN imports i ON i.id=p.active_import_id WHERE p.company_id=$1 AND p.year=$2 AND p.month=$3",
          [companyId, parsed.source.year, parsed.source.month],
        )
      : null;
  const rows: PreviewRow[] = parsed.rows.map((row) => {
    const choice = request.employees?.[String(row.row)];
    const match =
      choice?.action === "ignore"
        ? ({ status: "ignored", code: null, method: "manual" } as EmployeeMatch)
        : choice?.action === "match"
          ? ({
              status: "matched",
              code: choice.employeeCode,
              method: "manual",
            } as EmployeeMatch)
          : choice?.action === "create"
            ? ({ status: "new", code: null, method: "manual" } as EmployeeMatch)
            : autoMatch(row, existing.rows);
    const { nationalId: _nationalId, items: _items, ...safe } = row;
    return { ...safe, match, itemCount: row.items.length };
  });
  const extraIssues: ImportIssue[] = [];
  for (const row of rows)
    if (row.match.status === "ambiguous")
      extraIssues.push({
        severity: "error",
        code: "ambiguous_employee",
        message: "พบพนักงานชื่อซ้ำ ต้องจับคู่รหัสเอง",
        row: row.row,
      });
  const unresolvedHeaders = parsed.unknownHeaders.filter(
    (header) => !request.mappings?.[normalizeHeader(header.header)],
  );
  for (const header of unresolvedHeaders)
    extraIssues.push({
      severity: "error",
      code: "unknown_item",
      message: `ยังไม่ได้จับคู่รายการ ${header.header}`,
      field: header.header,
    });
  const prior =
    parsed.source.year && parsed.source.month
      ? await db().query<{ code: string }>(
          "SELECT em.code FROM active_payroll_entries e JOIN employees em ON em.id=e.employee_id WHERE e.company_id=$1 AND (e.year,e.month)=(SELECT p.year,p.month FROM payroll_periods p WHERE p.company_id=$1 AND (p.year,p.month)<($2,$3) AND p.active_import_id IS NOT NULL ORDER BY p.year DESC,p.month DESC LIMIT 1)",
          [companyId, parsed.source.year, parsed.source.month],
        )
      : null;
  const currentCodes = new Set(
    rows.map((row) => row.match.code).filter(Boolean),
  );
  for (const old of prior?.rows || [])
    if (!currentCodes.has(old.code))
      extraIssues.push({
        severity: "warning",
        code: "missing_previous_employee",
        message: `ไม่พบพนักงานรหัส ${old.code} ในงวดนี้`,
      });
  const allIssues = [...parsed.issues, ...extraIssues];
  return {
    upload: { id: upload.id, originalFilename: upload.original_filename },
    source: parsed.source,
    sheets: parsed.sheets.filter((sheet) => sheet.score > 0),
    rows,
    unknownHeaders: parsed.unknownHeaders,
    issues: allIssues,
    existingPeriod: period?.rows[0] || null,
    employees: existing.rows.map((employee) => ({
      code: employee.code,
      type: employee.employee_type,
    })),
    totals: {
      gross: parsed.rows.reduce((total, row) => total + row.gross, 0),
      deductions: parsed.rows.reduce((total, row) => total + row.deductions, 0),
      net: parsed.rows.reduce((total, row) => total + row.net, 0),
    },
  };
}

export async function recordIssues(
  client: PoolClient,
  importId: string,
  issues: ImportIssue[],
) {
  for (const issue of issues)
    await client.query(
      "INSERT INTO import_errors(import_id,row_number,field,severity,code,message) VALUES($1,$2,$3,$4,$5,$6)",
      [
        importId,
        issue.row || null,
        issue.field || null,
        issue.severity,
        issue.code,
        issue.message,
      ],
    );
}
