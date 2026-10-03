import ExcelJS from "exceljs";
import { z } from "zod";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { db } from "@/lib/db";
import { toSatang } from "@/lib/money";
import { badRequest } from "@/lib/request";

export const runtime = "nodejs";

const querySchema = z.object({
  kind: z.enum(["employee", "company", "monthly"]),
  year: z.coerce.number().int().min(1900).max(2200),
  month: z.coerce.number().int().min(1).max(12).optional(),
  employee: z.string().max(40).optional(),
});

const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
type Entry = { id: string; code: string; name: string; employee_type: string; month: number; gross: string; deductions: string; net: string };
type Item = { entry_id: string; code: string; label: string; kind: "income" | "deduction"; amount: string };

function safeText(value: string) {
  return /^[=+@\-]/.test(value) ? `'${value}` : value;
}

function styleSheet(sheet: ExcelJS.Worksheet, moneyFrom = 2) {
  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
  sheet.getRow(3).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF176D52" } };
  sheet.getColumn(1).width = 28;
  for (let col = moneyFrom; col <= sheet.columnCount; col++) {
    sheet.getColumn(col).width = 15;
    sheet.getColumn(col).numFmt = '#,##0.00;[Red](#,##0.00);0.00';
  }
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: sheet.columnCount } };
}

