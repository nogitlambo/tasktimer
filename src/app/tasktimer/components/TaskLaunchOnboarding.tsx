"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";

import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { AVATAR_CATALOG, type AvatarOption } from "../lib/avatarCatalog";
import { syncOwnFriendshipProfile } from "../lib/friendsStore";
import { normalizeDashboardWeekStart, type DashboardWeekStart } from "../lib/historyChart";
import {
  TASKTIMER_ONBOARDING_DEFAULT_END_TIME,
  TASKTIMER_ONBOARDING_DEFAULT_START_TIME,
  buildTaskTimerOnboardingPreferenceDraft,
  consumePendingEmailLinkOnboardingHint,
  loadRemoteTaskTimerOnboardingState,
  loadTaskTimerOnboardingPreferencePresence,
  readLocalTaskTimerOnboardingNewUserHint,
  readLocalTaskTimerOnboardingState,
  saveTaskTimerOnboardingState,
  shouldAutoOpenTaskTimerOnboarding,
  type TaskTimerOnboardingPreferencePresence,
} from "../lib/onboarding";
import type { UserPreferencesV1 } from "../lib/cloudStore";
import { DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS, OPTIMAL_PRODUCTIVITY_DAY_LABELS, normalizeTimeOfDay } from "../lib/productivityPeriod";
import {
  ACCOUNT_PROFILE_UPDATED_EVENT,
  notifyAccountAvatarUpdated,
  notifyAccountProfileUpdated,
  readStoredAvatarId,
  writeStoredAvatarId,
} from "../lib/accountProfileStorage";
import {
  TASKTIMER_OPEN_ONBOARDING_EVENT,
  resolveOnboardingPreferenceError,
  saveOnboardingPreferencesViaRuntime,
} from "../client/onboarding-events";
import { getErrorMessage, loadClaimedUsername, saveUserDocPatch, updateAliasFlow } from "./settings/settingsAccountService";

type TaskLaunchOnboardingProps = {
  preferences: UserPreferencesV1 | null;
};

type StepKey = "username" | "intro" | "days" | "hours" | "push" | "weekStart";
type OnboardingTimeField = "start" | "end";

export const ONBOARDING_CHRONOTYPE_INTRO =
  "Most productivity tools organize your time. TaskLaunch goes a step further by using chronotype alignment to help you match demanding work with your peak focus periods, so you can achieve more with less mental strain.";

export const ONBOARDING_STEPS: ReadonlyArray<{ key: StepKey; title: string }> = [
  { key: "username", title: "Username" },
  { key: "intro", title: "Chronotype Alignment" },
  { key: "days", title: "Productivity Days" },
  { key: "hours", title: "Productivity Hours" },
  { key: "weekStart", title: "Week Start" },
  { key: "push", title: "Notifications" },
];

const WEEK_START_OPTIONS: ReadonlyArray<{ value: DashboardWeekStart; label: string }> = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];

const PRODUCTIVITY_DAY_PILL_ROWS: ReadonlyArray<ReadonlyArray<DashboardWeekStart>> = [
  ["mon", "tue", "wed", "thu", "fri"],
  ["sat", "sun"],
];

const PRODUCTIVITY_DAY_LABELS = new Map(
  OPTIMAL_PRODUCTIVITY_DAY_LABELS.map((day) => [normalizeDashboardWeekStart(day.value), day.label.slice(0, 3).toUpperCase()] as const)
);
const USERNAME_TAKEN_ERROR_MESSAGE = "That username is already taken.";
export const ONBOARDING_USERNAME_TAKEN_INLINE_MESSAGE = "That username is already taken. Try another one.";
const ONBOARDING_USERNAME_ERROR_ID = "onboardingUsernameError";

export function isOnboardingUsernameTakenError(message: unknown) {
  return String(message || "").trim() === USERNAME_TAKEN_ERROR_MESSAGE;
}

export function resolveOnboardingAvatarId(
  savedAvatarId: unknown,
  avatars: ReadonlyArray<Pick<AvatarOption, "id">>,
  randomValue = Math.random()
) {
  if (!avatars.length) return "";
  const saved = String(savedAvatarId || "").trim();
  if (saved && avatars.some((avatar) => avatar.id === saved)) return saved;
  const index = Math.max(0, Math.min(avatars.length - 1, Math.floor(Math.max(0, Math.min(0.999999, randomValue)) * avatars.length)));
  return avatars[index]?.id || avatars[0]?.id || "";
}

