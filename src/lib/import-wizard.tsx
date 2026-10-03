"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePayrollData } from "./data-context";

export type MappingChoice =
  | { action: "existing"; code: string }
  | { action: "create"; label: string; kind: "income" | "deduction" }
  | { action: "ignore" };
export type EmployeeChoice =
  | { action: "match"; employeeCode: string }
  | { action: "create" }
  | { action: "ignore" };
export type Stage = {
  uploadId: string;
  originalFilename: string;
  suggestedSheet: string;
  sheets: {
    name: string;
    score: number;
    year: number | null;
    month: number | null;
    paymentDate: string | null;
  }[];
  rowCount: number;
  employeeCount: number;
  directorCount: number;
  year: number | null;
  month: number | null;
  paymentDate: string | null;
  issueCount: number;
};
export type Preview = {
  upload: { id: string; originalFilename: string };
  source: {
    name: string;
    year: number | null;
    month: number | null;
    paymentDate: string | null;
  };
  sheets: Stage["sheets"];
  rows: {
    row: number;
    name: string;
    employeeType: "employee" | "director";
    gross: number;
    deductions: number;
    net: number;
    excelGross: number | null;
    excelNet: number | null;
    itemCount: number;
    match: {
      status: "matched" | "new" | "ambiguous" | "ignored";
      code: string | null;
      method: string | null;
    };
    issues: { severity: string; code: string; message: string; row?: number }[];
  }[];
  unknownHeaders: { header: string; kind: "income" | "deduction" }[];
  issues: {
    severity: "warning" | "error";
    code: string;
    message: string;
    row?: number;
    field?: string;
  }[];
  existingPeriod: {
    id: string;
    active_import_id: string | null;
    version: number | null;
    gross: string | null;
    net: string | null;
  } | null;
  employees: { code: string; type: string }[];
  totals: { gross: number; deductions: number; net: number };
};
export type ImportResult = {
  importId: string;
  year: number;
  month: number;
  version: number;
  employeeCount: number;
  createdCodes: string[];
  gross: number;
  deductions: number;
  net: number;
};

type Wizard = {
  stage: Stage | null;
  selectedSheet: string;
  setSelectedSheet: (value: string) => void;
  mappings: Record<string, MappingChoice>;
  setMappings: (value: Record<string, MappingChoice>) => void;
  employeeChoices: Record<string, EmployeeChoice>;
  setEmployeeChoices: (value: Record<string, EmployeeChoice>) => void;
  preview: Preview | null;
  result: ImportResult | null;
  busy: boolean;
  error: string;
  clearError: () => void;
  stageFile: (file: File) => Promise<Stage>;
  loadPreview: (input?: {
    sheet?: string;
    mappings?: Record<string, MappingChoice>;
    employees?: Record<string, EmployeeChoice>;
  }) => Promise<Preview>;
  confirm: (replace: boolean) => Promise<ImportResult>;
  reset: () => void;
};
const Context = createContext<Wizard | null>(null);

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || "ดำเนินการไม่สำเร็จ");
  return value;
}

export function ImportWizardProvider({ children }: { children: ReactNode }) {
  const { refresh } = usePayrollData();
  const [stage, setStage] = useState<Stage | null>(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [mappings, setMappings] = useState<Record<string, MappingChoice>>({});
  const [employeeChoices, setEmployeeChoices] = useState<
    Record<string, EmployeeChoice>
  >({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("ntp-import-wizard") || "null",
      );
      if (saved) {
        setStage(saved.stage || null);
        setSelectedSheet(saved.selectedSheet || "");
        setMappings(saved.mappings || {});
        setEmployeeChoices(saved.employeeChoices || {});
        setResult(saved.result || null);
      }
    } catch {
      /* Ignore stale browser state. */
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated)
      sessionStorage.setItem(
        "ntp-import-wizard",
        JSON.stringify({
          stage,
          selectedSheet,
          mappings,
          employeeChoices,
          result,
        }),
      );
  }, [hydrated, stage, selectedSheet, mappings, employeeChoices, result]);
  const stageFile = async (file: File) => {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      const value = (await requestJson("/api/import/stage", {
        method: "POST",
        body: form,
      })) as Stage;
      setStage(value);
      setSelectedSheet(value.suggestedSheet);
      setMappings({});
      setEmployeeChoices({});
      setPreview(null);
      setResult(null);
      return value;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "อัปโหลดไม่สำเร็จ";
      setError(message);
      throw cause;
    } finally {
      setBusy(false);
    }
  };
  const loadPreview = async (input?: {
    sheet?: string;
    mappings?: Record<string, MappingChoice>;
    employees?: Record<string, EmployeeChoice>;
  }) => {
    if (!stage) throw new Error("กรุณาอัปโหลดไฟล์ก่อน");
    setBusy(true);
    setError("");
    try {
      const value = (await requestJson("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: stage.uploadId,
          sheetName: input?.sheet ?? selectedSheet,
          mappings: input?.mappings ?? mappings,
          employees: input?.employees ?? employeeChoices,
        }),
      })) as Preview;
      setPreview(value);
      return value;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "ตรวจไฟล์ไม่สำเร็จ";
      setError(message);
      throw cause;
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (replace: boolean) => {
    if (!stage) throw new Error("กรุณาอัปโหลดไฟล์ก่อน");
    setBusy(true);
    setError("");
    try {
      const value = (await requestJson("/api/import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId: stage.uploadId,
          sheetName: selectedSheet,
          mappings,
          employees: employeeChoices,
          replace,
        }),
      })) as ImportResult;
      setResult(value);
      await refresh();
      return value;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ";
      setError(message);
      throw cause;
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setStage(null);
    setSelectedSheet("");
    setMappings({});
    setEmployeeChoices({});
    setPreview(null);
    setResult(null);
    setError("");
    sessionStorage.removeItem("ntp-import-wizard");
  };
  return (
    <Context.Provider
      value={{
        stage,
        selectedSheet,
        setSelectedSheet,
        mappings,
        setMappings,
        employeeChoices,
        setEmployeeChoices,
        preview,
        result,
        busy,
        error,
        clearError: () => setError(""),
        stageFile,
        loadPreview,
        confirm,
        reset,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useImportWizard(): Wizard {
  const context = useContext(Context);
  if (!context) throw new Error("ImportWizardProvider is missing");
  return context;
}
