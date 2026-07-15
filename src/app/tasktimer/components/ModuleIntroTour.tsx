"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";

import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import {
  clearLocalModuleIntroTourPending,
  dispatchModuleIntroTourApplyPageEvent,
  getModuleIntroTourStep,
  getNextModuleIntroTourIndex,
  hasCompletedModuleIntroTour,
  isFinalModuleIntroTourStep,
  markModuleIntroTourCompleted,
  MODULE_INTRO_TOUR_STEPS,
  readLocalModuleIntroTourPending,
  TASKTIMER_MODULE_INTRO_TOUR_START_EVENT,
  type ModuleIntroTourStartEventDetail,
} from "../client/module-intro-tour";

function normalizeUid(uidRaw: unknown) {
  return String(uidRaw || "").trim();
}

export default function ModuleIntroTour() {
  const [uid, setUid] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const activeUidRef = useRef("");
  const startingRef = useRef(false);

  useEffect(() => {
    activeUidRef.current = uid;
  }, [uid]);

  const closeTour = useCallback(async (targetUidRaw?: unknown) => {
    const targetUid = normalizeUid(targetUidRaw) || activeUidRef.current;
    setActiveIndex(null);
    if (!targetUid) return;
    try {
      await markModuleIntroTourCompleted(targetUid);
    } catch {
      clearLocalModuleIntroTourPending(targetUid);
    }
  }, []);

  const startTour = useCallback(async (targetUidRaw?: unknown) => {
    const targetUid = normalizeUid(targetUidRaw) || activeUidRef.current;
    if (!targetUid || startingRef.current) return;
    startingRef.current = true;
    try {
      if (await hasCompletedModuleIntroTour(targetUid)) {
        clearLocalModuleIntroTourPending(targetUid);
        setActiveIndex(null);
        return;
      }
      activeUidRef.current = targetUid;
      setUid(targetUid);
      setActiveIndex(0);
      dispatchModuleIntroTourApplyPageEvent(MODULE_INTRO_TOUR_STEPS[0].page);
    } finally {
      startingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    const syncUser = (nextUidRaw: unknown) => {
      const nextUid = normalizeUid(nextUidRaw);
      activeUidRef.current = nextUid;
      setUid(nextUid);
      if (!nextUid) {
        setActiveIndex(null);
        return;
      }
      if (readLocalModuleIntroTourPending(nextUid)) {
        void startTour(nextUid);
      }
    };
    syncUser(auth.currentUser?.uid);
    const unsubscribe = onAuthStateChanged(auth, (user) => syncUser(user?.uid));
    return () => unsubscribe();
  }, [startTour]);

  useEffect(() => {
    const onTourStart = (event: Event) => {
      const detail = (event as CustomEvent<ModuleIntroTourStartEventDetail>).detail;
      void startTour(detail?.uid);
    };
    window.addEventListener(TASKTIMER_MODULE_INTRO_TOUR_START_EVENT, onTourStart as EventListener);
    return () => {
      window.removeEventListener(TASKTIMER_MODULE_INTRO_TOUR_START_EVENT, onTourStart as EventListener);
    };
  }, [startTour]);

  useEffect(() => {
    if (activeIndex == null) return;
    const step = getModuleIntroTourStep(activeIndex);
    document.body.classList.add("isModuleIntroTourActive");
    document.body.setAttribute("data-module-intro-tour-page", step.page);
    return () => {
      document.body.classList.remove("isModuleIntroTourActive");
      document.body.removeAttribute("data-module-intro-tour-page");
    };
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex == null) return;
    const blockTourNav = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("#desktopAppRail [data-nav-page], .appFooterNav [data-nav-page]")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    document.addEventListener("click", blockTourNav, true);
    return () => document.removeEventListener("click", blockTourNav, true);
  }, [activeIndex]);

  const continueTour = useCallback(() => {
    if (activeIndex == null) return;
    const nextIndex = getNextModuleIntroTourIndex(activeIndex);
    if (nextIndex == null) {
      void closeTour();
      return;
    }
    dispatchModuleIntroTourApplyPageEvent(getModuleIntroTourStep(nextIndex).page);
    setActiveIndex(nextIndex);
  }, [activeIndex, closeTour]);

  if (activeIndex == null || !uid) return null;

  const step = getModuleIntroTourStep(activeIndex);
  const finalStep = isFinalModuleIntroTourStep(activeIndex);

  return (
    <div className="moduleIntroTourOverlay" role="dialog" aria-modal="false" aria-labelledby="moduleIntroTourTitle" aria-describedby="moduleIntroTourText">
      <div className="moduleIntroTourPanel">
        <div className="moduleIntroTourKicker">Module intro</div>
        <h2 id="moduleIntroTourTitle">{step.label}</h2>
        <p id="moduleIntroTourText" className="modalSubtext">
          {step.message}
        </p>
        <div className="moduleIntroTourProgress" aria-label={`Step ${activeIndex + 1} of ${MODULE_INTRO_TOUR_STEPS.length}`}>
          {MODULE_INTRO_TOUR_STEPS.map((item, index) => (
            <span key={item.page} className={index === activeIndex ? "isActive" : ""} aria-hidden="true" />
          ))}
        </div>
        <div className="confirmBtns moduleIntroTourActions">
          <button className="btn btn-ghost" type="button" onClick={() => void closeTour()}>
            Skip Tour
          </button>
          <button className="btn btn-accent" type="button" onClick={continueTour}>
            {finalStep ? "Finish" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
