import { randomUUID } from "node:crypto";

export type ReportableLogLevel = "warn" | "error";

export function createReportableLogId(prefix = "tl") {
  const entropy = randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${entropy}`;
}

export function writeReportableLog(
  level: ReportableLogLevel,
  label: string,
  details: Record<string, unknown>
) {
  if (level === "warn") {
    console.warn(label, details);
    return;
  }
  console.error(label, details);
}
