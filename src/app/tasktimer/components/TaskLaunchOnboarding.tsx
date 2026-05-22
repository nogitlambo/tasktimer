"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { getFirebaseAuthClient, isNativeOrFileRuntime } from "@/lib/firebaseClient";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { syncOwnFriendshipProfile } from "../lib/friendsStore";
import { normalizeDashboardWeekStart, type DashboardWeekStart } from "../lib/historyChart";
import {
  TASKTIMER_ONBOARDING_DEFAULT_END_TIME,
  TASKTIMER_ONBOARDING_DEFAULT_START_TIME,
  TASKTIMER_ONBOARDING_WEEKDAY_DEFAULTS,
  buildTaskTimerOnboardingPreferenceDraft,
  loadRemoteTaskTimerOnboardingState,
  loadTaskTimerOnboardingPreferencePresence,
  readLocalTaskTimerOnboardingState,
  saveTaskTimerOnboardingState,
  shouldAutoOpenTaskTimerOnboarding,
  type TaskTimerOnboardingPreferencePresence,
} from "../lib/onboarding";
import type { UserPreferencesV1 } from "../lib/cloudStore";
import { OPTIMAL_PRODUCTIVITY_DAY_LABELS, normalizeOptimalProductivityDays, normalizeTimeOfDay } from "../lib/productivityPeriod";
import { ACCOUNT_PROFILE_UPDATED_EVENT, notifyAccountProfileUpdated } from "../lib/accountProfileStorage";
import {
  TASKTIMER_OPEN_ONBOARDING_EVENT,
  resolveOnboardingPreferenceError,
  saveOnboardingPreferencesViaRuntime,
} from "../client/onboarding-events";
import { getErrorMessage, loadClaimedUsername, updateAliasFlow } from "./settings/settingsAccountService";

type TaskLaunchOnboardingProps = {
  preferences: UserPreferencesV1 | null;
};

type StepKey = "username" | "days" | "hours" | "push";

