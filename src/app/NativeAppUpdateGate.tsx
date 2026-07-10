"use client";

import { useLayoutEffect, useState } from "react";
import { getNativeAppUpdateGateInitialPending, runNativeAndroidAppUpdateGate } from "./nativeAppUpdate";

export default function NativeAppUpdateGate() {
  const [pending, setPending] = useState(() => getNativeAppUpdateGateInitialPending());

  useLayoutEffect(() => {
    if (!pending) return;
    let cancelled = false;
    void runNativeAndroidAppUpdateGate().finally(() => {
      if (!cancelled) setPending(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pending]);

  if (!pending) return null;
  return <div className="nativeAppUpdateGate" aria-hidden="true" />;
}
