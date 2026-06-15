"use client";

export const ACCOUNT_DELETION_REDIRECT_INTENT_KEY = "taskticker_tasks_v1:accountDeletionRedirectToLanding";
const ACCOUNT_DELETION_REDIRECT_INTENT_VALUE = "1";

export function markAccountDeletionLandingRedirectIntent() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ACCOUNT_DELETION_REDIRECT_INTENT_KEY, ACCOUNT_DELETION_REDIRECT_INTENT_VALUE);
  } catch {
    // Ignore storage failures; the delete flow still performs its explicit landing redirect.
  }
}

export function consumeAccountDeletionLandingRedirectIntent() {
  if (typeof window === "undefined") return false;
  try {
    const hasIntent = window.sessionStorage.getItem(ACCOUNT_DELETION_REDIRECT_INTENT_KEY) === ACCOUNT_DELETION_REDIRECT_INTENT_VALUE;
    if (hasIntent) window.sessionStorage.removeItem(ACCOUNT_DELETION_REDIRECT_INTENT_KEY);
    return hasIntent;
  } catch {
    return false;
  }
}
