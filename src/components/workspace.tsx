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
import { toSatang } from "@/lib/money";
import type { AppUser } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const mainNav: NavItem[] = [
  { href: "/", label: "ภาพรวม", icon: LayoutDashboard },
  { href: "/monthly", label: "ข้อมูลรายเดือน", icon: Wallet },
  { href: "/reports/employee", label: "รายงานรายปี", icon: FileSpreadsheet },
  { href: "/employees", label: "พนักงาน", icon: Users },
  { href: "/leave", label: "วันลา", icon: Clock3 },
  { href: "/salary", label: "ปรับเงินเดือน", icon: SlidersHorizontal },
];
const systemNav: NavItem[] = [
  { href: "/import", label: "นำเข้าข้อมูล", icon: FolderUp },
  { href: "/imports", label: "ประวัตินำเข้า", icon: FileClock },
  { href: "/settings", label: "ตั้งค่า", icon: Settings2 },
];

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
  const years = Array.from(new Set([current, current + 1, Number(year), ...periods.map((period) => period.year + 543)])).sort((a, b) => b - a);
  return (
    <label className="select-wrap">
      <span>ปี</span>
      <select value={year} onChange={(e) => onChange(e.target.value)}>
        {years.map((option) => <option value={String(option)} key={option}>{option}</option>)}
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

function CompanySwitch() {
  const { company } = usePayrollData();
  return <div className="company-switch"><span className="company-monogram">N</span><div><strong>{company?.name || "บริษัทของฉัน"}</strong><small>ระบบภายในบริษัท</small></div></div>;
}

export default function Workspace({ user }: { user?: AppUser }) {
  const pathname = usePathname() || "/";
  const [year, setYear] = useState(pathname.startsWith("/monthly/") ? pathname.split("/")[2] : String(new Date().getFullYear() + 543));
  useEffect(() => { if (pathname.startsWith("/monthly/")) setYear(pathname.split("/")[2]); }, [pathname]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");

  if (pathname === "/login") return <LoginPage />;

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);
  let content: ReactNode;
  if (pathname === "/") content = <Dashboard year={year} setYear={setYear} />;
  else if (pathname === "/monthly")
    content = <MonthlyList year={year} setYear={setYear} />;
  else if (pathname.startsWith("/monthly/"))
    content = <MonthDetail year={year} setYear={setYear} />;
  else if (pathname === "/import") content = <ImportUpload />;
  else if (pathname === "/import/preview") content = <ImportPreview />;
  else if (pathname === "/import/mapping") content = <ImportMapping />;
  else if (pathname === "/import/validation") content = <ImportValidation />;
  else if (pathname === "/import/complete") content = <ImportComplete />;
  else if (pathname === "/reports/employee")
    content = <AnnualEmployeeReport year={year} setYear={setYear} />;
  else if (pathname === "/reports/company")
    content = <CompanyReport year={year} setYear={setYear} />;
  else if (pathname === "/employees")
    content = <EmployeesPage search={search} setSearch={setSearch} />;
  else if (pathname.startsWith("/employees/"))
    content = <EmployeeProfile id={pathname.split("/")[2]} />;
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

  return (
    <DataProvider year={Number(year) - 543}>
      <div className="app-shell">
        <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
          <div className="brand">
            <div className="brand-symbol">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div>
              <strong>NTP Audit</strong>
              <small>ระบบรายได้พนักงาน</small>
            </div>
            <IconButton label="ปิดเมนู" onClick={() => setMobileOpen(false)}>
              <X size={19} />
            </IconButton>
          </div>
          <CompanySwitch />
          <nav aria-label="เมนูหลัก">
            <p className="nav-caption">งานประจำ</p>
            {mainNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
            <p className="nav-caption nav-caption-second">จัดการระบบ</p>
            {systemNav.map((item) => (
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
              <IconButton label="เปิดเมนู" onClick={() => setMobileOpen(true)}>
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
        <div className="brand-symbol">
          <span></span>
          <span></span>
          <span></span>
        </div>
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
  const { payrollForMonth, annualTotal, coverage, employees, periods } =
    usePayrollData();
  const latest = periods.filter((period) => period.year === Number(year) - 543 && period.activeImportId).sort((a, b) => b.month - a.month)[0];
  const rows = latest ? payrollForMonth(latest.month) : [];
  const latestHref = latest ? `/monthly/${year}/${String(latest.month).padStart(2, "0")}` : "/import";
  return (
    <>
      <PageHeading
        title="ภาพรวม"
        description="ติดตามข้อมูลเงินเดือนและความครบถ้วนของรายงานประจำปี"
        action={
          <>
            <SelectYear year={year} onChange={setYear} />
            <Link className="button button-primary" href="/import">
              <Plus size={17} />
              นำเข้า Excel
            </Link>
          </>
        }
      />
      <div className="coverage-card">
        <div className="coverage-intro">
          <div>
            <span className="overline">ความครบของข้อมูล</span>
            <h2>ข้อมูลปี {year}</h2>
            <p>{latest ? `นำเข้าแล้วถึงเดือน${months[latest.month - 1]}` : "ยังไม่มีข้อมูลในปีนี้"}</p>
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
              href={periods.some((p) => p.year === Number(year) - 543 && p.month === index + 1 && p.activeImportId) ? `/monthly/${year}/${String(index + 1).padStart(2, "0")}` : "/import"}
              className={`coverage-month ${periods.some((p) => p.year === Number(year) - 543 && p.month === index + 1 && p.activeImportId) ? "completed" : "missing"}`}
              key={name}
            >
              <span>{name}</span>
              <span className="coverage-marker">
                {periods.some((p) => p.year === Number(year) - 543 && p.month === index + 1 && p.activeImportId) ? (
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
      <div className="two-column">
        <Section
          title="งวดล่าสุด"
          action={
            <Link className="text-link" href={latestHref}>
              ดูรายละเอียด <ArrowRight size={15} />
            </Link>
          }
        >
          <div className="latest-period">
            <div className="latest-main">
              <div>
                <strong>{latest ? `${months[latest.month - 1]} ${year}` : "ยังไม่มีงวดข้อมูล"}</strong>
                <p>{latest ? `บันทึกข้อมูล ${rows.length} รายการ` : "เริ่มด้วยการนำเข้า Excel รายเดือน"}</p>
              </div>
              <Status tone={latest ? "green" : "gray"}>{latest ? "นำเข้าแล้ว" : "รอนำเข้า"}</Status>
            </div>
            <div className="latest-numbers">
              <div>
                <span>รายได้รวม</span>
                <strong>{latest ? `฿${money(sum(rows, "gross"))}` : "—"}</strong>
              </div>
              <div>
                <span>รายการหัก</span>
                <strong>{latest ? `฿${money(sum(rows, "deductions"))}` : "—"}</strong>
              </div>
              <div>
                <span>เงินสุทธิ</span>
                <strong className="green-text">
                  {latest ? `฿${money(sum(rows, "net"))}` : "—"}
                </strong>
              </div>
            </div>
          </div>
        </Section>
        <Section
          title="งานที่ต้องติดตาม"
          action={
            <Link className="text-link" href="/imports">
              ประวัตินำเข้า <ArrowRight size={15} />
            </Link>
          }
        >
          <div className="task-list">
            <div className="task-item">
              <span className="task-icon amber">
                <CircleAlert size={17} />
              </span>
              <div>
                <strong>{coverage < 12 ? `เดือน${months[Math.min(coverage, 11)]}ยังไม่มีข้อมูล` : "ข้อมูลครบทั้งปีแล้ว"}</strong>
                <small>เมื่อปิดงวดแล้วให้นำเข้าไฟล์ Excel</small>
              </div>
              <Link href="/import">นำเข้า</Link>
            </div>
            <div className="task-item">
              <span className="task-icon green">
                <CircleCheck size={17} />
              </span>
              <div>
                <strong>{latest ? `งวด${months[latest.month - 1]}พร้อมใช้ในรายงาน` : "รอการนำเข้างวดแรก"}</strong>
                <small>{latest ? "ข้อมูลมาจากฐานข้อมูลที่บันทึกแล้ว" : "รายงานจะอัปเดตหลังยืนยันนำเข้า"}</small>
              </div>
            </div>
          </div>
        </Section>
      </div>
      <Section
        title="แนวโน้มเงินจ่ายสุทธิ"
        action={<span className="section-subtle">มกราคม – ธันวาคม {year}</span>}
      >
        <div
          className="bar-chart"
          role="img"
          aria-label="แผนภูมิเงินจ่ายสุทธิ 12 เดือน"
        >
          {shortMonths.map((label, i) => (
            <div key={label} className="bar-chart-column">
              <div className="bar-chart-track">
                {payrollForMonth(i + 1).length > 0 && <div style={{ height: `${Math.max(10, annualTotal("net") ? sum(payrollForMonth(i + 1), "net") / (annualTotal("net") / Math.max(coverage, 1)) * 72 : 10)}%` }} />}
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>
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
        <span className="toolbar-meta">
          {coverage} จาก 12 เดือนมีข้อมูล
        </span>
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
              const imported = savedPeriods.some((period) => period.year === Number(year) - 543 && period.month === p.index && period.activeImportId);
              return (
                <tr key={p.index}>
                  <td>
                    <Link
                      className="table-primary-link"
                      href={imported ? `/monthly/${year}/${String(p.index).padStart(2, "0")}` : "/import"}
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
                  <td className="row-arrow">
                    <ChevronRight size={16} />
                  </td>
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
  const { payrollForMonth, periods } = usePayrollData();
  const [query, setQuery] = useState("");
  const [type, setType] = useState("all");
  const pathname = usePathname();
  const selectedYear = Number(pathname.split("/")[2]);
  const selectedMonth = Number(pathname.split("/")[3]);
  const period = periods.find((p) => p.year === selectedYear - 543 && p.month === selectedMonth && p.activeImportId);
  const allRows = payrollForMonth(selectedMonth);
  const rows = allRows.filter(
    (row) =>
      (type === "all" || row.employee.type === type) &&
      (row.employee.name.includes(query) ||
        row.employee.id.toLowerCase().includes(query.toLowerCase())),
  );
  if (!period) return <><PageHeading title="ยังไม่มีข้อมูลเดือนนี้" description={`${months[selectedMonth - 1] || "เดือนที่เลือก"} ${selectedYear}`} action={<Link href="/import" className="button button-primary">นำเข้า Excel</Link>} /></>;
  return (
    <>
      <div className="backline">
        <Link href="/monthly">
          <ArrowLeft size={16} /> ข้อมูลรายเดือน
        </Link>
      </div>
      <PageHeading
        title={`${months[selectedMonth - 1]} ${selectedYear}`}
        description={period.paymentDate ? `งวดจ่าย ${thaiDate(period.paymentDate)} · ข้อมูลรายเดือน` : "ข้อมูลรายเดือน"}
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
          <button
            className="button button-secondary"
            type="button"
            onClick={() => window.print()}
          >
            <ArrowDownToLine size={16} />
            พิมพ์รายการ
          </button>
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
                  <td className="row-arrow">
                    <ChevronRight size={16} />
                  </td>
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
    </>
  );
}

const importSteps = [
  { name: "เลือกไฟล์", href: "/import" },
  { name: "ตรวจพบข้อมูล", href: "/import/preview" },
  { name: "จับคู่ข้อมูล", href: "/import/mapping" },
  { name: "ตรวจสอบ", href: "/import/validation" },
  { name: "เสร็จสิ้น", href: "/import/complete" },
];

function ImportFrame({
  step,
  children,
  title,
  description,
}: {
  step: number;
  children: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <>
      <PageHeading title={title} description={description} />
      <div className="stepper" aria-label="ขั้นตอนการนำเข้า">
        {importSteps.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            className={`step ${index === step ? "current" : ""} ${index < step ? "done" : ""}`}
          >
            <span className="step-number">
              {index < step ? <Check size={13} /> : index + 1}
            </span>
            <span>{item.name}</span>
          </Link>
        ))}
      </div>
      <div className="import-content">{children}</div>
    </>
  );
}

function ImportUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  return (
    <ImportFrame
      step={0}
      title="นำเข้าข้อมูลเงินเดือน"
      description="อัปโหลด Excel รายเดือน แล้วตรวจข้อมูลก่อนบันทึก"
    >
      <div className="import-panel">
        <div className="panel-title">
          <h2>เลือกไฟล์รายเดือน</h2>
          <p>ระบบจะอ่านข้อมูลจากชีตคำนวณเงินเดือนที่คุณยืนยัน</p>
        </div>
        <label
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const picked = e.dataTransfer.files[0];
            if (picked?.name.toLowerCase().endsWith(".xlsx")) setFile(picked);
          }}
        >
          <span className="upload-icon">
            <FileSpreadsheet size={25} strokeWidth={1.7} />
          </span>
          <strong>{file ? file.name : "ลากไฟล์ Excel มาวางที่นี่"}</strong>
          <span>
            {file
              ? `${(file.size / 1024).toFixed(0)} KB · พร้อมตรวจตัวอย่าง`
              : "หรือคลิกเพื่อเลือกไฟล์จากเครื่อง"}
          </span>
          <span className="dropzone-button">เลือกไฟล์ .xlsx</span>
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <div className="hint-box">
          <CircleAlert size={18} />
          <p>
            หน้าจอนี้เป็นต้นแบบการใช้งาน
            ไฟล์ที่เลือกยังไม่ถูกส่งหรือบันทึกในระบบ การอ่าน Excel จริงจะเพิ่มใน
            session นำเข้าข้อมูล
          </p>
        </div>
        <div className="panel-actions">
          <Link href="/" className="button button-secondary">
            ยกเลิก
          </Link>
          <button
            className="button button-primary"
            disabled={!file}
            onClick={() => router.push("/import/preview")}
          >
            ดูตัวอย่างขั้นตอนถัดไป <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </ImportFrame>
  );
}

function ImportPreview() {
  const [sheet, setSheet] = useState("คิดค่าจ้าง");
  return (
    <ImportFrame
      step={1}
      title="ตรวจพบข้อมูลในไฟล์"
      description="ยืนยันงวดและชีตต้นทางก่อนจับคู่คอลัมน์"
    >
      <div className="import-panel">
        <div className="panel-title">
          <h2>ตรวจพบจากไฟล์ตัวอย่าง</h2>
          <p>เดือน 9.xlsx · ข้อมูลตัวอย่างเพื่อแสดงลำดับการทำงาน</p>
        </div>
        <div className="detected-grid">
          <div>
            <span>งวดเดือน</span>
            <strong>กันยายน 2569</strong>
          </div>
          <div>
            <span>วันที่จ่าย</span>
            <strong>5 ตุลาคม 2569</strong>
          </div>
          <div>
            <span>จำนวนพนักงาน</span>
            <strong>8 รายการ</strong>
          </div>
          <div>
            <span>ประเภทข้อมูล</span>
            <strong>พนักงานและกรรมการ</strong>
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="source-sheet">ชีตต้นทางสำหรับงวดนี้</label>
          <select
            id="source-sheet"
            value={sheet}
            onChange={(e) => setSheet(e.target.value)}
          >
            <option>คิดค่าจ้าง</option>
            <option>ปรับปรุง</option>
            <option>ไม่รวมปีใหม่</option>
          </select>
          <small>
            ไฟล์นี้มีหลายชีตที่ระบุคนละงวด โปรดยืนยันชีตที่ถูกต้องก่อนดำเนินการ
          </small>
        </div>
        {sheet !== "คิดค่าจ้าง" && (
          <div className="warning-box">
            <CircleAlert size={18} />
            ชีตนี้มีหัวกระดาษเป็นเดือนธันวาคม โปรดตรวจงวดก่อนดำเนินการ
          </div>
        )}
        <div className="panel-actions">
          <Link href="/import" className="button button-secondary">
            <ArrowLeft size={16} />
            ย้อนกลับ
          </Link>
          <Link href="/import/mapping" className="button button-primary">
            ยืนยันชีตและไปต่อ <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </ImportFrame>
  );
}

function ImportMapping() {
  const [unknown, setUnknown] = useState("สร้างรายการรายได้ใหม่");
  const mappings = [
    ["ค่าจ้าง", "เงินเดือน", "รายได้"],
    ["ค่าล่วงเวลาปกติ x 1.5", "OT 1.5", "รายได้"],
    ["ค่าทำงานในวันหยุด", "ค่าทำงานวันหยุด", "รายได้"],
    ["เบี้ยขยัน", "เบี้ยขยัน", "รายได้"],
    ["ประกันสังคม", "ประกันสังคม", "รายการหัก"],
    ["ภาษี ภงด.1", "ภาษี", "รายการหัก"],
  ];
  return (
    <ImportFrame
      step={2}
      title="จับคู่ข้อมูล"
      description="ตรวจว่าหัวคอลัมน์ใน Excel ตรงกับรายการในระบบ"
    >
      <div className="import-panel">
        <div className="panel-title">
          <h2>รายการที่ตรวจพบ</h2>
          <p>ระบบจะจำการจับคู่ที่ยืนยันไว้สำหรับเดือนถัดไป</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>หัวคอลัมน์ใน Excel</th>
                <th>รายการในระบบ</th>
                <th>ประเภท</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map(([source, target, type]) => (
                <tr key={source}>
                  <td>{source}</td>
                  <td>{target}</td>
                  <td>{type}</td>
                  <td>
                    <Status>จับคู่อัตโนมัติ</Status>
                  </td>
                </tr>
              ))}
              <tr>
                <td>ค่าพิเศษ</td>
                <td>
                  <select
                    value={unknown}
                    onChange={(e) => setUnknown(e.target.value)}
                  >
                    <option>สร้างรายการรายได้ใหม่</option>
                    <option>จับคู่กับรายได้อื่น</option>
                    <option>ไม่นำเข้าคอลัมน์นี้</option>
                  </select>
                </td>
                <td>รอยืนยัน</td>
                <td>
                  <Status tone="amber">ต้องตรวจสอบ</Status>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mapping-note">
          <CircleAlert size={18} />
          <div>
            <strong>พนักงานใหม่หรือชื่อไม่ตรงกัน</strong>
            <p>
              ระบบจะให้จับคู่กับรหัสพนักงานที่มี หรือสร้างรหัสใหม่ก่อนบันทึกจริง
            </p>
          </div>
        </div>
        <div className="panel-actions">
          <Link href="/import/preview" className="button button-secondary">
            <ArrowLeft size={16} />
            ย้อนกลับ
          </Link>
          <Link href="/import/validation" className="button button-primary">
            ตรวจสอบข้อมูล <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </ImportFrame>
  );
}

function ImportValidation() {
  const { payrollForMonth } = usePayrollData();
  const rows = payrollForMonth(9);
  return (
    <ImportFrame
      step={3}
      title="ตรวจสอบก่อนนำเข้า"
      description="เปรียบเทียบยอดและแก้รายการที่ต้องตรวจสอบ"
    >
      <div className="import-panel import-panel-wide">
        <div className="validation-summary">
          <div className="validation-good">
            <CircleCheck size={21} />
            <div>
              <strong>ผ่านการตรวจสอบ 8 รายการ</strong>
              <span>ไม่พบข้อผิดพลาดที่ขัดขวางการบันทึก</span>
            </div>
          </div>
          <div className="validation-count">
            <span>
              คำเตือน <strong>1</strong>
            </span>
            <span>
              ข้อผิดพลาด <strong>0</strong>
            </span>
          </div>
        </div>
        <div className="hint-box">
          <CircleAlert size={18} />
          <p>
            ข้อมูลด้านล่างเป็นข้อมูลสมมติสำหรับต้นแบบ
            ยังไม่ใช่ผลจากไฟล์ที่อัปโหลด
          </p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>พนักงาน</th>
                <th className="numeric">เงินเดือน</th>
                <th className="numeric">OT</th>
                <th className="numeric">รายได้อื่น</th>
                <th className="numeric">รายการหัก</th>
                <th className="numeric">สุทธิ</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employee.id}>
                  <td>
                    {row.employee.name}
                    <small className="cell-subtext">{row.employee.id}</small>
                  </td>
                  <MoneyCell value={row.salary} />
                  <MoneyCell value={row.ot} />
                  <MoneyCell value={row.allowance + row.bonus} />
                  <MoneyCell value={row.deductions} />
                  <MoneyCell value={row.net} />
                  <td>
                    <Status>ถูกต้อง</Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="confirm-bar">
          <div>
            <span>สรุปงวดกันยายน 2569</span>
            <strong>เงินสุทธิรวม ฿{money(sum(rows, "net"))}</strong>
          </div>
          <div className="panel-actions">
            <Link href="/import/mapping" className="button button-secondary">
              <ArrowLeft size={16} />
              ย้อนกลับ
            </Link>
            <Link href="/import/complete" className="button button-primary">
              ดูผลตัวอย่าง <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </div>
    </ImportFrame>
  );
}

function ImportComplete() {
  const { payrollForMonth } = usePayrollData();
  return (
    <ImportFrame
      step={4}
      title="ตัวอย่างผลการนำเข้า"
      description="หน้าจอที่จะปรากฏหลังบันทึกข้อมูลสำเร็จ"
    >
      <div className="import-panel complete-panel">
        <div className="complete-mark">
          <Check size={26} />
        </div>
        <h2>พร้อมใช้งานในรายงาน</h2>
        <p>ตัวอย่าง: กันยายน 2569 · พนักงาน 8 รายการ</p>
        <div className="complete-detail">
          <div>
            <span>งวดข้อมูล</span>
            <strong>กันยายน 2569</strong>
          </div>
          <div>
            <span>เงินสุทธิ</span>
            <strong>฿{money(sum(payrollForMonth(9), "net"))}</strong>
          </div>
          <div>
            <span>สถานะ</span>
            <Status>ตรวจสอบแล้ว</Status>
          </div>
        </div>
        <div className="hint-box">
          <CircleAlert size={18} />
          <p>
            นี่เป็นผลตัวอย่างของขั้นตอนนำเข้า
            ยังไม่มีข้อมูลใดถูกบันทึกลงฐานข้อมูล
          </p>
        </div>
        <div className="complete-actions">
          <Link href="/monthly/2569/09" className="button button-primary">
            ดูงวดตัวอย่าง <ArrowRight size={17} />
          </Link>
          <Link href="/" className="button button-secondary">
            กลับภาพรวม
          </Link>
        </div>
      </div>
    </ImportFrame>
  );
}

function AnnualEmployeeReport({
  year,
  setYear,
}: {
  year: string;
  setYear: (value: string) => void;
}) {
  const { employees, payrollForMonth, leaveRecords, salaryAdjustments } =
    usePayrollData();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || "");
  const [detailed, setDetailed] = useState(true);
  const [showEmpty, setShowEmpty] = useState(false);
  const employee =
    employees.find((item) => item.id === employeeId) || employees[0];
  const monthly = Array.from({ length: 12 }, (_, index) => payrollForMonth(index + 1).find((row) => row.employee.id === employeeId));
  const incomeItems: { label: string; key: keyof PayrollRow }[] = [
    { label: "เงินเดือน", key: "salary" },
    { label: "ค่าล่วงเวลา", key: "ot" },
    { label: "เบี้ยเลี้ยงและค่าเดินทาง", key: "allowance" },
    { label: "โบนัส", key: "bonus" },
  ];
  const deductionItems: { label: string; key: keyof PayrollRow }[] = [
    { label: "ประกันสังคม", key: "socialSecurity" },
    { label: "ภาษี", key: "tax" },
    { label: "รายการหักอื่น", key: "otherDeduction" },
  ];
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
  if (!employee) return <><PageHeading title="รายงานรายปีรายพนักงาน" description="ยังไม่มีพนักงานในระบบ" action={<SelectYear year={year} onChange={setYear} />} /><div className="guide-card"><h2>เริ่มจากข้อมูลรายเดือน</h2><p>นำเข้า Excel รายเดือนเพื่อสร้างข้อมูลพนักงานและรายงานรายปีอัตโนมัติ</p><Link href="/import" className="button button-primary">นำเข้า Excel</Link></div></>;
  return (
    <>
      <PageHeading
        title="รายงานรายปีรายพนักงาน"
        description="สรุปยอดจากข้อมูลรายเดือนที่นำเข้าแล้ว"
        action={
          <>
            <SelectYear year={year} onChange={setYear} />
            <button
              className="button button-secondary"
              onClick={() => window.print()}
            >
              <ArrowDownToLine size={16} />
              พิมพ์รายงาน
            </button>
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
            {detailed &&
              incomeItems.map((item) => reportRow(item.label, item.key))}
            {reportRow("รวมรายได้", "gross", true)}
            <tr className="report-section-row">
              <th colSpan={14}>รายการหัก</th>
            </tr>
            {detailed &&
              deductionItems.map((item) => reportRow(item.label, item.key))}
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
            <div>
              <strong>
                {leaveRecords
                  .filter(
                    (item) =>
                      item.employeeId === employeeId && item.type === "ลากิจ",
                  )
                  .reduce((a, b) => a + b.days, 0)}
              </strong>
              <span>ลากิจ</span>
            </div>
            <div>
              <strong>
                {leaveRecords
                  .filter(
                    (item) =>
                      item.employeeId === employeeId && item.type === "พักร้อน",
                  )
                  .reduce((a, b) => a + b.days, 0)}
              </strong>
              <span>พักร้อน</span>
            </div>
            <div>
              <strong>
                {leaveRecords
                  .filter(
                    (item) =>
                      item.employeeId === employeeId && item.type === "ลาป่วย",
                  )
                  .reduce((a, b) => a + b.days, 0)}
              </strong>
              <span>ลาป่วย</span>
            </div>
          </div>
          <div className="compact-list">
            {leaveRecords
              .filter((item) => item.employeeId === employeeId)
              .map((item) => (
                <div key={item.id}>
                  <span>
                    {thaiDate(item.date)} · {item.type}
                  </span>
                  <strong>{item.days} วัน</strong>
                </div>
              ))}
            {!leaveRecords.some((item) => item.employeeId === employeeId) && (
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
              .filter((item) => item.employeeId === employeeId)
              .map((item) => (
                <div key={item.id}>
                  <span>
                    {thaiDate(item.date)} · {item.reason}
                  </span>
                  <strong>฿{money(item.newSalary)}</strong>
                </div>
              ))}
            {!salaryAdjustments.some(
              (item) => item.employeeId === employeeId,
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
  const { payrollForMonth, annualTotal, coverage } = usePayrollData();
  const [showExtra, setShowExtra] = useState(false);
  const imported = coverage > 0;
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
            <button
              className="button button-secondary"
              onClick={() => window.print()}
            >
              <ArrowDownToLine size={16} />
              พิมพ์รายงาน
            </button>
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
                         href={hasData ? `/monthly/${year}/${String(index + 1).padStart(2, "0")}` : "/import"}
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
                       ? totals.flat().filter((row) => row.employee.type === "employee").reduce((a, b) => a + b.salary, 0)
                       : null
                  }
                />
                <MoneyCell
                  value={
                     imported
                       ? totals.flat().filter((row) => row.employee.type === "director").reduce((a, b) => a + b.salary, 0)
                       : null
                  }
                />
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
        <Link href="/reports/employee">
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
  const { employees, refresh, user } = usePayrollData();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState("");
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
        action={
          <button
            className="button button-primary"
            onClick={() => setOpen(true)}
            disabled={user?.role === "viewer"}
          >
            <Plus size={17} />
            เพิ่มพนักงาน
          </button>
        }
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
                  <Status tone={employee.status === "active" ? "green" : "gray"}>{employee.status === "active" ? "ปฏิบัติงาน" : employee.status === "resigned" ? "ลาออก" : "ไม่ปฏิบัติงาน"}</Status>
                </td>
                <td className="row-arrow">
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <div className="modal-backdrop" onClick={() => setOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title" onClick={e => e.stopPropagation()}><div className="modal-heading"><div><h2 id="employee-modal-title">เพิ่มพนักงาน</h2><p>สร้างรหัสพนักงานใหม่ในฐานข้อมูล</p></div><IconButton label="ปิด" onClick={() => setOpen(false)}><X size={19} /></IconButton></div><form className="form-grid" onSubmit={async e => { e.preventDefault(); setFormError(""); const form = new FormData(e.currentTarget); try { await postJson("/api/employees", { name: form.get("name"), type: form.get("type"), position: form.get("position"), department: form.get("department"), startDate: form.get("date") || undefined, salary: toSatang(String(form.get("salary"))) }); await refresh(); setOpen(false); } catch (error) { setFormError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); } }}><label className="full-field">ชื่อ-สกุล<input name="name" required minLength={2} /></label><label>ประเภท<select name="type"><option value="employee">พนักงาน</option><option value="director">กรรมการ</option></select></label><label>วันที่เริ่มงาน<input name="date" type="date" /></label><label>ตำแหน่ง<input name="position" /></label><label>แผนก<input name="department" /></label><label className="full-field">เงินเดือนปัจจุบัน (บาท)<input name="salary" type="number" min="0" step="0.01" required /></label>{formError && <div className="login-error full-field" role="alert">{formError}</div>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setOpen(false)}>ยกเลิก</button><button type="submit" className="button button-primary">บันทึกพนักงาน</button></div></form></div></div>}
    </>
  );
}

function EmployeeProfile({ id }: { id: string }) {
  const { employees, payrollForMonth, leaveRecords, salaryAdjustments } =
    usePayrollData();
  const employee = employees.find((item) => item.id === id);
  const [tab, setTab] = useState("overview");
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
  const rows = payrollForMonth(9);
  const monthly = rows.find((row) => row.employee.id === employee.id);
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
            <Status>ปฏิบัติงาน</Status>
          </div>
          <p>
            {employee.id} · {employee.position} · {employee.department}
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {[
          ["overview", "ภาพรวม"],
          ["income", "รายได้"],
          ["leave", "วันลา"],
          ["salary", "ปรับเงินเดือน"],
          ["documents", "ข้อมูลและเอกสาร"],
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
              <div>
                <span>เงินเดือนปัจจุบัน</span>
                <strong>฿{money(employee.salary)}</strong>
              </div>
            </div>
          </Section>
          <Section
            title="รายได้ล่าสุด"
            action={
              <Link href="/reports/employee" className="text-link">
                รายงานรายปี <ArrowRight size={15} />
              </Link>
            }
          >
            <div className="detail-list">
              <div>
                <span>งวด</span>
                <strong>กันยายน 2569</strong>
              </div>
              <div>
                <span>รายได้รวม</span>
                <strong>฿{money(monthly?.gross || 0)}</strong>
              </div>
              <div>
                <span>รายการหัก</span>
                <strong>฿{money(monthly?.deductions || 0)}</strong>
              </div>
              <div>
                <span>เงินสุทธิ</span>
                <strong className="green-text">
                  ฿{money(monthly?.net || 0)}
                </strong>
              </div>
            </div>
          </Section>
        </div>
      )}
      {tab === "income" && (
        <Section title="รายได้รายเดือน">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>เดือน</th>
                  <th className="numeric">เงินเดือน</th>
                  <th className="numeric">OT</th>
                  <th className="numeric">รายได้รวม</th>
                  <th className="numeric">รายการหัก</th>
                  <th className="numeric">สุทธิ</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month, index) => {
                  const row = payrollForMonth(index + 1).find(
                    (item) => item.employee.id === id,
                  );
                  return (
                    <tr key={month}>
                      <td>{month}</td>
                      <MoneyCell value={row?.salary ?? null} />
                      <MoneyCell value={row?.ot ?? null} />
                      <MoneyCell value={row?.gross ?? null} />
                      <MoneyCell value={row?.deductions ?? null} />
                      <MoneyCell value={row?.net ?? null} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {tab === "leave" && (
        <Section title="ประวัติการลา">
          <div className="compact-list">
            {leaveRecords
              .filter((item) => item.employeeId === id)
              .map((item) => (
                <div key={item.id}>
                  <span>
                    {thaiDate(item.date)} · {item.type} · {item.reason}
                  </span>
                  <strong>{item.days} วัน</strong>
                </div>
              ))}
            {!leaveRecords.some((item) => item.employeeId === id) && (
              <p className="empty-inline">ยังไม่มีบันทึกการลา</p>
            )}
          </div>
        </Section>
      )}
      {tab === "salary" && (
        <Section title="ประวัติปรับเงินเดือน">
          <div className="compact-list">
            {salaryAdjustments
              .filter((item) => item.employeeId === id)
              .map((item) => (
                <div key={item.id}>
                  <span>
                    {thaiDate(item.date)} · {item.reason}
                  </span>
                  <strong>
                    ฿{money(item.oldSalary)} → ฿{money(item.newSalary)}
                  </strong>
                </div>
              ))}
            {!salaryAdjustments.some((item) => item.employeeId === id) && (
              <p className="empty-inline">ยังไม่มีประวัติการปรับเงินเดือน</p>
            )}
          </div>
        </Section>
      )}
      {tab === "documents" && (
        <Section title="ข้อมูลและเอกสาร">
          <div className="sensitive-panel">
            <CircleAlert size={19} />
            <div>
              <strong>ข้อมูลส่วนบุคคล</strong>
              <p>
                เลขประจำตัวประชาชนและบัญชีธนาคารจะถูกปิดบังตามสิทธิ์ผู้ใช้งานเมื่อเชื่อมระบบจริง
              </p>
            </div>
          </div>
        </Section>
      )}
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
                  await postJson("/api/leave", { employeeId: form.get("employee"), dateFrom: form.get("date"), dateTo: form.get("dateTo"), type: form.get("type"), days: Number(form.get("days")), reason: form.get("reason") });
                  await refresh();
                  setOpen(false);
                } catch (error) { setFormError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); }
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
              <label>วันที่สิ้นสุด<input name="dateTo" type="date" required /></label>
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
              {formError && <div className="login-error full-field" role="alert">{formError}</div>}
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
  const { employees, salaryAdjustments: records, refresh, user } = usePayrollData();
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
                  await postJson("/api/salary", { employeeId: selectedId, effectiveDate: form.get("date"), newSalary: amount, reason: form.get("reason") });
                  await refresh();
                  setOpen(false);
                  setNewSalary("");
                } catch (error) { setFormError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ"); }
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
              {formError && <div className="login-error full-field" role="alert">{formError}</div>}
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
  const { imports } = usePayrollData();
  return (
    <>
      <PageHeading
        title="ประวัติการนำเข้า"
        description="ตรวจสอบงวด ไฟล์ต้นฉบับ และเวอร์ชันข้อมูล"
        action={
          <Link href="/import" className="button button-primary">
            <Plus size={17} />
            นำเข้า Excel
          </Link>
        }
      />
      {imports.length === 0 && <div className="hint-box history-hint"><CircleAlert size={18} /><p>ยังไม่มีประวัติการนำเข้า เริ่มจากไฟล์เงินเดือนรายเดือน</p></div>}
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {imports.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link href={`/monthly/${item.year + 543}/${String(item.month).padStart(2, "0")}`} className="table-primary-link">
                    {months[item.month - 1]} {item.year + 543}
                  </Link>
                </td>
                <td>v{item.version}</td>
                <td>{item.originalFilename}</td>
                <td>{new Date(item.importedAt).toLocaleDateString("th-TH")}</td>
                <td className="numeric">{item.employeeCount}</td>
                <td>
                  <Status tone={item.status === "active" ? "green" : "gray"}>{item.status === "active" ? "ใช้งานอยู่" : "แทนที่แล้ว"}</Status>
                </td>
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
          <span>กันยายน 2569</span>
          <span>v1 · เดิม</span>
          <ChevronRight size={16} />
          <span>v2 · ใช้งานอยู่</span>
        </div>
      </div>
    </>
  );
}

function SettingsPage() {
  const { itemTypes, company } = usePayrollData();
  const [tab, setTab] = useState("mapping");
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
                  </tr>
                </thead>
                <tbody>
                  {itemTypes.map((item) => (
                    <tr key={item.id}>
                      <td>{item.aliases.join(" / ") || "—"}</td>
                      <td>{item.label}</td>
                      <td>{item.kind === "income" ? "รายได้" : "รายการหัก"}</td>
                      <td>
                        <Status tone={item.active ? "green" : "gray"}>{item.active ? "ใช้งาน" : "ปิดใช้งาน"}</Status>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
      {tab === "users" && (
        <Section title="บทบาทผู้ใช้งาน">
          <div className="roles-grid">
            <div>
              <strong>Admin</strong>
              <p>จัดการทุกส่วน รวมถึงผู้ใช้งานและการตั้งค่า</p>
            </div>
            <div>
              <strong>บัญชี / เงินเดือน</strong>
              <p>นำเข้า แก้ไขข้อมูลวันลา เงินเดือน และรายงาน</p>
            </div>
            <div>
              <strong>ผู้ดูรายงาน</strong>
              <p>ดูภาพรวมและรายงานโดยไม่มีสิทธิ์แก้ข้อมูล</p>
            </div>
          </div>
        </Section>
      )}
      {tab === "company" && (
        <Section title="ข้อมูลบริษัท">
          <div className="detail-list">
            <div>
              <span>ชื่อบริษัท</span>
               <strong>{company?.name || "—"}</strong>
            </div>
            <div>
              <span>ปีบัญชีที่แสดง</span>
              <strong>2569</strong>
            </div>
            <div>
              <span>สกุลเงิน</span>
              <strong>บาท (THB)</strong>
            </div>
            <div>
              <span>เขตเวลา</span>
              <strong>Asia/Bangkok</strong>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
