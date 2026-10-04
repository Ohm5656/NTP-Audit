import { randomUUID } from "node:crypto";
import { db, inTransaction } from "./db";

export type AnnualExportJobStatus = "queued" | "processing" | "ready" | "failed";

export type AnnualExportJob = {
  id: string;
  companyId: string;
  requestedBy: string;
  year: number;
  status: AnnualExportJobStatus;
  resultStorageKey: string | null;
  errorMessage: string | null;
  attempts: number;
  expiresAt: string;
};

type JobRow = {
  id: string;
  company_id: string;
  requested_by: string;
  year: number;
  status: AnnualExportJobStatus;
  result_storage_key: string | null;
  error_message: string | null;
  attempts: number;
  expires_at: string;
};

function mapJob(row: JobRow): AnnualExportJob {
  return {
    id: row.id,
    companyId: row.company_id,
    requestedBy: row.requested_by,
    year: row.year,
    status: row.status,
    resultStorageKey: row.result_storage_key,
    errorMessage: row.error_message,
    attempts: row.attempts,
    expiresAt: row.expires_at,
  };
}

const jobColumns = "id,company_id,requested_by,year,status,result_storage_key,error_message,attempts,expires_at::text";

export async function createAnnualExportJob(companyId: string, userId: string, year: number): Promise<AnnualExportJob> {
  return inTransaction(async (client) => {
    const existing = await client.query<JobRow>(
      `SELECT ${jobColumns} FROM annual_export_jobs
       WHERE company_id=$1 AND requested_by=$2 AND year=$3 AND status IN ('queued','processing','ready') AND expires_at>now()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [companyId, userId, year],
    );
    if (existing.rows[0]) return mapJob(existing.rows[0]);
    const created = await client.query<JobRow>(
      `INSERT INTO annual_export_jobs(company_id,requested_by,year)
       VALUES($1,$2,$3) RETURNING ${jobColumns}`,
      [companyId, userId, year],
    );
    return mapJob(created.rows[0]);
  });
}

export async function getAnnualExportJob(id: string, companyId: string, userId?: string): Promise<AnnualExportJob | null> {
  const result = await db().query<JobRow>(
    `SELECT ${jobColumns} FROM annual_export_jobs
     WHERE id=$1 AND company_id=$2${userId ? " AND requested_by=$3" : ""}`,
    userId ? [id, companyId, userId] : [id, companyId],
  );
  return result.rows[0] ? mapJob(result.rows[0]) : null;
}

export async function claimAnnualExportJob(): Promise<AnnualExportJob | null> {
  return inTransaction(async (client) => {
    await client.query(
      "UPDATE annual_export_jobs SET status='failed',error_message='งานหมดเวลา กรุณาสร้างรายงานใหม่' WHERE status='processing' AND claimed_at<now()-interval '20 minutes'",
    );
    const candidate = await client.query<JobRow>(
      `SELECT ${jobColumns} FROM annual_export_jobs
       WHERE status='queued' AND expires_at>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    const job = candidate.rows[0];
    if (!job) return null;
    const resultStorageKey = `${randomUUID()}.xlsx`;
    const claimed = await client.query<JobRow>(
      `UPDATE annual_export_jobs
       SET status='processing',claimed_at=now(),attempts=attempts+1,result_storage_key=$2,error_message=NULL
       WHERE id=$1 RETURNING ${jobColumns}`,
      [job.id, resultStorageKey],
    );
    return mapJob(claimed.rows[0]);
  });
}

export async function completeAnnualExportJob(id: string, storageKey: string): Promise<boolean> {
  const result = await db().query(
    `UPDATE annual_export_jobs SET status='ready',completed_at=now(),expires_at=now()+interval '1 hour'
     WHERE id=$1 AND status='processing' AND result_storage_key=$2`,
    [id, storageKey],
  );
  return Boolean(result.rowCount);
}

export async function failAnnualExportJob(id: string, message: string): Promise<void> {
  await db().query(
    "UPDATE annual_export_jobs SET status='failed',error_message=$2 WHERE id=$1 AND status='processing'",
    [id, message.slice(0, 500)],
  );
}

/** Expired generated files are eligible for removal by the next Worker poll. */
export async function expiredAnnualExportStorageKeys(): Promise<string[]> {
  return inTransaction(async (client) => {
    const expired = await client.query<{ result_storage_key: string }>(
      "DELETE FROM annual_export_jobs WHERE expires_at<now() RETURNING result_storage_key",
    );
    return expired.rows.flatMap((row) => (row.result_storage_key ? [row.result_storage_key] : []));
  });
}
