import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(".env.local"), quiet: true });

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.SUPABASE_DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.argv.includes("--confirm")) {
  throw new Error("This replaces NTP data in the target project. Rerun with: npm run db:migrate:supabase -- --confirm");
}
if (!sourceUrl || !targetUrl || !supabaseUrl || !serviceRoleKey) {
  throw new Error("DATABASE_URL, SUPABASE_DATABASE_URL, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required");
}

const source = new pg.Pool({ connectionString: sourceUrl, max: 1 });
const target = new pg.Pool({ connectionString: targetUrl, max: 1 });
const storage = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tables = [
  "companies",
  "users",
  "employees",
  "payroll_item_types",
  "payroll_periods",
  "import_uploads",
  "imports",
  "import_mappings",
  "payroll_entries",
  "payroll_items",
  "leave_records",
  "salary_adjustments",
  "import_errors",
  "historical_imports",
  "annual_templates",
  "audit_logs",
];

const truncateTables = [
  "audit_logs", "import_errors", "payroll_items", "payroll_entries", "imports",
  "import_uploads", "import_mappings", "payroll_periods", "payroll_item_types",
  "leave_records", "salary_adjustments", "historical_imports", "annual_templates",
  "sessions", "employees", "users", "companies",
];

function quoteIdentifier(identifier) {
  if (!/^[a-z_]+$/.test(identifier)) throw new Error("Unsafe identifier");
  return `"${identifier}"`;
}

async function copyRows(client, name, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const columnList = columns.map(quoteIdentifier).join(",");
  for (const row of rows) {
    const values = columns.map((column) => row[column]);
    const placeholders = values.map((_, index) => `$${index + 1}`).join(",");
    await client.query(
      `INSERT INTO public.${quoteIdentifier(name)} (${columnList}) VALUES (${placeholders})`,
      values,
    );
  }
}

async function listStorageKeys() {
  const result = await source.query(`
    SELECT storage_key FROM imports
    UNION
    SELECT storage_key FROM historical_imports
    UNION
    SELECT storage_key FROM annual_templates
  `);
  return result.rows.map((row) => row.storage_key);
}

try {
  const sourcePeriods = await source.query("SELECT id, active_import_id FROM payroll_periods");
  const data = new Map();
  for (const table of tables) {
    const result = await source.query(`SELECT * FROM public.${quoteIdentifier(table)}`);
    data.set(table, result.rows);
  }

  const client = await target.connect();
  try {
    await client.query("BEGIN");
    await client.query(`TRUNCATE TABLE ${truncateTables.map((name) => `public.${quoteIdentifier(name)}`).join(", ")} CASCADE`);
    for (const table of tables) {
      const rows = data.get(table);
      if (table === "payroll_periods") {
        await copyRows(client, table, rows.map((row) => ({ ...row, active_import_id: null })));
      } else {
        await copyRows(client, table, rows);
      }
    }
    for (const period of sourcePeriods.rows) {
      if (period.active_import_id)
        await client.query("UPDATE payroll_periods SET active_import_id=$2 WHERE id=$1", [period.id, period.active_import_id]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  const uploadDirectory = path.resolve(process.env.PRIVATE_UPLOAD_DIR || ".data/uploads");
  const keys = await listStorageKeys();
  for (const key of keys) {
    const file = await fs.readFile(path.join(uploadDirectory, key));
    const { error } = await storage.storage.from(process.env.SUPABASE_STORAGE_BUCKET || "ntp-private-uploads").upload(key, file, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
    if (error) throw new Error(`Could not upload ${key}: ${error.message}`);
  }
  console.log(`Migrated ${keys.length} private workbook(s) and all application data to Supabase.`);
} finally {
  await Promise.all([source.end(), target.end()]);
}
