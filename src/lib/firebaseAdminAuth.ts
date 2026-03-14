import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

let authAdmin: Auth | null | undefined;

function getProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    ""
  ).trim();
}

function getPrivateKey() {
  return String(process.env.FIREBASE_PRIVATE_KEY || "")
    .replace(/\\n/g, "\n")
    .trim();
}

function getClientEmail() {
  return String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
}

function hasServiceAccountConfig() {
  return Boolean(getProjectId() && getClientEmail() && getPrivateKey());
}

export function getFirebaseAdminAuth(): Auth | null {
  if (authAdmin !== undefined) return authAdmin;

  try {
    if (!getApps().length) {
      if (hasServiceAccountConfig()) {
        initializeApp({
          credential: cert({
            projectId: getProjectId(),
            clientEmail: getClientEmail(),
            privateKey: getPrivateKey(),
          }),
        });
      } else {
        initializeApp({
          credential: applicationDefault(),
          projectId: getProjectId() || undefined,
        });
      }
    }

    authAdmin = getAuth();
  } catch {
    authAdmin = null;
  }

  return authAdmin;
}
