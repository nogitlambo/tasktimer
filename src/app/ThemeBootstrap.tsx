"use client";

import { useLayoutEffect } from "react";

export default function ThemeBootstrap() {
  useLayoutEffect(() => {
    try {
      const keyBase = "taskticker_tasks_v1";
      const style = String(localStorage.getItem(`${keyBase}:menuButtonStyle`) || "")
        .trim()
        .toLowerCase();
      const { body } = document;

      body.setAttribute("data-theme", "lime");

      if (style === "square" || style === "parallelogram") {
        body.setAttribute("data-control-style", style);
      }
    } catch {
      // Ignore storage access failures in restricted browser contexts.
    }
  }, []);

  return null;
}
