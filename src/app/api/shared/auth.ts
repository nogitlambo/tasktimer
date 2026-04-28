import {
  canUseFirebaseAdminDefaultCredentials,
  getFirebaseAdminAuth,
  hasFirebaseAdminCredentialConfig,
} from "@/lib/firebaseAdmin";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function parseCookieValue(cookieHeader: string | null, name: string) {
  const source = String(cookieHeader || "");
  if (!source) return "";
  const parts = source.split(";");
  for (const part of parts) {
    const [rawName, ...rawValue] = part.split("=");
    if (asString(rawName) !== name) continue;
    const joined = rawValue.join("=").trim();
    if (!joined) return "";
    try {
      return decodeURIComponent(joined);
    } catch {
      return joined;
    }
  }
  return "";
}

function getRequestIdToken(req: Request, body?: Record<string, unknown> | null) {
  const authHeader = asString(req.headers.get("authorization"));
  if (authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.slice("Bearer ".length).trim();
    if (bearerToken) return bearerToken;
  }
  const customHeaderToken = asString(req.headers.get("x-firebase-auth"), 8192);
  if (customHeaderToken) return customHeaderToken;
  const bodyToken = asString(body?.authToken, 8192);
  if (bodyToken) return bodyToken;
  return parseCookieValue(req.headers.get("cookie"), "tasktimer_feedback_auth");
}

class ApiAuthError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 401) {
    super(message);
    this.name = "ApiAuthError";
    this.code = code;
    this.status = status;
  }
}

export function createApiAuthErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiAuthError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  return Response.json({ error: fallbackMessage, code: "auth/internal" }, { status: 500 });
}

export function createApiInternalErrorResponse(error: unknown, fallbackMessage: string, logLabel: string) {
  console.error(logLabel, error);
  return Response.json({ error: fallbackMessage, code: "internal" }, { status: 500 });
}

export async function verifyFirebaseRequestUser(req: Request, body?: Record<string, unknown> | null) {
  const idToken = getRequestIdToken(req, body);
  if (!idToken) {
    throw new ApiAuthError("auth/unauthenticated", "You must be signed in to continue.", 401);
  }
  if (!hasFirebaseAdminCredentialConfig() && !canUseFirebaseAdminDefaultCredentials()) {
    throw new ApiAuthError(
      "auth/admin-config-missing",
      "Firebase Admin credentials are not configured for this environment.",
      503
    );
  }
  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const uid = asString(decodedToken.uid, 120);
    const email = asString(decodedToken.email, 320) || null;
    if (!uid) throw new Error("Missing uid.");
    return { uid, email, idToken };
  } catch {
    throw new ApiAuthError("auth/invalid-session", "Your sign-in session is no longer valid. Please sign in again.", 401);
  }
}
