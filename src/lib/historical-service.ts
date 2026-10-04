import { randomUUID, createHash } from "node:crypto";
import { db } from "./db";
import { normalizeName } from "./excel-import";
import { parseHistoricalWorkbook } from "./historical-import";
import { deletePrivateFile, withPrivateUploadPath, writePrivateFile } from "./import-storage";

type EmployeeRow = { id: string; normalized_name: string; full_name: string };
type HistoricalImportRow = { id: string; storage_key: string; metadata: unknown };

const nameAliases: Array<[string, string]> = [
  ["ดนุกานต์", "ตั้ง"], ["อัษฎาพร", "บอล"], ["วรรณษณ์", "แนน"], ["จริยา", "วรรณษรณ์"], ["พัชระ", "เม่น"],
  ["วัชระ", "นุก"], ["โชคลิขิต", "เบียร์"], ["สุภนัย", "เปา"], ["ภาณุวัฒน์", "บอย"], ["อดิศักดิ์", "เก็ต"], ["บรรจง", "บรรจง"],
];

function personKey(value: string): string {
  return normalizeName(value).replace(/^(นาย|นางสาว|นาง)/, "").replace(/[.]/g, "");
}

function findEmployee(sourceName: string, employees: EmployeeRow[]): EmployeeRow | null {
  const source = personKey(sourceName);
  const direct = employees.filter((employee) => {
    const candidate = personKey(employee.full_name || employee.normalized_name);
    return candidate === source || candidate.includes(source) || source.includes(candidate);
  });
  if (direct.length === 1) return direct[0];
  const aliases = nameAliases.flatMap(([left, right]) => {
    const a = personKey(left), b = personKey(right);
    return source.includes(a) ? [b] : source.includes(b) ? [a] : [];
  });
  const aliasMatches = employees.filter((employee) => {
    const candidate = personKey(employee.full_name || employee.normalized_name);
    return aliases.some((alias) => candidate.includes(alias) || alias.includes(candidate));
  });
  return aliasMatches.length === 1 ? aliasMatches[0] : null;
}

function scopeOf(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && "scope" in metadata && typeof metadata.scope === "string") return metadata.scope;
  if (typeof metadata === "string") {
    try { return scopeOf(JSON.parse(metadata)); } catch { return null; }
  }
  return null;
}

/** Imports start dates, leave records, and salary-adjustment history. Monthly Excel remains the only payroll source. */
export async function importHistoricalAnnual({ companyId, userId, filename, buffer }: { companyId: string; userId: string; filename: string; buffer: Buffer }) {
  if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024) throw new Error("ขนาดไฟล์ไม่อยู่ในขอบเขตที่รองรับ");
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const storageKey = `${randomUUID()}.xlsx`;
  await writePrivateFile(storageKey, buffer);
  let replacedStorageKey: string | null = null;

  try {
    const parsed = await withPrivateUploadPath(storageKey, parseHistoricalWorkbook);
    const client = await db().connect();
    try {
      await client.query("BEGIN");
      const duplicate = await client.query<HistoricalImportRow>("SELECT id,storage_key,metadata FROM historical_imports WHERE company_id=$1 AND sha256=$2 FOR UPDATE", [companyId, sha256]);
      if (duplicate.rowCount) {
        const previous = duplicate.rows[0];
        if (scopeOf(previous.metadata) === "employment_leave_salary_adjustments") {
          throw new Error("ไฟล์ Annual Excel นี้ถูกนำเข้าพร้อมประวัติปรับเงินเดือนแล้ว");
        }
        const previousNote = `Annual historical import ${previous.id}`;
        await client.query("DELETE FROM leave_records WHERE company_id=$1 AND source_type='imported' AND note=$2", [companyId, previousNote]);
        await client.query("DELETE FROM salary_adjustments WHERE company_id=$1 AND source_type='imported' AND note=$2", [companyId, previousNote]);
        const templateUsesPreviousFile = await client.query("SELECT 1 FROM annual_templates WHERE storage_key=$1 LIMIT 1", [previous.storage_key]);
        await client.query("DELETE FROM historical_imports WHERE id=$1", [previous.id]);
        // The first separated-template migration may reference this original
        // historical upload. Keep its private file while it remains a template.
        if (!templateUsesPreviousFile.rowCount) replacedStorageKey = previous.storage_key;
      }

      const history = await client.query<{ id: string }>(
        "INSERT INTO historical_imports(company_id,original_filename,storage_key,sha256,imported_by,metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
        [companyId, filename, storageKey, sha256, userId, JSON.stringify({ sheets: parsed.sheets, years: parsed.years, scope: "employment_leave_salary_adjustments" })],
      );
      const historyId = history.rows[0].id;
      const sourceNote = `Annual historical import ${historyId}`;
      const records = await client.query<EmployeeRow>("SELECT id,normalized_name,full_name FROM employees WHERE company_id=$1 FOR UPDATE", [companyId]);
      let matched = 0, leave = 0, startDates = 0, salaryAdjustments = 0;
      const unmatched: string[] = [];

      for (const source of parsed.employees) {
        const employee = findEmployee(source.name, records.rows);
        if (!employee) { unmatched.push(source.name); continue; }
        matched++;
        if (source.startDate) {
          const updated = await client.query("UPDATE employees SET hire_date=COALESCE(hire_date,$3),updated_at=now() WHERE id=$1 AND company_id=$2 AND hire_date IS NULL", [employee.id, companyId, source.startDate]);
          startDates += updated.rowCount || 0;
        }
        for (const item of source.leave) {
          await client.query("INSERT INTO leave_records(company_id,employee_id,date_from,date_to,leave_type,days,reason,source_type,created_by,note) VALUES($1,$2,$3,$4,$5,$6,$7,'imported',$8,$9)", [companyId, employee.id, item.dateFrom, item.dateTo, item.type, item.days, item.reason || null, userId, sourceNote]);
          leave++;
        }
        let previousSalary: number | null = null;
        for (const item of [...source.adjustments].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))) {
          const oldSalary = previousSalary ?? item.newSalary;
          await client.query("INSERT INTO salary_adjustments(company_id,employee_id,effective_date,old_salary,new_salary,reason,note,source_type,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'imported',$8)", [companyId, employee.id, item.effectiveDate, oldSalary, item.newSalary, item.reason || null, sourceNote, userId]);
          previousSalary = item.newSalary;
          salaryAdjustments++;
        }
      }

      await client.query("INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data) VALUES($1,$2,'import','historical_import',$3,$4)", [companyId, userId, historyId, JSON.stringify({ years: parsed.years, matched, startDates, leave, salaryAdjustments, unmatched: unmatched.length, scope: "employment_leave_salary_adjustments" })]);
      await client.query("COMMIT");
      if (replacedStorageKey) await deletePrivateFile(replacedStorageKey).catch(() => {});
      return { years: parsed.years, employees: parsed.employees.length, matched, startDates, leave, salaryAdjustments, unmatched: unmatched.length };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    await deletePrivateFile(storageKey).catch(() => {});
    throw error;
  }
}
