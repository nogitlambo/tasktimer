"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { syncTaskTimerPushNotificationsEnabled } from "@/app/tasktimer/lib/pushNotifications";
import { STORAGE_KEY } from "@/app/tasktimer/lib/storage";
import { createTaskTimerWorkspaceRepository } from "@/app/tasktimer/lib/workspaceRepository";

type GuardStatus = "checking" | "ready";
const workspaceRepository = createTaskTimerWorkspaceRepository();

export default function TaskLaunchAuthGuard({
  children,
  requireAuth = false,
}: {
  children: ReactNode;
  requireAuth?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<GuardStatus>(() => {
    const auth = getFirebaseAuthClient();
    return auth?.currentUser || !requireAuth ? "ready" : "checking";
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
      if (requireAuth) router.replace("/");
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user || !requireAuth) {
        setStatus("ready");
        return;
      }
      router.replace("/");
    });
    return () => unsub();
  }, [requireAuth, router]);

  useEffect(() => {
    const syncPreference = (mobileEnabled: boolean, webEnabled: boolean) => {
      if (!getFirebaseAuthClient()?.currentUser) return;
      void syncTaskTimerPushNotificationsEnabled({ mobileEnabled, webEnabled }).catch(() => {});
    };
    const cachedPreferences = workspaceRepository.loadCachedPreferences();
    const initialMobileEnabled =
      cachedPreferences && typeof cachedPreferences === "object" && "mobilePushAlertsEnabled" in cachedPreferences
        ? !!cachedPreferences.mobilePushAlertsEnabled
        : readStoredMobilePushAlertsEnabled();
    const initialWebEnabled =
      cachedPreferences && typeof cachedPreferences === "object" && "webPushAlertsEnabled" in cachedPreferences
        ? !!cachedPreferences.webPushAlertsEnabled
        : readStoredWebPushAlertsEnabled(initialMobileEnabled);
    syncPreference(initialMobileEnabled, initialWebEnabled);
    const unsub = workspaceRepository.subscribeCachedPreferences((prefs) => {
      if (!prefs || typeof prefs !== "object" || !("mobilePushAlertsEnabled" in prefs)) return;
      const mobileEnabled = !!prefs.mobilePushAlertsEnabled;
      const webEnabled = "webPushAlertsEnabled" in prefs ? !!prefs.webPushAlertsEnabled : mobileEnabled;
      syncPreference(mobileEnabled, webEnabled);
    });
    return () => {
      unsub();
    };
  }, []);

  if (status !== "ready") return null;
  return <>{children}</>;
}
