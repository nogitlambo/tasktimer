"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SettingsNavItem, SettingsPaneKey } from "./types";

const SETTINGS_PANE_KEYS: SettingsPaneKey[] = [
  "general",
  "preferences",
  "appearance",
  "notifications",
  "privacy",
  "help",
  "about",
  "feedback",
  "data",
  "reset",
];

const SETTINGS_PANE_TRANSITION_MS = 220;

type SettingsPaneSlideDirection = "forward" | "backward";

function isSettingsPaneKey(value: string): value is SettingsPaneKey {
  return SETTINGS_PANE_KEYS.includes(value as SettingsPaneKey);
}

export function useSettingsPaneState(initialPane: SettingsPaneKey | null) {
  const [initialState] = useState<{ activePane: SettingsPaneKey | null; mobileDetailOpen: boolean }>(() => {
    return { activePane: initialPane, mobileDetailOpen: !!initialPane };
  });
  const [activePane, setActivePane] = useState<SettingsPaneKey | null>(initialState.activePane);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(initialState.mobileDetailOpen);
  const [paneSlideDirection, setPaneSlideDirection] = useState<SettingsPaneSlideDirection | null>(null);
  const [exitingPane, setExitingPane] = useState<SettingsPaneKey | null>(null);
  const transitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current != null) window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      const queryPaneRaw = String(new URLSearchParams(window.location.search).get("pane") || "").trim();
      const requestedPane = isSettingsPaneKey(queryPaneRaw) ? queryPaneRaw : initialPane;
      if (requestedPane && requestedPane !== "general") {
        setActivePane(requestedPane);
        setMobileDetailOpen(true);
        return;
      }
      const isMobileViewport = window.matchMedia("(max-width: 640px)").matches;
      if (!isMobileViewport) {
        setActivePane("preferences");
      }
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [initialPane]);

  function clearPaneTransitionLater(nextExitingPane: SettingsPaneKey | null) {
    if (typeof window === "undefined") return;
    if (transitionTimerRef.current != null) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = window.setTimeout(() => {
      setExitingPane((current) => (current === nextExitingPane ? null : current));
      transitionTimerRef.current = null;
    }, SETTINGS_PANE_TRANSITION_MS);
  }

  return {
    activePane,
    setActivePane,
    mobileDetailOpen,
    setMobileDetailOpen,
    paneSlideDirection,
    exitingPane,
    closeMobileDetail: () => {
      setPaneSlideDirection("backward");
      setMobileDetailOpen(false);
    },
    selectPane: (pane: SettingsPaneKey) => {
      if (pane === activePane) {
        setPaneSlideDirection("forward");
        setMobileDetailOpen(true);
        return;
      }
      const previousPane = activePane;
      setPaneSlideDirection("forward");
      setExitingPane(previousPane);
      setActivePane(pane);
      setMobileDetailOpen(true);
      clearPaneTransitionLater(previousPane);
    },
  };
}

export function getSettingsNavItems(): SettingsNavItem[] {
  return [
    { key: "preferences", label: "Preferences", icon: "/Task_Settings.svg" },
    { key: "appearance", label: "Appearance", icon: "/Appearance.svg" },
    { key: "notifications", label: "Sounds & Alerts", icon: "/Settings.svg" },
    { key: "help", label: "Help Center", icon: "/About.svg", id: "commandCenterHelpCenterBtn" },
    { key: "data", label: "Data", icon: "/History_Manager.svg" },
    { key: "about", label: "About", icon: "/About.svg" },
  ];
}

export function useSettingsNavItems(): SettingsNavItem[] {
  return useMemo(() => getSettingsNavItems(), []);
}
