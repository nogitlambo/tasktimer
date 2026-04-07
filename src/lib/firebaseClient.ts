import { initializeApp, getApp, getApps } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";

export function isNativeOrFileRuntime() {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform() || window.location.protocol === "file:";
  } catch {
    return window.location.protocol === "file:";
  }
}

export function firebaseAuthMode() {
  return isNativeOrFileRuntime() ? "native" : "web";
}

const defaultAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const mobileAuthDomainOverride = process.env.NEXT_PUBLIC_FIREBASE_MOBILE_AUTH_DOMAIN;
const defaultApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const mobileApiKeyOverride = process.env.NEXT_PUBLIC_FIREBASE_MOBILE_API_KEY;
const recaptchaEnterpriseSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
const shouldLogFirebaseDiagnostics = process.env.NODE_ENV !== "production";

function describeFirebaseError(error: unknown): Record<string, unknown> {
  if (!error) return { value: error };
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; customData?: unknown };
    return {
      name: error.name,
      message: error.message,
      code: withCode.code ?? null,
      customData: withCode.customData ?? null,
      stack: error.stack || null,
    };
  }
  if (typeof error === "object") {
    const errorObject = error as Record<string, unknown> & {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      stack?: unknown;
      toString?: () => string;
    };
    const ownPropertyNames = (() => {
      try {
        return Object.getOwnPropertyNames(errorObject);
      } catch {
        return [];
      }
    })();
    const enumerableEntries = (() => {
      try {
        return { ...errorObject };
      } catch {
        return {};
      }
    })();
    const stringified =
      typeof errorObject.toString === "function"
        ? (() => {
            try {
              return errorObject.toString();
            } catch {
              return null;
            }
          })()
        : null;
    try {
      return {
        ...enumerableEntries,
        name: typeof errorObject.name === "string" ? errorObject.name : null,
        message: typeof errorObject.message === "string" ? errorObject.message : null,
        code: errorObject.code ?? null,
        stack: typeof errorObject.stack === "string" ? errorObject.stack : null,
        ownPropertyNames,
        stringified,
      };
    } catch {
      return {
        value: String(error),
        ownPropertyNames,
        stringified,
      };
    }
  }
  return { value: error };
}

function logFirebaseAppCheck(message: string, details?: Record<string, unknown>) {
  if (!shouldLogFirebaseDiagnostics) return;
  if (details) {
    console.info(`[firebase-app-check] ${message}`, details);
    return;
  }
  console.info(`[firebase-app-check] ${message}`);
}

function warnFirebaseAppCheck(message: string, details?: Record<string, unknown>) {
  if (!shouldLogFirebaseDiagnostics) return;
  if (details) {
    console.warn(`[firebase-app-check] ${message}`, details);
    return;
  }
  console.warn(`[firebase-app-check] ${message}`);
}

function errorFirebaseAppCheck(message: string, details?: Record<string, unknown>) {
  if (!shouldLogFirebaseDiagnostics) return;
  if (details) {
    console.error(`[firebase-app-check] ${message}`, details);
    return;
  }
  console.error(`[firebase-app-check] ${message}`);
}

function getFirebaseClientConfig() {
  const useMobileConfig = isNativeOrFileRuntime();
  const resolvedAuthDomain = useMobileConfig ? mobileAuthDomainOverride || defaultAuthDomain : defaultAuthDomain;
  const resolvedApiKey = useMobileConfig ? mobileApiKeyOverride || defaultApiKey : defaultApiKey;
  return {
    apiKey: resolvedApiKey,
    authDomain: resolvedAuthDomain,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

export function getFirebaseClientConfigSnapshot() {
  return getFirebaseClientConfig();
}

function hasFirebaseClientConfig(config: ReturnType<typeof getFirebaseClientConfig>) {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function warnInvalidFirebaseClientConfig(config: ReturnType<typeof getFirebaseClientConfig>) {
  if (process.env.NODE_ENV === "production") return;
  const missing: string[] = [];
  if (!config.apiKey) missing.push("apiKey");
  if (!config.authDomain) missing.push("authDomain");
  if (!config.projectId) missing.push("projectId");
  if (!config.appId) missing.push("appId");
  if (!missing.length) return;
  console.warn("[firebase-auth] Missing client config", {
    mode: firebaseAuthMode(),
    missing,
  });
}

function verifyFirebaseAuthSetup(_auth: Auth, config: ReturnType<typeof getFirebaseClientConfig>) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[firebase-auth] Auth setup verified", {
    authDomain: config.authDomain || null,
    mode: firebaseAuthMode(),
    popupRedirectResolver: "browserPopupRedirectResolver",
  });
  if (firebaseAuthMode() === "web" && !config.authDomain) {
    console.warn("[firebase-auth] Web auth initialized without authDomain");
  }
}

