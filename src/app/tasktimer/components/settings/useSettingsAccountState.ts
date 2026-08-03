"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Browser } from "@capacitor/browser";
import { readApiJson } from "@/lib/apiJson";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { recordNonFatal } from "@/lib/firebaseTelemetry";
import { loadUserRootPlan, loadUserSubscriptionRenewalAtMs } from "@/app/tasktimer/lib/cloudStore";
import { syncOwnFriendshipProfile } from "@/app/tasktimer/lib/friendsStore";
import { syncCurrentUserPlanCache } from "@/app/tasktimer/lib/planFunctions";
import { notifyAccountProfileUpdated } from "@/app/tasktimer/lib/accountProfileStorage";
import { getApiUrl } from "@/app/tasktimer/lib/apiClient";
import {
  readTaskTimerPlanCacheFromStorage,
  readTaskTimerPlanFromStorage,
  TASKTIMER_PLAN_CHANGED_EVENT,
  type TaskTimerPaidOffer,
  writeTaskTimerPlanToStorage,
} from "@/app/tasktimer/lib/entitlements";
import {
  getErrorMessage,
  handleDeleteAccountFlow,
  loadClaimedUsername,
  saveUserDocPatch,
  updateAliasFlow,
} from "./settingsAccountService";
import type { SettingsAccountViewModel } from "./types";

type UseSettingsAccountStateOptions = {
  nativeCheckoutReturnPath?: string;
};

function resolveNativeCheckoutReturnPath(value: string | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "/settings";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function logNativePlusCheckout(
  message: string,
  details?: Record<string, unknown>
) {
  if (details) {
    console.info(`[native-plus-checkout] ${message}`, details);
    return;
  }
  console.info(`[native-plus-checkout] ${message}`);
}

function warnNativePlusCheckout(
  message: string,
  details?: Record<string, unknown>
) {
  if (details) {
    console.warn(`[native-plus-checkout] ${message}`, details);
    return;
  }
  console.warn(`[native-plus-checkout] ${message}`);
}

function describeCheckoutError(error: unknown) {
  if (error instanceof Error) {
    const errorWithCause = error as Error & { cause?: unknown };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || null,
      cause: errorWithCause.cause ?? null,
    };
  }
  return { value: error };
}

