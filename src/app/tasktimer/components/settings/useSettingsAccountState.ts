"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { syncOwnFriendshipProfile } from "@/app/tasktimer/lib/friendsStore";
import { syncCurrentUserPlanCache } from "@/app/tasktimer/lib/planFunctions";
import { readTaskTimerPlanCacheFromStorage, readTaskTimerPlanFromStorage, TASKTIMER_PLAN_CHANGED_EVENT } from "@/app/tasktimer/lib/entitlements";
import {
  getErrorMessage,
  handleDeleteAccountFlow,
  handleSignOutFlow,
  loadClaimedUsername,
  resumePendingDeleteFlow,
  saveUserDocPatch,
  updateAliasFlow,
} from "./settingsAccountService";
import type { SettingsAccountViewModel } from "./types";

export function useSettingsAccountState(): {
  account: SettingsAccountViewModel;
  authUserUid: string | null;
  authUserEmail: string | null;
  authHasGoogleProvider: boolean;
  authGooglePhotoUrl: string | null;
  setAuthError: (value: string) => void;
  setAuthStatus: (value: string) => void;
  markSynced: (message?: string) => void;
} {
  const initialPlanCache = readTaskTimerPlanCacheFromStorage();
  const [authStatus, setAuthStatus] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authPlan, setAuthPlan] = useState<SettingsAccountViewModel["authPlan"]>(() => readTaskTimerPlanFromStorage());
  const [authPlanStatus, setAuthPlanStatus] = useState<SettingsAccountViewModel["authPlanStatus"]>("confirmed");
  const [authPlanIsProvisional, setAuthPlanIsProvisional] = useState(false);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [authUserUid, setAuthUserUid] = useState<string | null>(null);
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
  const lastConfirmedPlanRef = useRef<SettingsAccountViewModel["authPlan"]>(initialPlanCache.plan);
  const lastConfirmedPlanUidRef = useRef<string | null>(initialPlanCache.uid);
  const pendingPlanRefreshRef = useRef(false);
  const planRefreshIdRef = useRef(0);

  const markPlanConfirmed = useCallback((plan: SettingsAccountViewModel["authPlan"], uid: string | null) => {
    lastConfirmedPlanRef.current = plan;
    lastConfirmedPlanUidRef.current = uid;
    pendingPlanRefreshRef.current = false;
    setAuthPlan(plan);
    setAuthPlanStatus("confirmed");
    setAuthPlanIsProvisional(false);
  }, []);

  const beginPlanRefresh = useCallback(
    (uid: string, fallbackPlan: SettingsAccountViewModel["authPlan"], provisional: boolean) => {
      pendingPlanRefreshRef.current = true;
      setAuthPlan(fallbackPlan);
      setAuthPlanStatus("refreshing");
      setAuthPlanIsProvisional(provisional);
      const refreshId = ++planRefreshIdRef.current;
      void syncCurrentUserPlanCache(uid)
        .then((nextPlan) => {
          const activeUid = String(getFirebaseAuthClient()?.currentUser?.uid || "").trim();
          if (planRefreshIdRef.current !== refreshId || activeUid !== uid) return;
          markPlanConfirmed(nextPlan, uid);
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
    [markPlanConfirmed]
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
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      planRefreshIdRef.current += 1;
      setAuthUserEmail(user?.email || null);
      setAuthUserUid(user?.uid || null);
      const nextAlias = (user?.displayName || "").trim();
      setAuthUserAlias(nextAlias);
      setAuthUserAliasDraft(nextAlias);
      setAuthUserAliasEditing(false);
      setAuthUserAliasBusy(false);
      setAuthMemberSince(user?.metadata?.creationTime || null);

      const providerIds = new Set((user?.providerData || []).map((provider) => String(provider?.providerId || "")));
      const hasGoogleProvider = providerIds.has("google.com");
      const googleProviderProfile = (user?.providerData || []).find((provider) => String(provider?.providerId || "") === "google.com");
      const googlePhotoCandidate = String(user?.photoURL || googleProviderProfile?.photoURL || "").trim();

      setAuthHasGoogleProvider(hasGoogleProvider);
      setAuthGooglePhotoUrl(hasGoogleProvider && googlePhotoCandidate ? googlePhotoCandidate : null);

      if (user?.uid) {
        const uid = String(user.uid || "").trim();
        const cachedPlan = readTaskTimerPlanFromStorage();
        const hasConfirmedPlanForUid = lastConfirmedPlanUidRef.current === uid;
        const retainedPlan = hasConfirmedPlanForUid ? lastConfirmedPlanRef.current : cachedPlan;
        beginPlanRefresh(uid, retainedPlan, !hasConfirmedPlanForUid);
        void saveUserDocPatch(user.uid, {
          email: user.email || "",
          displayName: user.displayName || null,
          googlePhotoUrl: hasGoogleProvider && googlePhotoCandidate ? googlePhotoCandidate : null,
        }).catch(() => {});
        markSynced();
      } else {
        pendingPlanRefreshRef.current = false;
        markPlanConfirmed("free", null);
        setSyncState("idle");
        setSyncMessage("Sign in to sync preferences.");
        setSyncAtMs(null);
      }
    });
    return () => unsubscribe();
  }, [beginPlanRefresh, markPlanConfirmed, markSynced]);

  useEffect(() => {
    if (!authUserUid) {
      setAuthUserAlias("");
      setAuthUserAliasDraft("");
      return;
    }
    let cancelled = false;
    const loadUsername = async () => {
      try {
        const claimedUsername = await loadClaimedUsername(authUserUid);
        if (!claimedUsername || cancelled) return;
        setAuthUserAlias(claimedUsername);
        setAuthUserAliasDraft((prev) => (authUserAliasEditing ? prev : claimedUsername));
      } catch {
        // Keep auth display-name fallback when cloud username load fails.
      }
    };
    void loadUsername();
    return () => {
      cancelled = true;
    };
  }, [authUserUid, authUserAliasEditing]);

  useEffect(() => {
    if (authUserAliasEditing) return;
    setAuthUserAliasDraft(authUserAlias);
  }, [authUserAlias, authUserAliasEditing]);

  useEffect(() => {
    if (typeof window === "undefined" || !authUserUid) return;
    let cancelled = false;
    const resumePendingDelete = async () => {
      try {
        const result = await resumePendingDeleteFlow(authUserUid);
        if (cancelled || !result.resumed) return;
        setShowDeleteAccountConfirm(false);
        if (result.error) {
          setAuthError(result.error);
          setAuthStatus("");
          return;
        }
        setAuthStatus("Re-authentication complete. Deleting account...");
        setAuthError("");
      } catch (err: unknown) {
        if (cancelled) return;
        setAuthError(getErrorMessage(err, "Could not complete Google re-authentication for account deletion."));
        setAuthStatus("");
      }
    };
    void resumePendingDelete();
    return () => {
      cancelled = true;
    };
  }, [authUserUid]);

  const onSignOut = useCallback(async () => {
    setAuthBusy(true);
    setAuthError("");
    setAuthStatus("");
    try {
      await handleSignOutFlow();
      setAuthStatus("Signed out.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not sign out."));
    } finally {
      setAuthBusy(false);
    }
  }, []);

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
    setShowDeleteAccountConfirm(false);
    try {
      await handleDeleteAccountFlow(user);
      setAuthStatus("Account deleted.");
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Could not delete account."));
      setAuthStatus("");
    } finally {
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
      setAuthStatus("Username updated.");
      markSynced();
    } catch (err: unknown) {
      setAuthError(getErrorMessage(err, "Unable to update username right now."));
      setAuthStatus("");
    } finally {
      setAuthUserAliasBusy(false);
    }
  }, [authUserAlias, authUserAliasDraft, authUserUid, markSynced]);

  return {
    account: {
      authStatus,
      authError,
      authBusy,
      authPlan,
      authPlanStatus,
      authPlanIsProvisional,
      authUserEmail,
      authUserUid,
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
      setShowDeleteAccountConfirm,
      onSignOut,
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
    },
    authUserUid,
    authUserEmail,
    authHasGoogleProvider,
    authGooglePhotoUrl,
    setAuthError,
    setAuthStatus,
    markSynced,
  };
}
