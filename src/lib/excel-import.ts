import ExcelJS from "exceljs";
import Decimal from "decimal.js";

const thaiMonths = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export type ImportIssue = {
  severity: "warning" | "error";
  code: string;
  message: string;
  row?: number;
  field?: string;
};
export type SourceItem = {
  header: string;
  kind: "income" | "deduction";
  code: string | null;
  amount: number;
  cell: string;
  formula: string | null;
  rawValue: string | null;
};
export type SourceRow = {
  row: number;
  sequence: number;
  name: string;
  normalizedName: string;
  employeeCode: string | null;
  nationalId: string | null;
  employeeType: "employee" | "director";
  items: SourceItem[];
  excelGross: number | null;
  excelNet: number | null;
  gross: number;
  deductions: number;
  net: number;
  issues: ImportIssue[];
};
export type SourceSheet = {
  name: string;
  score: number;
  year: number | null;
  month: number | null;
  paymentDate: string | null;
  headerRow: number | null;
};
export type ParsedImport = {
  source: SourceSheet;
  sheets: SourceSheet[];
  rows: SourceRow[];
  unknownHeaders: { header: string; kind: "income" | "deduction" }[];
  issues: ImportIssue[];
};

type Column = {
  index: number;
  header: string;
  kind: "income" | "deduction" | "gross" | "net";
  code: string | null;
};

export function normalizeHeader(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("th-TH")
    .replace(/[\s\-_/().:+]+/g, "");
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("th-TH")
    .replace(/\s+/g, "")
    .trim();
}

export function normalizeNationalId(value: unknown): string | null {
  const text = String(value ?? "").replace(/\D/g, "");
  return text.length === 13 ? text : null;
}

function numericCell(cell: ExcelJS.Cell): {
  amount: number | null;
  formula: string | null;
  raw: string | null;
  unreliable: boolean;
} {
  const value = cell.value;
  if (value === null || value === undefined || value === "")
    return { amount: null, formula: null, raw: null, unreliable: false };
  let raw: unknown = value;
  let formula: string | null = null;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    "formula" in value
  ) {
    formula = String(value.formula);
    raw = "result" in value ? value.result : null;
  } else if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    "sharedFormula" in value
  ) {
    formula = `shared:${value.sharedFormula}`;
    raw = "result" in value ? value.result : null;
  }
  if (raw === null || raw === undefined || raw === "")
    return { amount: null, formula, raw: null, unreliable: !!formula };
  const cleaned = typeof raw === "string" ? raw.replace(/,/g, "").trim() : raw;
  try {
    const decimal = new Decimal(cleaned as Decimal.Value);
    if (!decimal.isFinite()) throw new Error("Not finite");
    const cents = decimal
      .mul(100)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
      .toNumber();
    if (!Number.isSafeInteger(cents)) throw new Error("Out of range");
    return { amount: cents, formula, raw: String(raw), unreliable: false };
  } catch {
    return { amount: null, formula, raw: String(raw), unreliable: true };
  }
}

function cellText(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "text" in value)
    return String(value.text).trim();
  return "";
}

function extractPeriod(
  sheet: ExcelJS.Worksheet,
): Pick<SourceSheet, "year" | "month" | "paymentDate"> {
  const headers = new Set<string>();
  for (let row = 1; row <= Math.min(12, sheet.rowCount); row++)
    for (let col = 1; col <= Math.min(5, sheet.columnCount); col++) {
      const text = cellText(sheet.getRow(row).getCell(col));
      if (text) headers.add(text);
    }
  let year: number | null = null;
  let month: number | null = null;
  let paymentDate: string | null = null;
  for (const text of headers) {
    const period = /(?:ประจำเดือน|เดือน)\s*([ก-๙]+)\s*(25\d{2}|20\d{2})/.exec(
      text,
    );
    if (period) {
      month =
        thaiMonths.findIndex((name) => period[1].startsWith(name)) + 1 || null;
      year =
        Number(period[2]) >= 2400 ? Number(period[2]) - 543 : Number(period[2]);
    }
    const pay = /จ่ายวันที่\s*(\d{1,2})\s*([ก-๙]+)\s*(25\d{2}|20\d{2})/.exec(
      text,
    );
    if (pay) {
      const payMonth =
        thaiMonths.findIndex((name) => pay[2].startsWith(name)) + 1;
      const payYear =
        Number(pay[3]) >= 2400 ? Number(pay[3]) - 543 : Number(pay[3]);
      if (payMonth > 0 && Number(pay[1]) >= 1 && Number(pay[1]) <= 31)
        paymentDate = `${payYear}-${String(payMonth).padStart(2, "0")}-${String(pay[1]).padStart(2, "0")}`;
    }
  }
  return { year, month, paymentDate };
}

function findHeaderRow(sheet: ExcelJS.Worksheet): number | null {
  let found: number | null = null;
  for (let row = 3; row <= Math.min(20, sheet.rowCount); row++) {
    const labels = Array.from(
      { length: Math.min(sheet.columnCount, 50) },
      (_, index) => cellText(sheet.getRow(row).getCell(index + 1)),
    );
    if (
      labels.some((value) => value.includes("ชื่อ-สกุล")) &&
      labels.some((value) => value.includes("รายได้สุทธิ")) &&
      labels.some((value) => value.includes("รวมเงินได้"))
    )
      found = row;
  }
  return found;
}

