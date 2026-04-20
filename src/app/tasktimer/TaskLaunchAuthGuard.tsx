"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { syncTaskTimerPushNotificationsEnabled } from "@/app/tasktimer/lib/pushNotifications";
import { loadCachedPreferences, STORAGE_KEY, subscribeCachedPreferences } from "@/app/tasktimer/lib/storage";

type GuardStatus = "checking" | "authed";

export default function TaskLaunchAuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<GuardStatus>(() => {
    const auth = getFirebaseAuthClient();
    return auth?.currentUser ? "authed" : "checking";
  });

  function readStoredMobilePushAlertsEnabled() {
    if (typeof window === "undefined") return false;
    try {
      return String(window.localStorage.getItem(`${STORAGE_KEY}:mobilePushAlertsEnabled`) || "").trim() === "true";
    } catch {
      return false;
    }
  }

  function readStoredWebPushAlertsEnabled(fallback: boolean) {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = String(window.localStorage.getItem(`${STORAGE_KEY}:webPushAlertsEnabled`) || "").trim();
      if (raw === "true") return true;
      if (raw === "false") return false;
      return fallback;
    } catch {
      return fallback;
    }
  }

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) {
      router.replace("/");
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setStatus("authed");
        // Check onboarding status for non-onboarding routes
        if (pathname !== "/onboarding") {
          try {
            const onboardingCompleted = window.localStorage.getItem(`${STORAGE_KEY}:onboardingCompleted`);
            if (onboardingCompleted !== "true") {
              router.replace("/onboarding");
              return;
            }
          } catch {
            // Ignore localStorage errors
          }
        }
        return;
      }
      router.replace("/");
    });
    return () => unsub();
  }, [router, pathname]);

  useEffect(() => {
    const syncPreference = (mobileEnabled: boolean, webEnabled: boolean) => {
      void syncTaskTimerPushNotificationsEnabled({ mobileEnabled, webEnabled }).catch(() => {});
    };
    const cachedPreferences = loadCachedPreferences();
    const initialMobileEnabled =
      cachedPreferences && typeof cachedPreferences === "object" && "mobilePushAlertsEnabled" in cachedPreferences
        ? !!cachedPreferences.mobilePushAlertsEnabled
        : readStoredMobilePushAlertsEnabled();
    const initialWebEnabled =
      cachedPreferences && typeof cachedPreferences === "object" && "webPushAlertsEnabled" in cachedPreferences
        ? !!cachedPreferences.webPushAlertsEnabled
        : readStoredWebPushAlertsEnabled(initialMobileEnabled);
    syncPreference(initialMobileEnabled, initialWebEnabled);
    const unsub = subscribeCachedPreferences((prefs) => {
      if (!prefs || typeof prefs !== "object" || !("mobilePushAlertsEnabled" in prefs)) return;
      const mobileEnabled = !!prefs.mobilePushAlertsEnabled;
      const webEnabled = "webPushAlertsEnabled" in prefs ? !!prefs.webPushAlertsEnabled : mobileEnabled;
      syncPreference(mobileEnabled, webEnabled);
    });
    return () => {
      unsub();
    };
  }, []);

  if (status !== "authed") return null;
  return <>{children}</>;
}
