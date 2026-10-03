import { z } from "zod";

const mappingChoice = z.discriminatedUnion("action", [
  z.object({ action: z.literal("existing"), code: z.string().min(1) }),
  z.object({ action: z.literal("create"), label: z.string().trim().min(1).max(100), kind: z.enum(["income", "deduction"]) }),
  z.object({ action: z.literal("ignore") }),
]);
const employeeChoice = z.discriminatedUnion("action", [
  z.object({ action: z.literal("match"), employeeCode: z.string().min(1) }),
  z.object({ action: z.literal("create") }),
  z.object({ action: z.literal("ignore") }),
]);
export const previewSchema = z.object({ uploadId: z.uuid(), sheetName: z.string().max(100).optional(), mappings: z.record(z.string(), mappingChoice).optional(), employees: z.record(z.string(), employeeChoice).optional() });
export const confirmSchema = previewSchema.extend({ replace: z.boolean().default(false) });
