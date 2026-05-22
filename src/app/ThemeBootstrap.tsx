"use client";

import { useLayoutEffect } from "react";

export default function ThemeBootstrap() {
  useLayoutEffect(() => {
    try {
      const { body } = document;

      body.setAttribute("data-theme", "lime");
    } catch {
      // Ignore storage access failures in restricted browser contexts.
    }
  }, []);

  return null;
}