const STEPS: ReadonlyArray<{ key: StepKey; title: string }> = [
  { key: "username", title: "Username" },
  { key: "days", title: "Productivity Days" },
  { key: "hours", title: "Productivity Hours" },
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

function stepIntro(step: StepKey, isNativeRuntime: boolean) {
  if (step === "username") return "Confirm the username people will see in TaskLaunch social surfaces.";
  if (step === "days") return "Choose the days that count toward your productivity streaks, rewards, and dashboard insights.";
  if (step === "hours") return "Set the time block when you are usually at your best.";
  return isNativeRuntime
    ? "Enable device notifications for task reminders and completed task alerts."
    : "Enable browser notifications for task reminders and completed task alerts.";
}

function alertUsernameError(message: string) {
  if (typeof window !== "undefined") window.alert(message);
}

function onboardingTitle(step: StepKey, username: string) {
  if (step === "username") return "Welcome";
  if (step === "days") return `Good to meet you, ${username}!`;
  return STEPS.find((item) => item.key === step)?.title || "TaskLaunch Setup";
}

export default function TaskLaunchOnboarding({ preferences }: TaskLaunchOnboardingProps) {
  const [uid, setUid] = useState("");
  const [username, setUsername] = useState("");
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [usernameConfirmedAtMs, setUsernameConfirmedAtMs] = useState<number | null>(null);
  const [weekStarting, setWeekStarting] = useState<DashboardWeekStart>("mon");
  const [productivityDays, setProductivityDays] = useState(() => normalizeOptimalProductivityDays(TASKTIMER_ONBOARDING_WEEKDAY_DEFAULTS));
  const [startTime, setStartTime] = useState(TASKTIMER_ONBOARDING_DEFAULT_START_TIME);
  const [endTime, setEndTime] = useState(TASKTIMER_ONBOARDING_DEFAULT_END_TIME);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushTouched, setPushTouched] = useState(false);
  const [weekStartDropdownOpen, setWeekStartDropdownOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const openRef = useRef(false);
  const weekStartDropdownRef = useRef<HTMLDivElement | null>(null);

  const activeStep = STEPS[stepIndex]?.key || "username";
  const isNativeRuntime = isNativeOrFileRuntime();
  const usernameValidation = usernameDraft.trim() ? validateUsername(usernameDraft) : "Username is required.";
  const usernameConfirmed = !!usernameConfirmedAtMs && normalizeUsername(usernameDraft) === normalizeUsername(username);
  const selectedDays = useMemo(() => normalizeOptimalProductivityDays(productivityDays), [productivityDays]);
  const selectedWeekStartOption = WEEK_START_OPTIONS.find((option) => option.value === weekStarting) ?? WEEK_START_OPTIONS[0];

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
    if (activeStep !== "days") setWeekStartDropdownOpen(false);
  }, [activeStep]);

  const resetDrafts = useCallback(
    (nextUsername: string, nextPresence: TaskTimerOnboardingPreferencePresence | null) => {
      const normalizedUsername = normalizeUsername(nextUsername);
      const preferenceDraft = buildTaskTimerOnboardingPreferenceDraft(preferences, nextPresence);
      setUsername(normalizedUsername);
      setUsernameDraft(normalizedUsername);
      setUsernameConfirmedAtMs(null);
      setWeekStarting(preferenceDraft.weekStarting);
      setProductivityDays(preferenceDraft.optimalProductivityDays);
      setStartTime(preferenceDraft.optimalProductivityStartTime);
      setEndTime(preferenceDraft.optimalProductivityEndTime);
      setPushEnabled(isNativeRuntime ? !!preferences?.mobilePushAlertsEnabled : !!preferences?.webPushAlertsEnabled);
      setPushTouched(false);
      setStepIndex(0);
      setStatus("");
      setError("");
    },
    [isNativeRuntime, preferences]
  );

  const refreshForUser = useCallback(
    async (user: User | null, options?: { forceOpen?: boolean }) => {
      const nextUid = String(user?.uid || "").trim();
      setUid(nextUid);
      if (!nextUid) {
        setOpen(false);
        setUsername("");
        return;
      }

      const localState = readLocalTaskTimerOnboardingState(nextUid);

      const [remoteState, nextPresence, claimedUsername] = await Promise.all([
        loadRemoteTaskTimerOnboardingState(nextUid).catch(() => localState),
        loadTaskTimerOnboardingPreferencePresence(nextUid).catch(() => null),
        loadClaimedUsername(nextUid).catch(() => ""),
      ]);

      setUsername(normalizeUsername(claimedUsername));

      if (options?.forceOpen) {
        resetDrafts(claimedUsername, nextPresence);
        setOpen(true);
        return;
      }

      const shouldOpen = shouldAutoOpenTaskTimerOnboarding({
        uid: nextUid,
        username: claimedUsername,
        state: remoteState || localState || null,
        preferencePresence: nextPresence,
      });
      if (shouldOpen && !openRef.current) {
        resetDrafts(claimedUsername, nextPresence);
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

  const confirmUsername = useCallback(async () => {
    const nextUsername = usernameDraft.trim();
    const validation = validateUsername(nextUsername);
    if (validation) {
      setError(validation);
      setUsernameConfirmedAtMs(null);
      alertUsernameError(validation);
      return false;
    }
    if (!uid) {
      const message = "Sign in is required to update your username.";
      setError(message);
      setUsernameConfirmedAtMs(null);
      alertUsernameError(message);
      return false;
    }

    setBusy(true);
    setError("");
    setStatus("");
    setUsernameConfirmedAtMs(null);
    try {
      if (normalizeUsername(nextUsername) !== normalizeUsername(username)) {
        const result = await updateAliasFlow(uid, username, nextUsername);
        if (result.changed) {
          await syncOwnFriendshipProfile(uid, { alias: result.username });
          setUsername(result.username);
          setUsernameDraft(result.username);
          notifyAccountProfileUpdated();
        }
      } else {
        setUsername(normalizeUsername(nextUsername));
        setUsernameDraft(normalizeUsername(nextUsername));
      }
      const confirmedAtMs = Date.now();
      setUsernameConfirmedAtMs(confirmedAtMs);
      setStatus("Username confirmed.");
      return true;
    } catch (err: unknown) {
      const message = getErrorMessage(err, "Unable to update username right now.");
      setUsernameConfirmedAtMs(null);
      setError(message);
      alertUsernameError(message);
      return false;
    } finally {
      setBusy(false);
    }
  }, [uid, username, usernameDraft]);

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
    if (activeStep === "days") {
      return savePreferenceStep({
        weekStarting,
        optimalProductivityDays: selectedDays,
      });
    }
    if (activeStep === "hours") {
      return savePreferenceStep({
        optimalProductivityStartTime: startTime,
        optimalProductivityEndTime: endTime,
      });
    }
    if (pushTouched) return savePreferenceStep({ pushNotificationsEnabled: pushEnabled });
    return true;
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
    setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
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
      const normalized = normalizeOptimalProductivityDays(current);
      const hasDay = normalized.includes(day);
      const next = hasDay ? normalized.filter((value) => value !== day) : normalized.concat(day);
      return next.length ? normalizeOptimalProductivityDays(next) : normalized;
    });
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
        {activeStep !== "username" ? (
          <div className="onboardingStepMeta" aria-label="Onboarding progress">
            Step {stepIndex + 1} of {STEPS.length}
          </div>
        ) : null}
        <h2>{onboardingTitle(activeStep, username || normalizeUsername(usernameDraft) || "there")}</h2>
        {activeStep !== "days" ? (
          <p className={`modalSubtext${activeStep === "hours" ? " onboardingHoursSubtext" : ""}`}>
            {activeStep === "username" ? "Set a username for your account" : stepIntro(activeStep, isNativeRuntime)}
          </p>
        ) : null}

        {activeStep === "username" ? (
          <div className="field modalPreviewDropdownField onboardingField">
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
              }}
              maxLength={20}
              aria-invalid={!!usernameValidation}
            />
          </div>
        ) : null}

        {activeStep === "days" ? (
          <div className="onboardingFieldsGrid">
            <div className="field modalPreviewDropdownField onboardingField">
              <label htmlFor="onboardingWeekStartSelect">Which day do you want your week to start on?</label>
              <div className="modalPreviewDropdown" ref={weekStartDropdownRef}>
                <button
                  className="modalPreviewDropdownButton"
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
                  <div
                    className="modalPreviewDropdownList"
                    id="onboardingWeekStartSelectList"
                    role="listbox"
                    aria-labelledby="onboardingWeekStartSelect"
                  >
                    {WEEK_START_OPTIONS.map((option) => {
                      const selected = option.value === weekStarting;
                      return (
                        <button
                          className={`modalPreviewDropdownOption${selected ? " isSelected" : ""}`}
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
            <div className="field modalPreviewDropdownField onboardingField">
              <label id="onboardingProductivityDaysLabel">Select the day(s) of the week you are the most productive.</label>
              <div className="onboardingDayGrid" role="group" aria-label="Optimal productivity days">
                {PRODUCTIVITY_DAY_PILL_ROWS.map((row, rowIndex) => (
                  <div className="onboardingDayPillRow" key={`productivity-days-row-${rowIndex}`}>
                    {row.map((value) => {
                      const checked = selectedDays.includes(value);
                      return (
                        <button
                          className={`onboardingDayPill${checked ? " isSelected" : ""}`}
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
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeStep === "hours" ? (
          <div className="onboardingTimeGrid">
            <div className="field modalPreviewDropdownField onboardingField">
              <label htmlFor="onboardingStartTimeInput">Start</label>
              <input
                id="onboardingStartTimeInput"
                className="onboardingTextInput"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(normalizeTimeOfDay(event.target.value, TASKTIMER_ONBOARDING_DEFAULT_START_TIME))}
              />
            </div>
            <div className="field modalPreviewDropdownField onboardingField">
              <label htmlFor="onboardingEndTimeInput">End</label>
              <input
                id="onboardingEndTimeInput"
                className="onboardingTextInput"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(normalizeTimeOfDay(event.target.value, TASKTIMER_ONBOARDING_DEFAULT_END_TIME))}
              />
            </div>
          </div>
        ) : null}

        {activeStep === "push" ? (
          <div className="chkRow modalPreviewCheckboxRow onboardingPushRow">
            <input
              id="onboardingPushToggle"
              type="checkbox"
              checked={pushEnabled}
              disabled={busy}
              onChange={(event) => void handlePushToggle(event.target.checked)}
            />
            <div className="modalPreviewCheckboxText">
              <label htmlFor="onboardingPushToggle">Enable push notifications</label>
            </div>
          </div>
        ) : null}

        {activeStep !== "username" && activeStep !== "push" && status ? <p className="modalSubtext onboardingStatusText">{status}</p> : null}
        {activeStep !== "username" && error ? <p className="confirmText onboardingErrorText">{error}</p> : null}

        <div className="confirmBtns onboardingActions">
          {stepIndex > 0 ? (
            <button className="btn btn-ghost modalPreviewSecondaryAction" type="button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={busy}>
              Back
            </button>
          ) : null}
          {stepIndex < STEPS.length - 1 ? (
            <button className="btn btn-accent modalPreviewPrimaryAction" type="button" onClick={() => void handleNext()} disabled={busy}>
              Next
            </button>
          ) : (
            <button className="btn btn-accent modalPreviewPrimaryAction" type="button" onClick={() => void handleFinish()} disabled={busy || !usernameConfirmed}>
              Finish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
