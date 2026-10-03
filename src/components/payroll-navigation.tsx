"use client";

import Link from "next/link";
import { ArrowDownToLine, ArrowLeft, ChevronRight, Folder, FolderOpen, Plus } from "lucide-react";
import { usePayrollData, type Entry, type ItemType } from "@/lib/data-context";
import { money, months, thaiDate } from "@/lib/mock";

const incomeOrder = ["salary", "ot_15", "holiday_work", "ot_3", "attendance_bonus", "travel_allowance", "phone_allowance", "meal_allowance", "position_allowance", "bonus"];
const deductionOrder = ["housing_utilities", "social_security", "advance", "lost_tools", "loan", "tax"];

function displayMoney(value: number) {
  return money(value);
}

function orderedItems(items: ItemType[], kind: "income" | "deduction") {
  const order = kind === "income" ? incomeOrder : deductionOrder;
  return items
    .filter((item) => item.kind === kind && item.active)
    .sort((a, b) => {
      const ai = order.indexOf(a.code);
      const bi = order.indexOf(b.code);
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.label.localeCompare(b.label, "th");
    });
}

function amount(entry: Entry, code: string) {
  return entry.items.filter((item) => item.code === code).reduce((total, item) => total + item.amount, 0);
}

export function MonthlyYearFolders() {
  const { periods } = usePayrollData();
  const years = Array.from(new Set(periods.filter((period) => period.activeImportId).map((period) => period.year))).sort((a, b) => b - a);
  return <>
    <div className="page-heading">
      <div><h1>ข้อมูลรายเดือน</h1><p>เลือกปีจากงวดที่นำเข้าแล้ว</p></div>
      <div className="heading-actions"><Link href="/import" className="button button-primary"><Plus size={17} />นำเข้า Excel</Link></div>
    </div>
    {years.length === 0 ? <div className="guide-card"><h2>ยังไม่มีข้อมูลงวดเงินเดือน</h2><p>นำเข้า Excel รายเดือน แล้วระบบจะสร้างปีและเดือนจากข้อมูลจริงโดยอัตโนมัติ</p><Link href="/import" className="button button-primary">นำเข้า Excel</Link></div> : <div className="year-folder-grid">
      {years.map((year) => {
        const monthCount = periods.filter((period) => period.year === year && period.activeImportId).length;
        return <Link href={`/monthly/${year + 543}`} className="year-folder" key={year}><span className="year-folder-icon"><Folder size={28} /></span><span><strong>{year + 543}</strong><small>{monthCount} เดือนที่นำเข้าแล้ว</small></span><ChevronRight size={19} /></Link>;
      })}
    </div>}
  </>;
}

export function MonthlyMonthFolders({ year }: { year: number }) {
  const { periods, entries } = usePayrollData();
  const beYear = year + 543;
  const imported = new Map(periods.filter((period) => period.year === year && period.activeImportId).map((period) => [period.month, period]));
  return <>
    <div className="backline"><Link href="/monthly"><ArrowLeft size={16} />ข้อมูลรายเดือน</Link></div>
    <div className="page-heading"><div><h1>{beYear}</h1><p>เลือกเดือนที่มีข้อมูล</p></div><div className="heading-actions"><Link href="/import" className="button button-primary"><Plus size={17} />นำเข้า Excel</Link></div></div>
    <div className="month-folder-grid">
      {months.map((monthName, index) => {
        const month = index + 1;
        const period = imported.get(month);
        const rows = entries.filter((entry) => entry.year === year && entry.month === month);
        return period ? <Link className="month-folder active" key={month} href={`/monthly/${beYear}/${String(month).padStart(2, "0")}`}><FolderOpen size={22} /><span><strong>{monthName}</strong><small>{rows.length} รายการ · นำเข้าแล้ว</small></span><ChevronRight size={17} /></Link> : <div className="month-folder" key={month}><Folder size={22} /><span><strong>{monthName}</strong><small>ยังไม่มีข้อมูล</small></span></div>;
      })}
    </div>
  </>;
}

