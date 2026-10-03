import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import { normalizeHeader, normalizeName } from "./excel-import";

export type HistoricalPayrollItem = { code: string; label: string; kind: "income" | "deduction"; amount: number };
export type HistoricalLeave = { dateFrom: string; dateTo: string; type: "personal" | "vacation" | "sick" | "unpaid" | "absence"; days: number; reason: string };
export type HistoricalAdjustment = { date: string; oldSalary: number; newSalary: number; reason: string };
export type HistoricalEmployee = { name: string; normalizedName: string; year: number; startDate: string | null; currentSalary: number | null; payroll: { month: number; items: HistoricalPayrollItem[]; gross: number; deductions: number; net: number }[]; leave: HistoricalLeave[]; adjustments: HistoricalAdjustment[] };
export type HistoricalParse = { employees: HistoricalEmployee[]; sheets: number; years: number[] };

const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const itemMap: Record<string, { code: string; label: string; kind: "income" | "deduction" }> = {
  [normalizeHeader("เงินเดือน")]: { code: "salary", label: "เงินเดือน", kind: "income" },
  [normalizeHeader("OT1.5")]: { code: "ot_15", label: "OT 1.5", kind: "income" },
  [normalizeHeader("OT2")]: { code: "ot_2", label: "OT 2", kind: "income" },
  [normalizeHeader("OT3")]: { code: "ot_3", label: "OT 3", kind: "income" },
  [normalizeHeader("เบี้ยขยัน")]: { code: "attendance_bonus", label: "เบี้ยขยัน", kind: "income" },
  [normalizeHeader("ค่าเดินทาง")]: { code: "travel_allowance", label: "ค่าเดินทาง", kind: "income" },
  [normalizeHeader("ค่าโทรศัพท์")]: { code: "phone_allowance", label: "ค่าโทรศัพท์", kind: "income" },
  [normalizeHeader("เบี้ยเลี้ยง")]: { code: "meal_allowance", label: "เบี้ยเลี้ยง", kind: "income" },
  [normalizeHeader("โบนัส")]: { code: "bonus", label: "โบนัส", kind: "income" },
  [normalizeHeader("เที่ยวประจำปี")]: { code: "annual_trip", label: "เที่ยวประจำปี", kind: "income" },
  [normalizeHeader("วันเกิด")]: { code: "birthday", label: "วันเกิด", kind: "income" },
  [normalizeHeader("ประกันอุบัติเหตุ")]: { code: "accident_insurance", label: "ประกันอุบัติเหตุ", kind: "income" },
  [normalizeHeader("ของขวัญปีใหม่")]: { code: "new_year_gift", label: "ของขวัญปีใหม่", kind: "income" },
  [normalizeHeader("ปกส.")]: { code: "social_security", label: "ประกันสังคม", kind: "deduction" },
  [normalizeHeader("ประกันสังคม")]: { code: "social_security", label: "ประกันสังคม", kind: "deduction" },
  [normalizeHeader("ภาษี")]: { code: "tax", label: "ภาษี", kind: "deduction" },
};
const leaveMap: Record<string, HistoricalLeave["type"]> = { [normalizeHeader("ลากิจ")]: "personal", [normalizeHeader("พักร้อน")]: "vacation", [normalizeHeader("ลาป่วย")]: "sick", [normalizeHeader("ไม่รับค่าจ้าง")]: "unpaid", [normalizeHeader("ขาดงาน")]: "absence" };

