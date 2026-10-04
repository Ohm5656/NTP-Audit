"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileClock,
  FileSpreadsheet,
  Filter,
  FolderUp,
  History as HistoryIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  money,
  months,
  shortMonths,
  sum,
  thaiDate,
  type PayrollRow,
} from "@/lib/mock";
import { DataProvider, usePayrollData } from "@/lib/data-context";
import { ImportWizardProvider } from "@/lib/import-wizard";
import {
  ImportUpload as LiveImportUpload,
  ImportPreview as LiveImportPreview,
  ImportMapping as LiveImportMapping,
  ImportValidation as LiveImportValidation,
  ImportComplete as LiveImportComplete,
} from "@/components/import-flow";
import { toSatang } from "@/lib/money";
import type { AppUser } from "@/lib/auth";
import { EmployeeAnnualTable, MonthlyMonthFolders, MonthlyPayrollTable, MonthlyYearFolders } from "@/components/payroll-navigation";
import { HistoricalImport } from "@/components/historical-import";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const mainNav: NavItem[] = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/monthly", label: "ข้อมูลรายเดือน", icon: Wallet },
  { href: "/employees", label: "รายได้พนักงาน (รายปี)", icon: Users },
  { href: "/leave", label: "วันลา", icon: Clock3 },
  { href: "/salary", label: "ปรับเงินเดือน", icon: SlidersHorizontal },
];
const systemNav: NavItem[] = [
  { href: "/historical", label: "\u0e19\u0e33\u0e40\u0e02\u0e49\u0e32\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e22\u0e49\u0e2d\u0e19\u0e2b\u0e25\u0e31\u0e07", icon: HistoryIcon },
  { href: "/import", label: "นำเข้าข้อมูล", icon: FolderUp },
  { href: "/imports", label: "ประวัตินำเข้า", icon: FileClock },
  { href: "/settings", label: "ตั้งค่า", icon: Settings2 },
];

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "บันทึกข้อมูลไม่สำเร็จ");
  return result;
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Status({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "gray" | "red";
}) {
  return <span className={`status status-${tone}`}>{children}</span>;
}

function Section({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className}`}>
      <div className="section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </div>
  );
}

function SelectYear({
  year,
  onChange,
}: {
  year: string;
  onChange: (value: string) => void;
}) {
  const { periods } = usePayrollData();
  const current = new Date().getFullYear() + 543;
  const years = Array.from(
    new Set([
      current,
      current + 1,
      Number(year),
      ...periods.map((period) => period.year + 543),
    ]),
  ).sort((a, b) => b - a);
  return (
    <label className="select-wrap">
      <span>ปี</span>
      <select value={year} onChange={(e) => onChange(e.target.value)}>
        {years.map((option) => (
          <option value={String(option)} key={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown size={15} aria-hidden />
    </label>
  );
}

function Metric({
  label,
  value,
  hint,
  primary = false,
}: {
  label: string;
  value: string;
  hint?: string;
  primary?: boolean;
}) {
  return (
    <div className={`metric ${primary ? "metric-primary" : ""}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {hint && <div className="metric-hint">{hint}</div>}
    </div>
  );
}

function MoneyCell({
  value,
  muted = false,
}: {
  value: number | null;
  muted?: boolean;
}) {
  return (
    <td className={`numeric ${muted ? "muted" : ""}`}>
      {value === null ? "—" : money(value)}
    </td>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`nav-link ${active ? "active" : ""}`}
    >
      <Icon size={18} strokeWidth={1.8} aria-hidden />
      <span>{item.label}</span>
    </Link>
  );
}

export default function Workspace({ user }: { user?: AppUser }) {
  const pathname = usePathname() || "/";
  const [year, setYear] = useState(
    pathname.startsWith("/monthly/")
      ? pathname.split("/")[2]
      : String(new Date().getFullYear() + 543),
  );
  useEffect(() => {
    if (pathname.startsWith("/monthly/")) setYear(pathname.split("/")[2]);
  }, [pathname]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");

  if (pathname === "/login") return <LoginPage />;

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  let content: ReactNode;
  if (pathname === "/") content = <Dashboard year={year} setYear={setYear} />;
  else if (pathname === "/monthly") content = <MonthlyYearFolders />;
  else if (/^\/monthly\/\d{4}$/.test(pathname))
    content = <MonthlyMonthFolders year={Number(pathname.split("/")[2]) - 543} />;
  else if (/^\/monthly\/\d{4}\/\d{1,2}$/.test(pathname))
    content = <MonthlyPayrollTable year={Number(pathname.split("/")[2]) - 543} month={Number(pathname.split("/")[3])} />;
  else if (pathname === "/historical") content = <HistoricalImport />;
  else if (pathname === "/import") content = <LiveImportUpload />;
  else if (pathname === "/import/preview") content = <LiveImportPreview />;
  else if (pathname === "/import/mapping") content = <LiveImportMapping />;
  else if (pathname === "/import/validation")
    content = <LiveImportValidation />;
  else if (pathname === "/import/complete") content = <LiveImportComplete />;
  else if (pathname === "/reports/employee")
    content = <EmployeesPage search={search} setSearch={setSearch} />;
  else if (pathname === "/reports/company")
    content = <CompanyReport year={year} setYear={setYear} />;
  else if (pathname === "/employees")
    content = <EmployeesPage search={search} setSearch={setSearch} />;
  else if (pathname.startsWith("/employees/"))
    content = <EmployeeProfile id={pathname.split("/")[2]} selectedAnnualYear={Number(pathname.split("/")[3]) - 543} />;
  else if (pathname === "/leave") content = <LeavePage />;
  else if (pathname === "/salary") content = <SalaryPage />;
  else if (pathname === "/imports") content = <ImportHistory />;
  else if (pathname === "/settings") content = <SettingsPage />;
  else
    content = (
      <PageHeading
        title="ไม่พบหน้า"
        action={
          <Link className="button button-primary" href="/">
            กลับภาพรวม
          </Link>
        }
      />
    );

  if (user?.role === "viewer" && (pathname === "/historical" || pathname === "/import" || pathname.startsWith("/import/") || pathname === "/leave" || pathname === "/salary" || pathname === "/settings"))
    content = <PageHeading title="ไม่มีสิทธิ์แก้ไขข้อมูล" description="บัญชีผู้ดูรายงานใช้สำหรับดูภาพรวมและรายงาน" action={<Link className="button button-primary" href="/">กลับภาพรวม</Link>} />;

  return (
    <DataProvider year={Number(year) - 543}>
      <ImportWizardProvider>
        <div className="app-shell">
          <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
            <div className="brand">
              <img src="/logo.png" className="brand-logo" alt="NTP Electric and Engineering" />
              <div>
                <strong>NTP Audit</strong>
                <small>ระบบรายได้พนักงาน</small>
              </div>
              <IconButton label="ปิดเมนู" onClick={() => setMobileOpen(false)}>
                <X size={19} />
              </IconButton>
            </div>
            <nav aria-label="เมนูหลัก">
              <p className="nav-caption">งานประจำ</p>
              {mainNav.filter((item) => user?.role !== "viewer" || !["/leave", "/salary"].includes(item.href)).map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
              <p className="nav-caption nav-caption-second">จัดการระบบ</p>
              {systemNav.filter((item) => user?.role !== "viewer" || item.href === "/imports").map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="prototype-note">
                <span className="note-dot" />
                ข้อมูลจากฐานข้อมูลภายใน
              </div>
              <div className="user-block">
                <span className="avatar">บ</span>
                <div>
                  <strong>{user?.email || "ผู้ใช้งาน"}</strong>
                  <small>{user?.role || "Admin"}</small>
                </div>
                <MoreHorizontal size={18} />
              </div>
            </div>
          </aside>
          {mobileOpen && (
            <button
              className="sidebar-backdrop"
              onClick={() => setMobileOpen(false)}
              aria-label="ปิดเมนู"
            />
          )}
          <div className="main-shell">
            <header className="topbar">
              <div className="topbar-left">
                <IconButton
                  label="เปิดเมนู"
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu size={20} />
                </IconButton>
                <span>ระบบบัญชีและเงินเดือน</span>
                <ChevronRight size={14} />
                <strong>{pageLabel(pathname)}</strong>
              </div>
              <div className="topbar-right">
                <span className="topbar-date">ข้อมูลปี {year}</span>
                <IconButton label="การแจ้งเตือน">
                  <Bell size={19} />
                </IconButton>
                <span className="topbar-avatar">บ</span>
                <IconButton
                  label="ออกจากระบบ"
                  onClick={async () => {
                    await fetch("/api/auth/logout", { method: "POST" });
                    window.location.href = "/login";
                  }}
                >
                  <LogOut size={18} />
                </IconButton>
              </div>
            </header>
            <main className="page-content">{content}</main>
          </div>
        </div>
      </ImportWizardProvider>
    </DataProvider>
  );
}

function pageLabel(path: string) {
  if (path === "/") return "ภาพรวม";
  if (path.startsWith("/monthly/")) return "รายละเอียดงวด";
  if (path.startsWith("/monthly")) return "ข้อมูลรายเดือน";
  if (path.startsWith("/import")) return "นำเข้าข้อมูล";
  if (path.startsWith("/reports/company")) return "รายงานบริษัท";
  if (path.startsWith("/reports")) return "รายงานรายปี";
  if (path.startsWith("/employees/")) return "ข้อมูลพนักงาน";
  if (path.startsWith("/employees")) return "พนักงาน";
  if (path === "/leave") return "วันลา";
  if (path === "/salary") return "ปรับเงินเดือน";
  if (path === "/imports") return "ประวัตินำเข้า";
  return "ตั้งค่า";
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-layout">
      <div className="login-brand">
        <img src="/logo.png" className="brand-logo" alt="NTP Electric and Engineering" />
        <strong>NTP Audit</strong>
      </div>
      <form
        className="login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email, password }),
            });
            const data = await response.json();
            if (!response.ok) setError(data.error || "เข้าสู่ระบบไม่สำเร็จ");
            else window.location.href = "/";
          } catch {
            setError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="login-topline" />
        <h1>เข้าสู่ระบบ</h1>
        <p>จัดการข้อมูลเงินเดือนและรายงานของบริษัทในที่เดียว</p>
        <label>
          อีเมล
          <input
            type="email"
            autoComplete="username"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          รหัสผ่าน
          <input
            type="password"
            autoComplete="current-password"
            placeholder="กรอกรหัสผ่าน"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
        <button
          className="button button-primary button-block"
          type="submit"
          disabled={busy}
        >
          {busy ? "กำลังเข้าสู่ระบบ" : "เข้าสู่ระบบ"} <ArrowRight size={17} />
        </button>
      </form>
      <div className="login-footer">
        สำหรับเจ้าหน้าที่บัญชีและผู้มีสิทธิ์เท่านั้น
      </div>
    </div>
  );
}

