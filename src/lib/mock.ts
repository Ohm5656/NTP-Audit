export type EmployeeType = "employee" | "director";
export type EmployeeStatus = "active" | "inactive" | "resigned";

export type Employee = {
  id: string;
  name: string;
  position: string;
  type: EmployeeType;
  status: EmployeeStatus;
  startDate: string;
  salary: number;
  department: string;
};

export type PayrollRow = {
  employee: Employee;
  salary: number;
  ot: number;
  allowance: number;
  bonus: number;
  tax: number;
  socialSecurity: number;
  otherDeduction: number;
  gross: number;
  deductions: number;
  net: number;
};

export const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export const shortMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// Fictional records, deliberately unrelated to the example workbooks.
// All money is stored in satang to keep arithmetic exact in the prototype.
export const employees: Employee[] = [
  { id: "EMP001", name: "นางสาวกมลชนก วิริยะ", position: "เจ้าหน้าที่บัญชี", type: "employee", status: "active", startDate: "2021-06-15", salary: 2850000, department: "บัญชี" },
  { id: "EMP002", name: "นายธนกฤต ศรีพงษ์", position: "ช่างเทคนิค", type: "employee", status: "active", startDate: "2022-02-01", salary: 2280000, department: "ปฏิบัติการ" },
  { id: "EMP003", name: "นางสาวพิมพ์ชนก สุขใจ", position: "เจ้าหน้าที่ธุรการ", type: "employee", status: "active", startDate: "2023-03-20", salary: 2100000, department: "ธุรการ" },
  { id: "EMP004", name: "นายกิตติพงศ์ แก้วใส", position: "หัวหน้าช่าง", type: "employee", status: "active", startDate: "2020-11-02", salary: 3400000, department: "ปฏิบัติการ" },
  { id: "EMP005", name: "นางสาวรินรดา พรดี", position: "ฝ่ายจัดซื้อ", type: "employee", status: "active", startDate: "2024-01-08", salary: 2360000, department: "จัดซื้อ" },
  { id: "EMP006", name: "นายวรเมธ อินทร์คำ", position: "ช่างเทคนิค", type: "employee", status: "active", startDate: "2024-08-19", salary: 2050000, department: "ปฏิบัติการ" },
  { id: "EMP007", name: "นางสาวณัฐธิดา พูลผล", position: "ผู้จัดการทั่วไป", type: "employee", status: "active", startDate: "2019-05-10", salary: 4250000, department: "บริหาร" },
  { id: "DIR001", name: "นายปกรณ์ ทวีทรัพย์", position: "กรรมการบริษัท", type: "director", status: "active", startDate: "2018-01-01", salary: 6500000, department: "กรรมการ" },
];

export function payrollForMonth(month: number): PayrollRow[] {
  if (month < 1 || month > 9) return [];
  return employees.map((employee, index) => {
    const salary = employee.salary;
    const ot = employee.type === "director" ? 0 : (index % 3 === 0 ? 185000 : index % 3 === 1 ? 96000 : 0) + (month % 3) * 14000;
    const allowance = employee.type === "director" ? 0 : 80000 + (index % 3) * 25000;
    const bonus = month === 9 && index < 2 ? 150000 : 0;
    const tax = employee.type === "director" ? 920000 : index === 6 ? 180000 : 0;
    const socialSecurity = employee.type === "director" ? 0 : 75000;
    const otherDeduction = index === 3 ? 30000 : 0;
    const gross = salary + ot + allowance + bonus;
    const deductions = tax + socialSecurity + otherDeduction;
    return { employee, salary, ot, allowance, bonus, tax, socialSecurity, otherDeduction, gross, deductions, net: gross - deductions };
  });
}

export function sum(rows: PayrollRow[], key: keyof Pick<PayrollRow, "salary" | "ot" | "allowance" | "bonus" | "tax" | "socialSecurity" | "gross" | "deductions" | "net">): number {
  return rows.reduce((total, row) => total + row[key], 0);
}

export function annualTotal(key: Parameters<typeof sum>[1]): number {
  return Array.from({ length: 9 }, (_, month) => sum(payrollForMonth(month + 1), key)).reduce((a, b) => a + b, 0);
}

export function money(satang: number, digits = 2): string {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(satang / 100);
}

export function thaiDate(iso: string): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00`));
}

export const leaveRecords = [
  { id: "LEV001", employeeId: "EMP001", date: "2026-02-13", type: "ลากิจ", days: 1, reason: "ธุระส่วนตัว", status: "อนุมัติแล้ว" },
  { id: "LEV002", employeeId: "EMP002", date: "2026-04-07", type: "ลาป่วย", days: 2, reason: "พักรักษาตัว", status: "อนุมัติแล้ว" },
  { id: "LEV003", employeeId: "EMP001", date: "2026-06-15", type: "พักร้อน", days: 3, reason: "พักผ่อน", status: "อนุมัติแล้ว" },
  { id: "LEV004", employeeId: "EMP005", date: "2026-08-21", type: "ลากิจ", days: 0.5, reason: "ธุระส่วนตัว", status: "อนุมัติแล้ว" },
];

export const salaryAdjustments = [
  { id: "SAL001", employeeId: "EMP001", date: "2026-01-01", oldSalary: 2700000, newSalary: 2850000, reason: "ปรับประจำปี" },
  { id: "SAL002", employeeId: "EMP004", date: "2026-01-01", oldSalary: 3200000, newSalary: 3400000, reason: "ปรับประจำปี" },
  { id: "SAL003", employeeId: "EMP005", date: "2026-07-01", oldSalary: 2200000, newSalary: 2360000, reason: "ผ่านการประเมิน" },
];