function inspectSheet(sheet: ExcelJS.Worksheet): SourceSheet {
  const period = extractPeriod(sheet);
  const headerRow = findHeaderRow(sheet);
  let score = 0;
  if (sheet.name.trim() === "คิดค่าจ้าง") score += 10;
  if (headerRow) score += 5;
  if (period.year && period.month) score += 4;
  if (sheet.name.toLocaleLowerCase("th-TH").includes("payslip")) score -= 6;
  return { name: sheet.name, score, headerRow, ...period };
}

function resolveCode(
  header: string,
  aliases: Map<string, string>,
): string | null {
  return aliases.get(normalizeHeader(header)) || null;
}

function columnsForSheet(
  sheet: ExcelJS.Worksheet,
  headerRow: number,
  aliases: Map<string, string>,
): {
  columns: Column[];
  sequenceColumn: number;
  nameColumn: number;
  codeColumn: number | null;
  nationalIdColumn: number | null;
} {
  const columns: Column[] = [];
  let sequenceColumn = 1;
  let nameColumn = 2;
  let codeColumn: number | null = null;
  let nationalIdColumn: number | null = null;
  let salaryChosen = false;
  for (let col = 1; col <= Math.min(sheet.columnCount, 100); col++) {
    const group = cellText(sheet.getRow(headerRow - 2).getCell(col));
    const sub = cellText(sheet.getRow(headerRow - 1).getCell(col));
    const leaf = cellText(sheet.getRow(headerRow).getCell(col));
    if (leaf.includes("ลำดับ")) {
      sequenceColumn = col;
      continue;
    }
    if (leaf.includes("ชื่อ-สกุล")) {
      nameColumn = col;
      continue;
    }
    if (leaf.includes("รหัสพนักงาน")) {
      codeColumn = col;
      continue;
    }
    if (
      leaf.includes("บัตร") &&
      (leaf.includes("ประชาชน") || leaf.includes("ปะชาชน"))
    ) {
      nationalIdColumn = col;
      continue;
    }
    if (group.includes("รวมเงินได้") || leaf.includes("รวมเงินได้")) {
      columns.push({
        index: col,
        header: leaf || group,
        kind: "gross",
        code: null,
      });
      continue;
    }
    if (group.includes("รายได้สุทธิ") || leaf.includes("รายได้สุทธิ")) {
      columns.push({
        index: col,
        header: leaf || group,
        kind: "net",
        code: null,
      });
      continue;
    }
    if (
      group.includes("ค่าจ้าง") &&
      (leaf.includes("เดือนละ") || leaf.includes("ค่าจ้าง"))
    ) {
      if (!salaryChosen) {
        columns.push({
          index: col,
          header: "ค่าจ้าง",
          kind: "income",
          code: "salary",
        });
        salaryChosen = true;
      }
      continue;
    }
    if (group.includes("ค่าล่วงเวลา") && leaf.includes("รวมเงิน")) {
      const code = sub.includes("1.5")
        ? "ot_15"
        : sub.includes("x 3") || sub.includes("x3")
          ? "ot_3"
          : sub.includes("วันหยุด")
            ? "holiday_work"
            : null;
      columns.push({ index: col, header: sub || group, kind: "income", code });
      continue;
    }
    if (group.includes("รายรับอื่น") && leaf && !leaf.includes("รายรับอื่น")) {
      columns.push({
        index: col,
        header: leaf,
        kind: "income",
        code: resolveCode(leaf, aliases),
      });
      continue;
    }
    if (group.includes("รายการหัก") && leaf && !leaf.includes("รายการหัก")) {
      columns.push({
        index: col,
        header: leaf,
        kind: "deduction",
        code: resolveCode(leaf, aliases),
      });
      continue;
    }
  }
  return { columns, sequenceColumn, nameColumn, codeColumn, nationalIdColumn };
}

