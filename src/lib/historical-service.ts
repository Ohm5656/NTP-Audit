import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { db } from "./db";
import { parseHistoricalWorkbook, type HistoricalPayrollItem } from "./historical-import";
import { ensureUploadDirectory, uploadPath } from "./import-storage";

function codeFor(name: string) { return `HST-${name.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "EMP"}`; }

export async function importHistoricalAnnual({ companyId, userId, filename, buffer }: { companyId: string; userId: string; filename: string; buffer: Buffer }) {
  if (buffer.length === 0 || buffer.length > 25 * 1024 * 1024) throw new Error("ขนาดไฟล์ไม่อยู่ในขอบเขตที่รองรับ");
  const sha256 = (await import("node:crypto")).createHash("sha256").update(buffer).digest("hex");
  const storageKey = `${randomUUID()}.xlsx`; await ensureUploadDirectory(); await fs.writeFile(uploadPath(storageKey), buffer, { mode: 0o600 });
  try {
    const parsed = await parseHistoricalWorkbook(uploadPath(storageKey));
    const client = await db().connect();
    try {
      await client.query("BEGIN");
      const duplicate = await client.query("SELECT id FROM historical_imports WHERE company_id=$1 AND sha256=$2", [companyId, sha256]);
      if (duplicate.rowCount) throw new Error("ไฟล์ Annual Excel นี้ถูกนำเข้าแล้ว");
      const history = await client.query<{ id: string }>("INSERT INTO historical_imports(company_id,original_filename,storage_key,sha256,imported_by,metadata) VALUES($1,$2,$3,$4,$5,$6) RETURNING id", [companyId, filename, storageKey, sha256, userId, JSON.stringify({ sheets: parsed.sheets, years: parsed.years })]);
      const employeeRows = await client.query<{ id: string; code: string; normalized_name: string; employee_type: "employee" | "director" }>("SELECT id,code,normalized_name,employee_type FROM employees WHERE company_id=$1 FOR UPDATE", [companyId]);
      const employees = new Map(employeeRows.rows.map((row) => [row.normalized_name, row]));
      const typeIds = new Map<string, string>();
      const ensureType = async (item: HistoricalPayrollItem) => {
        const cached = typeIds.get(item.code); if (cached) return cached;
        const found = await client.query<{ id: string }>("SELECT id FROM payroll_item_types WHERE company_id=$1 AND code=$2", [companyId, item.code]);
        const id = found.rows[0]?.id || (await client.query<{ id: string }>("INSERT INTO payroll_item_types(company_id,code,label,kind,aliases) VALUES($1,$2,$3,$4,$5) RETURNING id", [companyId, item.code, item.label, item.kind, [item.label]])).rows[0].id;
        typeIds.set(item.code, id); return id;
      };
      const periodImports = new Map<string, { periodId: string; importId: string }>();
      let employeeCount = 0; let payrollCount = 0; let leaveCount = 0; let adjustmentCount = 0;
      for (const source of parsed.employees) {
        let employee = employees.get(source.normalizedName);
        if (!employee) {
          let code = codeFor(source.name); let suffix = 1;
          while (Array.from(employees.values()).some((item) => item.code === code)) code = `${codeFor(source.name)}-${++suffix}`;
          employee = (await client.query<{ id: string; code: string; normalized_name: string; employee_type: "employee" | "director" }>("INSERT INTO employees(company_id,code,full_name,normalized_name,employee_type,hire_date,current_salary) VALUES($1,$2,$3,$4,'employee',$5,$6) RETURNING id,code,normalized_name,employee_type", [companyId, code, source.name, source.normalizedName, source.startDate, source.currentSalary === null ? null : source.currentSalary / 100])).rows[0];
          employees.set(source.normalizedName, employee); employeeCount++;
        } else await client.query("UPDATE employees SET hire_date=COALESCE(hire_date,$3), current_salary=COALESCE($4,current_salary), updated_at=now() WHERE id=$1 AND company_id=$2", [employee.id, companyId, source.startDate, source.currentSalary === null ? null : source.currentSalary / 100]);
        for (const payroll of source.payroll) {
          const key = `${source.year}-${payroll.month}`; let periodImport = periodImports.get(key);
          if (!periodImport) {
            const period = await client.query<{ id: string; active_import_id: string | null }>("INSERT INTO payroll_periods(company_id,year,month) VALUES($1,$2,$3) ON CONFLICT(company_id,year,month) DO UPDATE SET year=EXCLUDED.year RETURNING id,active_import_id", [companyId, source.year, payroll.month]);
            const version = await client.query<{ version: number }>("SELECT COALESCE(MAX(version),0)::int + 1 AS version FROM imports WHERE period_id=$1", [period.rows[0].id]);
            if (period.rows[0].active_import_id) await client.query("UPDATE imports SET status='replaced' WHERE id=$1", [period.rows[0].active_import_id]);
            const imported = await client.query<{ id: string }>("INSERT INTO imports(company_id,period_id,version,original_filename,storage_key,sha256,source_sheet,status,imported_by,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,'active',$8,$9) RETURNING id", [companyId, period.rows[0].id, version.rows[0].version, filename, storageKey, sha256, "Annual historical import", userId, JSON.stringify({ historicalImportId: history.rows[0].id })]);
            await client.query("UPDATE payroll_periods SET active_import_id=$2 WHERE id=$1", [period.rows[0].id, imported.rows[0].id]);
            periodImport = { periodId: period.rows[0].id, importId: imported.rows[0].id }; periodImports.set(key, periodImport);
          }
          const inserted = await client.query<{ id: string }>("INSERT INTO payroll_entries(import_id,period_id,employee_id,source_row,gross,deductions,net,warnings) VALUES($1,$2,$3,NULL,$4,$5,$6,'[]') ON CONFLICT(import_id,employee_id) DO NOTHING RETURNING id", [periodImport.importId, periodImport.periodId, employee.id, payroll.gross / 100, payroll.deductions / 100, payroll.net / 100]);
          if (!inserted.rowCount) continue;
          for (const item of payroll.items) { const typeId = await ensureType(item); await client.query("INSERT INTO payroll_items(entry_id,item_type_id,amount,original_amount,source_header,source_type) VALUES($1,$2,$3,$3,$4,'imported')", [inserted.rows[0].id, typeId, item.amount / 100, item.label]); }
          payrollCount++;
        }
        for (const leave of source.leave) { await client.query("INSERT INTO leave_records(company_id,employee_id,date_from,date_to,leave_type,days,reason,source_type,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,'imported',$8)", [companyId, employee.id, leave.dateFrom, leave.dateTo, leave.type, leave.days, leave.reason || null, userId]); leaveCount++; }
        for (const adjustment of source.adjustments) { await client.query("INSERT INTO salary_adjustments(company_id,employee_id,effective_date,old_salary,new_salary,reason,source_type,created_by) VALUES($1,$2,$3,$4,$5,$6,'imported',$7)", [companyId, employee.id, adjustment.date, adjustment.oldSalary / 100, adjustment.newSalary / 100, adjustment.reason || null, userId]); adjustmentCount++; }
      }
      await client.query("INSERT INTO audit_logs(company_id,actor_id,action,entity_type,entity_id,after_data) VALUES($1,$2,'import','historical_import',$3,$4)", [companyId, userId, history.rows[0].id, JSON.stringify({ years: parsed.years, employees: employeeCount, payroll: payrollCount, leave: leaveCount, adjustments: adjustmentCount })]);
      await client.query("COMMIT");
      return { years: parsed.years, employees: parsed.employees.length, newEmployees: employeeCount, payroll: payrollCount, leave: leaveCount, adjustments: adjustmentCount };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  } catch (error) { await fs.unlink(uploadPath(storageKey)).catch(() => {}); throw error; }
}
