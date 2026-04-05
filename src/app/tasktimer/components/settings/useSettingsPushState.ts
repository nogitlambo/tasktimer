"use client";

import { useEffect, useState } from "react";
import { getTaskTimerPushDiagnostics } from "@/app/tasktimer/lib/pushNotifications";
import { sendPushTestNotification } from "@/app/tasktimer/lib/pushFunctions";
import { getErrorMessage } from "./settingsAccountService";
import type { SettingsPushViewModel } from "./types";

export function useSettingsPushState(authUserUid: string | null): SettingsPushViewModel {
  const [diagnostics, setDiagnostics] = useState<SettingsPushViewModel["diagnostics"]>(null);
  const [pushTestBusy, setPushTestBusy] = useState(false);
  const [pushTestStatus, setPushTestStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!authUserUid) {
      setDiagnostics(null);
      return;
    }
    const loadDiagnostics = async () => {
      const nextDiagnostics = await getTaskTimerPushDiagnostics(authUserUid);
      if (!cancelled) setDiagnostics(nextDiagnostics);
    };
    void loadDiagnostics();
    return () => {
      cancelled = true;
    };
  }, [authUserUid, pushTestStatus]);

  return {
    diagnostics,
    pushTestBusy,
    pushTestStatus,
    canTriggerPushTest: !!authUserUid,
    onPushTest: async () => {
      if (!authUserUid) {
        setPushTestStatus("Sign in first to send a test push.");
        return;
      }
      setPushTestBusy(true);
      setPushTestStatus("");
      try {
        const result = await sendPushTestNotification({
          title: "TaskLaunch Test",
          body: `Push check sent at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          data: {
            screen: "tasktimer",
            source: "settings-hidden-test",
          },
        });
        const successCount = Number(result.successCount || 0);
        const failureCount = Number(result.failureCount || 0);
        const tokenCount = Number(result.tokenCount || 0);
        setPushTestStatus(
          failureCount > 0
            ? `Push sent to ${successCount}/${tokenCount} device${tokenCount === 1 ? "" : "s"} (${failureCount} failed).`
            : `Push sent to ${successCount}/${tokenCount} device${tokenCount === 1 ? "" : "s"}.`,
        );
      } catch (err: unknown) {
        setPushTestStatus(getErrorMessage(err, "Unable to send test push right now."));
      } finally {
        setPushTestBusy(false);
      }
    },
  };
}