function text(value: ExcelJS.CellValue): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "text" in value) return String(value.text || "").trim();
  return "";
}
function number(value: ExcelJS.CellValue): number | null {
  const raw = value && typeof value === "object" && "result" in value ? value.result : value;
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}
function asDate(value: ExcelJS.CellValue, yearHint: number): string | null {
  const raw = value && typeof value === "object" && "result" in value ? value.result : value;
  if (raw instanceof Date && !Number.isNaN(raw.valueOf())) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number" && raw > 20_000 && raw < 60_000) return new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000).toISOString().slice(0, 10);
  const input = String(raw ?? "").trim();
  const parts = /(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})/.exec(input);
  if (!parts) return null;
  let year = Number(parts[3]); if (year < 100) year += 2500; if (year > 2400) year -= 543;
  if (year < 1900 || year > 2200) year = yearHint;
  const month = Number(parts[2]); const day = Number(parts[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function headerItem(header: string): HistoricalPayrollItem | null {
  const known = itemMap[normalizeHeader(header)]; if (known) return { ...known, amount: 0 };
  if (!header || /รวมรายได้|วันที่ลา|เหตุผล/.test(header)) return null;
  const kind: "income" | "deduction" = /หัก|ภาษี|ประกัน|กู้|เบิก/.test(header) ? "deduction" : "income";
  const code = `historical_${createHash("sha1").update(normalizeHeader(header)).digest("hex").slice(0, 12)}`;
  return { code, label: header, kind, amount: 0 };
}
function nameForSheet(sheet: ExcelJS.Worksheet): string | null {
  const title = text(sheet.getCell(1, 1).value);
  const named = /รายงานค่าจ้าง\s*(.*?)\s*ปี\s*(?:25\d{2}|20\d{2})/.exec(title)?.[1]?.trim();
  return named || (sheet.name.trim() && !/^sheet\d*$/i.test(sheet.name) ? sheet.name.trim() : null);
}
function yearForSheet(sheet: ExcelJS.Worksheet): number | null {
  const title = text(sheet.getCell(1, 1).value);
  const match = /ปี\s*(25\d{2}|20\d{2})/.exec(title); if (!match) return null;
  const value = Number(match[1]); return value > 2400 ? value - 543 : value;
}

export async function parseHistoricalWorkbook(filePath: string): Promise<HistoricalParse> {
  const book = new ExcelJS.Workbook(); await book.xlsx.readFile(filePath);
  const employees: HistoricalEmployee[] = [];
  for (const sheet of book.worksheets) {
    if (text(sheet.getCell(2, 1).value) !== "เดือน" || !text(sheet.getCell(2, 2).value).includes("เงินเดือน")) continue;
    const name = nameForSheet(sheet); const year = yearForSheet(sheet); if (!name || !year || sheet.columnCount < 14) continue;
    const headers = new Map<number, string>(); for (let col = 2; col <= sheet.columnCount; col++) { const header = text(sheet.getCell(2, col).value); if (header) headers.set(col, header); }
    const startRow = Array.from({ length: sheet.rowCount }, (_, index) => index + 1).find((row) => text(sheet.getCell(row, 1).value).includes("วันที่เริ่มงาน"));
    const adjustmentTitle = Array.from({ length: sheet.rowCount }, (_, index) => index + 1).find((row) => text(sheet.getCell(row, 1).value).includes("รายละเอียดการปรับเงินเดือน"));
    const startDate = startRow ? asDate(sheet.getCell(startRow, 2).value, year) : null;
    const payroll: HistoricalEmployee["payroll"] = [];
    for (let row = 3; row <= 14; row++) {
      const month = thaiMonths.findIndex((label) => text(sheet.getCell(row, 1).value) === label) + 1; if (!month) continue;
      const items: HistoricalPayrollItem[] = [];
      for (const [column, label] of headers) { const mapped = headerItem(label); const value = number(sheet.getCell(row, column).value); if (!mapped || value === null) continue; mapped.amount = value; items.push(mapped); }
      if (!items.length) continue;
      const gross = items.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 0);
      const deductions = items.filter((item) => item.kind === "deduction").reduce((sum, item) => sum + item.amount, 0);
      payroll.push({ month, items, gross, deductions, net: gross - deductions });
    }
    const leave: HistoricalLeave[] = [];
    for (let row = 3; row < (startRow || 19); row++) {
      const date = asDate(sheet.getCell(row, 18).value, year); if (!date) continue;
      for (const [column, label] of headers) { const type = leaveMap[normalizeHeader(label)]; const days = number(sheet.getCell(row, column).value); if (type && days && days > 0) leave.push({ dateFrom: date, dateTo: date, type, days: days / 100, reason: text(sheet.getCell(row, 24).value) }); }
    }
    const adjustments: HistoricalAdjustment[] = []; let previousSalary: number | null = null;
    if (adjustmentTitle) for (let row = adjustmentTitle + 2; row <= sheet.rowCount; row++) { const date = asDate(sheet.getCell(row, 1).value, year); const salary = number(sheet.getCell(row, 2).value); if (!date || salary === null) continue; if (previousSalary !== null && previousSalary !== salary) adjustments.push({ date, oldSalary: previousSalary, newSalary: salary, reason: text(sheet.getCell(row, 5).value) }); previousSalary = salary; }
    const currentSalary = previousSalary ?? payroll.flatMap((entry) => entry.items).filter((item) => item.code === "salary").at(-1)?.amount ?? null;
    employees.push({ name, normalizedName: normalizeName(name), year, startDate, currentSalary, payroll, leave, adjustments });
  }
  if (!employees.length) throw new Error("ไม่พบแผ่นข้อมูลพนักงานใน Annual Excel");
  return { employees, sheets: employees.length, years: Array.from(new Set(employees.map((employee) => employee.year))).sort() };
}
