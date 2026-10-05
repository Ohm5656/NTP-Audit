"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  CircleCheck,
  FileSpreadsheet,
  Plus,
} from "lucide-react";
import { months, money } from "@/lib/mock";
import { toSatang } from "@/lib/money";
import { usePayrollData } from "@/lib/data-context";
import {
  useImportWizard,
  type EmployeeChoice,
  type MappingChoice,
} from "@/lib/import-wizard";

const steps = [
  { title: "เลือกไฟล์", href: "/import" },
  { title: "ตรวจพบข้อมูล", href: "/import/preview" },
  { title: "จับคู่ข้อมูล", href: "/import/mapping" },
  { title: "ตรวจสอบ", href: "/import/validation" },
  { title: "เสร็จสิ้น", href: "/import/complete" },
];
const keyFor = (value: string) =>
  value
    .normalize("NFC")
    .toLocaleLowerCase("th-TH")
    .replace(/[\s\-_/().:+]+/g, "");
const periodLabel = (year: number | null, month: number | null) =>
  year && month ? `${months[month - 1]} ${year + 543}` : "ไม่พบงวดข้อมูล";

function Frame({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className="stepper" aria-label="ขั้นตอนการนำเข้า">
        {steps.map((item, index) => (
          <Link
            href={item.href}
            key={item.href}
            className={`step ${index === step ? "current" : ""} ${index < step ? "done" : ""}`}
          >
            <span className="step-number">
              {index < step ? <Check size={13} /> : index + 1}
            </span>
            <span>{item.title}</span>
          </Link>
        ))}
      </div>
      <div className="import-content">{children}</div>
    </>
  );
}

function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="warning-box" role="alert">
      <CircleAlert size={18} />
      {message}
    </div>
  ) : null;
}
function NeedFile() {
  return (
    <div className="import-panel">
      <h2>ยังไม่มีไฟล์ที่อัปโหลด</h2>
      <p>เริ่มจากเลือกไฟล์ Excel รายเดือน</p>
      <Link href="/import" className="button button-primary">
        เลือกไฟล์
      </Link>
    </div>
  );
}

export function ImportUpload() {
  const router = useRouter();
  const wizard = useImportWizard();
  const [file, setFile] = useState<File | null>(null);
  const choose = (picked?: File | null) => {
    if (picked && picked.name.toLowerCase().endsWith(".xlsx")) setFile(picked);
  };
  return (
    <Frame
      step={0}
      title="นำเข้าข้อมูลเงินเดือน"
      description="อัปโหลด Excel รายเดือน แล้วตรวจข้อมูลก่อนบันทึก"
    >
      <div className="import-panel">
        <div className="panel-title">
          <h2>เลือกไฟล์รายเดือน</h2>
          <p>รองรับ .xlsx ขนาดไม่เกิน 15 MB</p>
        </div>
        <label
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose(e.dataTransfer.files[0]);
          }}
        >
          <span className="upload-icon">
            <FileSpreadsheet size={25} strokeWidth={1.7} />
          </span>
          <strong>{file?.name || "ลากไฟล์ Excel มาวางที่นี่"}</strong>
          <span>
            {file
              ? `${(file.size / 1024).toFixed(0)} KB · พร้อมอัปโหลด`
              : "หรือคลิกเพื่อเลือกไฟล์จากเครื่อง"}
          </span>
          <span className="dropzone-button">เลือกไฟล์ .xlsx</span>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => choose(e.target.files?.[0])}
          />
        </label>
        <div className="hint-box">
          <CircleAlert size={18} />
          <p>
            ระบบเก็บไฟล์ต้นฉบับไว้ในพื้นที่ส่วนตัว
            และจะยังไม่บันทึกยอดเงินเดือนจนกว่าคุณจะตรวจสอบและยืนยัน
          </p>
        </div>
        <ErrorBox message={wizard.error} />
        <div className="panel-actions">
          <Link href="/" className="button button-secondary">
            ยกเลิก
          </Link>
          <button
            className="button button-primary"
            disabled={!file || wizard.busy}
            onClick={async () => {
              if (!file) return;
              try {
                await wizard.stageFile(file);
                router.push("/import/preview");
              } catch {
                /* Error shown above. */
              }
            }}
          >
            {wizard.busy ? "กำลังอ่านไฟล์..." : "อ่านไฟล์และไปต่อ"}
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </Frame>
  );
}

