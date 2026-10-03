"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Employee, PayrollRow } from "./mock";

export type Period = {
  id: string;
  year: number;
  month: number;
  paymentDate: string | null;
  activeImportId: string | null;
  sourceSheet: string | null;
  originalFilename: string | null;
  importedAt: string | null;
};
export type ImportRecord = {
  id: string;
  year: number;
  month: number;
  version: number;
  originalFilename: string;
  sourceSheet: string;
  status: string;
  importedAt: string;
  employeeCount: number;
};
export type ItemType = {
  id: string;
  code: string;
  label: string;
  kind: "income" | "deduction";
  aliases: string[];
  active: boolean;
};
export type LeaveRecord = {
  id: string;
  employeeId: string;
  date: string;
  dateTo: string;
  type: string;
  days: number;
  reason: string;
  status: string;
};
export type SalaryRecord = {
  id: string;
  employeeId: string;
  date: string;
  oldSalary: number;
  newSalary: number;
  reason: string;
};
type Entry = {
  id: string;
  employeeDbId: string;
  year: number;
  month: number;
  gross: number;
  deductions: number;
  net: number;
  items: {
    code: string;
    label: string;
    kind: string;
    amount: number;
    sourceType: string;
  }[];
};
type ApiData = {
  company: { id: string; name: string } | null;
  user: { id: string; email: string; role: "admin" | "payroll" | "viewer" } | null;
  employees: (Employee & { dbId: string })[];
  periods: Period[];
  entries: Entry[];
  leaveRecords: LeaveRecord[];
  salaryAdjustments: SalaryRecord[];
  imports: ImportRecord[];
  itemTypes: ItemType[];
};
type DataContextValue = ApiData & {
  refresh: () => Promise<void>;
  payrollForMonth: (month: number) => PayrollRow[];
  annualTotal: (key: keyof PayrollRow) => number;
  coverage: number;
};

const DataContext = createContext<DataContextValue | null>(null);

const emptyData: ApiData = {
  company: null,
  user: null,
  employees: [],
  periods: [],
  entries: [],
  leaveRecords: [],
  salaryAdjustments: [],
  imports: [],
  itemTypes: [],
};

export function DataProvider({
  year,
  children,
}: {
  year: number;
  children: ReactNode;
}) {
  const [data, setData] = useState<ApiData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = async () => {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (response.status === 403) {
      window.location.href = "/login";
      return;
    }
    if (!response.ok) throw new Error("อ่านข้อมูลจากฐานข้อมูลไม่สำเร็จ");
    setData(await response.json());
  };
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  const value = useMemo<DataContextValue>(() => {
    const byDbId = new Map(
      data.employees.map((employee) => [employee.dbId, employee]),
    );
    const payrollForMonth = (month: number): PayrollRow[] =>
      data.entries
        .filter((entry) => entry.year === year && entry.month === month)
        .flatMap((entry) => {
          const employee = byDbId.get(entry.employeeDbId);
          if (!employee) return [];
          const amount = (code: string) =>
            entry.items
              .filter((item) => item.code === code)
              .reduce((total, item) => total + item.amount, 0);
          const salary = amount("salary");
          const ot = entry.items
            .filter((item) =>
              ["ot_15", "ot_2", "ot_3", "holiday_work"].includes(item.code),
            )
            .reduce((total, item) => total + item.amount, 0);
          const bonus = amount("bonus");
          const allowance = entry.items
            .filter(
              (item) =>
                item.kind === "income" &&
                ![
                  "salary",
                  "ot_15",
                  "ot_2",
                  "ot_3",
                  "holiday_work",
                  "bonus",
                ].includes(item.code),
            )
            .reduce((total, item) => total + item.amount, 0);
          const tax = amount("tax");
          const socialSecurity = amount("social_security");
          const otherDeduction = entry.deductions - tax - socialSecurity;
          return [
            {
              employee,
              salary,
              ot,
              allowance,
              bonus,
              tax,
              socialSecurity,
              otherDeduction,
              gross: entry.gross,
              deductions: entry.deductions,
              net: entry.net,
            },
          ];
        });
    const annualTotal = (key: keyof PayrollRow) =>
      Array.from({ length: 12 }, (_, index) => payrollForMonth(index + 1))
        .flat()
        .reduce(
          (total, row) =>
            total + (typeof row[key] === "number" ? (row[key] as number) : 0),
          0,
        );
    return {
      ...data,
      refresh,
      payrollForMonth,
      annualTotal,
      coverage: data.periods.filter(
        (period) => period.year === year && period.activeImportId,
      ).length,
    };
  }, [data, year]);
  if (loading) return <div className="app-loading">กำลังอ่านข้อมูล...</div>;
  if (error)
    return (
      <div className="app-loading error">
        {error}
        <button onClick={() => window.location.reload()}>ลองอีกครั้ง</button>
      </div>
    );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function usePayrollData(): DataContextValue {
  const value = useContext(DataContext);
  if (!value) throw new Error("DataProvider is missing");
  return value;
}
