// Read-only diagnostic for an operator-supplied workbook. Prints counts only.
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { parseWorkbook } from "../src/lib/excel-import";

async function main() {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) throw new Error("Usage: npx tsx scripts/probe-import.ts <workbook.xlsx>");
  dotenv.config({ path: path.resolve(".env.local"), quiet: true });
  const client = process.env.DATABASE_URL ? new pg.Client({ connectionString: process.env.DATABASE_URL }) : null;
  let aliases: { code: string; aliases: string[] }[] = [];
  if (client) {
    await client.connect();
    try { aliases = (await client.query("SELECT code,aliases FROM payroll_item_types")).rows; }
    finally { await client.end(); }
  }
  const parsed = await parseWorkbook(filePath, undefined, aliases);
  console.log(JSON.stringify({
  selectedSheet: parsed.source.name,
  year: parsed.source.year,
  month: parsed.source.month,
  paymentDate: parsed.source.paymentDate,
  candidates: parsed.sheets.filter(sheet => sheet.score > 0).map(sheet => ({ name: sheet.name, year: sheet.year, month: sheet.month, score: sheet.score })),
  rowCount: parsed.rows.length,
  employeeRows: parsed.rows.filter(row => row.employeeType === "employee").length,
  directorRows: parsed.rows.filter(row => row.employeeType === "director").length,
  unknownHeaders: parsed.unknownHeaders,
  issuesByCode: parsed.issues.reduce<Record<string, number>>((map, issue) => { map[issue.code] = (map[issue.code] || 0) + 1; return map; }, {}),
  issuesByField: parsed.issues.reduce<Record<string, number>>((map, issue) => { const field = issue.field?.replace(/[0-9]/g, "") || "other"; map[field] = (map[field] || 0) + 1; return map; }, {}),
  grossSatang: parsed.rows.reduce((sum, row) => sum + row.gross, 0),
  deductionSatang: parsed.rows.reduce((sum, row) => sum + row.deductions, 0),
  netSatang: parsed.rows.reduce((sum, row) => sum + row.net, 0),
  }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
