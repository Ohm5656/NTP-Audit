import dotenv from "dotenv";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const run = promisify(execFile);
dotenv.config({ path: process.env.NTP_WORKER_ENV || ".env.worker.local", quiet: true });

const appUrl = (process.env.NTP_APP_URL || "").replace(/\/$/, "");
const workerToken = process.env.EXPORT_WORKER_TOKEN || "";
const pollInterval = Math.max(1000, Number(process.env.WORKER_POLL_INTERVAL_MS || 5000));

if (!appUrl || !workerToken || workerToken.length < 32) {
  throw new Error("Set NTP_APP_URL and a 32+ character EXPORT_WORKER_TOKEN in .env.worker.local before starting the Worker.");
}

function headers() {
  return { "x-ntp-export-worker": workerToken, "Content-Type": "application/json" };
}

async function wait(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 500) || "Worker failed without an error message";
}

async function workerPost(pathname, body) {
  const response = await fetch(`${appUrl}${pathname}`, {
    method: "POST",
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok && response.status !== 204) {
    const result = await response.text();
    throw new Error(`Worker API ${response.status}: ${result.slice(0, 180)}`);
  }
  return response;
}

async function generateAndUpload(payload) {
  const { job, input, templateUrl, resultUploadUrl } = payload;
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ntp-annual-worker-"));
  const templatePath = path.join(temporaryDirectory, "template.xlsx");
  const dataPath = path.join(temporaryDirectory, "input.json");
  const outputPath = path.join(temporaryDirectory, `${job.id}-${randomUUID()}.xlsx`);
  try {
    const templateResponse = await fetch(templateUrl);
    if (!templateResponse.ok) throw new Error(`Template download failed (${templateResponse.status})`);
    await fs.writeFile(templatePath, Buffer.from(await templateResponse.arrayBuffer()), { mode: 0o600 });
    await fs.writeFile(dataPath, JSON.stringify(input), { encoding: "utf8", mode: 0o600 });

    await run("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", path.join(process.cwd(), "scripts", "generate-annual-export.ps1"),
      "-TemplatePath", templatePath,
      "-DataPath", dataPath,
      "-OutputPath", outputPath,
    ], { windowsHide: true, maxBuffer: 1024 * 1024 });

    const workbook = await fs.readFile(outputPath);
    if (!workbook.length) throw new Error("Generated Annual Excel is empty");
    const uploadResponse = await fetch(resultUploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: new Uint8Array(workbook),
    });
    if (!uploadResponse.ok) throw new Error(`Result upload failed (${uploadResponse.status})`);
    await workerPost(`/api/internal/annual-export/${job.id}/complete`, { storageKey: job.storageKey });
    console.log(`[${new Date().toISOString()}] Annual Excel ${job.year + 543} completed.`);
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function poll() {
  const response = await workerPost("/api/internal/annual-export/claim");
  if (response.status === 204) return false;
  const payload = await response.json();
  try {
    await generateAndUpload(payload);
  } catch (error) {
    const message = errorMessage(error);
    console.error(`[${new Date().toISOString()}] Annual Excel failed: ${message}`);
    await workerPost(`/api/internal/annual-export/${payload.job.id}/fail`, { error: message }).catch((failError) => {
      console.error(`[${new Date().toISOString()}] Could not mark export as failed: ${errorMessage(failError)}`);
    });
  }
  return true;
}

console.log(`NTP Annual Export Worker started for ${appUrl}.`);
for (;;) {
  try {
    const didWork = await poll();
    if (!didWork) await wait(pollInterval);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Worker poll failed: ${errorMessage(error)}`);
    await wait(pollInterval);
  }
}