export function MonthlyPayrollTable({ year, month }: { year: number; month: number }) {
  const { periods, entries, employees, itemTypes } = usePayrollData();
  const period = periods.find((value) => value.year === year && value.month === month && value.activeImportId);
  const income = orderedItems(itemTypes, "income");
  const deductions = orderedItems(itemTypes, "deduction");
  const rows = entries
    .filter((entry) => entry.year === year && entry.month === month)
    .map((entry) => ({ entry, employee: employees.find((employee) => employee.dbId === entry.employeeDbId) }))
    .filter((row): row is { entry: Entry; employee: NonNullable<typeof row.employee> } => Boolean(row.employee));
  const byType = (type: "employee" | "director") => rows.filter((row) => row.employee.type === type);
  const total = (group: typeof rows, get: (entry: Entry) => number) => group.reduce((sum, row) => sum + get(row.entry), 0);
  const makeBody = (title: string, group: typeof rows) => <tbody key={title}>
    <tr className="monthly-group-row"><th colSpan={income.length + deductions.length + 3}>{title}</th></tr>
    {group.map(({ entry, employee }) => <tr key={entry.id}>
      <th className="monthly-employee"><Link href={`/employees/${employee.id}`}>{employee.name}<small>{employee.id}</small></Link></th>
      {income.map((item) => <td className="numeric" key={item.id}>{displayMoney(amount(entry, item.code))}</td>)}
      <td className="numeric total-column">{displayMoney(entry.gross)}</td>{deductions.map((item) => <td className="numeric" key={item.id}>{displayMoney(amount(entry, item.code))}</td>)}<td className="numeric total-column">{displayMoney(entry.deductions)}</td><td className="numeric net-column">{displayMoney(entry.net)}</td>
    </tr>)}
    <tr className="monthly-total-row"><th className="monthly-employee">รวมค่าจ้าง{title}</th>{income.map((item) => <td className="numeric" key={item.id}>{displayMoney(total(group, (entry) => amount(entry, item.code)))}</td>)}<td className="numeric total-column">{displayMoney(total(group, (entry) => entry.gross))}</td>{deductions.map((item) => <td className="numeric" key={item.id}>{displayMoney(total(group, (entry) => amount(entry, item.code)))}</td>)}<td className="numeric total-column">{displayMoney(total(group, (entry) => entry.deductions))}</td><td className="numeric net-column">{displayMoney(total(group, (entry) => entry.net))}</td></tr>
  </tbody>;
  if (!period) return <><div className="backline"><Link href={`/monthly/${year + 543}`}><ArrowLeft size={16} />{year + 543}</Link></div><div className="guide-card"><h2>ยังไม่มีข้อมูลเดือนนี้</h2><p>เลือกไฟล์ Excel รายเดือนเพื่อนำเข้าข้อมูล</p><Link href="/import" className="button button-primary">นำเข้า Excel</Link></div></>;
  const staff = byType("employee"); const directors = byType("director");
  return <>
    <div className="backline"><Link href={`/monthly/${year + 543}`}><ArrowLeft size={16} />{year + 543}</Link></div>
    <div className="page-heading"><div><h1>{months[month - 1]} {year + 543}</h1><p>{period.paymentDate ? `งวดจ่าย ${thaiDate(period.paymentDate)} · ` : ""}ข้อมูลจากฐานข้อมูล</p></div><div className="heading-actions"><a className="button button-secondary" href={`/api/import/files/${period.activeImportId}`}><ArrowDownToLine size={16} />ดาวน์โหลดไฟล์ต้นฉบับ</a></div></div>
    <div className="period-facts"><div><span>ไฟล์ต้นฉบับ</span><strong>{period.originalFilename || "—"}</strong></div><div><span>ชีตข้อมูล</span><strong>{period.sourceSheet || "—"}</strong></div><div><span>พนักงาน</span><strong>{staff.length} คน</strong></div><div><span>กรรมการ</span><strong>{directors.length} คน</strong></div></div>
    <section className="section"><div className="section-heading"><h2>รายละเอียด Payroll</h2><span className="section-subtle">หน่วย: บาท</span></div><div className="table-scroll monthly-detail-scroll"><table className="monthly-detail-table"><thead><tr className="monthly-header-groups"><th rowSpan={2} className="monthly-employee">พนักงาน</th><th colSpan={Math.max(income.length, 1)}>ค่าจ้าง ค่าล่วงเวลา และรายรับอื่น</th><th rowSpan={2} className="numeric total-column">รวมเงินได้</th><th colSpan={Math.max(deductions.length, 1)}>รายการหัก</th><th rowSpan={2} className="numeric net-column">รายได้สุทธิ</th></tr><tr>{income.map((item) => <th className="numeric" key={item.id}>{item.label}</th>)}{deductions.map((item) => <th className="numeric" key={item.id}>{item.label}</th>)}</tr></thead>{makeBody("พนักงาน", staff)}{directors.length > 0 && makeBody("กรรมการบริษัท", directors)}<tfoot><tr><th className="monthly-employee">รวมทั้งสิ้น</th>{income.map((item) => <td className="numeric" key={item.id}>{displayMoney(total(rows, (entry) => amount(entry, item.code)))}</td>)}<td className="numeric total-column">{displayMoney(total(rows, (entry) => entry.gross))}</td>{deductions.map((item) => <td className="numeric" key={item.id}>{displayMoney(total(rows, (entry) => amount(entry, item.code)))}</td>)}<td className="numeric total-column">{displayMoney(total(rows, (entry) => entry.deductions))}</td><td className="numeric net-column">{displayMoney(total(rows, (entry) => entry.net))}</td></tr></tfoot></table></div></section>
  </>;
}

