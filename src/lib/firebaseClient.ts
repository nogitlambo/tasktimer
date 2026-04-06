import { initializeApp, getApp, getApps } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
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

export function getFirebaseAppClient() {
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

let firebaseAuthInstance: Auth | null | undefined;
let firebaseAppCheckInstance: AppCheck | null | undefined;

export function getFirebaseAuthClient(): Auth | null {
  if (firebaseAuthInstance !== undefined) return firebaseAuthInstance;
  firebaseAuthInstance = createFirebaseAuth();
  return firebaseAuthInstance;
}

export function getFirebaseAppCheckClient(): AppCheck | null {
  if (firebaseAppCheckInstance !== undefined) return firebaseAppCheckInstance;
  if (typeof window === "undefined" || isNativeOrFileRuntime()) {
    firebaseAppCheckInstance = null;
    return firebaseAppCheckInstance;
  }
  const app = getFirebaseAppClient();
  if (!app || !recaptchaEnterpriseSiteKey) {
    firebaseAppCheckInstance = null;
    return firebaseAppCheckInstance;
  }
  try {
    firebaseAppCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return firebaseAppCheckInstance;
  } catch {
    firebaseAppCheckInstance = null;
    return firebaseAppCheckInstance;
  }
}

export const hasFirebaseAuthClientConfig = hasFirebaseClientConfig(getFirebaseClientConfig());
