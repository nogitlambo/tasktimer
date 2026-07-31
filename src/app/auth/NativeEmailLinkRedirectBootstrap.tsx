"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { resolveNativeAppRoute } from "@/lib/nativeAppLinks";
import { resolveTaskTimerRouteHref } from "../tasktimer/lib/routeHref";
import { resolveNativeEmailLinkLoginRoute } from "./nativeEmailLinkRedirect";

export default function NativeEmailLinkRedirectBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!Capacitor.isNativePlatform() && window.location.protocol !== "file:") return;
    } catch {
      if (window.location.protocol !== "file:") return;
    }

    let disposed = false;
    let removeListener: (() => void) | null = null;

    const openNativeRoute = (rawUrl: string) => {
      if (disposed) return;
      const route = resolveNativeAppRoute(rawUrl) || resolveNativeEmailLinkLoginRoute(rawUrl);
      if (!route) return;
      const target = resolveTaskTimerRouteHref(route);
      const current = `${window.location.pathname}${window.location.search || ""}`;
      if (current === target) return;
      void Browser.close().catch(() => {});
      window.location.assign(target);
    };

    const setup = async () => {
      try {
        const { App } = await import("@capacitor/app");
        const launchUrl = await App.getLaunchUrl().catch(() => undefined);
        openNativeRoute(launchUrl?.url || "");
        const handle = await App.addListener("appUrlOpen", (event) => {
          openNativeRoute(event.url || "");
        });
        removeListener = () => {
          void handle.remove();
        };
      } catch {
        // Native link routing is best-effort; /login still handles browser-opened links.
      }
    };

    void setup();
    return () => {
      disposed = true;
      removeListener?.();
    };
  }, []);

  return null;
}
