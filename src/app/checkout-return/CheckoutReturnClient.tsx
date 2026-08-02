"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveTaskTimerRouteHref } from "../tasktimer/lib/routeHref";
import { isNativeOrFileRuntime } from "@/lib/firebaseClient";
import {
  buildNativeCheckoutReturnHandoffUrl,
  resolveHostedCheckoutReturnRoute,
} from "./nativeCheckoutReturn";

export default function CheckoutReturnClient() {
  const [message, setMessage] = useState("Returning to TaskLaunch...");
  const [manualHref, setManualHref] = useState("");

  const fallbackRoute = useMemo(() => {
    if (typeof window === "undefined") return "/login";
    return resolveHostedCheckoutReturnRoute(window.location.href) || "/login";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const href = window.location.href;
    const route = resolveHostedCheckoutReturnRoute(href);
    if (!route) {
      setMessage("This checkout return link is invalid.");
      setManualHref(resolveTaskTimerRouteHref("/login"));
      return;
    }

    if (isNativeOrFileRuntime()) {
      window.location.replace(resolveTaskTimerRouteHref(route));
      return;
    }

    const handoffUrl = buildNativeCheckoutReturnHandoffUrl(href, window.navigator.userAgent || "");
    if (handoffUrl) {
      setManualHref(handoffUrl);
      window.location.replace(handoffUrl);
      window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          setMessage("Open TaskLaunch to finish returning from checkout.");
        }
      }, 1800);
      return;
    }

    window.location.replace(resolveTaskTimerRouteHref(route));
  }, []);

  return (
    <main className="nativeAppUpdateGate">
      <div className="nativeAppUpdateGateCard">
        <h1>Returning to TaskLaunch</h1>
        <p>{message}</p>
        <p>
          <a href={manualHref || resolveTaskTimerRouteHref(fallbackRoute)}>Return now</a>
        </p>
      </div>
    </main>
  );
}

