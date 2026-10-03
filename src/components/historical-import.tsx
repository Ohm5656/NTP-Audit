"use client";

import { useState, type FormEvent } from "react";
import { FileUp, History, LoaderCircle } from "lucide-react";

export function HistoricalImport() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ years: number[]; employees: number; matched: number; startDates: number; leave: number; unmatched: number } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!file) return; setBusy(true); setError("");
    try { const form = new FormData(); form.append("file", file); const response = await fetch("/api/historical/import", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "นำเข้าข้อมูลไม่สำเร็จ"); setResult(data); }
    catch (value) { setError(value instanceof Error ? value.message : "นำเข้าข้อมูลไม่สำเร็จ"); }
    finally { setBusy(false); }
  }
  return <><div className="page-heading"><div><h1>นำเข้าข้อมูลย้อนหลัง</h1><p>ใช้ Annual Excel สำหรับวันเริ่มงานและประวัติวันลาเท่านั้น</p></div></div><section className="section historical-import"><div className="historical-icon"><History size={23} /></div><h2>Annual Excel เดิม</h2><p>ไฟล์จะเก็บเป็นแหล่งอ้างอิงส่วนตัว ข้อมูลเงินเดือนในไฟล์นี้จะไม่ถูกอ่านเข้าระบบ รายได้จะมาจากไฟล์ Payroll รายเดือนเท่านั้น</p><form onSubmit={submit}><label className="file-picker"><FileUp size={18} /><span>{file?.name || "เลือกไฟล์ สรุปรายได้ พนักงาน วันลา.xlsx"}</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button className="button button-primary" disabled={!file || busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <FileUp size={16} />}{busy ? "กำลังนำเข้า" : "นำเข้าข้อมูลย้อนหลัง"}</button></form>{error && <p className="form-error" role="alert">{error}</p>}{result && <div className="historical-result"><strong>นำเข้าข้อมูลย้อนหลังแล้ว</strong><span>ปี {result.years.map((year) => year + 543).join(", ")} · ตรวจพบ {result.employees} แผ่น · จับคู่พนักงาน {result.matched} คน</span><span>เพิ่มวันเริ่มงาน {result.startDates} คน · เพิ่มประวัติวันลา {result.leave} รายการ</span>{result.unmatched > 0 && <span>ยังจับคู่ไม่ได้ {result.unmatched} คน — จะไม่สร้างพนักงานใหม่จากไฟล์นี้</span>}</div>}</section></>;
}
