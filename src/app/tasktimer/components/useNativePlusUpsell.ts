"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Browser } from "@capacitor/browser";
import { onAuthStateChanged } from "firebase/auth";
import { readApiJson } from "@/lib/apiJson";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { recordNonFatal } from "@/lib/firebaseTelemetry";
import { getApiUrl } from "@/app/tasktimer/lib/apiClient";
import type { TaskTimerPaidOffer } from "@/app/tasktimer/lib/entitlements";

type Options = { returnPath: string; sourcePage: string };

function getCheckoutErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not start checkout.";
}

export function useNativePlusUpsell({ returnPath, sourcePage }: Options) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedOffer, setSelectedOffer] = useState<TaskTimerPaidOffer>("plus_monthly");
  const [checkoutSuccess, setCheckoutSuccess] = useState(0);
  const attempt = useRef(0);
  const launching = useRef(false);
  const mounted = useRef(false);
  const browserListener = useRef<{ remove: () => Promise<void> } | null>(null);
  const removeBrowserListener = useCallback(() => {
    void browserListener.current?.remove().catch(() => {});
    browserListener.current = null;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const handleReturn = () => {
      const url = new URL(window.location.href);
      const outcome = url.searchParams.get("checkout");
      if (outcome !== "success" && outcome !== "cancelled") return;
      attempt.current += 1;
      launching.current = false;
      removeBrowserListener();
      setBusy(false);
      setError("");
      setOpen(outcome === "cancelled");
      if (outcome === "success") setCheckoutSuccess((value) => value + 1);
      url.searchParams.delete("checkout");
      url.searchParams.delete("session_id");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    };
    handleReturn();
    window.addEventListener("popstate", handleReturn);
    window.addEventListener("pageshow", handleReturn);
    return () => {
      mounted.current = false;
      attempt.current += 1;
      launching.current = false;
      removeBrowserListener();
      window.removeEventListener("popstate", handleReturn);
      window.removeEventListener("pageshow", handleReturn);
    };
  }, [removeBrowserListener]);

  const close = useCallback(() => {
    attempt.current += 1;
    launching.current = false;
    removeBrowserListener();
    setOpen(false);
    setError("");
    setBusy(false);
    setSelectedOffer("plus_monthly");
  }, [removeBrowserListener]);
  const show = useCallback(() => {
    setError("");
    setSelectedOffer("plus_monthly");
    setOpen(true);
  }, []);
  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    let previousUid = auth.currentUser?.uid;
    return onAuthStateChanged(auth, (user) => {
      if (previousUid && previousUid !== user?.uid) {
        close();
        setCheckoutSuccess(0);
      }
      previousUid = user?.uid;
    });
  }, [close]);
  const startCheckout = useCallback(async (offer: TaskTimerPaidOffer) => {
    const currentUser = getFirebaseAuthClient()?.currentUser || null;
    const uid = String(currentUser?.uid || "").trim();
    if (!uid || launching.current) return;
    launching.current = true;
    const currentAttempt = ++attempt.current;
    const isCurrent = () => mounted.current && attempt.current === currentAttempt
      && getFirebaseAuthClient()?.currentUser?.uid === uid;
    setBusy(true);
    setError("");
    try {
      const idToken = await currentUser?.getIdToken();
      if (!isCurrent()) return;
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const res = await fetch(getApiUrl("/api/stripe/create-checkout-session/"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({ uid, offer, returnTarget: "native", successReturnPath: returnPath, cancelReturnPath: returnPath }),
      });
      const data = await readApiJson<{ url?: string; error?: string }>(res, "Could not start checkout.");
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout.");
      if (!isCurrent()) return;
      removeBrowserListener();
      const listener = await Browser.addListener("browserFinished", () => {
        if (!isCurrent()) return;
        launching.current = false;
        setBusy(false);
        setError("");
        removeBrowserListener();
      }).catch(() => null);
      if (!isCurrent()) {
        void listener?.remove().catch(() => {});
        return;
      }
      browserListener.current = listener;
      try {
        await Browser.open({ url: data.url });
      } catch {
        if (!isCurrent()) return;
        window.location.assign(data.url);
      }
      // Opening the browser completes the launch, not the purchase. Keep the
      // attempt locked until dismissal, but never leave Close disabled behind it.
      if (isCurrent()) {
        setBusy(false);
        if (!listener) launching.current = false;
      }
    } catch (checkoutError: unknown) {
      if (!isCurrent()) return;
      launching.current = false;
      removeBrowserListener();
      void recordNonFatal(checkoutError, { flow: "billing_checkout", source_page: sourcePage });
      setError(getCheckoutErrorMessage(checkoutError));
      setBusy(false);
    }
  }, [removeBrowserListener, returnPath, sourcePage]);

  return { open, busy, error, selectedOffer, checkoutSuccess, close, show, setSelectedOffer, startCheckout };
}