function Dashboard({
  year,
  setYear,
}: {
  year: string;
  setYear: (value: string) => void;
}) {
  const { payrollForMonth, annualTotal, coverage, employees, periods, user } =
    usePayrollData();
  const latest = periods
    .filter(
      (period) => period.year === Number(year) - 543 && period.activeImportId,
    )
    .sort((a, b) => b.month - a.month)[0];
  return (
    <>
      <PageHeading
        title="ภาพรวม"
        description="ติดตามข้อมูลเงินเดือนและความครบถ้วนของรายงานประจำปี"
        action={
          <>
            <SelectYear year={year} onChange={setYear} />
            {user?.role !== "viewer" && <Link className="button button-primary" href="/import">
              <Plus size={17} />
              นำเข้า Excel
            </Link>}
          </>
        }
      />
      <div className="coverage-card">
        <div className="coverage-intro">
          <div>
            <span className="overline">ความครบของข้อมูล</span>
            <h2>ข้อมูลปี {year}</h2>
            <p>
              {latest
                ? `นำเข้าแล้วถึงเดือน${months[latest.month - 1]}`
                : "ยังไม่มีข้อมูลในปีนี้"}
            </p>
          </div>
          <div className="coverage-number">
            <strong>
              {coverage}
              <span> / 12</span>
            </strong>
            <small>เดือน</small>
          </div>
        </div>
        <div className="coverage-months">
          {shortMonths.map((name, index) => (
            <Link
              href={
                periods.some(
                  (p) =>
                    p.year === Number(year) - 543 &&
                    p.month === index + 1 &&
                    p.activeImportId,
                )
                  ? `/monthly/${year}/${String(index + 1).padStart(2, "0")}`
                  : user?.role === "viewer" ? "/reports/company" : "/import"
              }
              className={`coverage-month ${periods.some((p) => p.year === Number(year) - 543 && p.month === index + 1 && p.activeImportId) ? "completed" : "missing"}`}
              key={name}
            >
              <span>{name}</span>
              <span className="coverage-marker">
                {periods.some(
                  (p) =>
                    p.year === Number(year) - 543 &&
                    p.month === index + 1 &&
                    p.activeImportId,
                ) ? (
                  <Check size={13} strokeWidth={2.5} />
                ) : (
                  "—"
                )}
              </span>
            </Link>
          ))}
        </div>
      </div>
      <div className="metric-grid">
        <Metric
          label="รายได้รวมตั้งแต่ต้นปี"
          value={coverage ? `฿${money(annualTotal("gross"), 0)}` : "—"}
          hint="รวมเงินเดือน OT และรายได้อื่น"
          primary
        />
        <Metric
          label="เงินสุทธิที่จ่าย"
          value={coverage ? `฿${money(annualTotal("net"), 0)}` : "—"}
          hint="หลังหักรายการทั้งหมด"
        />
        <Metric
          label="ค่าล่วงเวลา"
          value={coverage ? `฿${money(annualTotal("ot"), 0)}` : "—"}
          hint={`สะสม ${coverage} เดือน`}
        />
        <Metric
          label="พนักงานในระบบ"
          value={`${employees.length} คน`}
          hint={`พนักงาน ${employees.filter((e) => e.type === "employee").length} · กรรมการ ${employees.filter((e) => e.type === "director").length}`}
        />
      </div>
      <Section
        title="แนวโน้มเงินจ่ายสุทธิ"
        action={<span className="section-subtle">มกราคม – ธันวาคม {year}</span>}
      >
        {coverage === 0 ? <div className="chart-empty"><FileSpreadsheet size={23} /><strong>ยังไม่มีข้อมูลสำหรับแผนภูมิ</strong><span>ยอดแต่ละเดือนจะแสดงหลังบันทึกงวดเงินเดือน</span></div> : <div
          className="bar-chart"
          role="img"
          aria-label="แผนภูมิเงินจ่ายสุทธิ 12 เดือน"
        >
          {shortMonths.map((label, i) => (
            <div key={label} className="bar-chart-column">
              <div className="bar-chart-track">
                {payrollForMonth(i + 1).length > 0 && (
                  <div
                    style={{
                      height: `${Math.max(10, annualTotal("net") ? (sum(payrollForMonth(i + 1), "net") / (annualTotal("net") / Math.max(coverage, 1))) * 72 : 10)}%`,
                    }}
                  />
                )}
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>}
      </Section>
    </>
  );
}

function MonthlyList({
  year,
  setYear,
}: {
  year: string;
  setYear: (value: string) => void;
}) {
  const { payrollForMonth, coverage, periods: savedPeriods } = usePayrollData();
  const [query, setQuery] = useState("");
  const periods = months
    .map((name, index) => ({
      name,
      index: index + 1,
      rows: payrollForMonth(index + 1),
    }))
    .filter((p) => p.name.includes(query));
  return (
    <>
      <PageHeading
        title="ข้อมูลรายเดือน"
        description="ตรวจสอบยอดและสถานะการนำเข้าแต่ละงวด"
        action={
          <>
            <SelectYear year={year} onChange={setYear} />
            <Link href="/import" className="button button-primary">
              <Plus size={17} />
              นำเข้า Excel
            </Link>
          </>
        }
      />
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเดือน"
            aria-label="ค้นหาเดือน"
          />
        </div>
        <span className="toolbar-meta">{coverage} จาก 12 เดือนมีข้อมูล</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>งวดเดือน</th>
              <th>สถานะ</th>
              <th className="numeric">พนักงาน</th>
              <th className="numeric">รายได้รวม</th>
              <th className="numeric">รายการหัก</th>
              <th className="numeric">เงินสุทธิ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {periods.map((p) => {
              const imported = savedPeriods.some(
                (period) =>
                  period.year === Number(year) - 543 &&
                  period.month === p.index &&
                  period.activeImportId,
              );
              return (
                <tr key={p.index}>
                  <td>
                    <Link
                      className="table-primary-link"
                      href={
                        imported
                          ? `/monthly/${year}/${String(p.index).padStart(2, "0")}`
                          : "/import"
                      }
                    >
                      {p.name} {year}
                    </Link>
                  </td>
                  <td>
                    {imported ? (
                      <Status>นำเข้าแล้ว</Status>
                    ) : (
                      <Status tone="gray">ยังไม่มีข้อมูล</Status>
                    )}
                  </td>
                  <td className="numeric">{imported ? p.rows.length : "—"}</td>
                  <MoneyCell value={imported ? sum(p.rows, "gross") : null} />
                  <MoneyCell
                    value={imported ? sum(p.rows, "deductions") : null}
                  />
                  <MoneyCell value={imported ? sum(p.rows, "net") : null} />
                  <td className="row-arrow"><ChevronRight size={16} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MonthDetail({
  year,
  setYear,
}: {
  year: string;
  setYear: (value: string) => void;
}) {
  const { payrollForMonth, periods, entries, employees, user, refresh } = usePayrollData();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editError, setEditError] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const pathname = usePathname();
  const selectedYear = Number(pathname.split("/")[2]);
  const selectedMonth = Number(pathname.split("/")[3]);
  const period = periods.find(
    (p) =>
      p.year === selectedYear - 543 &&
      p.month === selectedMonth &&
      p.activeImportId,
  );
  const allRows = payrollForMonth(selectedMonth);
  const selectedEmployee = employees.find((person) => person.id === selectedEmployeeId);
  const selectedEntry = entries.find((entry) => entry.employeeDbId === selectedEmployee?.dbId && entry.year === selectedYear - 543 && entry.month === selectedMonth);
  const rows = allRows.filter(
    (row) =>
      (type === "all" || row.employee.type === type) &&
      (row.employee.name.includes(query) ||
        row.employee.id.toLowerCase().includes(query.toLowerCase())),
  );
  if (!period)
    return (
      <>
        <PageHeading
          title="ยังไม่มีข้อมูลเดือนนี้"
          description={`${months[selectedMonth - 1] || "เดือนที่เลือก"} ${selectedYear}`}
          action={
            <Link href="/import" className="button button-primary">
              นำเข้า Excel
            </Link>
          }
        />
      </>
    );
  return (
    <>
      <div className="backline">
        <Link href="/monthly">
          <ArrowLeft size={16} /> ข้อมูลรายเดือน
        </Link>
      </div>
      <PageHeading
        title={`${months[selectedMonth - 1]} ${selectedYear}`}
        description={
          period.paymentDate
            ? `งวดจ่าย ${thaiDate(period.paymentDate)} · ข้อมูลรายเดือน`
            : "ข้อมูลรายเดือน"
        }
        action={
          <>
            <SelectYear year={year} onChange={setYear} />
            <Status>นำเข้าแล้ว</Status>
          </>
        }
      />
      <div className="period-facts">
        <div>
          <span>ไฟล์ต้นฉบับ</span>
          <strong>{period.originalFilename || "—"}</strong>
        </div>
        <div>
          <span>ชีตข้อมูล</span>
          <strong>{period.sourceSheet || "—"}</strong>
        </div>
        <div>
          <span>จำนวนรายการ</span>
          <strong>{allRows.length} คน</strong>
        </div>
        <div>
          <span>สถานะตรวจสอบ</span>
          <strong className="green-text">ครบถ้วน</strong>
        </div>
      </div>
      <div className="metric-grid metric-grid-3">
        <Metric label="รายได้รวม" value={`฿${money(sum(allRows, "gross"))}`} />
        <Metric
          label="รายการหัก"
          value={`฿${money(sum(allRows, "deductions"))}`}
        />
        <Metric
          label="เงินสุทธิ"
          value={`฿${money(sum(allRows, "net"))}`}
          primary
        />
      </div>
      <Section
        title="รายการพนักงาน"
        action={
          <a className="button button-secondary" href={`/api/reports/export?kind=monthly&year=${selectedYear - 543}&month=${selectedMonth}`}>
            <ArrowDownToLine size={16} />
            ส่งออก Excel
          </a>
        }
      >
        <div className="toolbar toolbar-inside">
          <div className="search-box">
            <Search size={17} />
            <input
              placeholder="ค้นหาชื่อหรือรหัสพนักงาน"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <label className="filter-select">
            <Filter size={16} />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">ทุกประเภท</option>
              <option value="employee">พนักงาน</option>
              <option value="director">กรรมการ</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th>ประเภท</th>
                <th className="numeric">เงินเดือน</th>
                <th className="numeric">OT</th>
                <th className="numeric">รายได้อื่น</th>
                <th className="numeric">รายได้รวม</th>
                <th className="numeric">รายการหัก</th>
                <th className="numeric">สุทธิ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employee.id}>
                  <td>
                    <Link
                      className="table-primary-link"
                      href={`/employees/${row.employee.id}`}
                    >
                      {row.employee.name}
                    </Link>
                    <small className="cell-subtext">{row.employee.id}</small>
                  </td>
                  <td>
                    {row.employee.type === "director" ? "กรรมการ" : "พนักงาน"}
                  </td>
                  <MoneyCell value={row.salary} />
                  <MoneyCell value={row.ot} />
                  <MoneyCell value={row.allowance + row.bonus} />
                  <MoneyCell value={row.gross} />
                  <MoneyCell value={row.deductions} />
                  <MoneyCell value={row.net} />
                  <td className="row-arrow"><button className="icon-button" aria-label={`ดูรายละเอียดเงินเดือน ${row.employee.name}`} onClick={() => setSelectedEmployeeId(row.employee.id)}><ChevronRight size={16} /></button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>รวมทั้งงวด</td>
                <MoneyCell value={sum(rows, "salary")} />
                <MoneyCell value={sum(rows, "ot")} />
                <MoneyCell
                  value={sum(rows, "allowance") + sum(rows, "bonus")}
                />
                <MoneyCell value={sum(rows, "gross")} />
                <MoneyCell value={sum(rows, "deductions")} />
                <MoneyCell value={sum(rows, "net")} />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>
      {selectedEntry && selectedEmployee && (
        <div className="modal-backdrop" onClick={() => setSelectedEmployeeId(null)}>
          <div className="modal payroll-detail" role="dialog" aria-modal="true" aria-label={`รายละเอียดเงินเดือน ${selectedEmployee.name}`} onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div><h2>รายละเอียดเงินเดือน</h2><p>{selectedEmployee.name} · {selectedEmployee.id} · {months[selectedMonth - 1]} {selectedYear}</p></div>
              <button className="icon-button" aria-label="ปิดรายละเอียด" onClick={() => setSelectedEmployeeId(null)}><X size={18} /></button>
            </div>
            <div className="payroll-detail-scroll">
              {(["income", "deduction"] as const).map((kind) => <div key={kind}>
                <h3>{kind === "income" ? "รายได้" : "รายการหัก"}</h3>
                {selectedEntry.items.filter((item) => item.kind === kind).map((item) => <div key={item.id}>
                  <div className="payroll-detail-line">
                    <div><strong>{item.label}</strong><small>{item.sourceType === "manual" ? `แก้ไขแล้ว · ยอดจากไฟล์ ฿${money(item.originalAmount ?? item.amount)} · ` : ""}ไฟล์ {period.originalFilename} · ชีต {period.sourceSheet} · แถว {selectedEntry.sourceRow} · {item.sourceCell || "—"}{item.sourceHeader ? ` · ${item.sourceHeader}` : ""}</small></div>
                    <span>฿{money(item.amount)} {user?.role !== "viewer" && <button className="text-link edit-item-button" onClick={() => { setEditingItemId(item.id); setEditAmount((item.amount / 100).toFixed(2)); setEditReason(""); setEditError(""); }}>แก้ไข</button>}</span>
                  </div>
                  {editingItemId === item.id && <form className="payroll-edit-form" onSubmit={async (event) => {
                    event.preventDefault(); setEditBusy(true); setEditError("");
                    try {
                      const response = await fetch(`/api/payroll/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: editAmount, reason: editReason }) });
                      const result = await response.json();
                      if (!response.ok) throw new Error(result.error || "บันทึกไม่สำเร็จ");
                      await refresh(); setEditingItemId(null);
                    } catch (error) { setEditError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); }
                    finally { setEditBusy(false); }
                  }}>
                    <label>จำนวนเงินใหม่ (บาท)<input type="number" min="0" step="0.01" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} required /></label>
                    <label>เหตุผลการแก้ไข<input value={editReason} onChange={(event) => setEditReason(event.target.value)} required minLength={3} maxLength={500} /></label>
                    <button className="button button-primary" disabled={editBusy}>{editBusy ? "กำลังบันทึก" : "บันทึก"}</button>
                    <button type="button" className="button button-secondary" onClick={() => setEditingItemId(null)}>ยกเลิก</button>
                    {editError && <span className="form-error" role="alert">{editError}</span>}
                  </form>}
                </div>)}
              </div>)}
            </div>
            <div className="payroll-detail-totals"><span>รายได้รวม ฿{money(selectedEntry.gross)}</span><span>รายการหัก ฿{money(selectedEntry.deductions)}</span><strong>สุทธิ ฿{money(selectedEntry.net)}</strong></div>
          </div>
        </div>
      )}
    </>
  );
}

function AnnualEmployeeReport({
  year,
  setYear,
}: {
  year: string;
  setYear: (value: string) => void;
}) {
  const { employees, entries, itemTypes, payrollForMonth, leaveRecords, salaryAdjustments } =
    usePayrollData();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || "");
  const [detailed, setDetailed] = useState(true);
  const [showEmpty, setShowEmpty] = useState(false);
  const employee =
    employees.find((item) => item.id === employeeId) || employees[0];
  const monthly = Array.from({ length: 12 }, (_, index) =>
    payrollForMonth(index + 1).find((row) => row.employee.id === employeeId),
  );
  const monthlyEntries = Array.from({ length: 12 }, (_, index) =>
    entries.find((entry) => entry.year === Number(year) - 543 && entry.month === index + 1 && entry.employeeDbId === employee?.dbId),
  );
  const incomeItems = itemTypes.filter((item) => item.kind === "income");
  const deductionItems = itemTypes.filter((item) => item.kind === "deduction");
  const itemRow = (label: string, code: string) => {
    const values = monthlyEntries.map((entry) => entry
      ? entry.items.filter((item) => item.code === code).reduce((total, item) => total + item.amount, 0)
      : null);
    if (!showEmpty && values.every((value) => value === null || value === 0)) return null;
    return <tr key={code}>
      <th scope="row">{label}</th>
      {values.map((value, index) => <MoneyCell key={index} value={value} />)}
      <td className="numeric total-column">{money(values.reduce<number>((total, value) => total + (value || 0), 0))}</td>
    </tr>;
  };
  const reportRow = (label: string, key: keyof PayrollRow, strong = false) => {
    const values = monthly.map((row) => (row ? (row[key] as number) : null));
    if (!showEmpty && !strong && values.every((value) => !value)) return null;
    return (
      <tr key={label} className={strong ? "report-total" : ""}>
        <th scope="row">{label}</th>
        {values.map((value, index) => (
          <MoneyCell key={index} value={value} />
        ))}
        <td className="numeric total-column">
          {money(
            values.reduce<number>((total, value) => total + (value || 0), 0),
          )}
        </td>
      </tr>
    );
  };
  if (!employee)
    return (
      <>
        <PageHeading
          title="รายงานรายปีรายพนักงาน"
          description="ยังไม่มีพนักงานในระบบ"
          action={<SelectYear year={year} onChange={setYear} />}
        />
        <div className="guide-card">
          <h2>เริ่มจากข้อมูลรายเดือน</h2>
          <p>
            นำเข้า Excel รายเดือนเพื่อสร้างข้อมูลพนักงานและรายงานรายปีอัตโนมัติ
          </p>
          <Link href="/import" className="button button-primary">
            นำเข้า Excel
          </Link>
        </div>
      </>
    );
  return (
    <>
      <PageHeading
        title="รายงานรายปีรายพนักงาน"
        description="สรุปยอดจากข้อมูลรายเดือนที่นำเข้าแล้ว"
        action={
          <>
            <SelectYear year={year} onChange={setYear} />
            <a className="button button-secondary" href={`/api/reports/export?kind=employee&year=${Number(year) - 543}&employee=${encodeURIComponent(employeeId)}`}>
              <ArrowDownToLine size={16} />
              ส่งออก Excel
            </a>
          </>
        }
      />
      <div className="report-controls">
        <label className="control-field">
          <span>พนักงาน</span>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {employees.map((item) => (
              <option value={item.id} key={item.id}>
                {item.id} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented">
          <button
            className={!detailed ? "selected" : ""}
            onClick={() => setDetailed(false)}
          >
            สรุป
          </button>
          <button
            className={detailed ? "selected" : ""}
            onClick={() => setDetailed(true)}
          >
            รายละเอียด
          </button>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(e) => setShowEmpty(e.target.checked)}
          />
          แสดงรายการที่ไม่มียอด
        </label>
      </div>
      <div className="employee-report-head">
        <div className="profile-avatar">{employee.name.slice(0, 1)}</div>
        <div>
          <h2>{employee.name}</h2>
          <p>
            {employee.id} · {employee.position} · เริ่มงาน{" "}
            {thaiDate(employee.startDate)}
          </p>
        </div>
        <Status>มีข้อมูล {monthly.filter(Boolean).length} / 12 เดือน</Status>
      </div>
      <div className="report-key">
        <span>
          <i className="key-dot filled" />
          มีข้อมูล
        </span>
        <span>
          <i className="key-dot empty" />
          ยังไม่มีข้อมูล
        </span>
        <span>หน่วย: บาท</span>
      </div>
      <div className="table-scroll annual-scroll">
        <table className="annual-table">
          <thead>
            <tr>
              <th>รายการ</th>
              {shortMonths.map((month) => (
                <th className="numeric" key={month}>
                  {month}
                </th>
              ))}
              <th className="numeric total-column">รวมปี</th>
            </tr>
          </thead>
          <tbody>
            <tr className="report-section-row">
              <th colSpan={14}>รายได้</th>
            </tr>
            {detailed && incomeItems.map((item) => itemRow(item.label, item.code))}
            {reportRow("รวมรายได้", "gross", true)}
            <tr className="report-section-row">
              <th colSpan={14}>รายการหัก</th>
            </tr>
            {detailed && deductionItems.map((item) => itemRow(item.label, item.code))}
            {reportRow("รวมรายการหัก", "deductions", true)}
            {reportRow("เงินได้สุทธิ", "net", true)}
          </tbody>
        </table>
      </div>
      <div className="two-column report-lower">
        <Section
          title="สถิติการลา"
          action={
            <Link href="/leave" className="text-link">
              ดูรายการทั้งหมด <ArrowRight size={15} />
            </Link>
          }
        >
          <div className="leave-stats">
            {["ลากิจ", "พักร้อน", "ลาป่วย", "ลาไม่รับค่าจ้าง", "ขาดงาน"].map((type) => <div key={type}>
              <strong>{leaveRecords.filter((item) => item.employeeId === employeeId && item.date.startsWith(String(Number(year) - 543)) && item.type === type).reduce((total, item) => total + item.days, 0)}</strong>
              <span>{type}</span>
            </div>)}
          </div>
          <div className="compact-list">
            {leaveRecords
              .filter((item) => item.employeeId === employeeId && item.date.startsWith(String(Number(year) - 543)))
              .map((item) => (
                <div key={item.id}>
                  <span>
                    {thaiDate(item.date)} · {item.type}
                  </span>
                  <strong>{item.days} วัน</strong>
                </div>
              ))}
            {!leaveRecords.some((item) => item.employeeId === employeeId && item.date.startsWith(String(Number(year) - 543))) && (
              <p className="empty-inline">ยังไม่มีบันทึกการลา</p>
            )}
          </div>
        </Section>
        <Section
          title="ประวัติปรับเงินเดือน"
          action={
            <Link href="/salary" className="text-link">
              ดูรายการทั้งหมด <ArrowRight size={15} />
            </Link>
          }
        >
          <div className="compact-list">
            {salaryAdjustments
              .filter((item) => item.employeeId === employeeId && item.date.startsWith(String(Number(year) - 543)))
              .map((item) => (
                <div key={item.id}>
                  <span>
                    {thaiDate(item.date)} · {item.reason}
                  </span>
                  <strong>฿{money(item.oldSalary)} → ฿{money(item.newSalary)} <small>({item.oldSalary ? (((item.newSalary - item.oldSalary) / item.oldSalary) * 100).toFixed(1) : "—"}%)</small></strong>
                </div>
              ))}
            {!salaryAdjustments.some(
              (item) => item.employeeId === employeeId && item.date.startsWith(String(Number(year) - 543)),
            ) && <p className="empty-inline">ยังไม่มีประวัติปรับเงินเดือน</p>}
          </div>
        </Section>
      </div>
    </>
  );
}

function CompanyReport({
  year,
  setYear,
}: {
  year: string;
  setYear: (value: string) => void;
}) {
  const { payrollForMonth, annualTotal, coverage, entries } = usePayrollData();
  const [showExtra, setShowExtra] = useState(false);
  const imported = coverage > 0;
  const currentMonths = new Set(entries.filter((entry) => entry.year === Number(year) - 543).map((entry) => entry.month));
  const previousYearEntries = entries.filter((entry) => entry.year === Number(year) - 544);
  const previousNet = previousYearEntries.reduce((total, entry) => total + entry.net, 0);
  const priorSameMonths = previousYearEntries.filter((entry) => currentMonths.has(entry.month));
  const comparablePreviousNet = priorSameMonths.reduce((total, entry) => total + entry.net, 0);
  const comparableCurrentNet = entries.filter((entry) => entry.year === Number(year) - 543 && previousYearEntries.some((prior) => prior.month === entry.month)).reduce((total, entry) => total + entry.net, 0);
  const totals = Array.from({ length: 12 }, (_, index) =>
    payrollForMonth(index + 1),
  );
  return (
    <>
      <PageHeading
        title="รายงานสรุปทั้งบริษัท"
        description="เปรียบเทียบค่าใช้จ่ายพนักงานและกรรมการรายเดือน"
        action={
          <>
            <SelectYear year={year} onChange={setYear} />
            <a className="button button-secondary" href={`/api/reports/export?kind=company&year=${Number(year) - 543}`}>
              <ArrowDownToLine size={16} />
              ส่งออก Excel
            </a>
          </>
        }
      />
      <div className="report-summary-line">
        <div>
          <span>รายได้รวมทั้งปีถึงปัจจุบัน</span>
          <strong>{imported ? `฿${money(annualTotal("gross"))}` : "—"}</strong>
        </div>
        <div>
          <span>เงินสุทธิที่จ่าย</span>
          <strong>{imported ? `฿${money(annualTotal("net"))}` : "—"}</strong>
        </div>
        <div>
          <span>ข้อมูลครบ</span>
          <strong>{coverage} / 12 เดือน</strong>
        </div>
      </div>
      <div className="year-comparison">
        <div><span>ปีก่อน {Number(year) - 1}</span><strong>{previousYearEntries.length ? `฿${money(previousNet)}` : "—"}</strong></div>
        <div><span>เทียบเดือนที่มีข้อมูลทั้งสองปี</span><strong>{comparablePreviousNet !== 0 ? `${((comparableCurrentNet - comparablePreviousNet) / comparablePreviousNet * 100).toFixed(1)}%` : "—"}</strong></div>
      </div>
      <Section
        title="สรุปรายเดือน"
        action={
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showExtra}
              onChange={(e) => setShowExtra(e.target.checked)}
            />
            แสดงคอลัมน์เพิ่มเติม
          </label>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>เดือน</th>
                <th className="numeric">เงินเดือนพนักงาน</th>
                <th className="numeric">เงินเดือนกรรมการ</th>
                <th className="numeric">โบนัสพนักงาน</th>
                <th className="numeric">โบนัสกรรมการ</th>
                <th className="numeric">OT</th>
                <th className="numeric">รายได้รวม</th>
                {showExtra && (
                  <>
                    <th className="numeric">ภาษี</th>
                    <th className="numeric">ประกันสังคม</th>
                    <th className="numeric">รายการหัก</th>
                  </>
                )}
                <th className="numeric">เงินสุทธิ</th>
              </tr>
            </thead>
            <tbody>
              {months.map((name, index) => {
                const rows = imported ? totals[index] : [];
                const hasData = rows.length > 0;
                return (
                  <tr key={name}>
                    <td>
                      <Link
                        href={
                          hasData
                            ? `/monthly/${year}/${String(index + 1).padStart(2, "0")}`
                            : "/import"
                        }
                        className="table-primary-link"
                      >
                        {name}
                      </Link>
                    </td>
                    <MoneyCell
                      value={
                        hasData
                          ? rows
                              .filter((row) => row.employee.type === "employee")
                              .reduce((a, b) => a + b.salary, 0)
                          : null
                      }
                    />
                    <MoneyCell
                      value={
                        hasData
                          ? rows
                              .filter((row) => row.employee.type === "director")
                              .reduce((a, b) => a + b.salary, 0)
                          : null
                      }
                    />
                    <MoneyCell value={hasData ? rows.filter((row) => row.employee.type === "employee").reduce((a, b) => a + b.bonus, 0) : null} />
                    <MoneyCell value={hasData ? rows.filter((row) => row.employee.type === "director").reduce((a, b) => a + b.bonus, 0) : null} />
                    <MoneyCell value={hasData ? sum(rows, "ot") : null} />
                    <MoneyCell value={hasData ? sum(rows, "gross") : null} />
                    {showExtra && (
                      <>
                        <MoneyCell value={hasData ? sum(rows, "tax") : null} />
                        <MoneyCell
                          value={hasData ? sum(rows, "socialSecurity") : null}
                        />
                        <MoneyCell
                          value={hasData ? sum(rows, "deductions") : null}
                        />
                      </>
                    )}
                    <MoneyCell value={hasData ? sum(rows, "net") : null} />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>รวมปี</td>
                <MoneyCell
                  value={
                    imported
                      ? totals
                          .flat()
                          .filter((row) => row.employee.type === "employee")
                          .reduce((a, b) => a + b.salary, 0)
                      : null
                  }
                />
                <MoneyCell
                  value={
                    imported
                      ? totals
                          .flat()
                          .filter((row) => row.employee.type === "director")
                          .reduce((a, b) => a + b.salary, 0)
                      : null
                  }
                />
                <MoneyCell value={imported ? totals.flat().filter((row) => row.employee.type === "employee").reduce((a, b) => a + b.bonus, 0) : null} />
                <MoneyCell value={imported ? totals.flat().filter((row) => row.employee.type === "director").reduce((a, b) => a + b.bonus, 0) : null} />
                <MoneyCell value={imported ? annualTotal("ot") : null} />
                <MoneyCell value={imported ? annualTotal("gross") : null} />
                {showExtra && (
                  <>
                    <MoneyCell value={imported ? annualTotal("tax") : null} />
                    <MoneyCell
                      value={imported ? annualTotal("socialSecurity") : null}
                    />
                    <MoneyCell
                      value={imported ? annualTotal("deductions") : null}
                    />
                  </>
                )}
                <MoneyCell value={imported ? annualTotal("net") : null} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>
      <div className="related-link">
        <Link href="/employees">
          เปิดรายงานรายพนักงาน <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}

function EmployeesPage({
  search,
  setSearch,
}: {
  search: string;
  setSearch: (value: string) => void;
}) {
  const { employees, entries, refresh, user } = usePayrollData();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const latestAnnualYear = Array.from(new Set(entries.map((entry) => entry.year))).sort((a, b) => b - a)[0];
  const filtered = employees.filter(
    (employee) =>
      (filter === "all" || employee.type === filter) &&
      (employee.name.includes(search) ||
        employee.id.toLowerCase().includes(search.toLowerCase()) ||
        employee.position.includes(search)),
  );
  return (
    <>
      <PageHeading
        title="พนักงาน"
        description="ข้อมูลบุคลากรและประวัติเงินเดือน"
        action={latestAnnualYear ? <a className="button button-primary" href={`/api/reports/annual?year=${latestAnnualYear}`}><ArrowDownToLine size={17} />ดาวน์โหลด Annual Excel {latestAnnualYear + 543}</a> : null}
      />
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ รหัส หรือตำแหน่ง"
            aria-label="ค้นหาพนักงาน"
          />
        </div>
        <label className="filter-select">
          <Filter size={16} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">ทุกประเภท</option>
            <option value="employee">พนักงาน</option>
            <option value="director">กรรมการ</option>
          </select>
        </label>
        <span className="toolbar-meta">{filtered.length} คน</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>รหัส</th>
              <th>ชื่อพนักงาน</th>
              <th>ตำแหน่ง</th>
              <th>ประเภท</th>
              <th>วันเริ่มงาน</th>
              <th className="numeric">เงินเดือนปัจจุบัน</th>
              <th>สถานะ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((employee) => (
              <tr key={employee.id}>
                <td className="mono-cell">{employee.id}</td>
                <td>
                  <Link
                    href={`/employees/${employee.id}`}
                    className="table-primary-link"
                  >
                    {employee.name}
                  </Link>
                </td>
                <td>{employee.position}</td>
                <td>{employee.type === "director" ? "กรรมการ" : "พนักงาน"}</td>
                <td>{thaiDate(employee.startDate)}</td>
                <MoneyCell value={employee.salary} />
                <td>
                  <Status
                    tone={employee.status === "active" ? "green" : "gray"}
                  >
                    {employee.status === "active"
                      ? "ปฏิบัติงาน"
                      : employee.status === "resigned"
                        ? "ลาออก"
                        : "ไม่ปฏิบัติงาน"}
                  </Status>
                </td>
                <td className="row-arrow"><Link href={`/employees/${employee.id}`} aria-label={`Open ${employee.name}`} className="row-arrow-link"><ChevronRight size={16} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2 id="employee-modal-title">เพิ่มพนักงาน</h2>
                <p>สร้างรหัสพนักงานใหม่ในฐานข้อมูล</p>
              </div>
              <IconButton label="ปิด" onClick={() => setOpen(false)}>
                <X size={19} />
              </IconButton>
            </div>
            <form
              className="form-grid"
              onSubmit={async (e) => {
                e.preventDefault();
                setFormError("");
                const form = new FormData(e.currentTarget);
                try {
                  await postJson("/api/employees", {
                    name: form.get("name"),
                    type: form.get("type"),
                    position: form.get("position"),
                    department: form.get("department"),
                    startDate: form.get("date") || undefined,
                    salary: toSatang(String(form.get("salary"))),
                  });
                  await refresh();
                  setOpen(false);
                } catch (error) {
                  setFormError(
                    error instanceof Error ? error.message : "บันทึกไม่สำเร็จ",
                  );
                }
              }}
            >
              <label className="full-field">
                ชื่อ-สกุล
                <input name="name" required minLength={2} />
              </label>
              <label>
                ประเภท
                <select name="type">
                  <option value="employee">พนักงาน</option>
                  <option value="director">กรรมการ</option>
                </select>
              </label>
              <label>
                วันที่เริ่มงาน
                <input name="date" type="date" />
              </label>
              <label>
                ตำแหน่ง
                <input name="position" />
              </label>
              <label>
                แผนก
                <input name="department" />
              </label>
              <label className="full-field">
                เงินเดือนปัจจุบัน (บาท)
                <input
                  name="salary"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              {formError && (
                <div className="login-error full-field" role="alert">
                  {formError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setOpen(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="button button-primary">
                  บันทึกพนักงาน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function EmployeeProfile({ id, selectedAnnualYear }: { id: string; selectedAnnualYear: number }) {
  const { employees, entries, leaveRecords, salaryAdjustments } =
    usePayrollData();
  const employee = employees.find((item) => item.id === id);
  const [tab, setTab] = useState(selectedAnnualYear > 1900 || entries.some((entry) => entry.employeeDbId === employee?.dbId) ? "annual" : "overview");
  const monthly = entries
    .filter((entry) => entry.employeeDbId === employee?.dbId)
    .sort((a, b) => b.year - a.year || b.month - a.month)[0];
  const employeeLeaves = leaveRecords.filter((item) => item.employeeId === id).sort((a, b) => b.date.localeCompare(a.date));
  const leaveTotals = employeeLeaves.reduce<Record<string, number>>((totals, item) => ({ ...totals, [item.type]: (totals[item.type] || 0) + item.days }), {});
  const employeeAdjustments = salaryAdjustments.filter((item) => item.employeeId === id).sort((a, b) => b.date.localeCompare(a.date));
  const tenureText = employee?.startDate ? (() => { const start = new Date(employee.startDate); const now = new Date(); let monthsWorked = (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth(); if (now.getDate() < start.getDate()) monthsWorked--; return `${Math.max(0, Math.floor(monthsWorked / 12))} \u0e1b\u0e35 ${Math.max(0, monthsWorked % 12)} \u0e40\u0e14\u0e37\u0e2d\u0e19`; })() : "\u2014";
  if (!employee)
    return (
      <PageHeading
        title="ไม่พบพนักงาน"
        action={
          <Link href="/employees" className="button button-secondary">
            กลับรายชื่อ
          </Link>
        }
      />
    );
  return (
    <>
      <div className="backline">
        <Link href="/employees">
          <ArrowLeft size={16} /> พนักงาน
        </Link>
      </div>
      <div className="profile-header">
        <div className="profile-avatar large">{employee.name.slice(0, 1)}</div>
        <div>
          <div className="profile-title">
            <h1>{employee.name}</h1>
            <Status tone={employee.status === "active" ? "green" : "gray"}>{employee.status === "active" ? "ปฏิบัติงาน" : employee.status === "resigned" ? "ลาออก" : "ไม่ปฏิบัติงาน"}</Status>
          </div>
          <p>
            {[employee.id, employee.position, employee.department].filter(Boolean).join(" \u00b7 ")}
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {[
          ["overview", "ภาพรวม"],
          ["annual", "\u0e23\u0e32\u0e22\u0e44\u0e14\u0e49\u0e23\u0e32\u0e22\u0e1b\u0e35"],
          ["leave", "วันลา"],
          ["salary", "ปรับเงินเดือน"],
        ].map(([key, label]) => (
          <button
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? "selected" : ""}
            key={key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="two-column">
          <Section title="ข้อมูลการทำงาน">
            <div className="detail-list">
              <div>
                <span>รหัสพนักงาน</span>
                <strong>{employee.id}</strong>
              </div>
              <div>
                <span>ประเภท</span>
                <strong>
                  {employee.type === "director" ? "กรรมการ" : "พนักงาน"}
                </strong>
              </div>
              <div>
                <span>ตำแหน่ง</span>
                <strong>{employee.position}</strong>
              </div>
              <div>
                <span>วันเริ่มงาน</span>
                <strong>{thaiDate(employee.startDate)}</strong>
              </div>
              <div><span>{"\u0e2d\u0e32\u0e22\u0e38\u0e07\u0e32\u0e19"}</span><strong>{tenureText}</strong></div>
              <div>
                <span>เงินเดือนปัจจุบัน</span>
                <strong>฿{money(employee.salary)}</strong>
              </div>
            </div>
          </Section>
          <Section
            title="รายได้ล่าสุด"
            action={
              <Link href="/employees" className="text-link">
                รายงานรายปี <ArrowRight size={15} />
              </Link>
            }
          >
            <div className="detail-list">
              <div>
                <span>งวด</span>
                <strong>{monthly ? `${months[monthly.month - 1]} ${monthly.year + 543}` : "—"}</strong>
              </div>
              <div>
                <span>รายได้รวม</span>
                <strong>{monthly ? `฿${money(monthly.gross)}` : "—"}</strong>
              </div>
              <div>
                <span>รายการหัก</span>
                <strong>{monthly ? `฿${money(monthly.deductions)}` : "—"}</strong>
              </div>
              <div>
                <span>เงินสุทธิ</span>
                <strong className="green-text">
                  {monthly ? `฿${money(monthly.net)}` : "—"}
                </strong>
              </div>
            </div>
          </Section>
        </div>
      )}
      {tab === "annual" && <EmployeeAnnualTable employeeId={employee.id} selectedYear={selectedAnnualYear > 1900 ? selectedAnnualYear : (monthly?.year || new Date().getFullYear())} />}
      {tab === "leave" && (<Section title="ประวัติการลา" action={<span className="section-subtle">{employeeLeaves.length} รายการ</span>}>{employeeLeaves.length ? <><div className="history-summary">{Object.entries(leaveTotals).map(([type, days]) => <div key={type}><strong>{days}</strong><span>{type}</span></div>)}</div><div className="history-table-wrap"><table className="history-table"><thead><tr><th>วันที่</th><th>ประเภท</th><th>เหตุผล</th><th className="numeric">จำนวนวัน</th></tr></thead><tbody>{employeeLeaves.map((item) => <tr key={item.id}><td>{thaiDate(item.date)}</td><td><span className="history-tag">{item.type}</span></td><td>{item.reason || "—"}</td><td className="numeric history-value">{item.days.toFixed(2)}</td></tr>)}</tbody></table></div></> : <p className="empty-inline">ยังไม่มีบันทึกการลา</p>}</Section>)}
      {tab === "salary" && (<Section title="ประวัติปรับเงินเดือน" action={<span className="section-subtle">{employeeAdjustments.length} รายการ</span>}>{employeeAdjustments.length ? <div className="salary-history">{employeeAdjustments.map((item) => { const change = item.newSalary - item.oldSalary; const percent = item.oldSalary ? (change / item.oldSalary) * 100 : 0; return <article className="salary-history-row" key={item.id}><div className="salary-history-date">{thaiDate(item.date)}</div><div className="salary-history-amount"><strong>฿{money(item.oldSalary)}</strong><span>→</span><strong>฿{money(item.newSalary)}</strong></div><div><span className="salary-change">{change >= 0 ? "+" : ""}฿{money(change)} · {percent >= 0 ? "+" : ""}{percent.toFixed(1)}%</span><p>{item.reason || "ไม่มีหมายเหตุ"}</p></div></article>; })}</div> : <p className="empty-inline">ยังไม่มีประวัติการปรับเงินเดือน</p>}</Section>)}
    </>
  );
}

function LeavePage() {
  const { employees, leaveRecords: records, refresh, user } = usePayrollData();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [filter, setFilter] = useState("all");
  const shown = records.filter(
    (item) => filter === "all" || item.type === filter,
  );
  return (
    <>
      <PageHeading
        title="วันลา"
        description="บันทึกการลาแยกจากข้อมูลเงินเดือน"
        action={
          <button
            className="button button-primary"
            onClick={() => setOpen(true)}
            disabled={user?.role === "viewer" || employees.length === 0}
          >
            <Plus size={17} />
            เพิ่มการลา
          </button>
        }
      />
      <div className="metric-grid metric-grid-3">
        <Metric label="รายการลาทั้งปี" value={`${records.length} รายการ`} />
        <Metric
          label="วันลารวม"
          value={`${records.reduce((a, b) => a + b.days, 0)} วัน`}
        />
        <Metric
          label="พนักงานที่มีรายการลา"
          value={`${new Set(records.map((item) => item.employeeId)).size} คน`}
        />
      </div>
      <Section
        title="รายการลา"
        action={
          <label className="filter-select">
            <Filter size={16} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">ทุกประเภท</option>
              <option>ลากิจ</option>
              <option>พักร้อน</option>
              <option>ลาป่วย</option>
              <option>ลาไม่รับค่าจ้าง</option>
              <option>ขาดงาน</option>
            </select>
          </label>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>วันที่</th>
                <th>พนักงาน</th>
                <th>ประเภท</th>
                <th className="numeric">จำนวนวัน</th>
                <th>เหตุผล</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((item) => (
                <tr key={item.id}>
                  <td>{thaiDate(item.date)}</td>
                  <td>
                    <Link
                      href={`/employees/${item.employeeId}`}
                      className="table-primary-link"
                    >
                      {employees.find((e) => e.id === item.employeeId)?.name}
                    </Link>
                  </td>
                  <td>{item.type}</td>
                  <td className="numeric">{item.days}</td>
                  <td>{item.reason}</td>
                  <td>
                    <Status>{item.status}</Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2 id="leave-modal-title">เพิ่มการลา</h2>
                <p>บันทึกข้อมูลลงฐานข้อมูล</p>
              </div>
              <IconButton label="ปิด" onClick={() => setOpen(false)}>
                <X size={19} />
              </IconButton>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setFormError("");
                const form = new FormData(e.currentTarget);
                try {
                  await postJson("/api/leave", {
                    employeeId: form.get("employee"),
                    dateFrom: form.get("date"),
                    dateTo: form.get("dateTo"),
                    type: form.get("type"),
                    days: Number(form.get("days")),
                    reason: form.get("reason"),
                  });
                  await refresh();
                  setOpen(false);
                } catch (error) {
                  setFormError(
                    error instanceof Error ? error.message : "บันทึกไม่สำเร็จ",
                  );
                }
              }}
              className="form-grid"
            >
              <label>
                พนักงาน
                <select name="employee" required>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ประเภทการลา
                <select name="type" required>
                  <option value="personal">ลากิจ</option>
                  <option value="vacation">พักร้อน</option>
                  <option value="sick">ลาป่วย</option>
                  <option value="unpaid">ลาไม่รับค่าจ้าง</option>
                  <option value="absence">ขาดงาน</option>
                </select>
              </label>
              <label>
                วันที่เริ่ม
                <input name="date" type="date" required />
              </label>
              <label>
                วันที่สิ้นสุด
                <input name="dateTo" type="date" required />
              </label>
              <label>
                จำนวนวัน
                <input
                  name="days"
                  type="number"
                  min="0.5"
                  step="0.5"
                  defaultValue="1"
                  required
                />
              </label>
              <label className="full-field">
                เหตุผล
                <input name="reason" required placeholder="ระบุเหตุผล" />
              </label>
              {formError && (
                <div className="login-error full-field" role="alert">
                  {formError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setOpen(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="button button-primary">
                  บันทึกการลา
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function SalaryPage() {
  const {
    employees,
    salaryAdjustments: records,
    refresh,
    user,
  } = usePayrollData();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [selectedId, setSelectedId] = useState(employees[0]?.id || "");
  const [newSalary, setNewSalary] = useState("");
  const currentSalary =
    employees.find((item) => item.id === selectedId)?.salary || 0;
  const amount = newSalary ? toSatang(newSalary) : 0;
  const percent =
    amount > 0 && currentSalary > 0
      ? (((amount - currentSalary) / currentSalary) * 100).toFixed(2)
      : "0.00";
  return (
    <>
      <PageHeading
        title="ปรับเงินเดือน"
        description="เก็บประวัติการปรับพร้อมวันที่มีผลและเหตุผล"
        action={
          <button
            className="button button-primary"
            onClick={() => setOpen(true)}
            disabled={user?.role === "viewer" || employees.length === 0}
          >
            <Plus size={17} />
            เพิ่มการปรับเงินเดือน
          </button>
        }
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>วันที่มีผล</th>
              <th>พนักงาน</th>
              <th className="numeric">เงินเดือนเดิม</th>
              <th className="numeric">เงินเดือนใหม่</th>
              <th className="numeric">ปรับเพิ่ม</th>
              <th className="numeric">เปอร์เซ็นต์</th>
              <th>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {records.map((item) => (
              <tr key={item.id}>
                <td>{thaiDate(item.date)}</td>
                <td>
                  <Link
                    href={`/employees/${item.employeeId}`}
                    className="table-primary-link"
                  >
                    {employees.find((e) => e.id === item.employeeId)?.name}
                  </Link>
                </td>
                <MoneyCell value={item.oldSalary} />
                <MoneyCell value={item.newSalary} />
                <MoneyCell value={item.newSalary - item.oldSalary} />
                <td className="numeric">
                  {(
                    ((item.newSalary - item.oldSalary) / item.oldSalary) *
                    100
                  ).toFixed(2)}
                  %
                </td>
                <td>{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="salary-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2 id="salary-modal-title">เพิ่มการปรับเงินเดือน</h2>
                <p>บันทึกข้อมูลลงฐานข้อมูล</p>
              </div>
              <IconButton label="ปิด" onClick={() => setOpen(false)}>
                <X size={19} />
              </IconButton>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setFormError("");
                const form = new FormData(e.currentTarget);
                try {
                  await postJson("/api/salary", {
                    employeeId: selectedId,
                    effectiveDate: form.get("date"),
                    newSalary: amount,
                    reason: form.get("reason"),
                  });
                  await refresh();
                  setOpen(false);
                  setNewSalary("");
                } catch (error) {
                  setFormError(
                    error instanceof Error ? error.message : "บันทึกไม่สำเร็จ",
                  );
                }
              }}
              className="form-grid"
            >
              <label className="full-field">
                พนักงาน
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                >
                  {employees.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                วันที่มีผล
                <input name="date" type="date" required />
              </label>
              <label>
                เงินเดือนใหม่ (บาท)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newSalary}
                  onChange={(e) => setNewSalary(e.target.value)}
                  required
                />
              </label>
              <div className="salary-calculation full-field">
                <span>
                  เงินเดือนปัจจุบัน <strong>฿{money(currentSalary)}</strong>
                </span>
                <span>
                  ปรับเพิ่ม{" "}
                  <strong>
                    {amount > 0 ? `฿${money(amount - currentSalary)}` : "—"}
                  </strong>
                </span>
                <span>
                  อัตรา <strong>{percent}%</strong>
                </span>
              </div>
              <label className="full-field">
                หมายเหตุ
                <input name="reason" placeholder="เช่น ปรับประจำปี" required />
              </label>
              {formError && (
                <div className="login-error full-field" role="alert">
                  {formError}
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setOpen(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="button button-primary">
                  บันทึกการปรับเงินเดือน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ImportHistory() {
  const { imports, user } = usePayrollData();
  return (
    <>
      <PageHeading
        title="ประวัติการนำเข้า"
        description="ตรวจสอบงวด ไฟล์ต้นฉบับ และเวอร์ชันข้อมูล"
        action={user?.role !== "viewer" &&
          <Link href="/import" className="button button-primary">
            <Plus size={17} />
            นำเข้า Excel
          </Link>
        }
      />
      {imports.length === 0 && (
        <div className="hint-box history-hint">
          <CircleAlert size={18} />
          <p>ยังไม่มีประวัติการนำเข้า เริ่มจากไฟล์เงินเดือนรายเดือน</p>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>งวดข้อมูล</th>
              <th>เวอร์ชัน</th>
              <th>ไฟล์ต้นฉบับ</th>
              <th>วันที่นำเข้า</th>
              <th className="numeric">พนักงาน</th>
              <th>สถานะ</th>
              <th>ดาวน์โหลด</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {imports.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link
                    href={`/monthly/${item.year + 543}/${String(item.month).padStart(2, "0")}`}
                    className="table-primary-link"
                  >
                    {months[item.month - 1]} {item.year + 543}
                  </Link>
                </td>
                <td>v{item.version}</td>
                <td>{item.originalFilename}</td>
                <td>{new Date(item.importedAt).toLocaleDateString("th-TH")}</td>
                <td className="numeric">{item.employeeCount}</td>
                <td>
                  <Status tone={item.status === "active" ? "green" : "gray"}>
                    {item.status === "active" ? "ใช้งานอยู่" : "แทนที่แล้ว"}
                  </Status>
                </td>
                <td><a className="text-link" href={`/api/import/files/${item.id}`}>ไฟล์ต้นฉบับ</a></td>
                <td className="row-arrow">
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="guide-card">
        <h2>เมื่อนำเข้างวดเดิมอีกครั้ง</h2>
        <p>
          ระบบจะให้เปรียบเทียบความต่างก่อนเลือกแทนที่
          และเก็บเวอร์ชันเก่าไว้ตรวจสอบย้อนหลัง
        </p>
        <div className="version-example">
          <span>งวดเดิม</span>
          <span>v1 · เดิม</span>
          <ChevronRight size={16} />
          <span>v2 · ใช้งานอยู่</span>
        </div>
      </div>
    </>
  );
}

type ManagedUser = { id: string; email: string; role: "admin" | "payroll" | "viewer"; active: boolean; created_at: string };

function UserManagement() {
  const { user } = usePayrollData();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<ManagedUser["role"]>("payroll");
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = async () => {
    const response = await fetch("/api/users", { cache: "no-store" });
    if (!response.ok) throw new Error("อ่านบัญชีผู้ใช้ไม่สำเร็จ");
    setUsers((await response.json()).users);
  };
  useEffect(() => { reload().catch((cause) => setError(cause.message)); }, []);
  const update = async (id: string, changes: Record<string, unknown>) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...changes }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "บันทึกบัญชีไม่สำเร็จ");
      await reload(); setMessage("บันทึกบัญชีแล้ว");
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกบัญชีไม่สำเร็จ"); return false; }
    finally { setBusy(false); }
  };
  return <>
    <Section title="บัญชีผู้ใช้">
      <div className="table-scroll"><table><thead><tr><th>อีเมล</th><th>บทบาท</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
        {users.map((person) => <tr key={person.id}>
          <td>{person.email}{person.id === user?.id ? " · คุณ" : ""}</td>
          <td><select aria-label={`บทบาท ${person.email}`} value={person.role} disabled={busy || person.id === user?.id} onChange={(event) => update(person.id, { role: event.target.value })}><option value="admin">Admin</option><option value="payroll">บัญชี / เงินเดือน</option><option value="viewer">ผู้ดูรายงาน</option></select></td>
          <td><Status tone={person.active ? "green" : "gray"}>{person.active ? "ใช้งาน" : "ปิดใช้งาน"}</Status></td>
          <td><button className="text-link" disabled={busy || person.id === user?.id} onClick={() => update(person.id, { active: !person.active })}>{person.active ? "ปิดบัญชี" : "เปิดบัญชี"}</button> <button className="text-link" disabled={busy} onClick={() => { setResetTarget(person); setResetPassword(""); }}>ตั้งรหัสใหม่</button></td>
        </tr>)}
      </tbody></table></div>
      {resetTarget && <form className="settings-form settings-reset" onSubmit={async (event) => { event.preventDefault(); if (await update(resetTarget.id, { password: resetPassword })) { setResetTarget(null); setResetPassword(""); } }}>
        <label>รหัสผ่านใหม่สำหรับ {resetTarget.email}<input type="password" minLength={12} maxLength={200} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} required autoComplete="new-password" /></label>
        <button className="button button-primary" disabled={busy}>ตั้งรหัสผ่าน</button>
        <button type="button" className="button button-secondary" onClick={() => setResetTarget(null)}>ยกเลิก</button>
      </form>}
    </Section>
    <Section title="เพิ่มผู้ใช้">
      <form className="settings-form" onSubmit={async (event) => {
        event.preventDefault(); setBusy(true); setError(""); setMessage("");
        try {
          const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, role }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "เพิ่มผู้ใช้ไม่สำเร็จ");
          setEmail(""); setPassword(""); await reload(); setMessage("เพิ่มผู้ใช้แล้ว");
        } catch (cause) { setError(cause instanceof Error ? cause.message : "เพิ่มผู้ใช้ไม่สำเร็จ"); }
        finally { setBusy(false); }
      }}>
        <label>อีเมล<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>รหัสผ่านเริ่มต้น<input type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /></label>
        <label>บทบาท<select value={role} onChange={(event) => setRole(event.target.value as ManagedUser["role"])}><option value="payroll">บัญชี / เงินเดือน</option><option value="viewer">ผู้ดูรายงาน</option><option value="admin">Admin</option></select></label>
        <button className="button button-primary" disabled={busy}>เพิ่มผู้ใช้</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="green-text">{message}</p>}
    </Section>
  </>;
}

function CompanySettings() {
  const { company, refresh, user } = usePayrollData();
  const [name, setName] = useState(company?.name || "");
  const [address, setAddress] = useState(company?.address || "");
  const [taxId, setTaxId] = useState(company?.tax_id || "");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return <Section title="ข้อมูลบริษัท">
    <form className="settings-form" onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError(""); setMessage("");
      try {
        const response = await fetch("/api/settings/company", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, address, taxId }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "บันทึกข้อมูลบริษัทไม่สำเร็จ");
        await refresh(); setMessage("บันทึกข้อมูลบริษัทแล้ว");
      } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกข้อมูลบริษัทไม่สำเร็จ"); }
      finally { setBusy(false); }
    }}>
      <label>ชื่อบริษัท<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={160} disabled={user?.role !== "admin"} /></label>
      <label>เลขประจำตัวผู้เสียภาษี<input value={taxId} onChange={(event) => setTaxId(event.target.value.replace(/\D/g, "").slice(0, 13))} inputMode="numeric" placeholder="13 หลัก" disabled={user?.role !== "admin"} /></label>
      <label className="settings-wide">ที่อยู่บริษัท<textarea value={address} onChange={(event) => setAddress(event.target.value)} maxLength={500} rows={3} disabled={user?.role !== "admin"} /></label>
      {user?.role === "admin" && <button className="button button-primary" disabled={busy}>บันทึกข้อมูล</button>}
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="green-text">{message}</p>}
    <p className="section-subtle">สกุลเงิน: บาท (THB) · เขตเวลา: {company?.timezone || "Asia/Bangkok"}</p>
  </Section>;
}

function SettingsPage() {
  const { itemTypes, importMappings, user, refresh } = usePayrollData();
  const [tab, setTab] = useState("mapping");
  const [newItemLabel, setNewItemLabel] = useState("");
  const [newItemKind, setNewItemKind] = useState<"income" | "deduction">("income");
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editItemLabel, setEditItemLabel] = useState("");
  const [itemError, setItemError] = useState("");
  const [itemMessage, setItemMessage] = useState("");
  const [itemBusy, setItemBusy] = useState(false);
  const saveItem = async (method: "POST" | "PATCH", body: Record<string, unknown>) => {
    setItemBusy(true); setItemError(""); setItemMessage("");
    try {
      const response = await fetch("/api/settings/items", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "บันทึกรายการไม่สำเร็จ");
      await refresh(); setItemMessage("บันทึกรายการแล้ว"); return true;
    } catch (cause) { setItemError(cause instanceof Error ? cause.message : "บันทึกรายการไม่สำเร็จ"); return false; }
    finally { setItemBusy(false); }
  };
  return (
    <>
      <PageHeading
        title="ตั้งค่า"
        description="รายการเงินเดือน กฎการจับคู่ และสิทธิ์ผู้ใช้งาน"
      />
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "mapping"}
          className={tab === "mapping" ? "selected" : ""}
          onClick={() => setTab("mapping")}
        >
          รายการและการจับคู่
        </button>
        <button
          role="tab"
          aria-selected={tab === "users"}
          className={tab === "users" ? "selected" : ""}
          onClick={() => setTab("users")}
        >
          ผู้ใช้งานและสิทธิ์
        </button>
        <button
          role="tab"
          aria-selected={tab === "company"}
          className={tab === "company" ? "selected" : ""}
          onClick={() => setTab("company")}
        >
          ข้อมูลบริษัท
        </button>
      </div>
      {tab === "mapping" && (
        <>
          <Section title="รายการและคำเรียกจาก Excel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>หัวคอลัมน์ใน Excel</th>
                    <th>รายการในระบบ</th>
                    <th>ประเภท</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {itemTypes.map((item) => (
                    <tr key={item.id}>
                      <td>{item.aliases.join(" / ") || "—"}</td>
                      <td>{editItemId === item.id ? <form className="inline-item-edit" onSubmit={async (event) => { event.preventDefault(); if (await saveItem("PATCH", { id: item.id, label: editItemLabel })) setEditItemId(null); }}><input aria-label={`ชื่อรายการ ${item.label}`} value={editItemLabel} onChange={(event) => setEditItemLabel(event.target.value)} minLength={2} maxLength={120} required /><button className="text-link" disabled={itemBusy}>บันทึก</button><button type="button" className="text-link" onClick={() => setEditItemId(null)}>ยกเลิก</button></form> : item.label}</td>
                      <td>{item.kind === "income" ? "รายได้" : "รายการหัก"}</td>
                      <td>
                        <Status tone={item.active ? "green" : "gray"}>
                          {item.active ? "ใช้งาน" : "ปิดใช้งาน"}
                        </Status>
                      </td>
                      <td><button className="text-link" disabled={itemBusy} onClick={() => { setEditItemId(item.id); setEditItemLabel(item.label); }}>แก้ชื่อ</button> <button className="text-link" disabled={itemBusy || item.code === "salary"} onClick={() => saveItem("PATCH", { id: item.id, active: !item.active })}>{item.active ? "ปิด" : "เปิด"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="เพิ่มรายการเงินเดือน">
            <form className="settings-form" onSubmit={async (event) => { event.preventDefault(); if (await saveItem("POST", { label: newItemLabel, kind: newItemKind })) setNewItemLabel(""); }}>
              <label>ชื่อรายการ<input value={newItemLabel} onChange={(event) => setNewItemLabel(event.target.value)} minLength={2} maxLength={120} required placeholder="เช่น ค่าเดินทางพิเศษ" /></label>
              <label>ประเภท<select value={newItemKind} onChange={(event) => setNewItemKind(event.target.value as "income" | "deduction")}><option value="income">รายได้</option><option value="deduction">รายการหัก</option></select></label>
              <button className="button button-primary" disabled={itemBusy}>เพิ่มรายการ</button>
            </form>
            {itemError && <p className="form-error" role="alert">{itemError}</p>}{itemMessage && <p className="green-text">{itemMessage}</p>}
          </Section>
          <Section title="กฎจับคู่ที่บันทึกไว้">
            {importMappings.length ? <div className="table-scroll"><table><thead><tr><th>หัวคอลัมน์ Excel</th><th>รายการในระบบ</th><th>ประเภท</th></tr></thead><tbody>{importMappings.map((mapping) => <tr key={mapping.id}><td>{mapping.header}</td><td>{mapping.label}</td><td>{mapping.kind === "income" ? "รายได้" : "รายการหัก"}</td></tr>)}</tbody></table></div> : <p className="empty-inline">ยังไม่มีกฎจับคู่เพิ่มเติมจากการนำเข้า</p>}
          </Section>
          <div className="guide-card">
            <h2>รายการใหม่จาก Excel</h2>
            <p>
              หัวคอลัมน์ที่ระบบยังไม่รู้จักจะปรากฏให้เลือกจับคู่หรือสร้างรายการใหม่ในขั้นตอนนำเข้า
              จากนั้นระบบจะจำการจับคู่สำหรับงวดถัดไป
            </p>
          </div>
        </>
      )}
      {tab === "users" && (user?.role === "admin" ? <UserManagement /> : <Section title="ผู้ใช้งานและสิทธิ์"><p>บัญชี Admin เท่านั้นที่จัดการผู้ใช้ได้</p></Section>)}
      {tab === "company" && <CompanySettings />}
    </>
  );
}
