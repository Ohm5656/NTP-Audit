import ExcelJS from "exceljs";
import { normalizeHeader, normalizeName } from "./excel-import";

export type HistoricalLeave = {
  dateFrom: string;
  dateTo: string;
  type: "personal" | "vacation" | "sick" | "unpaid" | "absence";
  days: number;
  reason: string;
};

export type HistoricalSalaryAdjustment = {
  effectiveDate: string;
  newSalary: number;
  increase: number | null;
  percent: number | null;
  reason: string;
};

export type HistoricalEmployee = {
  name: string;
  normalizedName: string;
  year: number;
  startDate: string | null;
  leave: HistoricalLeave[];
  adjustments: HistoricalSalaryAdjustment[];
};

export type HistoricalParse = { employees: HistoricalEmployee[]; sheets: number; years: number[] };

const leaveMap: Record<string, HistoricalLeave["type"]> = {
  [normalizeHeader("ลากิจ")]: "personal",
  [normalizeHeader("พักร้อน")]: "vacation",
  [normalizeHeader("ลาป่วย")]: "sick",
  [normalizeHeader("ลาไม่รับค่าจ้าง")]: "unpaid",
  [normalizeHeader("ขาดงาน")]: "absence",
};

function text(value: ExcelJS.CellValue): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "text" in value) return String(value.text || "").trim();
  return "";
}