function createFirebaseAuth(): Auth | null {
  // Prevent Firebase Web Auth initialization during SSR/prerender/build.
  if (typeof window === "undefined") return null;
  const firebaseConfig = getFirebaseClientConfig();
  if (!hasFirebaseClientConfig(firebaseConfig)) {
    warnInvalidFirebaseClientConfig(firebaseConfig);
    return null;
  }
  try {
    console.info("[firebase-auth] Initializing auth client", {
      authDomain: firebaseConfig.authDomain || null,
      mode: firebaseAuthMode(),
    });
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    try {
      const auth = initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
        popupRedirectResolver: browserPopupRedirectResolver,
      });
      verifyFirebaseAuthSetup(auth, firebaseConfig);
      return auth;
    } catch {
      const auth = getAuth(app);
      verifyFirebaseAuthSetup(auth, firebaseConfig);
      return auth;
    }
  } catch {
    return null;
  }
}

function getOrCreateFirebaseAppClient() {
  if (typeof window === "undefined") return null;
  const firebaseConfig = getFirebaseClientConfig();
  if (!hasFirebaseClientConfig(firebaseConfig)) {
    warnInvalidFirebaseClientConfig(firebaseConfig);
    return null;
  }
  try {
    return getApps().length ? getApp() : initializeApp(firebaseConfig);
  } catch {
    return null;
  }
}

export function getFirebaseAppClient() {
  const app = getOrCreateFirebaseAppClient();
  if (
    app &&
    typeof window !== "undefined" &&
    !isNativeOrFileRuntime() &&
    firebaseAppCheckInstance === undefined
  ) {
    getFirebaseAppCheckClient();
  }
  return app;
}

let firebaseAuthInstance: Auth | null | undefined;
let firebaseAppCheckInstance: AppCheck | null | undefined;
let firebaseAppCheckInitStarted = false;
let firebaseAppCheckTokenProbeStarted = false;

export function getFirebaseAuthClient(): Auth | null {
  if (firebaseAuthInstance !== undefined) return firebaseAuthInstance;
  firebaseAuthInstance = createFirebaseAuth();
  return firebaseAuthInstance;
}

export function getFirebaseAppCheckClient(): AppCheck | null {
  if (firebaseAppCheckInstance !== undefined) return firebaseAppCheckInstance;
  if (typeof window === "undefined" || isNativeOrFileRuntime()) {
    logFirebaseAppCheck("Skipping initialization for non-web runtime", {
      mode: firebaseAuthMode(),
    });
    firebaseAppCheckInstance = null;
    return firebaseAppCheckInstance;
  }
  firebaseAppCheckInitStarted = true;
  logFirebaseAppCheck("Initialization requested", {
    mode: firebaseAuthMode(),
    hasSiteKey: Boolean(recaptchaEnterpriseSiteKey),
  });
  const app = getOrCreateFirebaseAppClient();
  if (!app || !recaptchaEnterpriseSiteKey) {
    warnFirebaseAppCheck("Initialization skipped because config is incomplete", {
      hasApp: Boolean(app),
      hasSiteKey: Boolean(recaptchaEnterpriseSiteKey),
    });
    firebaseAppCheckInstance = null;
    return firebaseAppCheckInstance;
  }
  try {
    firebaseAppCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    logFirebaseAppCheck("Initialized successfully", {
      appId: app.options.appId || null,
      authDomain: app.options.authDomain || null,
    });
    return firebaseAppCheckInstance;
  } catch (error) {
    errorFirebaseAppCheck("Initialization failed", {
      error: describeFirebaseError(error),
    });
    firebaseAppCheckInstance = null;
    return firebaseAppCheckInstance;
  }
}

export async function bootstrapFirebaseWebAppCheck(): Promise<AppCheck | null> {
  const appCheck = getFirebaseAppCheckClient();
  if (!appCheck) return null;
  if (firebaseAppCheckTokenProbeStarted) return appCheck;
  firebaseAppCheckTokenProbeStarted = true;
  try {
    const tokenResult = await getToken(appCheck, false);
    logFirebaseAppCheck("Token probe succeeded", {
      tokenPresent: Boolean(tokenResult?.token),
      expireTimeMillis: tokenResult?.expireTimeMillis ?? null,
      alreadyInitialized: firebaseAppCheckInitStarted,
      hostname: typeof window !== "undefined" ? window.location.hostname || null : null,
    });
  } catch (error) {
    errorFirebaseAppCheck("Token probe failed", {
      hostname: typeof window !== "undefined" ? window.location.hostname || null : null,
      origin: typeof window !== "undefined" ? window.location.origin || null : null,
      error: describeFirebaseError(error),
    });
  }
  return appCheck;
}

export const hasFirebaseAuthClientConfig = hasFirebaseClientConfig(getFirebaseClientConfig());