export function ImportPreview() {
  const router = useRouter();
  const wizard = useImportWizard();
  if (!wizard.stage)
    return (
      <Frame
        step={1}
        title="ตรวจพบข้อมูลในไฟล์"
        description="ยืนยันชีตและงวดข้อมูล"
      >
        <NeedFile />
      </Frame>
    );
  const selected = wizard.stage.sheets.find(
    (sheet) => sheet.name === wizard.selectedSheet,
  );
  return (
    <Frame
      step={1}
      title="ตรวจพบข้อมูลในไฟล์"
      description="ยืนยันงวดและชีตต้นทางก่อนจับคู่ข้อมูล"
    >
      <div className="import-panel">
        <div className="panel-title">
          <h2>ข้อมูลที่ตรวจพบ</h2>
          <p>
            {wizard.stage.originalFilename} · ตรวจพบ{" "}
            {wizard.stage.sheets.length} ชีตที่อาจเป็นข้อมูลเงินเดือน
          </p>
        </div>
        <div className="detected-grid">
          <div>
            <span>งวดเดือน</span>
            <strong>
              {periodLabel(selected?.year || null, selected?.month || null)}
            </strong>
          </div>
          <div>
            <span>วันที่จ่าย</span>
            <strong>
              {selected?.paymentDate
                ? new Date(
                    `${selected.paymentDate}T00:00:00`,
                  ).toLocaleDateString("th-TH")
                : "ไม่พบ"}
            </strong>
          </div>
          <div>
            <span>จำนวนแถวพนักงาน</span>
            <strong>{wizard.stage.rowCount} รายการ</strong>
          </div>
          <div>
            <span>ชีตที่เสนอ</span>
            <strong>{wizard.stage.suggestedSheet}</strong>
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="source-sheet">ชีตต้นทางสำหรับงวดนี้</label>
          <select
            id="source-sheet"
            value={wizard.selectedSheet}
            onChange={(e) => wizard.setSelectedSheet(e.target.value)}
          >
            {wizard.stage.sheets.map((sheet) => (
              <option value={sheet.name} key={sheet.name}>
                {sheet.name}{" "}
                {sheet.year && sheet.month
                  ? `· ${periodLabel(sheet.year, sheet.month)}`
                  : "· ไม่พบงวด"}
              </option>
            ))}
          </select>
          <small>
            ระบบเสนอชีต “คิดค่าจ้าง” ก่อนเสมอเมื่อมีชีตนี้
            แต่คุณต้องยืนยันว่าเป็นงวดที่ถูกต้อง
          </small>
        </div>
        {(!selected?.year || !selected?.month) && (
          <div className="warning-box">
            <CircleAlert size={18} />
            ชีตนี้ไม่มีเดือนและปีที่อ่านได้ กรุณาเลือกชีตอื่น
          </div>
        )}
        <ErrorBox message={wizard.error} />
        <div className="panel-actions">
          <Link href="/import" className="button button-secondary">
            <ArrowLeft size={16} />
            ย้อนกลับ
          </Link>
          <button
            className="button button-primary"
            disabled={!selected?.year || !selected?.month || wizard.busy}
            onClick={async () => {
              try {
                await wizard.loadPreview({ sheet: wizard.selectedSheet });
                router.push("/import/mapping");
              } catch {
                /* Error shown above. */
              }
            }}
          >
            {wizard.busy ? "กำลังตรวจ..." : "ยืนยันชีตและไปต่อ"}
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </Frame>
  );
}