function number(value: ExcelJS.CellValue): number | null {
  const raw = value && typeof value === "object" && "result" in value ? value.result : value;
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = typeof raw === "number" ? raw : Number(/-?[\d,]+(?:\.\d+)?/.exec(String(raw).replace(/%/g, ""))?.[0]?.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: ExcelJS.CellValue, yearHint: number): string | null {
  const raw = value && typeof value === "object" && "result" in value ? value.result : value;
  if (raw instanceof Date && !Number.isNaN(raw.valueOf())) return raw.toISOString().slice(0, 10);
  if (typeof raw === "number" && raw > 20000 && raw < 60000) return new Date(Date.UTC(1899, 11, 30) + raw * 86400000).toISOString().slice(0, 10);
  // Older cells in the source workbook store Buddhist years as Gregorian date serials (e.g. 2562 AD).
  if (typeof raw === "number" && raw > 200000 && raw < 300000) {
    const legacy = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    return `${legacy.getUTCFullYear() - 543}-${String(legacy.getUTCMonth() + 1).padStart(2, "0")}-${String(legacy.getUTCDate()).padStart(2, "0")}`;
  }
  const parts = /(\d{1,2})\D+(\d{1,2})\D+(\d{2,4})/.exec(String(raw ?? "").trim());
  if (!parts) return null;
  let year = Number(parts[3]);
  if (year < 100) year += 2500;
  if (year > 2400) year -= 543;
  if (year < 1900 || year > 2200) year = yearHint;
  const month = Number(parts[2]);
  const day = Number(parts[1]);
  return month < 1 || month > 12 || day < 1 || day > 31 ? null : `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function asDateRange(value: ExcelJS.CellValue, yearHint: number): { dateFrom: string; dateTo: string } | null {
  const raw = value && typeof value === "object" && "result" in value ? value.result : value;
  if (typeof raw === "string") {
    const range = /^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})\s*$/.exec(raw);
    if (range) {
      const [, fromDay, toDay, monthText, yearText] = range;
      let year = Number(yearText);
      if (year < 100) year += 2500;
      if (year > 2400) year -= 543;
      if (year < 1900 || year > 2200) year = yearHint;
      const month = Number(monthText);
      const start = Number(fromDay);
      const end = Number(toDay);
      if (month >= 1 && month <= 12 && start >= 1 && start <= 31 && end >= start && end <= 31) {
        const prefix = `${year}-${String(month).padStart(2, "0")}-`;
        return { dateFrom: `${prefix}${String(start).padStart(2, "0")}`, dateTo: `${prefix}${String(end).padStart(2, "0")}` };
      }
    }
  }
  const date = asDate(value, yearHint);
  return date ? { dateFrom: date, dateTo: date } : null;
}

function findRow(sheet: ExcelJS.Worksheet, phrase: string): number | undefined {
  return Array.from({ length: sheet.rowCount }, (_, index) => index + 1).find((row) => text(sheet.getCell(row, 1).value).includes(phrase));
}

function adjustmentRowForSheet(sheet: ExcelJS.Worksheet): number | undefined {
  return findRow(sheet, "รายละเอียดการปรับเงินเดือน");
}

function nameForSheet(sheet: ExcelJS.Worksheet): string | null {
  const adjustmentRow = adjustmentRowForSheet(sheet);
  const fromAdjustment = adjustmentRow
    ? text(sheet.getCell(adjustmentRow, 1).value).replace(/^.*?พนักงาน\s*/, "").trim()
    : "";
  const title = text(sheet.getCell(1, 1).value);
  const named = /รายงาน(?:ค่าจ้าง|ค่าแรง)?\s*(.*?)\s*ปี\s*(?:25\d{2}|20\d{2})/.exec(title)?.[1]?.trim();
  return fromAdjustment || named || (sheet.name.trim() && !/^sheet\d*$/i.test(sheet.name) ? sheet.name.trim() : null);
}

function yearForSheet(sheet: ExcelJS.Worksheet): number | null {
  const match = /ปี\s*(25\d{2}|20\d{2})/.exec(text(sheet.getCell(1, 1).value));
  if (!match) return null;
  const year = Number(match[1]);
  return year > 2400 ? year - 543 : year;
}

function salaryAdjustmentsForSheet(sheet: ExcelJS.Worksheet, adjustmentRow: number | undefined, year: number): HistoricalSalaryAdjustment[] {
  if (!adjustmentRow) return [];
  const adjustments: HistoricalSalaryAdjustment[] = [];
  for (let row = adjustmentRow + 2; row <= sheet.rowCount; row++) {
    const effectiveDate = asDate(sheet.getCell(row, 1).value, year);
    const newSalary = number(sheet.getCell(row, 2).value);
    if (!effectiveDate || newSalary === null) continue;
    const rawPercent = number(sheet.getCell(row, 4).value);
    adjustments.push({
      effectiveDate,
      newSalary,
      increase: number(sheet.getCell(row, 3).value),
      percent: rawPercent === null ? null : rawPercent > 0 && rawPercent <= 1 ? rawPercent * 100 : rawPercent,
      reason: text(sheet.getCell(row, 5).value),
    });
  }
  return adjustments;
}

/** Reads employment, leave, and salary-adjustment history only. Monthly payroll is intentionally ignored. */
export async function parseHistoricalWorkbook(filePath: string): Promise<HistoricalParse> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(filePath);
  const sheets = book.worksheets.filter((sheet) => text(sheet.getCell(2, 1).value) === "เดือน" && text(sheet.getCell(2, 2).value).includes("เงินเดือน") && sheet.columnCount >= 14);
  const fallbackYear = sheets.map(yearForSheet).find((year): year is number => year !== null);
  if (!fallbackYear) throw new Error("ไม่พบปีใน Annual Excel");

  const employees: HistoricalEmployee[] = [];
  for (const sheet of sheets) {
    const name = nameForSheet(sheet);
    const year = yearForSheet(sheet) || fallbackYear;
    if (!name) continue;
    const headers = new Map<number, string>();
    for (let column = 2; column <= sheet.columnCount; column++) {
      const header = text(sheet.getCell(2, column).value);
      if (header) headers.set(column, header);
    }
    const startRow = findRow(sheet, "วันที่เริ่มงาน");
    const startDate = startRow ? asDate(sheet.getCell(startRow, 2).value, year) : null;
    const leave: HistoricalLeave[] = [];
    for (let row = 3; row < (startRow || 19); row++) {
      const dateRange = asDateRange(sheet.getCell(row, 18).value, year);
      if (!dateRange) continue;
      for (const [column, header] of headers) {
        const type = leaveMap[normalizeHeader(header)];
        const days = number(sheet.getCell(row, column).value);
        if (type && days !== null && days > 0) {
          leave.push({ ...dateRange, type, days, reason: text(sheet.getCell(row, 24).value) });
        }
      }
    }
    employees.push({
      name,
      normalizedName: normalizeName(name),
      year,
      startDate,
      leave,
      adjustments: salaryAdjustmentsForSheet(sheet, adjustmentRowForSheet(sheet), year),
    });
  }
  if (!employees.length) throw new Error("ไม่พบแผ่นข้อมูลพนักงานใน Annual Excel");
  return { employees, sheets: employees.length, years: Array.from(new Set(employees.map((employee) => employee.year))).sort() };
}
