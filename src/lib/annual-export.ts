import { normalizeHeader } from "./excel-import";
import { db } from "./db";
import { uploadPath } from "./import-storage";

export type AnnualExportInput = {
  year: number;
  itemHeaderCodes: Record<string, string>;
  specialHeaderCodes: Record<string, "gross" | "deductions" | "net">;
  leaveHeaderCodes: Record<string, "personal" | "vacation" | "sick" | "unpaid" | "absence">;
  leaveDateHeaderKeys: string[];
  labels: { employeeTitle: string; adjustmentTitle: string; companySummaryTitle: string; hireDate: string };
  summary: Array<{ month: number; employeeGross: number; directorGross: number; employeeBonus: number; directorBonus: number; total: number }>;
  employees: Array<{
    code: string;
    fullName: string;
    employeeType: "employee" | "director";
    hireDate: string | null;
    entries: Array<{ month: number; gross: number; deductions: number; net: number; items: Record<string, number> }>;
    leaves: Array<{ dateFrom: string; dateTo: string; type: "personal" | "vacation" | "sick" | "unpaid" | "absence"; days: number; reason: string | null }>;
    adjustments: Array<{ effectiveDate: string; oldSalary: number; newSalary: number; reason: string | null; note: string | null }>;
  }>;
};

type EmployeeRow = { id: string; code: string; full_name: string; employee_type: "employee" | "director"; hire_date: string | null };
type EntryRow = { id: string; employee_id: string; month: number; gross: string; deductions: string; net: string };
type ItemRow = { entry_id: string; code: string; amount: string };
type LeaveRow = { employee_id: string; date_from: string; date_to: string; leave_type: "personal" | "vacation" | "sick" | "unpaid" | "absence"; days: string; reason: string | null };
type AdjustmentRow = { employee_id: string; effective_date: string; old_salary: string; new_salary: string; reason: string | null; note: string | null };

const specialHeaders: Array<[string, "gross" | "deductions" | "net"]> = [
  ["รวมรายได้", "gross"], ["รวมเงินได้", "gross"], ["รวมรายการหัก", "deductions"], ["รายการหัก", "deductions"], ["รายได้สุทธิ", "net"], ["เงินได้สุทธิ", "net"],
];
const leaveHeaders: Array<[string, AnnualExportInput["employees"][number]["leaves"][number]["type"]]> = [
  ["ลากิจ", "personal"], ["ลาพักร้อน", "vacation"], ["พักร้อน", "vacation"], ["พักร้อน 7 วัน", "vacation"], ["ลาป่วย", "sick"], ["ลาไม่รับค่าจ้าง", "unpaid"], ["ไม่รับค่าจ้าง", "unpaid"], ["ขาดงาน", "absence"],
];

