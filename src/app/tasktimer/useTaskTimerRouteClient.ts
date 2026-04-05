"use client";

import { useEffect, useRef } from "react";

import type { TaskTimerClientHandle } from "./client/types";

export function useTaskTimerRouteClient(initClient: () => TaskTimerClientHandle) {
  const handleRef = useRef<TaskTimerClientHandle | null>(null);

  useEffect(() => {
    const start = () => {
      handleRef.current?.destroy();
      handleRef.current = initClient();
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      start();
    };

    start();
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [initClient]);
}