export function onboardingAvatarProfilePatch(avatarId: string) {
  return {
    avatarId,
    avatarCustomSrc: null,
  };
}

export function normalizeOnboardingProductivityDays(value: unknown): DashboardWeekStart[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? String(value).split(",") : [];
  const seen = new Set<DashboardWeekStart>();
  for (const entry of source) {
    const day = normalizeDashboardWeekStart(entry);
    if (String(entry || "").trim().toLowerCase() === day) seen.add(day);
  }
  return DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.filter((day) => seen.has(day));
}

export function canContinueOnboardingStep(step: StepKey, selectedDays: ReadonlyArray<DashboardWeekStart>) {
  return step !== "days" || selectedDays.length > 0;
}

function stepIntro(step: StepKey, isNativeRuntime: boolean) {
  if (step === "username") return "Confirm the username people will see in TaskLaunch social surfaces.";
  if (step === "intro") return ONBOARDING_CHRONOTYPE_INTRO;
  if (step === "days") return "Choose the days that count toward your productivity streaks, rewards, and dashboard insights.";
  if (step === "hours") return "Set the time block when you are usually at your best.";
  if (step === "weekStart") return "Choose which day your week starts on.";
  void isNativeRuntime;
  return "To receive task reminders and alerts, please enable push notifications.";
}

function alertUsernameError(message: string) {
  if (typeof window !== "undefined") window.alert(message);
}

export function onboardingTitle(step: StepKey, username: string) {
  if (step === "username") return "Welcome";
  if (step === "intro") return `Good to meet you, ${username}!`;
  return ONBOARDING_STEPS.find((item) => item.key === step)?.title || "TaskLaunch Setup";
}

export function formatOnboardingClockTimeLabel(value: unknown, fallback: string) {
  const normalized = normalizeTimeOfDay(value, fallback);
  const [hourRaw, minuteRaw] = normalized.split(":");
  const hour24 = Math.max(0, Math.min(23, Number(hourRaw || 0)));
  const hour12 = hour24 % 12 || 12;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  return `${hour12}:${String(Number(minuteRaw || 0)).padStart(2, "0")} ${meridiem}`;
}

export function onboardingStepPreferencePayload(input: {
  step: StepKey;
  weekStarting: DashboardWeekStart;
  selectedDays: ReadonlyArray<DashboardWeekStart>;
  startTime: string;
  endTime: string;
  pushEnabled: boolean;
  pushTouched: boolean;
}) {
  if (input.step === "days") {
    return {
      optimalProductivityDays: Array.from(input.selectedDays),
    };
  }
  if (input.step === "hours") {
    return {
      optimalProductivityStartTime: input.startTime,
      optimalProductivityEndTime: input.endTime,
    };
  }
  if (input.step === "push") {
    return input.pushTouched ? { pushNotificationsEnabled: input.pushEnabled } : null;
  }
  if (input.step === "weekStart") {
    return {
      weekStarting: input.weekStarting,
    };
  }
  return null;
}

export function isOnboardingFinishDisabled(busy: boolean) {
  return busy;
}

