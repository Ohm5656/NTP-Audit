"use client";

import { useState, type FormEvent } from "react";
import { FileUp, History, LoaderCircle } from "lucide-react";

export function HistoricalImport() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ years: number[]; employees: number; newEmployees: number; payroll: number; leave: number; adjustments: number } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) return; setBusy(true); setError("");
    try { const form = new FormData(); form.append("file", file); const response = await fetch("/api/historical/import", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "นำเข้าข้อมูลไม่สำเร็จ"); setResult(data); }
    catch (value) { setError(value instanceof Error ? value.message : "นำเข้าข้อมูลไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <><div className="page-heading"><div><h1>นำเข้าข้อมูลย้อนหลัง</h1><p>อ่านวันที่เริ่มงาน, รายได้รายเดือน, วันลา และประวัติปรับเงินเดือนจาก Annual Excel</p></div></div><section className="section historical-import"><div className="historical-icon"><History size={23} /></div><h2>Annual Excel เดิม</h2><p>ไฟล์จะถูกเก็บเป็น Private Source และข้อมูลจะถูกบันทึกลงฐานข้อมูล เพื่อใช้กับหน้า Employee และ Annual Export ต่อไป</p><form onSubmit={submit}><label className="file-picker"><FileUp size={18} /><span>{file?.name || "เลือกไฟล์ สรุปรายได้ พนักงาน วันลา.xlsx"}</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button className="button button-primary" disabled={!file || busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <FileUp size={16} />}{busy ? "กำลังนำเข้า" : "นำเข้าข้อมูลย้อนหลัง"}</button></form>{error && <p className="form-error" role="alert">{error}</p>}{result && <div className="historical-result"><strong>นำเข้าข้อมูลย้อนหลังแล้ว</strong><span>ปี {result.years.map((year) => year + 543).join(", ")} · พนักงาน {result.employees} คน · Payroll {result.payroll} รายการ · วันลา {result.leave} รายการ · ปรับเงินเดือน {result.adjustments} รายการ</span>{result.newEmployees > 0 && <span>สร้างพนักงานใหม่ {result.newEmployees} คน</span>}</div>}</section></>;
}