export function useSettingsAccountState(options: UseSettingsAccountStateOptions = {}): {
  account: SettingsAccountViewModel;
  authUserUid: string | null;
  authUserEmail: string | null;
  authIsAnonymous: boolean;
  authHasGoogleProvider: boolean;
  authGooglePhotoUrl: string | null;
  setAuthError: (value: string) => void;
  setAuthStatus: (value: string) => void;
  markSynced: (message?: string) => void;
} {
  const nativeCheckoutReturnPath = resolveNativeCheckoutReturnPath(options.nativeCheckoutReturnPath);
  const initialPlanCache = readTaskTimerPlanCacheFromStorage();
  const [authStatus, setAuthStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authProfileReady, setAuthProfileReady] = useState(false);
  const [authPlan, setAuthPlan] = useState<SettingsAccountViewModel["authPlan"]>(() => readTaskTimerPlanFromStorage());
  const [authPlanStatus, setAuthPlanStatus] = useState<SettingsAccountViewModel["authPlanStatus"]>("confirmed");
  const [authPlanIsProvisional, setAuthPlanIsProvisional] = useState(false);
  const [authPlanRenewalAtMs, setAuthPlanRenewalAtMs] = useState<number | null>(null);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
  const [authIsAnonymous, setAuthIsAnonymous] = useState(false);
  const [authUserAlias, setAuthUserAlias] = useState("");
  const [authUserAliasDraft, setAuthUserAliasDraft] = useState("");
  const [authUserAliasEditing, setAuthUserAliasEditing] = useState(false);
  const [authUserAliasBusy, setAuthUserAliasBusy] = useState(false);
  const [authMemberSince, setAuthMemberSince] = useState<string | null>(null);
  const [authHasGoogleProvider, setAuthHasGoogleProvider] = useState(false);
  const [authGooglePhotoUrl, setAuthGooglePhotoUrl] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<SettingsAccountViewModel["syncState"]>("idle");
  const [syncMessage, setSyncMessage] = useState("Sign in to sync preferences.");
  const [syncAtMs, setSyncAtMs] = useState<number | null>(null);
  const [uidCopyStatus, setUidCopyStatus] = useState("");
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [showNativePlusUpsellModal, setShowNativePlusUpsellModal] = useState(false);
  const [nativePlusCheckoutBusy, setNativePlusCheckoutBusy] = useState(false);
  const [nativePlusCheckoutError, setNativePlusCheckoutError] = useState("");
  const [nativePlusCheckoutOffer, setNativePlusCheckoutOffer] = useState<TaskTimerPaidOffer>("plus_monthly");
  const lastConfirmedPlanRef = useRef<SettingsAccountViewModel["authPlan"]>(initialPlanCache.plan);
  const lastConfirmedPlanUidRef = useRef<string | null>(initialPlanCache.uid);
  const pendingPlanRefreshRef = useRef(false);
  const planRefreshIdRef = useRef(0);
  const loadedAliasUidRef = useRef<string | null>(null);

  const markPlanConfirmed = useCallback((plan: SettingsAccountViewModel["authPlan"], uid: string | null) => {
    lastConfirmedPlanRef.current = plan;
    lastConfirmedPlanUidRef.current = uid;
    pendingPlanRefreshRef.current = false;
    setAuthPlan(plan);
    setAuthPlanStatus("confirmed");
    setAuthPlanIsProvisional(false);
    if (plan !== "plus") setAuthPlanRenewalAtMs(null);
  }, []);

  const markPlanRenewal = useCallback((renewalAtMs: number | null, uid: string) => {
    const activeUid = String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
    if (activeUid !== uid) return;
    setAuthPlanRenewalAtMs(renewalAtMs);
  }, []);

  const beginPlanRefresh = useCallback(
    (uid: string, fallbackPlan: SettingsAccountViewModel["authPlan"], provisional: boolean) => {
      pendingPlanRefreshRef.current = true;
      setAuthPlan(fallbackPlan);
      setAuthPlanStatus("refreshing");
      setAuthPlanIsProvisional(provisional);
      if (fallbackPlan !== "plus") setAuthPlanRenewalAtMs(null);
      const refreshId = ++planRefreshIdRef.current;
      void loadUserRootPlan(uid)
        .then((nextPlan) => {
          const activeUid = String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
          if (planRefreshIdRef.current !== refreshId || activeUid !== uid) return;
          writeTaskTimerPlanToStorage(nextPlan, { uid });
          markPlanConfirmed(nextPlan, uid);
          if (nextPlan === "plus") {
            void loadUserSubscriptionRenewalAtMs(uid)
              .then((renewalAtMs) => markPlanRenewal(renewalAtMs, uid))
              .catch(() => markPlanRenewal(null, uid));
          }
          void syncCurrentUserPlanCache(uid).catch(() => {
            // The profile row already reflects the direct user-root plan read.
          });
        })
        .catch(() => syncCurrentUserPlanCache(uid))
        .then((nextPlan) => {
          const activeUid = String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
          if (planRefreshIdRef.current !== refreshId || activeUid !== uid) return;
          if (nextPlan) {
            markPlanConfirmed(nextPlan, uid);
            if (nextPlan === "plus") {
              void loadUserSubscriptionRenewalAtMs(uid)
                .then((renewalAtMs) => markPlanRenewal(renewalAtMs, uid))
                .catch(() => markPlanRenewal(null, uid));
            }
          }
        })
        .catch(() => {
          const activeUid = String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
          if (planRefreshIdRef.current !== refreshId || activeUid !== uid) return;
          pendingPlanRefreshRef.current = false;
          setAuthPlan(lastConfirmedPlanUidRef.current === uid ? lastConfirmedPlanRef.current : fallbackPlan);
          setAuthPlanStatus("confirmed");
          setAuthPlanIsProvisional(false);
        });
    },
    [markPlanConfirmed, markPlanRenewal]
  );

  const markSynced = useCallback((message = "Cloud data connected.") => {
    setSyncState("synced");
    setSyncMessage(message);
    setSyncAtMs(Date.now());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncPlanFromStorage = () => {
      const activeUid = String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
      const cached = readTaskTimerPlanCacheFromStorage();
      if (!activeUid) {
        markPlanConfirmed("free", null);
        setAuthPlanRenewalAtMs(null);
        return;
      }
      if (!cached.uid || cached.uid !== activeUid) return;
      if (pendingPlanRefreshRef.current) return;
      markPlanConfirmed(cached.plan, activeUid);
    };
    syncPlanFromStorage();
    window.addEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncPlanFromStorage as EventListener);
    return () => window.removeEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncPlanFromStorage as EventListener);
  }, [markPlanConfirmed]);

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) {
      setAuthProfileReady(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      planRefreshIdRef.current += 1;
      const uid = String(user?.uid || "").trim();
      const isAnonymous = !!user?.isAnonymous;
      const isNewUser = uid !== loadedAliasUidRef.current;
      if (isNewUser) setAuthProfileReady(false);
      setAuthUserEmail(user?.email || null);
      setAuthUserUid(user?.uid || null);
      setAuthIsAnonymous(isAnonymous);
      if (isNewUser) {
        setAuthUserAlias("");
        setAuthUserAliasDraft("");
        setAuthUserAliasEditing(false);
        setAuthUserAliasBusy(false);
      }
      setAuthMemberSince(user?.metadata?.creationTime || null);

      const providerIds = new Set((user?.providerData || []).map((provider) => String(provider?.providerId || "")));
      const hasGoogleProvider = providerIds.has("google.com");
      const googleProviderProfile = (user?.providerData || []).find((provider) => String(provider?.providerId || "") === "google.com");
      const googlePhotoCandidate = String(user?.photoURL || googleProviderProfile?.photoURL || "").trim();

      setAuthHasGoogleProvider(hasGoogleProvider);
      setAuthGooglePhotoUrl(hasGoogleProvider && googlePhotoCandidate ? googlePhotoCandidate : null);

      if (user?.uid) {
        const cachedPlan = readTaskTimerPlanFromStorage();
        const hasConfirmedPlanForUid = lastConfirmedPlanUidRef.current === uid;
        const retainedPlan = hasConfirmedPlanForUid ? lastConfirmedPlanRef.current : cachedPlan;
        beginPlanRefresh(uid, retainedPlan, !hasConfirmedPlanForUid);
        if (!isAnonymous) {
          void saveUserDocPatch(user.uid, {
            email: user.email || "",
            displayName: user.displayName || null,
            googlePhotoUrl: hasGoogleProvider && googlePhotoCandidate ? googlePhotoCandidate : null,
          }).catch(() => {});
        }
        if (loadedAliasUidRef.current === uid) setAuthProfileReady(true);
        markSynced("Cloud data connected.");
      } else {
        pendingPlanRefreshRef.current = false;
        markPlanConfirmed("free", null);
        setAuthPlanRenewalAtMs(null);
        setSyncState("idle");
        setSyncMessage("Sign in to sync preferences.");
        setSyncAtMs(null);
        loadedAliasUidRef.current = null;
        setAuthProfileReady(true);
      }
    });
    return () => unsubscribe();
  }, [beginPlanRefresh, markPlanConfirmed, markSynced]);

  useEffect(() => {
    if (!authUserUid || authIsAnonymous) {
      setAuthUserAlias("");
      setAuthUserAliasDraft("");
      loadedAliasUidRef.current = authUserUid && authIsAnonymous ? authUserUid : null;
      setAuthProfileReady(true);
      return;
    }
    let cancelled = false;
    const isInitialAliasLoad = loadedAliasUidRef.current !== authUserUid;
    if (isInitialAliasLoad) setAuthProfileReady(false);
    const loadUsername = async () => {
      try {
        const claimedUsername = await loadClaimedUsername(authUserUid);
        if (cancelled) return;
        if (claimedUsername) {
          setAuthUserAlias(claimedUsername);
          setAuthUserAliasDraft((prev) => (authUserAliasEditing ? prev : claimedUsername));
        }
      } catch {
        // Keep the username field empty when the claimed username cannot be loaded.
      } finally {
        if (!cancelled) {
          loadedAliasUidRef.current = authUserUid;
          setAuthProfileReady(true);
        }
      }
    };
    void loadUsername();
    return () => {
      cancelled = true;
    };
  }, [authIsAnonymous, authUserUid, authUserAliasEditing]);

  useEffect(() => {
    if (authUserAliasEditing) return;
    setAuthUserAliasDraft(authUserAlias);
  }, [authUserAlias, authUserAliasEditing]);

  const onDeleteAccount = useCallback(async () => {
    const auth = getFirebaseAuthClient();
    const user = auth?.currentUser || null;
    if (!user) {
      setAuthError("You must be signed in to delete your account.");
      setAuthStatus("");
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("Deleting account...");
    try {
      await handleDeleteAccountFlow(user);
    } catch (err: unknown) {
      setShowDeleteAccountConfirm(true);
      setAuthError(getErrorMessage(err, "Could not delete account."));
      setAuthStatus("");
      setAuthBusy(false);
    }
  }, []);

  const onCopyUid = useCallback(async () => {
    if (!authUserUid) return;
    try {
      await navigator.clipboard.writeText(authUserUid);
      setUidCopyStatus("Copied");
      window.setTimeout(() => setUidCopyStatus(""), 1200);
    } catch {
      setUidCopyStatus("Copy failed");
      window.setTimeout(() => setUidCopyStatus(""), 1500);
    }
  }, [authUserUid]);

  const onSaveAlias = useCallback(async () => {
    const auth = getFirebaseAuthClient();
    const user = auth?.currentUser || null;
    const uid = String(user?.uid || authUserUid || "").trim();
    if (!user || !uid) {
      setAuthError("Sign in is required to update your username.");
      setAuthStatus("");
      return;
    }
    if (user.isAnonymous || authIsAnonymous) {
      setAuthError("Sign in with Google or email before setting a public username.");
      setAuthStatus("");
      return;
    }

    setAuthUserAliasBusy(true);
    setAuthError("");
    setAuthStatus("");
    try {
      const result = await updateAliasFlow(uid, authUserAlias, authUserAliasDraft);
      if (!result.changed) {
        setAuthUserAliasEditing(false);
        return;
      }
      await syncOwnFriendshipProfile(uid, { alias: result.username });
      setAuthUserAlias(result.username);
      setAuthUserAliasDraft(result.username);
      setAuthUserAliasEditing(false);
      notifyAccountProfileUpdated();
      setAuthStatus("Username updated.");
      markSynced();
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Unable to update username right now."));
      setAuthStatus("");
    } finally {
      setAuthUserAliasBusy(false);
    }
  }, [authIsAnonymous, authUserAlias, authUserAliasDraft, authUserUid, markSynced]);

  const onStartNativePlusCheckout = useCallback(async (offer: TaskTimerPaidOffer) => {
    const auth = getFirebaseAuthClient();
    const currentUser = auth?.currentUser || null;
    const uid = String(currentUser?.uid || "").trim();
    if (!uid || nativePlusCheckoutBusy) return;

    setNativePlusCheckoutBusy(true);
    setNativePlusCheckoutError("");
    setAuthError("");
    setAuthStatus("");
    try {
      const idToken = await currentUser?.getIdToken();
      if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
      const checkoutApiUrl = getApiUrl("/api/stripe/create-checkout-session/");
      logNativePlusCheckout("Starting native checkout", {
        checkoutApiUrl,
        hasBrowserPlugin: typeof Browser?.open === "function",
        nativeCheckoutReturnPath,
        sourcePage: nativeCheckoutReturnPath === "/account" ? "account" : "settings",
        offer,
        uid,
      });
      const res = await fetch(checkoutApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
        body: JSON.stringify({
          uid,
          offer,
          returnTarget: "native",
          successReturnPath: nativeCheckoutReturnPath,
          cancelReturnPath: nativeCheckoutReturnPath,
        }),
      });
      const data = await readApiJson<{ url?: string; error?: string }>(res, "Could not start checkout.");
      logNativePlusCheckout("Checkout session response received", {
        hasCheckoutUrl: Boolean(data.url),
        responseOk: res.ok,
        status: res.status,
        statusText: res.statusText,
      });
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start checkout.");
      }
      logNativePlusCheckout("Opening Stripe checkout", {
        checkoutUrl: data.url,
      });
      try {
        await Browser.open({ url: data.url });
        logNativePlusCheckout("Stripe checkout opened with Capacitor Browser");
      } catch (browserError) {
        warnNativePlusCheckout("Capacitor Browser.open failed; falling back to window.location.assign", {
          browserError: describeCheckoutError(browserError),
          checkoutUrl: data.url,
        });
        window.location.assign(data.url);
        logNativePlusCheckout("Fallback navigation dispatched", {
          checkoutUrl: data.url,
        });
      }
    } catch (err: unknown) {
      warnNativePlusCheckout("Native checkout failed", {
        error: describeCheckoutError(err),
        nativeCheckoutReturnPath,
        offer,
        sourcePage: nativeCheckoutReturnPath === "/account" ? "account" : "settings",
      });
      void recordNonFatal(err, {
        flow: "billing_checkout",
        source_page: nativeCheckoutReturnPath === "/account" ? "account" : "settings",
      });
      setNativePlusCheckoutError(getErrorMessage(err, "Could not start checkout."));
      setNativePlusCheckoutBusy(false);
    }
  }, [nativeCheckoutReturnPath, nativePlusCheckoutBusy]);

  const onOpenPlanAction = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (authPlan === "plus") {
      setAuthError("");
      setAuthStatus("");
      const auth = getFirebaseAuthClient();
      const currentUser = auth?.currentUser || null;
      if (!currentUser) {
        setAuthError("Please sign in again to manage your subscription.");
        return;
      }
      const uid = String(currentUser?.uid || "").trim();
      if (!uid) {
        setAuthError("Please sign in again to manage your subscription.");
        return;
      }
      try {
        const idToken = await currentUser.getIdToken();
        if (!idToken) throw new Error("Your sign-in session is no longer valid. Please sign in again.");
        const res = await fetch(getApiUrl("/api/stripe/create-billing-portal-session/"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-firebase-auth": idToken },
          body: JSON.stringify({
            uid,
            returnPath: nativeCheckoutReturnPath,
          }),
        });
        const data = await readApiJson<{ url?: string; error?: string }>(res, "Could not open billing management.");
        if (!res.ok || !data.url) {
          throw new Error(data.error || "Could not open billing management.");
        }
        try {
          await Browser.open({ url: data.url });
        } catch {
          window.location.assign(data.url);
        }
      } catch (error: unknown) {
        void recordNonFatal(error, {
          flow: "billing_portal",
          source_page: nativeCheckoutReturnPath === "/account" ? "account" : "settings",
        });
        setAuthError(getErrorMessage(error, "Could not open billing management."));
      }
      return;
    }

    setNativePlusCheckoutError("");
    setNativePlusCheckoutOffer("plus_monthly");
    setShowNativePlusUpsellModal(true);
  }, [authPlan, nativeCheckoutReturnPath]);

  return {
    account: {
      authStatus,
      authError,
      authBusy,
      authProfileReady,
      authPlan,
      authPlanStatus,
      authPlanIsProvisional,
      authPlanRenewalAtMs,
      authUserEmail,
      authUserUid,
      authIsAnonymous,
      authUserAlias,
      authUserAliasDraft,
      authUserAliasEditing,
      authUserAliasBusy,
      authMemberSince,
      authHasGoogleProvider,
      authGooglePhotoUrl,
      syncState,
      syncMessage,
      syncAtMs,
      uidCopyStatus,
      showDeleteAccountConfirm,
      showNativePlusUpsellModal,
      nativePlusCheckoutBusy,
      nativePlusCheckoutError,
      nativePlusCheckoutOffer,
      setShowDeleteAccountConfirm,
      setShowNativePlusUpsellModal: (open) => {
        setShowNativePlusUpsellModal(open);
        if (open) return;
        setNativePlusCheckoutError("");
        setNativePlusCheckoutBusy(false);
        setNativePlusCheckoutOffer("plus_monthly");
      },
      onDeleteAccount,
      onCopyUid,
      onStartAliasEdit: () => {
        setAuthUserAliasDraft(authUserAlias);
        setAuthUserAliasEditing(true);
        setAuthError("");
        setAuthStatus("");
      },
      onCancelAliasEdit: () => {
        setAuthUserAliasDraft(authUserAlias);
        setAuthUserAliasEditing(false);
        setAuthUserAliasBusy(false);
      },
      onSaveAlias,
      onAliasDraftChange: setAuthUserAliasDraft,
      onOpenPlanAction,
      onSelectNativePlusCheckoutOffer: setNativePlusCheckoutOffer,
      onStartNativePlusCheckout,
    },
    authUserUid,
    authUserEmail,
    authIsAnonymous,
    authHasGoogleProvider,
    authGooglePhotoUrl,
    setAuthError,
    setAuthStatus,
    markSynced,
  };
}
