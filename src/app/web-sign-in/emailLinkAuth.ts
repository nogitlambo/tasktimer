const WEB_SIGN_IN_PATH = "/web-sign-in";

type LocationLike = Pick<Location, "origin" | "protocol" | "hostname">;

function normalizeHttpOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function isLocalhostHost(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function originHostname(origin: string) {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}

function authDomainOrigin(authDomain: string) {
  const normalized = authDomain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return normalized ? `https://${normalized}` : "";
}

export function resolveEmailLinkContinueUrl(input?: {
  location?: LocationLike | null;
  appUrl?: string | null;
  authDomain?: string | null;
}) {
  const configuredAppOrigin = normalizeHttpOrigin(input?.appUrl || process.env.NEXT_PUBLIC_APP_URL || "");
  const currentOrigin = normalizeHttpOrigin(input?.location?.origin || "");
  const currentProtocol = String(input?.location?.protocol || "").toLowerCase();
  const currentHost = String(input?.location?.hostname || originHostname(currentOrigin));
  const currentOriginIsHttp = currentProtocol === "http:" || currentProtocol === "https:" || Boolean(currentOrigin);
  const configuredAppHost = originHostname(configuredAppOrigin);
  const firebaseAuthOrigin = authDomainOrigin(input?.authDomain || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "");

  if (
    configuredAppOrigin &&
    (!currentOriginIsHttp ||
      !currentOrigin ||
      (isLocalhostHost(currentHost) && configuredAppHost && !isLocalhostHost(configuredAppHost)))
  ) {
    return `${configuredAppOrigin}${WEB_SIGN_IN_PATH}`;
  }

  if (currentOrigin && isLocalhostHost(currentHost) && firebaseAuthOrigin) {
    return `${firebaseAuthOrigin}${WEB_SIGN_IN_PATH}`;
  }

  if (currentOrigin) return `${currentOrigin}${WEB_SIGN_IN_PATH}`;
  if (configuredAppOrigin) return `${configuredAppOrigin}${WEB_SIGN_IN_PATH}`;
  if (firebaseAuthOrigin) return `${firebaseAuthOrigin}${WEB_SIGN_IN_PATH}`;

  return `https://tasktimer-prod.firebaseapp.com${WEB_SIGN_IN_PATH}`;
}

export function getEmailLinkActionCodeSettings(location?: LocationLike | null) {
  return {
    url: resolveEmailLinkContinueUrl({ location }),
    handleCodeInApp: true,
  };
}

export function getEmailLinkSendErrorMessage(err: unknown) {
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
  if (code === "auth/unauthorized-continue-uri") {
    return "Could not send sign-in link because this app URL is not authorized in Firebase Authentication. Add the continue URL domain to Firebase Auth > Settings > Authorized domains.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Could not send sign-in link because Email link sign-in is not enabled in Firebase Authentication.";
  }
  if (code === "auth/app-not-authorized") {
    return "Could not send sign-in link because this app is not authorized for the configured Firebase project.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many sign-in link requests. Wait a moment, then try again.";
  }
  if (code === "auth/network-request-failed") {
    return "Could not reach Firebase Authentication. Check your connection, then try again.";
  }
  return "";
}