export default function TaskLaunchOnboarding({ preferences }: TaskLaunchOnboardingProps) {
  const [uid, setUid] = useState("");
  const [username, setUsername] = useState("");
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [selectedAvatarId, setSelectedAvatarId] = useState("");
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [usernameConfirmedAtMs, setUsernameConfirmedAtMs] = useState<number | null>(null);
  const [weekStarting, setWeekStarting] = useState<DashboardWeekStart>("mon");
  const [productivityDays, setProductivityDays] = useState<DashboardWeekStart[]>([]);
  const [startTime, setStartTime] = useState(TASKTIMER_ONBOARDING_DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(TASKTIMER_ONBOARDING_DEFAULT_END_TIME);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushTouched, setPushTouched] = useState(false);
  const [weekStartDropdownOpen, setWeekStartDropdownOpen] = useState(false);
  const [visibleTimeFallback, setVisibleTimeFallback] = useState<OnboardingTimeField | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [usernameInlineError, setUsernameInlineError] = useState("");
  const openRef = useRef(false);
  const avatarSavePromiseRef = useRef<Promise<void> | null>(null);
  const profileSyncPromiseRef = useRef<Promise<void> | null>(null);
  const weekStartDropdownRef = useRef<HTMLDivElement | null>(null);
  const startTimeInputRef = useRef<HTMLInputElement | null>(null);
  const endTimeInputRef = useRef<HTMLInputElement | null>(null);

  const activeStep = ONBOARDING_STEPS[stepIndex]?.key || "username";
  const isNativeRuntime = isNativeOrFileRuntime();
  const usernameValidation = usernameDraft.trim() ? validateUsername(usernameDraft) : "Username is required.";
  const usernameConfirmed = !!usernameConfirmedAtMs && normalizeUsername(usernameDraft) === normalizeUsername(username);
  const selectedDays = useMemo(() => normalizeOnboardingProductivityDays(productivityDays), [productivityDays]);
  const selectedWeekStartOption = WEEK_START_OPTIONS.find((option) => option.value === weekStarting) ?? WEEK_START_OPTIONS[0];
  const onboardingHeadingText = onboardingTitle(activeStep, username || normalizeUsername(usernameDraft) || "there");
  const selectedAvatar = AVATAR_CATALOG.find((avatar) => avatar.id === selectedAvatarId) || AVATAR_CATALOG[0] || null;

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!weekStartDropdownOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const dropdown = weekStartDropdownRef.current;
      if (!dropdown || !(event.target instanceof Node) || dropdown.contains(event.target)) return;
      setWeekStartDropdownOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
    };
  }, [weekStartDropdownOpen]);

  useEffect(() => {
    if (activeStep !== "weekStart") setWeekStartDropdownOpen(false);
    if (activeStep !== "hours") setVisibleTimeFallback(null);
    if (activeStep !== "username") setAvatarPickerOpen(false);
  }, [activeStep]);

  const resetDrafts = useCallback(
    (nextUid: string, nextUsername: string, nextPresence: TaskTimerOnboardingPreferencePresence | null) => {
      const normalizedUsername = normalizeUsername(nextUsername);
      const preferenceDraft = buildTaskTimerOnboardingPreferenceDraft(preferences, nextPresence);
      const nextAvatarId = resolveOnboardingAvatarId(readStoredAvatarId(nextUid), AVATAR_CATALOG);
      setUsername(normalizedUsername);
      setUsernameDraft(normalizedUsername);
      setSelectedAvatarId(nextAvatarId);
      setAvatarPickerOpen(false);
      setUsernameConfirmedAtMs(null);
      setWeekStarting(preferenceDraft.weekStarting);
      setProductivityDays(normalizeOnboardingProductivityDays(preferenceDraft.optimalProductivityDays));
      setStartTime(preferenceDraft.optimalProductivityStartTime);
      setEndTime(preferenceDraft.optimalProductivityEndTime);
      setPushEnabled(isNativeRuntime ? !!preferences?.mobilePushAlertsEnabled : !!preferences?.webPushAlertsEnabled);
      setPushTouched(false);
      setStepIndex(0);
      setStatus("");
      setError("");
      setUsernameInlineError("");
      avatarSavePromiseRef.current = null;
      profileSyncPromiseRef.current = null;
    },
    [isNativeRuntime, preferences]
  );

  const refreshForUser = useCallback(
    async (user: User | null, options?: { forceOpen?: boolean }) => {
      const nextUid = String(user?.uid || "").trim();
      setUid(nextUid);
      if (!nextUid || user?.isAnonymous) {
        setOpen(false);
        setUsername("");
        return;
      }

      const localState = readLocalTaskTimerOnboardingState(nextUid);
      const newUserHint = readLocalTaskTimerOnboardingNewUserHint(nextUid) || consumePendingEmailLinkOnboardingHint(nextUid);

      const [remoteState, nextPresence, claimedUsername] = await Promise.all([
        loadRemoteTaskTimerOnboardingState(nextUid).catch(() => localState),
        loadTaskTimerOnboardingPreferencePresence(nextUid).catch(() => null),
        loadClaimedUsername(nextUid).catch(() => ""),
      ]);

      setUsername(normalizeUsername(claimedUsername));

      if (options?.forceOpen) {
        resetDrafts(nextUid, claimedUsername, nextPresence);
        setOpen(true);
        return;
      }

      const shouldOpen = shouldAutoOpenTaskTimerOnboarding({
        uid: nextUid,
        username: claimedUsername,
        state: remoteState || localState || null,
        preferencePresence: nextPresence,
        newUserHint,
      });
      if (shouldOpen && !openRef.current) {
        resetDrafts(nextUid, claimedUsername, nextPresence);
        setOpen(true);
      }
    },
    [resetDrafts]
  );

  useEffect(() => {
    const auth = getFirebaseAuthClient();
    if (!auth) return;
    let cancelled = false;
    const runRefresh = (user: User | null, options?: { forceOpen?: boolean }) => {
      void refreshForUser(user, options).catch(() => {
        if (!cancelled) setError("Could not load onboarding state.");
      });
    };
    const unsubscribe = onAuthStateChanged(auth, (user) => runRefresh(user));
    const openOnboarding = () => runRefresh(auth.currentUser, { forceOpen: true });
    const refreshProfile = () => runRefresh(auth.currentUser);
    window.addEventListener(TASKTIMER_OPEN_ONBOARDING_EVENT, openOnboarding);
    window.addEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, refreshProfile);
    if (auth.currentUser) runRefresh(auth.currentUser);
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener(TASKTIMER_OPEN_ONBOARDING_EVENT, openOnboarding);
      window.removeEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, refreshProfile);
    };
  }, [refreshForUser]);

  const savePreferenceStep = useCallback(
    async (payload: Parameters<typeof saveOnboardingPreferencesViaRuntime>[0]) => {
      setBusy(true);
      setError("");
      try {
        const result = await saveOnboardingPreferencesViaRuntime(payload);
        if (!result.ok) throw new Error(result.error || "Could not save onboarding settings.");
        setStatus("Saved.");
        return true;
      } catch (err: unknown) {
        setError(resolveOnboardingPreferenceError(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const saveSelectedOnboardingAvatar = useCallback(async () => {
    const avatarId = selectedAvatarId || AVATAR_CATALOG[0]?.id || "";
    if (!uid || !avatarId) return;
    const patch = onboardingAvatarProfilePatch(avatarId);
    writeStoredAvatarId(uid, avatarId);
    await saveUserDocPatch(uid, patch);
    await syncOwnFriendshipProfile(uid, patch);
    notifyAccountAvatarUpdated();
  }, [selectedAvatarId, uid]);

  const queueSelectedOnboardingAvatarSave = useCallback(() => {
    const promise = saveSelectedOnboardingAvatar();
    avatarSavePromiseRef.current = promise;
    void promise.catch((err: unknown) => {
      if (avatarSavePromiseRef.current !== promise) return;
      setError(getErrorMessage(err, "Unable to save avatar right now."));
    });
  }, [saveSelectedOnboardingAvatar]);

  const queueOnboardingProfileSync = useCallback((promise: Promise<void>) => {
    profileSyncPromiseRef.current = promise;
    void promise.catch((err: unknown) => {
      if (profileSyncPromiseRef.current !== promise) return;
      setError(getErrorMessage(err, "Unable to sync profile right now."));
    });
  }, []);

  const confirmUsername = useCallback(async () => {
    const nextUsername = usernameDraft.trim();
    const validation = validateUsername(nextUsername);
    if (validation) {
      setError(validation);
      setUsernameInlineError("");
      setUsernameConfirmedAtMs(null);
      alertUsernameError(validation);
      return false;
    }
    if (!uid) {
      const message = "Sign in is required to update your username.";
      setError(message);
      setUsernameInlineError("");
      setUsernameConfirmedAtMs(null);
      alertUsernameError(message);
      return false;
    }

    setBusy(true);
    setError("");
    setUsernameInlineError("");
    setStatus("");
    setUsernameConfirmedAtMs(null);
    try {
      if (normalizeUsername(nextUsername) !== normalizeUsername(username)) {
        const result = await updateAliasFlow(uid, username, nextUsername);
        if (result.changed) {
          setUsername(result.username);
          setUsernameDraft(result.username);
          queueOnboardingProfileSync(syncOwnFriendshipProfile(uid, { alias: result.username }));
          notifyAccountProfileUpdated();
        }
      } else {
        setUsername(normalizeUsername(nextUsername));
        setUsernameDraft(normalizeUsername(nextUsername));
      }
      await saveSelectedOnboardingAvatar();
      const confirmedAtMs = Date.now();
      setUsernameConfirmedAtMs(confirmedAtMs);
      setUsernameInlineError("");
      setStatus("Username confirmed.");
      queueSelectedOnboardingAvatarSave();
      return true;
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Unable to update username right now.");
      setUsernameConfirmedAtMs(null);
      if (isOnboardingUsernameTakenError(message)) {
        setError("");
        setUsernameInlineError(ONBOARDING_USERNAME_TAKEN_INLINE_MESSAGE);
        return false;
      }
      setError(message);
      setUsernameInlineError("");
      alertUsernameError(message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [queueOnboardingProfileSync, queueSelectedOnboardingAvatarSave, saveSelectedOnboardingAvatar, uid, username, usernameDraft]);

  const handlePushToggle = useCallback(
    async (nextEnabled: boolean) => {
      setPushEnabled(nextEnabled);
      setPushTouched(true);
      setBusy(true);
      setError("");
      setStatus("");
      try {
        const result = await saveOnboardingPreferencesViaRuntime({ pushNotificationsEnabled: nextEnabled });
        if (!result.ok) throw new Error(result.error || "Could not update notifications.");
        setPushTouched(false);
        setStatus(nextEnabled ? "Notification preference saved." : "Notifications disabled.");
      } catch (err: unknown) {
        setPushEnabled(!nextEnabled);
        setError(resolveOnboardingPreferenceError(err));
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const saveCurrentStep = useCallback(async () => {
    if (activeStep === "username") return confirmUsername();
    if (!canContinueOnboardingStep(activeStep, selectedDays)) {
      setError("Select at least one productivity day before continuing.");
      return false;
    }
    const preferencePayload = onboardingStepPreferencePayload({
      step: activeStep,
      weekStarting,
      selectedDays,
      startTime,
      endTime,
      pushEnabled,
      pushTouched,
    });
    return preferencePayload ? savePreferenceStep(preferencePayload) : true;
  }, [activeStep, confirmUsername, pushEnabled, pushTouched, savePreferenceStep, selectedDays, startTime, endTime, weekStarting]);

  const closeWithState = useCallback(
    async (nextStatus: "completed" | "dismissed") => {
      if (!uid) return;
      setBusy(true);
      setError("");
      try {
        const next = await saveTaskTimerOnboardingState(uid, {
          onboardingStatus: nextStatus,
          onboardingUsernameConfirmedAtMs: usernameConfirmedAtMs || undefined,
        });
        void next;
        setOpen(false);
      } catch (err: unknown) {
        setError(getErrorMessage(err, "Could not save onboarding state."));
      } finally {
        setBusy(false);
      }
    },
    [uid, usernameConfirmedAtMs]
  );

  const handleNext = useCallback(async () => {
    const saved = await saveCurrentStep();
    if (!saved) return;
    setStepIndex((current) => Math.min(ONBOARDING_STEPS.length - 1, current + 1));
    setStatus("");
  }, [saveCurrentStep]);

  const handleFinish = useCallback(async () => {
    if (!usernameConfirmed) {
      setStepIndex(0);
      setError("Confirm your username before finishing onboarding.");
      return;
    }
    const saved = await saveCurrentStep();
    if (!saved) return;
    await closeWithState("completed");
  }, [closeWithState, saveCurrentStep, usernameConfirmed]);

  const toggleProductivityDay = (day: DashboardWeekStart) => {
    setProductivityDays((current) => {
      const normalized = normalizeOnboardingProductivityDays(current);
      const hasDay = normalized.includes(day);
      const next = hasDay ? normalized.filter((value) => value !== day) : normalized.concat(day);
      return normalizeOnboardingProductivityDays(next);
    });
    setStatus("");
    setError("");
  };

  const selectAllProductivityDays = () => {
    setProductivityDays(Array.from(DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS));
    setStatus("");
    setError("");
  };

  const openClockTimePicker = (field: OnboardingTimeField) => {
    const input = field === "start" ? startTimeInputRef.current : endTimeInputRef.current;
    if (!input) return;
    input.focus();
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof pickerInput.showPicker === "function") {
      try {
        pickerInput.showPicker();
        return;
      } catch {
        // Fall back to the visible native field when browser picker access is blocked.
      }
    }
    setVisibleTimeFallback(field);
    window.setTimeout(() => input.focus(), 0);
  };

  const handleWeekStartDropdownKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      setWeekStartDropdownOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setWeekStartDropdownOpen((open) => !open);
    }
  }, []);

  if (!open) return null;

  return (
    <div className="overlay" id="onboardingOverlay" style={{ display: "flex" }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="TaskLaunch onboarding">
        {activeStep !== "username" ? (
          <button className="onboardingSkipLink" type="button" onClick={() => void closeWithState("dismissed")} disabled={busy}>
            Skip
          </button>
        ) : null}
        {activeStep === "intro" ? (
          <AppImg
            className="onboardingChronotypePreview"
            src="/onboarding/01_onboarding-chronotypes.webp"
            alt="Chronotype alignment preview"
            width={1597}
            height={985}
          />
        ) : null}
        {activeStep !== "username" ? (
          <div className="onboardingStepMeta" aria-label="Onboarding progress">
            Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
          </div>
        ) : null}
        <h2 className="onboardingGreetingTitle" key={`onboarding-heading-${activeStep}`}>
          {onboardingHeadingText}
        </h2>
        <div className="onboardingGreetingDivider" key={`onboarding-divider-${activeStep}`} aria-hidden="true" />
        {activeStep !== "days" ? (
          <p
            className={`modalSubtext${activeStep === "hours" ? " onboardingHoursSubtext" : ""}${
              activeStep === "push" || activeStep === "weekStart" ? " onboardingNotificationsSubtext" : ""
            }${activeStep === "push" ? " onboardingPushSubtext" : ""}${
              activeStep === "weekStart" ? " onboardingWeekStartSubtext" : ""
            }${activeStep === "intro" ? " onboardingIntroSubtext" : ""}${
              activeStep === "username" ? " onboardingUsernameSubtext" : ""
            }`}
            key={`onboarding-subtext-${activeStep}`}
          >
            {activeStep === "username" ? (
              "Please choose an avatar and set a username for your profile:"
            ) : activeStep === "intro" ? (
              <>
                Most productivity tools organize your time. TaskLaunch goes a step further by using{" "}
                <span className="onboardingChronotypeAccent">chronotype alignment</span> to help you match demanding work with your peak focus periods, so you can
                achieve more with less mental strain.
              </>
            ) : (
              stepIntro(activeStep, isNativeRuntime)
            )}
          </p>
        ) : null}

        {activeStep === "username" ? (
          <div className="field modalDropdownField onboardingField onboardingUsernameField">
            <div className="onboardingUsernameRow">
              <button
                className="onboardingAvatarFrameBtn"
                type="button"
                aria-label="Choose avatar"
                aria-expanded={avatarPickerOpen}
                onClick={() => setAvatarPickerOpen((open) => !open)}
              >
                <span className="onboardingAvatarFrame">
                  {selectedAvatar ? <AppImg className="onboardingAvatarImage" src={selectedAvatar.src} alt={`${selectedAvatar.label} avatar`} /> : null}
                </span>
              </button>
              <div className="onboardingUsernameInputStack">
                <input
                  id="onboardingUsernameInput"
                  className="onboardingTextInput"
                  type="text"
                  aria-label="Username"
                  value={usernameDraft}
                  onChange={(event) => {
                    setUsernameDraft(event.target.value);
                    setUsernameConfirmedAtMs(null);
                    setStatus("");
                    setError("");
                    setUsernameInlineError("");
                  }}
                  maxLength={20}
                  aria-describedby={usernameInlineError ? ONBOARDING_USERNAME_ERROR_ID : undefined}
                  aria-invalid={!!usernameValidation || !!usernameInlineError}
                />
                {usernameInlineError ? (
                  <p className="onboardingUsernameInlineError" id={ONBOARDING_USERNAME_ERROR_ID}>
                    {usernameInlineError}
                  </p>
                ) : null}
              </div>
            </div>
            {avatarPickerOpen ? (
              <div className="onboardingAvatarPicker" role="list" aria-label="Available avatars">
                {AVATAR_CATALOG.map((avatar) => (
                  <button
                    className={`onboardingAvatarOption${avatar.id === selectedAvatarId ? " isSelected" : ""}`}
                    type="button"
                    key={avatar.id}
                    aria-label={`Select ${avatar.label} avatar`}
                    aria-pressed={avatar.id === selectedAvatarId}
                    onClick={() => {
                      setSelectedAvatarId(avatar.id);
                      setAvatarPickerOpen(false);
                    }}
                  >
                    <AppImg className="onboardingAvatarOptionImage" src={avatar.src} alt="" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {activeStep === "days" ? (
          <div className="onboardingFieldsGrid">
            <div className="field modalDropdownField onboardingField">
              <div className="onboardingProductivityIntroText">
                <p className="onboardingProductivityDaysHelp">
                  TaskLaunch helps schedule your highest-priority tasks on the days you&apos;re most likely to perform at your best.
                  <br />
                  <span id="onboardingProductivityDaysLabel">Select the day(s) of the week you are the most productive.</span>
                  <br />
                  <span className="onboardingProductivitySettingsNote">
                    You can adjust your productivity days at any time from Settings &gt; Preferences.
                  </span>
                </p>
              </div>
              <div className="onboardingDayGrid" role="group" aria-labelledby="onboardingProductivityDaysLabel">
                {PRODUCTIVITY_DAY_PILL_ROWS.map((row, rowIndex) => (
                  <div className="onboardingDayPillRow" key={`productivity-days-row-${rowIndex}`}>
                    {row.map((value, dayIndex) => {
                      const checked = selectedDays.includes(value);
                      const revealIndex = rowIndex === 0 ? dayIndex : 5 + dayIndex;
                      return (
                        <button
                          className={`onboardingDayPill onboardingDayPillReveal${revealIndex}${checked ? " isSelected" : ""}`}
                          type="button"
                          key={value}
                          aria-pressed={checked}
                          aria-label={`${PRODUCTIVITY_DAY_LABELS.get(value) || value.toUpperCase()} productivity day`}
                          onClick={() => toggleProductivityDay(value)}
                        >
                          {PRODUCTIVITY_DAY_LABELS.get(value) || value.toUpperCase()}
                        </button>
                      );
                    })}
                    {rowIndex === PRODUCTIVITY_DAY_PILL_ROWS.length - 1 ? (
                      <button
                        className={`onboardingDayPill onboardingDayPillReveal7${selectedDays.length === DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.length ? " isSelected" : ""}`}
                        type="button"
                        aria-pressed={selectedDays.length === DEFAULT_OPTIMAL_PRODUCTIVITY_DAYS.length}
                        aria-label="Select all productivity days"
                        onClick={selectAllProductivityDays}
                      >
                        ALL
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeStep === "hours" ? (
          <div className="onboardingTimeGrid onboardingHoursTimeGrid">
            <div className="field modalDropdownField onboardingField">
              <label htmlFor="onboardingStartTimeInput">Start</label>
              <button
                className="onboardingClockButton"
                type="button"
                aria-label={`Choose start time, current ${formatOnboardingClockTimeLabel(startTime, TASKTIMER_ONBOARDING_DEFAULT_START_TIME)}`}
                onClick={() => openClockTimePicker("start")}
              >
                <span className="onboardingClockValue">{formatOnboardingClockTimeLabel(startTime, TASKTIMER_ONBOARDING_DEFAULT_START_TIME)}</span>
              </button>
              <input
                id="onboardingStartTimeInput"
                ref={startTimeInputRef}
                className={`onboardingTextInput onboardingClockNativeInput${visibleTimeFallback === "start" ? " isFallbackVisible" : ""}`}
                type="time"
                value={startTime}
                onChange={(event) => {
                  setStartTime(normalizeTimeOfDay(event.target.value, TASKTIMER_ONBOARDING_DEFAULT_START_TIME));
                  setStatus("");
                  setError("");
                }}
              />
            </div>
            <div className="field modalDropdownField onboardingField">
              <label htmlFor="onboardingEndTimeInput">End</label>
              <button
                className="onboardingClockButton"
                type="button"
                aria-label={`Choose end time, current ${formatOnboardingClockTimeLabel(endTime, TASKTIMER_ONBOARDING_DEFAULT_END_TIME)}`}
                onClick={() => openClockTimePicker("end")}
              >
                <span className="onboardingClockValue">{formatOnboardingClockTimeLabel(endTime, TASKTIMER_ONBOARDING_DEFAULT_END_TIME)}</span>
              </button>
              <input
                id="onboardingEndTimeInput"
                ref={endTimeInputRef}
                className={`onboardingTextInput onboardingClockNativeInput${visibleTimeFallback === "end" ? " isFallbackVisible" : ""}`}
                type="time"
                value={endTime}
                onChange={(event) => {
                  setEndTime(normalizeTimeOfDay(event.target.value, TASKTIMER_ONBOARDING_DEFAULT_END_TIME));
                  setStatus("");
                  setError("");
                }}
              />
            </div>
          </div>
        ) : null}

        {activeStep === "push" ? (
          <div className="onboardingFieldsGrid">
            <div className={`chkRow modalCheckboxRow onboardingPushRow${pushEnabled ? " isPushEnabled" : ""}`}>
              <input
                id="onboardingPushToggle"
                type="checkbox"
                checked={pushEnabled}
                disabled={busy}
                onChange={(event) => void handlePushToggle(event.target.checked)}
              />
              <div className="modalCheckboxText">
                <label className={`onboardingPushLabel${pushEnabled ? " isPushEnabled" : ""}`} htmlFor="onboardingPushToggle">
                  Enable push notifications
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {activeStep === "weekStart" ? (
          <div className="onboardingFieldsGrid">
            <div className="field modalDropdownField onboardingField">
              <label htmlFor="onboardingWeekStartSelect">Which day do you want your week to start on?</label>
              <div className="modalDropdown" ref={weekStartDropdownRef}>
                <button
                  className="modalDropdownButton"
                  id="onboardingWeekStartSelect"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={weekStartDropdownOpen}
                  aria-controls="onboardingWeekStartSelectList"
                  onClick={() => setWeekStartDropdownOpen((open) => !open)}
                  onKeyDown={handleWeekStartDropdownKeyDown}
                >
                  <span>{selectedWeekStartOption.label}</span>
                  <span aria-hidden="true">v</span>
                </button>
                {weekStartDropdownOpen ? (
                  <div className="modalDropdownList" id="onboardingWeekStartSelectList" role="listbox" aria-labelledby="onboardingWeekStartSelect">
                    {WEEK_START_OPTIONS.map((option) => {
                      const selected = option.value === weekStarting;
                      return (
                        <button
                          className={`modalDropdownOption${selected ? " isSelected" : ""}`}
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setWeekStarting(normalizeDashboardWeekStart(option.value));
                            setWeekStartDropdownOpen(false);
                          }}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {activeStep !== "username" && activeStep !== "push" && status ? <p className="modalSubtext onboardingStatusText">{status}</p> : null}
        {activeStep !== "username" && error ? <p className="confirmText onboardingErrorText">{error}</p> : null}

        <div className="confirmBtns onboardingActions">
          {stepIndex > 0 ? (
            <button
              className="btn btn-ghost"
              type="button"
              data-onboarding-back-action="true"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
              disabled={busy}
            >
              Back
            </button>
          ) : null}
          {stepIndex < ONBOARDING_STEPS.length - 1 ? (
            <button
              className="btn btn-accent"
              type="button"
              data-onboarding-next-action="true"
              onClick={() => void handleNext()}
              disabled={busy}
            >
              Continue
            </button>
          ) : (
            <button
              className="btn btn-accent"
              type="button"
              data-onboarding-next-action="true"
              onClick={() => void handleFinish()}
              disabled={isOnboardingFinishDisabled(busy)}
            >
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