export function EmployeeAnnualTable({ employeeId, selectedYear }: { employeeId: string; selectedYear: number }) {
  const { entries, employees, itemTypes } = usePayrollData();
  const employee = employees.find((value) => value.id === employeeId);
  const income = orderedItems(itemTypes, "income"); const deductions = orderedItems(itemTypes, "deduction");
  const currentEntries = new Map(entries.filter((entry) => entry.employeeDbId === employee?.dbId && entry.year === selectedYear).map((entry) => [entry.month, entry]));
  const availableYears = Array.from(new Set(entries.filter((entry) => entry.employeeDbId === employee?.dbId).map((entry) => entry.year))).sort((a, b) => b - a);
  if (!employee) return null;
  if (!availableYears.length) return <div className="guide-card"><h2>ยังไม่มีรายได้รายปี</h2><p>ข้อมูลรายได้จะแสดงหลังนำเข้า Payroll หรือข้อมูลย้อนหลังของพนักงานคนนี้</p></div>;
  const cell = (entry: Entry | undefined, code: string) => entry ? displayMoney(amount(entry, code)) : "—";
  const totalItem = (code: string) => Array.from(currentEntries.values()).reduce((sum, entry) => sum + amount(entry, code), 0);
  return <section className="section employee-annual-section"><div className="section-heading"><div><h2>รายได้รายปี {selectedYear + 543}</h2><p className="section-subtle">เดือนที่ยังไม่มี Payroll แสดงด้วย —</p></div><div className="annual-year-links">{availableYears.map((year) => <Link key={year} className={year === selectedYear ? "selected" : ""} href={`/employees/${employeeId}/${year + 543}`}>{year + 543}</Link>)}</div></div><div className="table-scroll annual-scroll"><table className="annual-payroll-table"><thead><tr className="monthly-header-groups"><th rowSpan={2} className="monthly-employee">เดือน</th><th colSpan={Math.max(income.length, 1)}>รายได้</th><th rowSpan={2} className="numeric total-column">รวมรายได้</th><th colSpan={Math.max(deductions.length, 1)}>รายการหัก</th><th rowSpan={2} className="numeric net-column">เงินได้สุทธิ</th></tr><tr>{income.map((item) => <th className="numeric" key={item.id}>{item.label}</th>)}{deductions.map((item) => <th className="numeric" key={item.id}>{item.label}</th>)}</tr></thead><tbody>{months.map((label, index) => { const entry = currentEntries.get(index + 1); return <tr key={label}><th className="monthly-employee">{label}</th>{income.map((item) => <td className="numeric" key={item.id}>{cell(entry, item.code)}</td>)}<td className="numeric total-column">{entry ? displayMoney(entry.gross) : "?"}</td>{deductions.map((item) => <td className="numeric" key={item.id}>{cell(entry, item.code)}</td>)}<td className="numeric total-column">{entry ? displayMoney(entry.gross) : "—"}</td><td className="numeric total-column">{entry ? displayMoney(entry.deductions) : "—"}</td><td className="numeric net-column">{entry ? displayMoney(entry.net) : "—"}</td></tr>; })}</tbody><tfoot><tr><th className="monthly-employee">รวม</th>{income.map((item) => <td className="numeric" key={item.id}>{displayMoney(totalItem(item.code))}</td>)}<td className="numeric total-column">{displayMoney(Array.from(currentEntries.values()).reduce((sum, entry) => sum + entry.gross, 0))}</td>{deductions.map((item) => <td className="numeric" key={item.id}>{displayMoney(totalItem(item.code))}</td>)}<td className="numeric total-column">{displayMoney(Array.from(currentEntries.values()).reduce((sum, entry) => sum + entry.deductions, 0))}</td><td className="numeric net-column">{displayMoney(Array.from(currentEntries.values()).reduce((sum, entry) => sum + entry.net, 0))}</td></tr></tfoot></table></div></section>;
}