function addAnnualRows(sheet: ExcelJS.Worksheet, entries: Entry[], items: Item[], codes: { code: string; label: string; kind: string }[]) {
  const entryByMonth = new Map(entries.map((entry) => [entry.month, entry]));
  const itemsByEntry = new Map<string, Item[]>();
  for (const item of items) itemsByEntry.set(item.entry_id, [...(itemsByEntry.get(item.entry_id) || []), item]);
  sheet.addRow(["รายการ", ...monthNames, "รวมปี"]);
  const addLine = (label: string, value: (entry: Entry) => number) => {
    const values = monthNames.map((_, index) => {
      const entry = entryByMonth.get(index + 1);
      return entry ? value(entry) / 100 : null;
    });
    sheet.addRow([safeText(label), ...values, values.reduce<number>((sum, amount) => sum + (amount || 0), 0)]);
  };
  sheet.addRow(["รายได้"]);
  for (const itemType of codes.filter((type) => type.kind === "income"))
    addLine(itemType.label, (entry) => (itemsByEntry.get(entry.id) || []).filter((item) => item.code === itemType.code).reduce((sum, item) => sum + toSatang(item.amount), 0));
  addLine("รวมรายได้", (entry) => toSatang(entry.gross));
  sheet.addRow(["รายการหัก"]);
  for (const itemType of codes.filter((type) => type.kind === "deduction"))
    addLine(itemType.label, (entry) => (itemsByEntry.get(entry.id) || []).filter((item) => item.code === itemType.code).reduce((sum, item) => sum + toSatang(item.amount), 0));
  addLine("รวมรายการหัก", (entry) => toSatang(entry.deductions));
  addLine("เงินได้สุทธิ", (entry) => toSatang(entry.net));
  styleSheet(sheet);
}

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin", "payroll", "viewer");
    const url = new URL(request.url);
    const checked = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!checked.success) return badRequest("ตัวเลือกส่งออกไม่ถูกต้อง");
    const { kind, year, month, employee } = checked.data;
    if (kind === "employee" && !employee) return badRequest("กรุณาเลือกรหัสพนักงาน");
    if (kind === "monthly" && !month) return badRequest("กรุณาเลือกเดือน");
    const employees = await db().query<{ id: string; code: string; full_name: string }>(
      "SELECT id,code,full_name FROM employees WHERE company_id=$1 AND ($2::text IS NULL OR code=$2)",
      [user.companyId, kind === "employee" ? employee : null],
    );
    if (kind === "employee" && employees.rows.length !== 1) return badRequest("ไม่พบพนักงาน", 404);
    const entries = await db().query<Entry>(
      "SELECT e.id,em.code,em.full_name AS name,em.employee_type,e.month,e.gross,e.deductions,e.net FROM active_payroll_entries e JOIN employees em ON em.id=e.employee_id WHERE e.company_id=$1 AND e.year=$2 AND ($3::int IS NULL OR e.month=$3) AND ($4::text IS NULL OR em.code=$4) ORDER BY e.month,em.code",
      [user.companyId, year, kind === "monthly" ? month : null, kind === "employee" ? employee : null],
    );
    const items = await db().query<Item>(
      "SELECT pi.entry_id,t.code,t.label,t.kind,pi.amount FROM payroll_items pi JOIN payroll_item_types t ON t.id=pi.item_type_id JOIN active_payroll_entries e ON e.id=pi.entry_id JOIN employees em ON em.id=e.employee_id WHERE e.company_id=$1 AND e.year=$2 AND ($3::int IS NULL OR e.month=$3) AND ($4::text IS NULL OR em.code=$4)",
      [user.companyId, year, kind === "monthly" ? month : null, kind === "employee" ? employee : null],
    );
    const book = new ExcelJS.Workbook();
    book.creator = "NTP Audit";
    book.created = new Date();
    if (kind === "employee") {
      const selected = employees.rows[0];
      const sheet = book.addWorksheet("รายได้รายปี");
      sheet.addRow([safeText(selected.full_name), selected.code]);
      sheet.addRow([`ปี ${year + 543}`, `ข้อมูล ${entries.rows.length} / 12 เดือน`]);
      const types = await db().query<{ code: string; label: string; kind: string }>("SELECT code,label,kind FROM payroll_item_types WHERE company_id=$1 ORDER BY kind,code", [user.companyId]);
      addAnnualRows(sheet, entries.rows, items.rows, types.rows);
      const leave = book.addWorksheet("วันลา");
      leave.addRow(["วันลาในปี", year + 543]);
      leave.addRow([]);
      leave.addRow(["วันที่เริ่ม", "วันที่สิ้นสุด", "ประเภท", "จำนวนวัน", "เหตุผล"]);
      const leaveRows = await db().query<{ date_from: string; date_to: string; leave_type: string; days: string; reason: string | null }>("SELECT date_from::text,date_to::text,leave_type,days,reason FROM leave_records WHERE company_id=$1 AND employee_id=$2 AND EXTRACT(YEAR FROM date_from)=$3 ORDER BY date_from", [user.companyId, selected.id, year]);
      const leaveLabels: Record<string, string> = { personal: "ลากิจ", vacation: "พักร้อน", sick: "ลาป่วย", unpaid: "ลาไม่รับค่าจ้าง", absence: "ขาดงาน" };
      for (const row of leaveRows.rows) leave.addRow([row.date_from, row.date_to, leaveLabels[row.leave_type] || row.leave_type, Number(row.days), safeText(row.reason || "")]);
      styleSheet(leave, 4);
      const salary = book.addWorksheet("ปรับเงินเดือน");
      salary.addRow(["ประวัติปรับเงินเดือน", year + 543]);
      salary.addRow([]);
      salary.addRow(["วันที่มีผล", "เงินเดือนเดิม", "เงินเดือนใหม่", "ส่วนต่าง", "อัตรา (%)", "เหตุผล"]);
      const salaryRows = await db().query<{ effective_date: string; old_salary: string; new_salary: string; reason: string | null }>("SELECT effective_date::text,old_salary,new_salary,reason FROM salary_adjustments WHERE company_id=$1 AND employee_id=$2 AND EXTRACT(YEAR FROM effective_date)=$3 ORDER BY effective_date", [user.companyId, selected.id, year]);
      for (const row of salaryRows.rows) salary.addRow([row.effective_date, Number(row.old_salary), Number(row.new_salary), Number(row.new_salary) - Number(row.old_salary), Number(row.old_salary) ? ((Number(row.new_salary) - Number(row.old_salary)) / Number(row.old_salary)) * 100 : null, safeText(row.reason || "")]);
      styleSheet(salary);
    } else if (kind === "monthly") {
      const sheet = book.addWorksheet(monthNames[month! - 1]);
      sheet.addRow([`งวด ${monthNames[month! - 1]} ${year + 543}`]);
      sheet.addRow([`จำนวน ${entries.rows.length} คน`]);
      sheet.addRow(["รหัส", "ชื่อ", "ประเภท", "รายได้รวม", "รายการหัก", "เงินสุทธิ"]);
      for (const entry of entries.rows) sheet.addRow([entry.code, safeText(entry.name), entry.employee_type === "director" ? "กรรมการ" : "พนักงาน", Number(entry.gross), Number(entry.deductions), Number(entry.net)]);
      sheet.addRow(["รวม", "", "", entries.rows.reduce((sum, row) => sum + Number(row.gross), 0), entries.rows.reduce((sum, row) => sum + Number(row.deductions), 0), entries.rows.reduce((sum, row) => sum + Number(row.net), 0)]);
      styleSheet(sheet, 4);
      sheet.getColumn(2).width = 30;
    } else {
      const sheet = book.addWorksheet("สรุปบริษัท");
      sheet.addRow([`สรุปบริษัท ปี ${year + 543}`]);
      sheet.addRow([`ข้อมูล ${new Set(entries.rows.map((entry) => entry.month)).size} / 12 เดือน`]);
      sheet.addRow(["เดือน", "เงินเดือนพนักงาน", "เงินเดือนกรรมการ", "โบนัสพนักงาน", "โบนัสกรรมการ", "OT และวันหยุด", "รายได้รวม", "รายการหัก", "เงินสุทธิ"]);
      const itemMap = new Map<string, Item[]>();
      for (const item of items.rows) itemMap.set(item.entry_id, [...(itemMap.get(item.entry_id) || []), item]);
      for (let current = 1; current <= 12; current++) {
        const rows = entries.rows.filter((entry) => entry.month === current);
        if (!rows.length) { sheet.addRow([monthNames[current - 1], null, null, null, null, null, null, null, null]); continue; }
        const sum = (pick: (entry: Entry) => number) => rows.reduce((total, entry) => total + pick(entry), 0) / 100;
        const itemSum = (entry: Entry, codes: string[]) => (itemMap.get(entry.id) || []).filter((item) => codes.includes(item.code)).reduce((total, item) => total + toSatang(item.amount), 0);
        sheet.addRow([monthNames[current - 1], sum((entry) => entry.employee_type === "employee" ? itemSum(entry, ["salary"]) : 0), sum((entry) => entry.employee_type === "director" ? itemSum(entry, ["salary"]) : 0), sum((entry) => entry.employee_type === "employee" ? itemSum(entry, ["bonus"]) : 0), sum((entry) => entry.employee_type === "director" ? itemSum(entry, ["bonus"]) : 0), sum((entry) => itemSum(entry, ["ot_15", "ot_2", "ot_3", "holiday_work"])), sum((entry) => toSatang(entry.gross)), sum((entry) => toSatang(entry.deductions)), sum((entry) => toSatang(entry.net))]);
      }
      sheet.addRow(["รวมปี", ...[2,3,4,5,6,7,8,9].map((col) => { let total = 0; for (let row = 4; row <= 15; row++) total += Number(sheet.getRow(row).getCell(col).value || 0); return total; })]);
      styleSheet(sheet);
      const types = await db().query<{ code: string; label: string; kind: string }>("SELECT code,label,kind FROM payroll_item_types WHERE company_id=$1 ORDER BY kind,code", [user.companyId]);
      const itemSheet = book.addWorksheet("รายการทั้งหมด");
      itemSheet.addRow([`รายการทุกประเภท ปี ${year + 543}`]);
      itemSheet.addRow([]);
      itemSheet.addRow(["รายการ", ...monthNames, "รวมปี"]);
      for (const type of types.rows) {
        const values = monthNames.map((_, index) => entries.rows.some((entry) => entry.month === index + 1)
          ? items.rows.filter((item) => item.code === type.code && entries.rows.some((entry) => entry.id === item.entry_id && entry.month === index + 1)).reduce((sum, item) => sum + Number(item.amount), 0)
          : null);
        itemSheet.addRow([safeText(type.label), ...values, values.reduce<number>((a, b) => a + (b || 0), 0)]);
      }
      styleSheet(itemSheet);
    }
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    const filename = `ntp-${kind}-${year}${month ? `-${String(month).padStart(2, "0")}` : ""}${employee ? `-${employee.replace(/[^a-zA-Z0-9_-]/g, "")}` : ""}.xlsx`;
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
