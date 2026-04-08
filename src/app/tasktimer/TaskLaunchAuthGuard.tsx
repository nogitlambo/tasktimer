"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { syncTaskTimerPushNotificationsEnabled } from "@/app/tasktimer/lib/pushNotifications";
import { loadCachedPreferences, STORAGE_KEY, subscribeCachedPreferences } from "@/app/tasktimer/lib/storage";

type GuardStatus = "checking" | "authed";

export default function TaskLaunchAuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
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

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) {
      router.replace("/");
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setStatus("authed");
        return;
      }
      router.replace("/");
    });
    return () => unsub();
  }, [router]);

  useEffect(() => {
    const syncPreference = (enabled: boolean) => {
      void syncTaskTimerPushNotificationsEnabled(enabled).catch(() => {});
    };
    const cachedPreferences = loadCachedPreferences();
    const initialEnabled =
      cachedPreferences && typeof cachedPreferences === "object" && "mobilePushAlertsEnabled" in cachedPreferences
        ? !!cachedPreferences.mobilePushAlertsEnabled
        : readStoredMobilePushAlertsEnabled();
    syncPreference(initialEnabled);
    const unsub = subscribeCachedPreferences((prefs) => {
      if (!prefs || typeof prefs !== "object" || !("mobilePushAlertsEnabled" in prefs)) return;
      syncPreference(!!prefs.mobilePushAlertsEnabled);
    });
    return () => {
      unsub();
    };
  }, []);

  if (status !== "authed") return null;
  return <>{children}</>;
}
