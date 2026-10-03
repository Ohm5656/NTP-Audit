import { requireRole, authErrorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { toSatang } from "@/lib/money";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireRole("admin", "payroll", "viewer");
    const companyId = user.companyId;
    const [company, employees, periods, entries, items, leave, salary, imports, itemTypes] = await Promise.all([
      db().query("SELECT id,name,timezone FROM companies WHERE id=$1", [companyId]),
      db().query("SELECT id,code,full_name,employee_type,status,position,department,hire_date,current_salary FROM employees WHERE company_id=$1 ORDER BY code", [companyId]),
      db().query("SELECT p.id,p.year,p.month,p.payment_date,p.active_import_id,i.source_sheet,i.original_filename,i.imported_at FROM payroll_periods p LEFT JOIN imports i ON i.id=p.active_import_id WHERE p.company_id=$1 ORDER BY p.year DESC,p.month DESC", [companyId]),
      db().query("SELECT e.id,e.employee_id,e.year,e.month,e.gross,e.deductions,e.net,e.excel_gross,e.excel_net FROM active_payroll_entries e WHERE e.company_id=$1", [companyId]),
      db().query("SELECT pi.entry_id,t.code,t.label,t.kind,pi.amount,pi.source_type FROM payroll_items pi JOIN payroll_item_types t ON t.id=pi.item_type_id JOIN active_payroll_entries e ON e.id=pi.entry_id WHERE e.company_id=$1", [companyId]),
      db().query("SELECT l.id,e.code AS employee_code,l.date_from,l.date_to,l.leave_type,l.days,l.reason,l.note FROM leave_records l JOIN employees e ON e.id=l.employee_id WHERE l.company_id=$1 ORDER BY l.date_from DESC", [companyId]),
      db().query("SELECT s.id,e.code AS employee_code,s.effective_date,s.old_salary,s.new_salary,s.reason,s.note FROM salary_adjustments s JOIN employees e ON e.id=s.employee_id WHERE s.company_id=$1 ORDER BY s.effective_date DESC", [companyId]),
      db().query("SELECT i.id,p.year,p.month,i.version,i.original_filename,i.source_sheet,i.status,i.imported_at, (SELECT count(*)::int FROM payroll_entries e WHERE e.import_id=i.id) AS employee_count FROM imports i JOIN payroll_periods p ON p.id=i.period_id WHERE i.company_id=$1 ORDER BY i.imported_at DESC", [companyId]),
      db().query("SELECT id,code,label,kind,aliases,active FROM payroll_item_types WHERE company_id=$1 ORDER BY kind,code", [companyId]),
    ]);
    const itemsByEntry = new Map<string, Array<{ code: string; label: string; kind: string; amount: number; sourceType: string }>>();
    for (const row of items.rows) {
      const list = itemsByEntry.get(row.entry_id) || [];
      list.push({ code: row.code, label: row.label, kind: row.kind, amount: toSatang(row.amount), sourceType: row.source_type });
      itemsByEntry.set(row.entry_id, list);
    }
    return Response.json({
      company: company.rows[0] || null,
      user: { id: user.id, email: user.email, role: user.role },
      employees: employees.rows.map(row => ({ dbId: row.id, id: row.code, name: row.full_name, type: row.employee_type, status: row.status, position: row.position || "", department: row.department || "", startDate: row.hire_date ? new Date(row.hire_date).toISOString().slice(0, 10) : "", salary: row.current_salary === null ? 0 : toSatang(row.current_salary) })),
      periods: periods.rows.map(row => ({ id: row.id, year: row.year, month: row.month, paymentDate: row.payment_date ? new Date(row.payment_date).toISOString().slice(0, 10) : null, activeImportId: row.active_import_id, sourceSheet: row.source_sheet, originalFilename: row.original_filename, importedAt: row.imported_at })),
      entries: entries.rows.map(row => ({ id: row.id, employeeDbId: row.employee_id, year: row.year, month: row.month, gross: toSatang(row.gross), deductions: toSatang(row.deductions), net: toSatang(row.net), excelGross: row.excel_gross === null ? null : toSatang(row.excel_gross), excelNet: row.excel_net === null ? null : toSatang(row.excel_net), items: itemsByEntry.get(row.id) || [] })),
      leaveRecords: leave.rows.map(row => ({ id: row.id, employeeId: row.employee_code, date: new Date(row.date_from).toISOString().slice(0, 10), dateTo: new Date(row.date_to).toISOString().slice(0, 10), type: ({ personal: "ลากิจ", vacation: "พักร้อน", sick: "ลาป่วย", unpaid: "ลาไม่รับค่าจ้าง", absence: "ขาดงาน" } as Record<string, string>)[row.leave_type], days: Number(row.days), reason: row.reason || "", status: "บันทึกแล้ว" })),
      salaryAdjustments: salary.rows.map(row => ({ id: row.id, employeeId: row.employee_code, date: new Date(row.effective_date).toISOString().slice(0, 10), oldSalary: toSatang(row.old_salary), newSalary: toSatang(row.new_salary), reason: row.reason || "" })),
      imports: imports.rows.map(row => ({ id: row.id, year: row.year, month: row.month, version: row.version, originalFilename: row.original_filename, sourceSheet: row.source_sheet, status: row.status, importedAt: row.imported_at, employeeCount: row.employee_count })),
      itemTypes: itemTypes.rows,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