export async function getAnnualExportInput(companyId: string, year: number): Promise<{ templatePath: string; input: AnnualExportInput }> {
  const [template, employees, entries, items, leaves, adjustments, types] = await Promise.all([
    db().query<{ storage_key: string }>("SELECT storage_key FROM historical_imports WHERE company_id=$1 ORDER BY imported_at DESC LIMIT 1", [companyId]),
    db().query<EmployeeRow>("SELECT e.id,e.code,e.full_name,e.employee_type,e.hire_date::text FROM employees e WHERE e.company_id=$1 AND EXISTS (SELECT 1 FROM active_payroll_entries p WHERE p.employee_id=e.id AND p.year=$2) ORDER BY CASE e.employee_type WHEN 'employee' THEN 0 ELSE 1 END,e.code", [companyId, year]),
    db().query<EntryRow>("SELECT id,employee_id,month,gross::text,deductions::text,net::text FROM active_payroll_entries WHERE company_id=$1 AND year=$2 ORDER BY employee_id,month", [companyId, year]),
    db().query<ItemRow>("SELECT pi.entry_id,t.code,pi.amount::text FROM payroll_items pi JOIN payroll_item_types t ON t.id=pi.item_type_id JOIN active_payroll_entries e ON e.id=pi.entry_id WHERE e.company_id=$1 AND e.year=$2", [companyId, year]),
    db().query<LeaveRow>("SELECT employee_id,date_from::text,date_to::text,leave_type,days::text,reason FROM leave_records WHERE company_id=$1 AND EXTRACT(YEAR FROM date_from)=$2 ORDER BY date_from,id", [companyId, year]),
    db().query<AdjustmentRow>("SELECT employee_id,effective_date::text,old_salary::text,new_salary::text,reason,note FROM salary_adjustments WHERE company_id=$1 ORDER BY effective_date,id", [companyId]),
    db().query<{ code: string; label: string; aliases: string[] }>("SELECT code,label,aliases FROM payroll_item_types WHERE company_id=$1", [companyId]),
  ]);
  if (!template.rows[0]) throw new Error("ยังไม่มีไฟล์ Annual Template สำหรับสร้างรายงาน");
  if (!employees.rowCount) throw new Error("ยังไม่มี Payroll ในปีที่เลือก");
  const entriesByEmployee = new Map<string, EntryRow[]>();
  for (const row of entries.rows) entriesByEmployee.set(row.employee_id, [...(entriesByEmployee.get(row.employee_id) || []), row]);
  const itemsByEntry = new Map<string, ItemRow[]>();
  for (const row of items.rows) itemsByEntry.set(row.entry_id, [...(itemsByEntry.get(row.entry_id) || []), row]);
  const leavesByEmployee = new Map<string, LeaveRow[]>();
  for (const row of leaves.rows) leavesByEmployee.set(row.employee_id, [...(leavesByEmployee.get(row.employee_id) || []), row]);
  const adjustmentsByEmployee = new Map<string, AdjustmentRow[]>();
  for (const row of adjustments.rows) adjustmentsByEmployee.set(row.employee_id, [...(adjustmentsByEmployee.get(row.employee_id) || []), row]);
  const itemHeaderCodes: Record<string, string> = {};
  for (const type of types.rows) for (const label of [type.label, ...(type.aliases || [])]) itemHeaderCodes[normalizeHeader(label)] = type.code;
  const bonusCodes = new Set(types.rows.filter((type) => [type.label, ...(type.aliases || [])].some((label) => normalizeHeader(label).includes(normalizeHeader("โบนัส")))).map((type) => type.code));
  const exportEmployees = employees.rows.map((employee) => ({
    code: employee.code, fullName: employee.full_name, employeeType: employee.employee_type, hireDate: employee.hire_date,
    entries: (entriesByEmployee.get(employee.id) || []).map((entry) => ({
      month: entry.month, gross: Number(entry.gross), deductions: Number(entry.deductions), net: Number(entry.net),
      items: Object.fromEntries((itemsByEntry.get(entry.id) || []).map((item) => [item.code, Number(item.amount)])),
    })),
    leaves: (leavesByEmployee.get(employee.id) || []).map((leave) => ({ dateFrom: leave.date_from, dateTo: leave.date_to, type: leave.leave_type, days: Number(leave.days), reason: leave.reason })),
    adjustments: (adjustmentsByEmployee.get(employee.id) || []).map((adjustment) => ({ effectiveDate: adjustment.effective_date, oldSalary: Number(adjustment.old_salary), newSalary: Number(adjustment.new_salary), reason: adjustment.reason, note: adjustment.note })),
  }));
  const summary = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    let employeeGross = 0, directorGross = 0, employeeBonus = 0, directorBonus = 0;
    for (const employee of exportEmployees) {
      const entry = employee.entries.find((item) => item.month === month);
      if (!entry) continue;
      const bonus = Object.entries(entry.items).filter(([code]) => bonusCodes.has(code)).reduce((total, [, amount]) => total + amount, 0);
      if (employee.employeeType === "director") { directorGross += entry.gross - bonus; directorBonus += bonus; }
      else { employeeGross += entry.gross - bonus; employeeBonus += bonus; }
    }
    return { month, employeeGross, directorGross, employeeBonus, directorBonus, total: employeeGross + directorGross + employeeBonus + directorBonus };
  });
  const input: AnnualExportInput = {
    year,
    itemHeaderCodes,
    specialHeaderCodes: Object.fromEntries(specialHeaders.map(([label, code]) => [normalizeHeader(label), code])),
    leaveHeaderCodes: Object.fromEntries(leaveHeaders.map(([label, code]) => [normalizeHeader(label), code])),
    leaveDateHeaderKeys: [normalizeHeader("วันที่ลา"), normalizeHeader("วันที่ ลา")],
    labels: { employeeTitle: "รายงานค่าจ้าง", adjustmentTitle: "รายละเอียดการปรับเงินเดือน พนักงาน", companySummaryTitle: "ตารางสรุปรายได้ พนักงาน", hireDate: "วันที่เริ่มงาน" },
    summary,
    employees: exportEmployees,
  };
  return { templatePath: uploadPath(template.rows[0].storage_key), input };
}
