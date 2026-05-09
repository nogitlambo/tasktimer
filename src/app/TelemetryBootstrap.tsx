"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  initTelemetry,
  setCrashlyticsContext,
  setTelemetryUser,
  triggerCrashlyticsTestCrash,
} from "@/lib/firebaseTelemetry";

type TelemetryWindow = Window & {
  tasklaunchTelemetry?: {
    triggerCrashlyticsTestCrash: () => Promise<void>;
  };
};

export default function TelemetryBootstrap() {
  useEffect(() => {
    void initTelemetry();
    void setCrashlyticsContext({
      bootstrap_route: typeof window !== "undefined" ? window.location.pathname || "/" : "/",
    });

    const auth = getFirebaseAuthClient();
    if (!auth) return;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const uid = String(user?.uid || "").trim() || null;
      void setTelemetryUser(uid);
    });

    const telemetryWindow = window as TelemetryWindow;
    if (String(process.env.NEXT_PUBLIC_FIREBASE_ENV || "prod").trim().toLowerCase() === "debug") {
      telemetryWindow.tasklaunchTelemetry = {
        triggerCrashlyticsTestCrash,
      };
    }

    return () => {
      unsubscribe();
      if (telemetryWindow.tasklaunchTelemetry) {
        delete telemetryWindow.tasklaunchTelemetry;
      }
    };
  }, []);

  return null;
}
