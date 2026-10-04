import { requireRole, authErrorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { toSatang } from "@/lib/money";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireRole("admin", "payroll", "viewer");
    const companyId = user.companyId;
    const [company, employees, periods, entries, items, leave, salary, imports, itemTypes, importMappings, annualTemplate] = await Promise.all([
      db().query("SELECT id,name,address,tax_id,timezone FROM companies WHERE id=$1", [companyId]),
      db().query("SELECT id,code,full_name,employee_type,status,position,department,hire_date::text AS hire_date,current_salary FROM employees WHERE company_id=$1 ORDER BY code", [companyId]),
      db().query("SELECT p.id,p.year,p.month,p.payment_date::text AS payment_date,p.active_import_id,i.source_sheet,i.original_filename,i.imported_at FROM payroll_periods p LEFT JOIN imports i ON i.id=p.active_import_id WHERE p.company_id=$1 ORDER BY p.year DESC,p.month DESC", [companyId]),
      db().query("SELECT e.id,e.employee_id,e.year,e.month,e.source_row,e.gross,e.deductions,e.net,e.excel_gross,e.excel_net,e.warnings FROM active_payroll_entries e WHERE e.company_id=$1", [companyId]),
      db().query("SELECT pi.id,pi.entry_id,t.code,t.label,t.kind,pi.amount,pi.original_amount,pi.source_type,pi.source_header,pi.source_cell,pi.raw_value FROM payroll_items pi JOIN payroll_item_types t ON t.id=pi.item_type_id JOIN active_payroll_entries e ON e.id=pi.entry_id WHERE e.company_id=$1", [companyId]),
      db().query("SELECT l.id,e.code AS employee_code,l.date_from::text AS date_from,l.date_to::text AS date_to,l.leave_type,l.days,l.reason,l.note FROM leave_records l JOIN employees e ON e.id=l.employee_id WHERE l.company_id=$1 ORDER BY l.date_from DESC", [companyId]),
      db().query("SELECT s.id,e.code AS employee_code,s.effective_date::text AS effective_date,s.old_salary,s.new_salary,s.reason,s.note FROM salary_adjustments s JOIN employees e ON e.id=s.employee_id WHERE s.company_id=$1 ORDER BY s.effective_date DESC", [companyId]),
      db().query("SELECT i.id,p.year,p.month,i.version,i.original_filename,i.source_sheet,i.status,i.imported_at, (SELECT count(*)::int FROM payroll_entries e WHERE e.import_id=i.id) AS employee_count FROM imports i JOIN payroll_periods p ON p.id=i.period_id WHERE i.company_id=$1 ORDER BY i.imported_at DESC", [companyId]),
      db().query("SELECT id,code,label,kind,aliases,active FROM payroll_item_types WHERE company_id=$1 ORDER BY kind,code", [companyId]),
      db().query("SELECT m.id,m.normalized_header,t.code,t.label,t.kind FROM import_mappings m JOIN payroll_item_types t ON t.id=m.item_type_id WHERE m.company_id=$1 ORDER BY m.normalized_header", [companyId]),
      db().query("SELECT original_filename,uploaded_at::text AS uploaded_at FROM annual_templates WHERE company_id=$1 LIMIT 1", [companyId]),
    ]);
    const itemsByEntry = new Map<string, Array<{ id: string; code: string; label: string; kind: string; amount: number; originalAmount: number | null; sourceType: string; sourceHeader: string | null; sourceCell: string | null; originalValue: string | null }>>();
    for (const row of items.rows) {
      const list = itemsByEntry.get(row.entry_id) || [];
      list.push({ id: row.id, code: row.code, label: row.label, kind: row.kind, amount: toSatang(row.amount), originalAmount: row.original_amount === null ? null : toSatang(row.original_amount), sourceType: row.source_type, sourceHeader: row.source_header, sourceCell: row.source_cell, originalValue: row.raw_value });
      itemsByEntry.set(row.entry_id, list);
    }
    return Response.json({
      company: company.rows[0] || null,
      user: { id: user.id, email: user.email, role: user.role },
      employees: employees.rows.map(row => ({ dbId: row.id, id: row.code, name: row.full_name, type: row.employee_type, status: row.status, position: row.position || "", department: row.department || "", startDate: row.hire_date || "", salary: row.current_salary === null ? 0 : toSatang(row.current_salary) })),
      periods: periods.rows.map(row => ({ id: row.id, year: row.year, month: row.month, paymentDate: row.payment_date || null, activeImportId: row.active_import_id, sourceSheet: row.source_sheet, originalFilename: row.original_filename, importedAt: row.imported_at })),
      entries: entries.rows.map(row => ({ id: row.id, employeeDbId: row.employee_id, year: row.year, month: row.month, sourceRow: row.source_row, gross: toSatang(row.gross), deductions: toSatang(row.deductions), net: toSatang(row.net), excelGross: row.excel_gross === null ? null : toSatang(row.excel_gross), excelNet: row.excel_net === null ? null : toSatang(row.excel_net), warnings: row.warnings, items: itemsByEntry.get(row.id) || [] })),
      leaveRecords: leave.rows.map(row => ({ id: row.id, employeeId: row.employee_code, date: row.date_from, dateTo: row.date_to, type: ({ personal: "ลากิจ", vacation: "พักร้อน", sick: "ลาป่วย", unpaid: "ลาไม่รับค่าจ้าง", absence: "ขาดงาน" } as Record<string, string>)[row.leave_type], days: Number(row.days), reason: row.reason || "", status: "บันทึกแล้ว" })),
      salaryAdjustments: salary.rows.map(row => ({ id: row.id, employeeId: row.employee_code, date: row.effective_date, oldSalary: toSatang(row.old_salary), newSalary: toSatang(row.new_salary), reason: row.reason || "" })),
      imports: imports.rows.map(row => ({ id: row.id, year: row.year, month: row.month, version: row.version, originalFilename: row.original_filename, sourceSheet: row.source_sheet, status: row.status, importedAt: row.imported_at, employeeCount: row.employee_count })),
      itemTypes: itemTypes.rows,
      importMappings: importMappings.rows.map(row => ({ id: row.id, header: row.normalized_header, code: row.code, label: row.label, kind: row.kind })),
      annualTemplate: annualTemplate.rows[0] ? { originalFilename: annualTemplate.rows[0].original_filename, uploadedAt: annualTemplate.rows[0].uploaded_at } : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
