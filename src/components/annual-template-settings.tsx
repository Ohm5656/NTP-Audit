"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { FileSpreadsheet, FileUp, History, LoaderCircle } from "lucide-react";
import { usePayrollData } from "@/lib/data-context";

function thaiDateTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AnnualTemplateSettings() {
  const { annualTemplate, refresh, user } = usePayrollData();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/settings/annual-template", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "บันทึก Annual Template ไม่สำเร็จ");
      await refresh();
      setFile(null);
      setMessage(`ใช้ ${result.originalFilename} เป็นรูปแบบสำหรับ Annual Excel แล้ว`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึก Annual Template ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return <div className="template-settings-stack">
    <section className="section template-settings-section">
      <div className="section-heading"><div><h2>Annual Excel Template</h2><p>กำหนดรูปแบบไฟล์ที่ระบบใช้สร้างรายงานรายปี</p></div></div>
      <div className="template-settings-body">
        <div className="template-current">
          <div className="template-file-icon"><FileSpreadsheet size={22} /></div>
          <div><strong>{annualTemplate?.originalFilename || "ยังไม่มี Annual Template"}</strong><span>{annualTemplate ? `อัปโหลดล่าสุด ${thaiDateTime(annualTemplate.uploadedAt)}` : "อัปโหลดไฟล์แม่แบบก่อนดาวน์โหลด Annual Excel"}</span></div>
        </div>
        <p className="section-subtle">เมื่อเปลี่ยนไฟล์นี้ ระบบจะเปลี่ยนเฉพาะรูปแบบของ Annual Excel ที่ export หลังจากนี้ ข้อมูลวันที่เริ่มงาน วันลา ประวัติปรับเงินเดือน และ Payroll รายเดือนไม่ถูกแก้ไข</p>
        {user?.role === "admin" ? <form className="template-upload-form" onSubmit={submit}>
          <label className="file-picker"><FileUp size={18} /><span>{file?.name || "เลือกไฟล์ Annual Excel Template (.xlsx)"}</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
          <button className="button button-primary" disabled={!file || busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <FileUp size={16} />}{busy ? "กำลังบันทึก" : "บันทึก Annual Template"}</button>
        </form> : <p className="access-note">เฉพาะผู้ดูแลระบบเท่านั้นที่เปลี่ยน Annual Template ได้</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="green-text">{message}</p>}
      </div>
    </section>

    <section className="section template-settings-section">
      <div className="section-heading"><div><h2>ข้อมูลย้อนหลังพนักงาน</h2><p>ใช้เมื่อต้องนำเข้าหรือแก้ข้อมูลเก่าจาก Annual Excel</p></div></div>
      <div className="template-settings-body history-settings-body">
        <div className="template-current"><div className="template-file-icon"><History size={22} /></div><div><strong>วันเริ่มงาน วันลา และประวัติปรับเงินเดือน</strong><span>ไม่อ่านรายได้หรือเงินเดือนรายเดือนจากไฟล์ย้อนหลัง</span></div></div>
        <Link className="button button-secondary" href="/historical">เปิดหน้าข้อมูลย้อนหลัง</Link>
      </div>
    </section>
  </div>;
}
