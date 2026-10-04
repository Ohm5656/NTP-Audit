import fs from "node:fs";
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var ntpPool: Pool | undefined;
}

export function db(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  if (!global.ntpPool) {
    const url = new URL(process.env.DATABASE_URL);
    const usesSupabaseTransactionPooler = url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543";
    const config: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      // The data endpoint reads independent payroll datasets in parallel.  A
      // small pool lets those reads share Supabase's transaction pooler rather
      // than waiting behind one connection on every page load.
      max: usesSupabaseTransactionPooler ? 4 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
    if (usesSupabaseTransactionPooler) {
      const certificatePath = process.env.SUPABASE_SSL_ROOT_CERT;
      config.ssl = certificatePath
        ? { ca: fs.readFileSync(certificatePath, "utf8"), rejectUnauthorized: true }
        : { rejectUnauthorized: false };
    }
    global.ntpPool = new Pool(config);
  }
  return global.ntpPool;
}

export async function inTransaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export type Row<T extends QueryResultRow = QueryResultRow> = T;
