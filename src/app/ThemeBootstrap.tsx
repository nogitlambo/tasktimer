"use client";

import { useLayoutEffect } from "react";

export default function ThemeBootstrap() {
  useLayoutEffect(() => {
    try {
      const keyBase = "taskticker_tasks_v1";
      const theme = String(localStorage.getItem(`${keyBase}:theme`) || "")
        .trim()
        .toLowerCase();
      const style = String(localStorage.getItem(`${keyBase}:menuButtonStyle`) || "")
        .trim()
        .toLowerCase();
      const { body } = document;

      if (theme === "purple" || theme === "cyan") {
        body.setAttribute("data-theme", theme);
      } else if (theme === "dark") {
        body.setAttribute("data-theme", "purple");
      } else if (theme === "command") {
        body.setAttribute("data-theme", "cyan");
      }

      if (style === "square" || style === "parallelogram") {
        body.setAttribute("data-control-style", style);
      }
    } catch {
      // Ignore storage access failures in restricted browser contexts.
    }
  }, []);

  return null;
}