export async function parseWorkbook(
  filePath: string,
  sheetName?: string,
  typeAliases: { code: string; aliases: string[] }[] = [],
): Promise<ParsedImport> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(filePath);
  const sheets = book.worksheets
    .map(inspectSheet)
    .sort((a, b) => b.score - a.score);
  const source = sheetName
    ? sheets.find((sheet) => sheet.name === sheetName)
    : sheets[0];
  if (!source || !source.headerRow)
    throw new Error("ไม่พบชีตคำนวณค่าจ้างที่อ่านได้");
  const sheet = book.getWorksheet(source.name)!;
  if (sheet.rowCount > 10000 || sheet.columnCount > 150)
    throw new Error("ชีตมีขนาดเกินขอบเขตที่รองรับ");
  const aliases = new Map<string, string>();
  for (const type of typeAliases)
    for (const alias of type.aliases)
      aliases.set(normalizeHeader(alias), type.code);
  const { columns, sequenceColumn, nameColumn, codeColumn, nationalIdColumn } =
    columnsForSheet(sheet, source.headerRow, aliases);
  const grossColumn = columns.find((col) => col.kind === "gross");
  const netColumn = columns.find((col) => col.kind === "net");
  if (
    !grossColumn ||
    !netColumn ||
    !columns.some((col) => col.code === "salary")
  )
    throw new Error("ไม่พบคอลัมน์เงินเดือน รายได้รวม หรือรายได้สุทธิ");
  const unknownHeaders = Array.from(
    new Map(
      columns
        .filter(
          (col) =>
            (col.kind === "income" || col.kind === "deduction") && !col.code,
        )
        .map((col) => [
          normalizeHeader(col.header),
          { header: col.header, kind: col.kind as "income" | "deduction" },
        ]),
    ).values(),
  );
  const rows: SourceRow[] = [];
  const issues: ImportIssue[] = [];
  let employeeType: "employee" | "director" = "employee";
  const seenIdentity = new Set<string>();
  for (
    let rowNumber = source.headerRow + 1;
    rowNumber <= sheet.rowCount;
    rowNumber++
  ) {
    const row = sheet.getRow(rowNumber);
    const name = cellText(row.getCell(nameColumn));
    const sequence = numericCell(row.getCell(sequenceColumn)).amount;
    if (name === "กรรมการบริษัท") employeeType = "director";
    else if (name === "พนักงาน") employeeType = "employee";
    if (!name || name.includes("รวม") || sequence === null) continue;
    const nationalId = nationalIdColumn
      ? normalizeNationalId(cellText(row.getCell(nationalIdColumn)))
      : null;
    const employeeCode = codeColumn
      ? cellText(row.getCell(codeColumn)) || null
      : null;
    const identity = nationalId || normalizeName(name);
    const rowIssues: ImportIssue[] = [];
    if (seenIdentity.has(identity))
      rowIssues.push({
        severity: "error",
        code: "duplicate_employee",
        message: "พนักงานซ้ำในชีตเดียวกัน",
        row: rowNumber,
      });
    seenIdentity.add(identity);
    const items: SourceItem[] = [];
    let excelGross: number | null = null;
    let excelNet: number | null = null;
    for (const col of columns) {
      const cell = row.getCell(col.index);
      const value = numericCell(cell);
      if (value.unreliable)
        rowIssues.push({
          severity:
            col.code === "salary" || col.kind === "gross" || col.kind === "net"
              ? "error"
              : "warning",
          code: "unreliable_formula",
          message: "ไม่มีค่า cached ที่อ่านได้จากสูตร Excel",
          row: rowNumber,
          field: cell.address,
        });
      if (col.kind === "gross") {
        excelGross = value.amount;
        continue;
      }
      if (col.kind === "net") {
        excelNet = value.amount;
        continue;
      }
      if (value.amount !== null && value.amount < 0)
        rowIssues.push({
          severity: "error",
          code: "negative_amount",
          message: "ยอดติดลบในรายการเงินเดือน",
          row: rowNumber,
          field: cell.address,
        });
      if (value.amount !== null && value.amount !== 0)
        items.push({
          header: col.header,
          kind: col.kind,
          code: col.code,
          amount: value.amount,
          cell: cell.address,
          formula: value.formula,
          rawValue: value.raw,
        });
    }
    const gross = items
      .filter((item) => item.kind === "income")
      .reduce((total, item) => total + item.amount, 0);
    const deductions = items
      .filter((item) => item.kind === "deduction")
      .reduce((total, item) => total + item.amount, 0);
    const net = gross - deductions;
    if (excelGross === null || excelNet === null)
      rowIssues.push({
        severity: "error",
        code: "missing_total",
        message: "ไม่พบยอดรวม/ยอดสุทธิที่อ่านได้",
        row: rowNumber,
      });
    if (excelGross !== null && Math.abs(gross - excelGross) > 1)
      rowIssues.push({
        severity: "error",
        code: "gross_mismatch",
        message: `รายได้รวมจากรายการต่างจาก Excel ${(gross - excelGross) / 100} บาท`,
        row: rowNumber,
      });
    if (excelNet !== null && Math.abs(net - excelNet) > 1)
      rowIssues.push({
        severity: "error",
        code: "net_mismatch",
        message: `รายได้สุทธิจากรายการต่างจาก Excel ${(net - excelNet) / 100} บาท`,
        row: rowNumber,
      });
    rows.push({
      row: rowNumber,
      sequence: sequence / 100,
      name,
      normalizedName: normalizeName(name),
      employeeCode,
      nationalId,
      employeeType,
      items,
      excelGross,
      excelNet,
      gross,
      deductions,
      net,
      issues: rowIssues,
    });
    issues.push(...rowIssues);
  }
  if (!source.year || !source.month)
    issues.push({
      severity: "error",
      code: "unknown_period",
      message: "ตรวจไม่พบเดือนหรือปีในหัวชีต",
    });
  if (!rows.length)
    issues.push({
      severity: "error",
      code: "no_employees",
      message: "ไม่พบรายการพนักงานในชีต",
    });
  return { source, sheets, rows, unknownHeaders, issues };
}
