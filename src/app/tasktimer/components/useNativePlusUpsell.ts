"use client";

import { useCallback, useState } from "react";
import { Browser } from "@capacitor/browser";
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

  const close = useCallback(() => {
    setOpen(false);
    setError("");
    setBusy(false);
    setSelectedOffer("plus_monthly");
  }, []);
  const show = useCallback(() => {
    setError("");
    setSelectedOffer("plus_monthly");
    setOpen(true);
  }, []);
  const startCheckout = useCallback(async (offer: TaskTimerPaidOffer) => {
    const currentUser = getFirebaseAuthClient()?.currentUser || null;
    const uid = String(currentUser?.uid || "").trim();
    if (!uid || busy) return;
    setBusy(true);
    setError("");
    try {
      const idToken = await currentUser?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const res = await fetch(getApiUrl("/api/stripe/create-checkout-session/"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({ uid, offer, returnTarget: "native", successReturnPath: returnPath, cancelReturnPath: returnPath }),
      });
      const data = await readApiJson<{ url?: string; error?: string }>(res, "Could not start checkout.");
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout.");
      try {
        await Browser.open({ url: data.url });
      } catch {
        window.location.assign(data.url);
      }
    } catch (checkoutError: unknown) {
      void recordNonFatal(checkoutError, { flow: "billing_checkout", source_page: sourcePage });
      setError(getCheckoutErrorMessage(checkoutError));
      setBusy(false);
    }
  }, [busy, returnPath, sourcePage]);

  return { open, busy, error, selectedOffer, close, show, setSelectedOffer, startCheckout };
}
