"use client";

import { useCallback, useEffect, useState } from "react";
import { handleSignOutFlow, syncLocalProfileDataToCloud, type ProfileSyncResult } from "./settingsAccountService";

type SharedProfileSessionActionState = {
  syncBusy: boolean;
  signOutBusy: boolean;
};

const listeners = new Set<() => void>();

let sharedState: SharedProfileSessionActionState = {
  syncBusy: false,
  signOutBusy: false,
};

let syncPromise: Promise<ProfileSyncResult> | null = null;
let signOutPromise: Promise<void> | null = null;

function emitSharedState() {
  listeners.forEach((listener) => listener());
}

function setSharedState(next: Partial<SharedProfileSessionActionState>) {
  sharedState = {
    ...sharedState,
    ...next,
  };
  emitSharedState();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SharedProfileSessionActionState {
  return sharedState;
}

export function useSharedProfileSessionActions() {
  const [snapshot, setSnapshot] = useState<SharedProfileSessionActionState>(() => getSnapshot());

  useEffect(() => subscribe(() => setSnapshot(getSnapshot())), []);

  const runSync = useCallback(() => {
    if (signOutPromise) return Promise.reject(new Error("Please wait for sign-out to finish before syncing again."));
    if (syncPromise) return syncPromise;
    setSharedState({ syncBusy: true });
    syncPromise = syncLocalProfileDataToCloud().finally(() => {
      syncPromise = null;
      setSharedState({ syncBusy: false });
    });
    return syncPromise;
  }, []);

  const runSignOut = useCallback(() => {
    if (syncPromise) return Promise.reject(new Error("Please wait for the current sync to finish before signing out."));
    if (signOutPromise) return signOutPromise;
    setSharedState({ signOutBusy: true });
    signOutPromise = handleSignOutFlow().finally(() => {
      signOutPromise = null;
      setSharedState({ signOutBusy: false });
    });
    return signOutPromise;
  }, []);

  return {
    syncBusy: snapshot.syncBusy,
    signOutBusy: snapshot.signOutBusy,
    actionBusy: snapshot.syncBusy || snapshot.signOutBusy,
    runSync,
    runSignOut,
  };
}
