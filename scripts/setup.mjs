import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

const localEnv = path.resolve(".env.local");
if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, quiet: true });
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required. Copy .env.example to .env.local first.");

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const seedTypes = [
  ["salary", "เงินเดือน", "income", ["ค่าจ้าง", "เงินเดือน", "เดือนละ"]],
  ["ot_15", "OT 1.5", "income", ["ค่าล่วงเวลาปกติ x 1.5", "OT 1.5"]],
  ["holiday_work", "ค่าทำงานวันหยุด", "income", ["ค่าทำงานในวันหยุด"]],
  ["ot_3", "OT วันหยุด x 3", "income", ["OT วันหยุด x 3"]],
  ["attendance_bonus", "เบี้ยขยัน", "income", ["เบี้ยขยัน"]],
  ["travel_allowance", "ค่าเดินทาง", "income", ["ค่าเดินทาง"]],
  ["phone_allowance", "ค่าโทรศัพท์", "income", ["ค่าโทรศัพท์"]],
  ["meal_allowance", "เบี้ยเลี้ยง", "income", ["เบี้ยเลี้ยง"]],
  ["position_allowance", "ค่าตำแหน่ง", "income", ["ค่าตำแหน่ง"]],
  ["bonus", "โบนัส", "income", ["โบนัส"]],
  ["other_income", "รายได้พิเศษอื่น", "income", ["ค่าพิเศษ"]],
  ["social_security", "ประกันสังคม", "deduction", ["ประกันสังคม", "ปกส."]],
  ["tax", "ภาษี", "deduction", ["ภาษี", "ภาษี ภงด.1", "ภงด.1"]],
  ["housing_utilities", "ที่พัก น้ำ ไฟ", "deduction", ["ที่พัก+ค่าน้ำ+ไฟ"]],
  ["advance", "เบิกล่วงหน้า", "deduction", ["เบิกล่วงหน้า"]],
  ["lost_tools", "เครื่องมือหาย", "deduction", ["หักเครื่องมือหาย"]],
  ["loan", "เงินกู้ยืม", "deduction", ["หักเงินกู้ยืม"]],
  ["other_deduction", "รายการหักอื่น", "deduction", []],
];

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(fs.readFileSync(path.resolve("db/schema.sql"), "utf8"));
  let company = await client.query("SELECT id FROM companies ORDER BY created_at LIMIT 1");
  if (!company.rowCount) company = await client.query("INSERT INTO companies(name) VALUES($1) RETURNING id", [process.env.COMPANY_NAME || "บริษัทของฉัน"]);
  const companyId = company.rows[0].id;
  for (const [code, label, kind, aliases] of seedTypes) {
    await client.query("INSERT INTO payroll_item_types(company_id,code,label,kind,aliases) VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,code) DO NOTHING", [companyId, code, label, kind, aliases]);
  }
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters");
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await client.query("INSERT INTO users(company_id,email,password_hash,role) VALUES($1,$2,$3,'admin') ON CONFLICT(email) DO NOTHING", [companyId, process.env.ADMIN_EMAIL, hash]);
  }
  await client.query("COMMIT");
  console.log("Database schema and payroll item types are ready.");
  if (!process.env.ADMIN_EMAIL) console.log("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local, then rerun db:setup to create an administrator.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