export function ImportMapping() {
  const router = useRouter();
  const wizard = useImportWizard();
  const { employees, itemTypes } = usePayrollData();
  useEffect(() => {
    if (wizard.stage && !wizard.preview) wizard.loadPreview().catch(() => {});
  }, [wizard.stage?.uploadId]);
  if (!wizard.stage)
    return (
      <Frame
        step={2}
        title="จับคู่ข้อมูล"
        description="รายการเงินเดือนและพนักงาน"
      >
        <NeedFile />
      </Frame>
    );
  const preview = wizard.preview;
  const newRows =
    preview?.rows.filter(
      (row) => row.match.status === "new" || row.match.status === "ambiguous",
    ) || [];
  const setEmployee = (row: number, choice: EmployeeChoice) =>
    wizard.setEmployeeChoices({
      ...wizard.employeeChoices,
      [String(row)]: choice,
    });
  const setMapping = (header: string, choice: MappingChoice) =>
    wizard.setMappings({ ...wizard.mappings, [keyFor(header)]: choice });
  return (
    <Frame
      step={2}
      title="จับคู่ข้อมูล"
      description="ยืนยันรายการเงินเดือนและรหัสพนักงานก่อนตรวจยอด"
    >
      <div className="import-panel import-panel-wide">
        <div className="panel-title">
          <h2>รายการเงินเดือน</h2>
          <p>
            หัวคอลัมน์ที่รู้จักถูกจับคู่อัตโนมัติ รายการใหม่ต้องยืนยันครั้งแรก
          </p>
        </div>
        {preview?.unknownHeaders.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>หัวคอลัมน์ใน Excel</th>
                  <th>ประเภท</th>
                  <th>วิธีจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {preview.unknownHeaders.map((header) => {
                  const choice = wizard.mappings[keyFor(header.header)];
                  return (
                    <tr key={header.header}>
                      <td>{header.header}</td>
                      <td>
                        {header.kind === "income" ? "รายได้" : "รายการหัก"}
                      </td>
                      <td>
                        <select
                          value={
                            choice?.action === "existing"
                              ? `existing:${choice.code}`
                              : choice?.action || ""
                          }
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === "create")
                              setMapping(header.header, {
                                action: "create",
                                label: header.header,
                                kind: header.kind,
                              });
                            else if (value === "ignore")
                              setMapping(header.header, { action: "ignore" });
                            else if (value.startsWith("existing:"))
                              setMapping(header.header, {
                                action: "existing",
                                code: value.slice(9),
                              });
                          }}
                        >
                          <option value="">เลือกการจับคู่</option>
                          <option value="create">
                            สร้างรายการ “{header.header}”
                          </option>
                          {itemTypes
                            .filter((type) => type.kind === header.kind)
                            .map((type) => (
                              <option
                                key={type.id}
                                value={`existing:${type.code}`}
                              >
                                จับคู่กับ {type.label}
                              </option>
                            ))}
                          <option value="ignore">
                            ไม่นำเข้า (เฉพาะยอดศูนย์)
                          </option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="validation-good">
            <CircleCheck size={20} />
            <div>
              <strong>รายการเงินเดือนทั้งหมดจับคู่ได้</strong>
              <span>ไม่พบหัวคอลัมน์ใหม่</span>
            </div>
          </div>
        )}
        <div className="panel-title mapping-employees-title">
          <h2>พนักงานที่ต้องยืนยัน</h2>
          <p>รหัสใหม่จะถูกสร้างเมื่อกดยืนยันนำเข้าครั้งสุดท้าย</p>
        </div>
        {newRows.length ? (
          <>
            <div className="mapping-bulk">
              <span>{newRows.length} คนต้องตัดสินใจ</span>
              <button
                className="button button-secondary"
                onClick={() =>
                  wizard.setEmployeeChoices({
                    ...wizard.employeeChoices,
                    ...Object.fromEntries(
                      newRows.map((row) => [
                        String(row.row),
                        { action: "create" },
                      ]),
                    ),
                  })
                }
              >
                สร้างรหัสใหม่ทั้งหมด
              </button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>แถว Excel</th>
                    <th>ชื่อ-สกุล</th>
                    <th>ประเภท</th>
                    <th>การจับคู่</th>
                  </tr>
                </thead>
                <tbody>
                  {newRows.map((row) => {
                    const choice = wizard.employeeChoices[String(row.row)];
                    return (
                      <tr key={row.row}>
                        <td>{row.row}</td>
                        <td>{row.name}</td>
                        <td>
                          {row.employeeType === "director"
                            ? "กรรมการ"
                            : "พนักงาน"}
                        </td>
                        <td>
                          <select
                            value={
                              choice?.action === "match"
                                ? `match:${choice.employeeCode}`
                                : choice?.action || ""
                            }
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "create")
                                setEmployee(row.row, { action: "create" });
                              else if (value === "ignore")
                                setEmployee(row.row, { action: "ignore" });
                              else if (value.startsWith("match:"))
                                setEmployee(row.row, {
                                  action: "match",
                                  employeeCode: value.slice(6),
                                });
                            }}
                          >
                            <option value="">เลือกการจัดการ</option>
                            <option value="create">สร้างพนักงานใหม่</option>
                            {employees
                              .filter(
                                (employee) =>
                                  employee.type === row.employeeType,
                              )
                              .map((employee) => (
                                <option
                                  value={`match:${employee.id}`}
                                  key={employee.id}
                                >
                                  จับคู่กับ {employee.id} · {employee.name}
                                </option>
                              ))}
                            <option value="ignore">ข้ามแถวนี้</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="validation-good">
            <CircleCheck size={20} />
            <div>
              <strong>พนักงานทุกคนจับคู่ได้</strong>
              <span>ไม่ต้องสร้างรหัสใหม่</span>
            </div>
          </div>
        )}
        <ErrorBox message={wizard.error} />
        <div className="panel-actions">
          <Link href="/import/preview" className="button button-secondary">
            <ArrowLeft size={16} />
            ย้อนกลับ
          </Link>
          <button
            className="button button-primary"
            disabled={!preview || wizard.busy}
            onClick={async () => {
              try {
                await wizard.loadPreview({
                  mappings: wizard.mappings,
                  employees: wizard.employeeChoices,
                });
                router.push("/import/validation");
              } catch {
                /* Error shown above. */
              }
            }}
          >
            ตรวจสอบยอด <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </Frame>
  );
}

export function ImportValidation() {
  const router = useRouter();
  const wizard = useImportWizard();
  const [replace, setReplace] = useState(false);
  useEffect(() => {
    if (wizard.stage && !wizard.preview) wizard.loadPreview().catch(() => {});
  }, [wizard.stage?.uploadId]);
  if (!wizard.stage)
    return (
      <Frame step={3} title="ตรวจสอบก่อนนำเข้า" description="เปรียบเทียบยอด">
        <NeedFile />
      </Frame>
    );
  const preview = wizard.preview;
  const errors =
    preview?.issues.filter((issue) => issue.severity === "error") || [];
  const warnings =
    preview?.issues.filter((issue) => issue.severity === "warning") || [];
  const unresolved =
    preview?.rows.filter(
      (row) =>
        row.match.status === "new" &&
        wizard.employeeChoices[String(row.row)]?.action !== "create",
    ) || [];
  const hasDuplicate = !!preview?.existingPeriod?.active_import_id;
  return (
    <Frame
      step={3}
      title="ตรวจสอบก่อนนำเข้า"
      description="ตรวจยอดจากรายการเงินเดือนและเปรียบเทียบกับ Excel"
    >
      <div className="import-panel import-panel-wide">
        <div className="validation-summary">
          <div className="validation-good">
            <CircleCheck size={21} />
            <div>
              <strong>
                {periodLabel(
                  preview?.source.year || null,
                  preview?.source.month || null,
                )}
              </strong>
              <span>
                {preview?.rows.length || 0} รายการ · {wizard.selectedSheet}
              </span>
            </div>
          </div>
          <div className="validation-count">
            <span>
              คำเตือน <strong>{warnings.length}</strong>
            </span>
            <span>
              ข้อผิดพลาด <strong>{errors.length + unresolved.length}</strong>
            </span>
          </div>
        </div>
        {hasDuplicate && (
          <div className="warning-box">
            <CircleAlert size={18} />
            <div>
              <strong>
                งวดนี้มีข้อมูลอยู่แล้ว (v{preview?.existingPeriod?.version})
              </strong>
              <p>
                ยอดเดิมรายได้รวม ฿
                {preview?.existingPeriod?.gross
                  ? money(toSatang(preview.existingPeriod.gross))
                  : "—"}{" "}
                · ยอดใหม่ ฿{money(preview?.totals.gross || 0)}
              </p>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.target.checked)}
                />
                แทนที่ข้อมูลเดิมและเก็บเวอร์ชันเก่าไว้
              </label>
            </div>
          </div>
        )}
        {errors.length > 0 && (
          <div className="issue-list">
            {errors.slice(0, 12).map((issue, index) => (
              <div key={index}>
                <CircleAlert size={15} />
                <span>
                  {issue.row ? `แถว ${issue.row}: ` : ""}
                  {issue.message}
                </span>
              </div>
            ))}
          </div>
        )}
        {unresolved.length > 0 && (
          <div className="warning-box">
            <CircleAlert size={18} />
            ยังไม่ยืนยันพนักงานใหม่ {unresolved.length} คน
            กรุณากลับไปหน้าจับคู่ข้อมูล
          </div>
        )}
        {warnings.length > 0 && (
          <details className="warning-details">
            <summary>ดูคำเตือน {warnings.length} รายการ</summary>
            <div>
              {warnings.slice(0, 30).map((issue, index) => (
                <p key={index}>
                  {issue.row ? `แถว ${issue.row}: ` : ""}
                  {issue.message}
                </p>
              ))}
            </div>
          </details>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>ประเภท</th>
                <th className="numeric">รายได้รวม</th>
                <th className="numeric">รายการหัก</th>
                <th className="numeric">สุทธิระบบ</th>
                <th className="numeric">สุทธิ Excel</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {preview?.rows.map((row) => (
                <tr key={row.row}>
                  <td>
                    {row.name}
                    <small className="cell-subtext">
                      แถว {row.row} ·{" "}
                      {row.match.code ||
                        (wizard.employeeChoices[String(row.row)]?.action ===
                        "create"
                          ? "สร้างรหัสใหม่"
                          : "ยังไม่จับคู่")}
                    </small>
                  </td>
                  <td>
                    {row.employeeType === "director" ? "กรรมการ" : "พนักงาน"}
                  </td>
                  <td className="numeric">{money(row.gross)}</td>
                  <td className="numeric">{money(row.deductions)}</td>
                  <td className="numeric">{money(row.net)}</td>
                  <td className="numeric">
                    {row.excelNet === null ? "—" : money(row.excelNet)}
                  </td>
                  <td>
                    {row.issues.some((issue) => issue.severity === "error") ? (
                      <span className="status status-red">ผิดพลาด</span>
                    ) : (
                      <span className="status status-green">ตรงกัน</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="confirm-bar">
          <div>
            <span>เงินสุทธิรวม</span>
            <strong>฿{money(preview?.totals.net || 0)}</strong>
          </div>
          <div className="panel-actions">
            <Link href="/import/mapping" className="button button-secondary">
              <ArrowLeft size={16} />
              ย้อนกลับ
            </Link>
            <button
              className="button button-primary"
              disabled={
                !preview ||
                errors.length > 0 ||
                unresolved.length > 0 ||
                (hasDuplicate && !replace) ||
                wizard.busy
              }
              onClick={async () => {
                try {
                  await wizard.confirm(replace);
                  router.push("/import/complete");
                } catch {
                  /* Error shown above. */
                }
              }}
            >
              {wizard.busy
                ? "กำลังบันทึก..."
                : hasDuplicate
                  ? "ยืนยันแทนที่งวด"
                  : "ยืนยันนำเข้า"}
            </button>
          </div>
        </div>
        <ErrorBox message={wizard.error} />
      </div>
    </Frame>
  );
}

export function ImportComplete() {
  const wizard = useImportWizard();
  const result = wizard.result;
  if (!result)
    return (
      <Frame
        step={4}
        title="ผลการนำเข้า"
        description="ไม่มีผลการนำเข้าที่เสร็จสิ้น"
      >
        <NeedFile />
      </Frame>
    );
  const href = `/monthly/${result.year + 543}/${String(result.month).padStart(2, "0")}`;
  return (
    <Frame
      step={4}
      title="นำเข้าข้อมูลเรียบร้อย"
      description="รายงานและยอดสะสมอัปเดตจากฐานข้อมูลแล้ว"
    >
      <div className="import-panel complete-panel">
        <div className="complete-mark">
          <Check size={26} />
        </div>
        <h2>{periodLabel(result.year, result.month)}</h2>
        <p>
          บันทึก {result.employeeCount} รายการ · เวอร์ชัน {result.version}
        </p>
        <div className="complete-detail">
          <div>
            <span>รายได้รวม</span>
            <strong>฿{money(result.gross)}</strong>
          </div>
          <div>
            <span>รายการหัก</span>
            <strong>฿{money(result.deductions)}</strong>
          </div>
          <div>
            <span>เงินสุทธิ</span>
            <strong>฿{money(result.net)}</strong>
          </div>
        </div>
        {result.createdCodes.length > 0 && (
          <div className="hint-box">
            <CircleCheck size={18} />
            <p>
              สร้างรหัสพนักงานใหม่ {result.createdCodes.length} รหัส:{" "}
              {result.createdCodes.join(", ")}
            </p>
          </div>
        )}
        <div className="complete-actions">
          <Link href={href} className="button button-primary">
            ดูงวดนี้ <ArrowRight size={17} />
          </Link>
          <button
            className="button button-secondary"
            onClick={() => {
              wizard.reset();
              window.location.href = "/import";
            }}
          >
            <Plus size={16} />
            นำเข้าเดือนถัดไป
          </button>
        </div>
      </div>
    </Frame>
  );
}
