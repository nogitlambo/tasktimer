import { randomUUID } from "node:crypto";

import { withAuthenticatedApiCors } from "@/app/api/shared/cors";

function requestId(req: Request) {
  const supplied = String(req.headers.get("x-request-id") || "").trim().slice(0, 120);
  return supplied || randomUUID();
}

export function automationSuccess(req: Request, data: unknown, status = 200) {
  return withAuthenticatedApiCors(req, Response.json({
    success: true,
    requestId: requestId(req),
    timestamp: new Date().toISOString(),
    data,
  }, { status }));
}

export function automationError(req: Request, status: number, code: string, message: string) {
  return withAuthenticatedApiCors(req, Response.json({
    success: false,
    requestId: requestId(req),
    timestamp: new Date().toISOString(),
    error: { code, message },
  }, { status }));
}

export function safeAutomationError(error: unknown, fallbackCode = "AUTOMATION_INTERNAL") {
  const status = Number((error as { status?: unknown })?.status);
  const code = typeof (error as { code?: unknown })?.code === "string" ? String((error as { code?: unknown }).code) : fallbackCode;
  const safeStatus = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  const safeCode = /^[A-Z0-9_/-]{1,80}$/.test(code) ? code : fallbackCode;
  const safeMessages: Record<string, string> = {
    "auth/unauthenticated": "You must be signed in to continue.",
    "auth/invalid-session": "Your sign-in session is no longer valid. Please sign in again.",
    "AUTOMATION_ACCOUNT_DELETED": "Automation is unavailable for this account.",
    "AUTOMATION_OWNERSHIP_FAILED": "Automation ownership could not be verified.",
    "automation/rate-limited": "Please wait before trying Trusted Automation again.",
    "plan/plus-required": "Upgrade to PLUS to use executive function features.",
  };
  return {
    status: safeStatus,
    code: safeMessages[code] ? code : safeCode,
    message: safeMessages[code] || (safeStatus === 400 ? "Automation request is invalid." : "TaskLaunch could not complete the automation request."),
  };
}

export async function readAutomationJsonBody(req: Request) {
  try {
    return await req.json() as unknown;
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400, code: "INVALID_SCHEMA" });
  }
}
