"use client";

import { useCallback, useEffect, useState } from "react";
import AppImg from "@/components/AppImg";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { getApiUrl } from "../../lib/apiClient";
import {
  AUTOMATION_RULE_TYPE_VALUES,
  type AutomationRuleType,
} from "@/app/trustedautomation/lib/trustedAutomationContract";
import {
  AutomationHistorySchema,
  type AutomationHistory,
} from "@/app/trustedautomation/lib/trustedAutomationPersistence";
import {
  AutomationSettingsSchema,
  type AutomationRulePolicy,
  type AutomationSettings,
  type AutomationSettingsPatch,
} from "@/app/trustedautomation/lib/trustedAutomationPolicy";
import { TrustRecommendationSchema, type TrustRecommendation } from "@/app/trustedautomation/lib/trustedAutomationTrust";
import { SettingsDetailPane } from "./SettingsShared";
import { hasTaskTimerEntitlement, readTaskTimerPlanFromStorage, TASKTIMER_PLAN_CHANGED_EVENT } from "../../lib/entitlements";
import { resolveTaskTimerRouteHref } from "../../lib/routeHref";
import { createTaskTimerWorkspacePreferencesPersistence, createTaskTimerWorkspaceRepository } from "../../lib/workspaceRepository";
import { EXECUTIVE_FUNCTION_PREFERENCE_CHANGED_EVENT } from "../../lib/executiveFunctionAvailability";

const RULE_LABELS: Record<AutomationRuleType, string> = {
  REFRESH_DAILY_BRIEF: "Refresh Daily Executive Brief",
  REFRESH_CAPACITY_SNAPSHOT: "Refresh Adaptive Capacity",
  REFRESH_NEXT_BEST_ACTION: "Refresh Next Best Action",
  EXPIRE_RECOMMENDATIONS: "Expire stale recommendations",
  REFRESH_SCHEDULE_REPAIR: "Refresh Schedule Repair",
  REFRESH_RECOVERY_MODE: "Refresh Recovery Mode",
  MAINTAIN_BRAIN_DUMP: "Maintain Brain Dump sessions",
  REFRESH_TASK_CLARIFICATION: "Request Task Clarification",
};

const RULE_HELP_TEXT: Record<AutomationRuleType, string> = {
  REFRESH_DAILY_BRIEF: "Updates today's Executive Brief so the plan summary, workload, risks, and suggested first action reflect current tasks and capacity.",
  REFRESH_CAPACITY_SNAPSHOT: "Recalculates today's adaptive capacity range from your availability and recent focus history so planning uses a current time budget.",
  REFRESH_NEXT_BEST_ACTION: "Chooses a current task recommendation from eligible work, using timing, urgency, focus windows, and available minutes.",
  EXPIRE_RECOMMENDATIONS: "Marks old Next Best Action and related recommendations as expired so stale choices are not reused after tasks or timing change.",
  REFRESH_SCHEDULE_REPAIR: "Checks today's schedule for overloads, missed windows, or deadline risk and prepares repair suggestions for review.",
  REFRESH_RECOVERY_MODE: "Refreshes Recovery Mode recommendations for what to restart, defer, or ignore when the current plan needs a reset.",
  MAINTAIN_BRAIN_DUMP: "Keeps Brain Dump sessions current by maintaining extracted ideas and follow-up candidates without directly changing tasks.",
  REFRESH_TASK_CLARIFICATION: "Requests clearer next steps for tasks that appear hard to start, incomplete, or too vague to act on confidently.",
};

type AutomationErrorPayload = { error?: { code?: unknown; message?: unknown } };
type AutomationHistoryPayload = { success?: boolean; data?: { items?: unknown[] }; error?: { code?: unknown; message?: unknown } };
type AutomationSettingsPayload = { success?: boolean; data?: { settings?: unknown }; error?: { code?: unknown; message?: unknown } };
type TrustRecommendationPayload = { success?: boolean; data?: { recommendations?: unknown[] }; error?: { code?: unknown; message?: unknown } };
const PLUS_REQUIRED_MESSAGE = "Upgrade to PLUS to use executive function features.";

class AutomationResponseError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "AutomationResponseError";
    this.code = code;
    this.status = status;
  }
}

function getRuleLabel(ruleId: AutomationRuleType) {
  return RULE_LABELS[ruleId];
}

function getRuleMode(rule: Pick<AutomationRulePolicy, "enabled" | "trustLevel">) {
  return rule.enabled ? rule.trustLevel : "OFF";
}

function getRuleHelpText(rule: Pick<AutomationRulePolicy, "ruleId" | "enabled" | "trustLevel">) {
  const trustText = !rule.enabled
    ? "Off means this rule will not run, even when consent and automation processing are enabled."
    : rule.trustLevel === "TRUSTED"
    ? "Trusted mode can run after consent when automation processing is enabled."
    : "Assisted mode prepares the work but still requires your confirmation before applying it.";
  return `${RULE_HELP_TEXT[rule.ruleId]} ${trustText}`;
}

function getSafeAutomationError(payload: AutomationErrorPayload | null, fallback: string) {
  const code = typeof payload?.error?.code === "string" ? payload.error.code : "";
  const message = typeof payload?.error?.message === "string" ? payload.error.message.trim() : "";
  if (code === "AUTH_REQUIRED" || code === "UNAUTHENTICATED" || code.startsWith("auth/")) return message || "Sign in again to manage Trusted Automation.";
  if (code === "plan/plus-required") return PLUS_REQUIRED_MESSAGE;
  if (code === "executive-function/disabled") return message || "Executive Function is turned off in Settings.";
  if (code === "automation/consent-required") return "Grant consent before enabling a Trusted rule.";
  if (code === "INVALID_SCHEMA" || code === "INVALID_ENUM") return "That automation setting was not accepted. Refresh and try again.";
  return message || fallback;
}

async function getAuthHeaders() {
  const token = await getFirebaseAuthClient()?.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again to manage Trusted Automation.");
  return { Authorization: `Bearer ${token}` };
}

async function readAutomationResponse<T>(response: Response, fallback: string) {
  let payload: T | null = null;
  try {
    payload = await response.json() as T;
  } catch {
    throw new Error(fallback);
  }
  const envelope = payload as T & { success?: boolean; error?: { code?: unknown } };
  if (!response.ok || envelope.success !== true) {
    const code = typeof envelope.error?.code === "string" ? envelope.error.code : "";
    throw new AutomationResponseError(getSafeAutomationError(envelope, fallback), code, response.status);
  }
  return payload;
}

function isAutomationPlanLockError(cause: unknown) {
  return cause instanceof AutomationResponseError && cause.code === "plan/plus-required";
}

function isAutomationExecutiveFunctionDisabledError(cause: unknown) {
  return cause instanceof AutomationResponseError && cause.code === "executive-function/disabled";
}

function parseSettings(payload: AutomationSettingsPayload) {
  const parsed = AutomationSettingsSchema.safeParse(payload.data?.settings);
  if (!parsed.success) throw new Error("Trusted Automation settings could not be loaded.");
  return parsed.data;
}

function parseHistory(payload: AutomationHistoryPayload) {
  return (payload.data?.items || []).flatMap((item) => {
    const parsed = AutomationHistorySchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function formatAutomationHistoryDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatAutomationReasonCodes(reasonCodes: AutomationHistory["reasonCodes"]) {
  return reasonCodes.length ? reasonCodes.join(", ") : "No reason recorded";
}

export function TrustedAutomationSettingsPane({ active, exiting = false }: { active: boolean; exiting?: boolean }) {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [history, setHistory] = useState<AutomationHistory[]>([]);
  const [trustRecommendations, setTrustRecommendations] = useState<TrustRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canUseExecutiveFunction, setCanUseExecutiveFunction] = useState(true);
  const [executiveFunctionEnabled, setExecutiveFunctionEnabled] = useState(true);

  useEffect(() => {
    const syncPlan = () => {
      setCanUseExecutiveFunction(hasTaskTimerEntitlement(readTaskTimerPlanFromStorage(), "executiveFunction"));
    };
    syncPlan();
    window.addEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncPlan);
    return () => window.removeEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncPlan);
  }, []);

  useEffect(() => {
    const persistence = createTaskTimerWorkspacePreferencesPersistence(createTaskTimerWorkspaceRepository());
    const syncPreference = () => {
      setExecutiveFunctionEnabled(persistence.loadResolved().executiveFunctionEnabled !== false);
    };
    syncPreference();
    const unsubscribe = persistence.subscribe((prefs) => {
      setExecutiveFunctionEnabled((prefs || persistence.loadResolved()).executiveFunctionEnabled !== false);
    });
    window.addEventListener(EXECUTIVE_FUNCTION_PREFERENCE_CHANGED_EVENT, syncPreference);
    return () => {
      unsubscribe();
      window.removeEventListener(EXECUTIVE_FUNCTION_PREFERENCE_CHANGED_EVENT, syncPreference);
    };
  }, []);

  const saveExecutiveFunctionEnabled = useCallback((nextEnabled: boolean) => {
    const persistence = createTaskTimerWorkspacePreferencesPersistence(createTaskTimerWorkspaceRepository());
    const next = persistence.update({ executiveFunctionEnabled: nextEnabled });
    setExecutiveFunctionEnabled(next.executiveFunctionEnabled !== false);
    window.dispatchEvent(new CustomEvent(EXECUTIVE_FUNCTION_PREFERENCE_CHANGED_EVENT, {
      detail: { enabled: next.executiveFunctionEnabled !== false },
    }));
  }, []);

  const loadData = useCallback(async () => {
      if (!canUseExecutiveFunction) {
        setSettings(null);
        setHistory([]);
        setTrustRecommendations([]);
        return;
      }
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [settingsResponse, historyResponse] = await Promise.all([
        fetch(getApiUrl("/api/automation/settings"), { headers }),
        fetch(getApiUrl("/api/automation/history?limit=20"), { headers }),
      ]);
      const settingsPayload = await readAutomationResponse<AutomationSettingsPayload>(settingsResponse, "Trusted Automation settings could not be loaded.");
      const historyPayload = await readAutomationResponse<AutomationHistoryPayload>(historyResponse, "Automation history could not be loaded.");
      setSettings(parseSettings(settingsPayload));
      setHistory(parseHistory(historyPayload));
      if (!executiveFunctionEnabled) {
        setTrustRecommendations([]);
        return;
      }
      try {
        const trustResponse = await fetch(getApiUrl("/api/automation/trust"), { headers });
        if (trustResponse.ok) {
          const trustPayload = await trustResponse.json() as TrustRecommendationPayload;
          setTrustRecommendations((trustPayload.data?.recommendations || []).flatMap((item) => {
            const parsed = TrustRecommendationSchema.safeParse(item);
            return parsed.success ? [parsed.data] : [];
          }));
        } else {
          setTrustRecommendations([]);
        }
      } catch {
        setTrustRecommendations([]);
      }
    } catch (cause) {
      if (isAutomationPlanLockError(cause)) {
        setCanUseExecutiveFunction(false);
        setSettings(null);
        setHistory([]);
        setTrustRecommendations([]);
        return;
      }
      if (isAutomationExecutiveFunctionDisabledError(cause)) {
        setExecutiveFunctionEnabled(false);
        setSettings(null);
        setHistory([]);
        setTrustRecommendations([]);
        return;
      }
      console.error("[TrustedAutomationSettingsPane] load failed", cause);
    } finally {
      setLoading(false);
    }
  }, [canUseExecutiveFunction, executiveFunctionEnabled]);

  useEffect(() => {
    if (!active) return;
    const timerId = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timerId);
  }, [active, loadData]);

  const savePatch = useCallback(async (patch: AutomationSettingsPatch) => {
    if (!canUseExecutiveFunction || !executiveFunctionEnabled) return;
    if (!settings || saving) return;
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(getApiUrl("/api/automation/settings"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await readAutomationResponse<AutomationSettingsPayload>(response, "Trusted Automation settings could not be saved.");
      setSettings(parseSettings(payload));
    } catch (cause) {
      console.error("[TrustedAutomationSettingsPane] save failed", cause);
    } finally {
      setSaving(false);
    }
  }, [canUseExecutiveFunction, executiveFunctionEnabled, saving, settings]);

  function updateRule(ruleId: AutomationRuleType, update: Partial<AutomationRulePolicy>) {
    if (!settings) return;
    const rules = settings.rules.map((rule) => rule.ruleId === ruleId ? { ...rule, ...update } : rule);
    void savePatch({ rules });
  }

  function updateRuleMode(ruleId: AutomationRuleType, mode: "OFF" | AutomationRulePolicy["trustLevel"]) {
    updateRule(ruleId, mode === "OFF" ? { enabled: false } : { enabled: true, trustLevel: mode });
  }

  const controlsDisabled = loading || saving || !settings;

  if (!canUseExecutiveFunction) {
    return (
      <SettingsDetailPane
        active={active}
        exiting={exiting}
        paneClassName="settingsTrustedAutomationPane isPlanLocked"
        title="Executive Function"
        subtitle={PLUS_REQUIRED_MESSAGE}
      >
        <div className="settingsInlineStack" data-plan-locked="executiveFunction">
          <section className="settingsInlineSection" aria-labelledby="trustedAutomationLockedHeading">
            <div className="settingsInlineSectionHead">
              <div>
                <div className="settingsInlineSectionTitle" id="trustedAutomationLockedHeading">PLUS required</div>
                <div className="settingsPreferenceControlHelp">Executive Function can refresh executive briefs, capacity, recovery, schedule repair, Brain Dump maintenance, task clarification, and Trusted Automation for PLUS users.</div>
              </div>
              <a className="btn btn-accent small" href={resolveTaskTimerRouteHref("/account")}>Upgrade to PLUS</a>
            </div>
          </section>
        </div>
      </SettingsDetailPane>
    );
  }

  return (
    <SettingsDetailPane
      active={active}
      exiting={exiting}
      paneClassName="settingsTrustedAutomationPane"
      title="Executive Function"
      subtitle="Control Executive Function features and Trusted Automation permissions."
    >
      <div className="settingsInlineStack">
        <section className="settingsInlineSection" aria-labelledby="executiveFunctionMasterHeading">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/icons/icons_default/executive.webp" alt="" aria-hidden="true" />
            <div>
              <div className="settingsInlineSectionTitle" id="executiveFunctionMasterHeading">Executive Function</div>
            </div>
          </div>
          <div className="toggleRow settingsTrustedAutomationToggleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Enable Executive Function</span>
              <span className="settingsPreferenceControlHelp">Turns Executive Summary, Daily Executive Brief, Next Best Action, Adaptive Capacity, Schedule Repair, Recovery Mode, Brain Dump executive actions, task clarification, and Trusted Automation on or off.</span>
            </div>
            <button
              className={`switch${executiveFunctionEnabled ? " on" : ""}`}
              type="button"
              role="switch"
              aria-label="Enable Executive Function"
              aria-checked={executiveFunctionEnabled}
              onClick={() => saveExecutiveFunctionEnabled(!executiveFunctionEnabled)}
            />
          </div>
        </section>

        <section className={`settingsInlineSection${executiveFunctionEnabled ? "" : " isDisabled"}`} aria-labelledby="trustedAutomationSectionHeading">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/icons/icons_default/automation.webp" alt="" aria-hidden="true" />
            <div>
              <div className="settingsInlineSectionTitle" id="trustedAutomationSectionHeading">Trusted Automation</div>
            </div>
          </div>
          <div className="toggleRow settingsTrustedAutomationToggleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Allow Trusted Automation</span>
              <span className="settingsPreferenceControlHelp">Gives server-side consent for Trusted Automation. Turning this off blocks trusted rule execution and prevents new automation work from starting.</span>
            </div>
            <button
              className={`switch${settings?.consentGranted ? " on" : ""}`}
              type="button"
              role="switch"
              aria-label="Allow Trusted Automation"
              aria-checked={settings?.consentGranted ?? false}
              disabled={controlsDisabled || !executiveFunctionEnabled}
              onClick={() => settings && void savePatch({ consentGranted: !settings.consentGranted, automationEnabled: settings.consentGranted ? false : settings.automationEnabled })}
            />
          </div>
          <div className="toggleRow settingsTrustedAutomationToggleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Enable automation processing</span>
              <span className="settingsPreferenceControlHelp">Master run switch for automation jobs. When off, enabled rules stay configured but no new scheduled, event, or system-triggered work begins.</span>
            </div>
            <button
              className={`switch${settings?.automationEnabled ? " on" : ""}`}
              type="button"
              role="switch"
              aria-label="Enable automation processing"
              aria-checked={settings?.automationEnabled ?? false}
              disabled={controlsDisabled || !executiveFunctionEnabled || !settings?.consentGranted}
              onClick={() => settings && void savePatch({ automationEnabled: !settings.automationEnabled })}
            />
          </div>
          <div className="toggleRow settingsTrustedAutomationToggleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Pause All</span>
              <span className="settingsPreferenceControlHelp">Temporarily stops all automation without changing consent or rule settings. Use this to freeze new work while preserving completed history and queued records.</span>
            </div>
            <button
              className={`switch${settings?.pauseAll ? " on" : ""}`}
              type="button"
              role="switch"
              aria-label="Pause all Trusted Automation"
              aria-checked={settings?.pauseAll ?? false}
              disabled={controlsDisabled || !executiveFunctionEnabled}
              onClick={() => settings && void savePatch({ pauseAll: !settings.pauseAll })}
            />
          </div>
        </section>

        <section className={`settingsInlineSection${executiveFunctionEnabled ? "" : " isDisabled"}`} aria-labelledby="trustedAutomationRulesHeading">
          <div className="settingsInlineSectionHead">
            <AppImg className="settingsInlineSectionIcon" src="/icons/icons_default/permissions.webp" alt="" aria-hidden="true" />
            <div>
              <div className="settingsInlineSectionTitle" id="trustedAutomationRulesHeading">Rule permissions</div>
            </div>
          </div>
          <div className="settingsTrustedAutomationRuleList">
            {(settings?.rules || AUTOMATION_RULE_TYPE_VALUES.map((ruleId) => ({ ruleId, enabled: false, trustLevel: "ASSISTED" as const }))).map((rule) => (
              <div className="settingsTrustedAutomationRule" key={rule.ruleId}>
                <div className="settingsPreferenceControlCopy">
                  <span className="settingsPreferenceControlLabel">{getRuleLabel(rule.ruleId)}</span>
                  <span className="settingsPreferenceControlHelp">{getRuleHelpText(rule)}</span>
                </div>
                <div className="settingsTrustedAutomationRuleControls" role="group" aria-label={`Automation mode for ${getRuleLabel(rule.ruleId)}`}>
                  {(["OFF", "ASSISTED", "TRUSTED"] as const).map((mode) => {
                    const isSelected = getRuleMode(rule) === mode;
                    return (
                      <button
                        className={`settingsTrustedAutomationModePill${isSelected ? " isSelected" : ""}`}
                        type="button"
                        aria-pressed={isSelected}
                        disabled={controlsDisabled || !executiveFunctionEnabled}
                        key={mode}
                        onClick={() => updateRuleMode(rule.ruleId, mode)}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {trustRecommendations.length ? (
          <section className="settingsInlineSection" aria-labelledby="trustedAutomationTrustHeading">
            <div className="settingsInlineSectionHead">
              <div>
                <div className="settingsInlineSectionTitle" id="trustedAutomationTrustHeading">Trust suggestions</div>
                <div className="settingsPreferenceControlHelp">These are advisory only. Review the evidence and change consent or rule permissions yourself; automation never escalates authority automatically.</div>
              </div>
            </div>
            <div className="settingsTrustedAutomationRecommendationList" role="list" aria-label="Trusted Automation trust suggestions">
              {trustRecommendations.map((recommendation) => (
                <article className="settingsTrustedAutomationRecommendation" key={recommendation.ruleId} role="listitem">
                  <div className="settingsTrustedAutomationHistoryHead">
                    <span>{getRuleLabel(recommendation.ruleId)}</span>
                    <span>{recommendation.kind === "PROMOTE" ? "Promotion suggested" : "Reduction suggested"}</span>
                  </div>
                  <div className="settingsTrustedAutomationHistoryReason">Evidence: {recommendation.acceptedSuccessCount} accepted successes, {recommendation.negativeCount} negative outcomes.</div>
                  <div className="settingsTrustedAutomationHistoryHelp">Suggested level: {recommendation.suggestedTrustLevel}. No setting has been changed.</div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="settingsInlineSection" aria-labelledby="trustedAutomationHistoryHeading">
          <div className="settingsInlineSectionHead">
            <div>
              <div className="settingsInlineSectionTitle" id="trustedAutomationHistoryHeading">Automation history</div>
              <div className="settingsPreferenceControlHelp">Read-only history shows what ran, why it ran, its result, and when it happened. Task titles and raw content are not displayed.</div>
            </div>
            <button type="button" className="btn btn-ghost small" disabled={controlsDisabled} onClick={() => void loadData()}>Refresh</button>
          </div>
          {history.length ? (
            <div className="settingsTrustedAutomationHistory" role="list" aria-label="Trusted Automation history">
              {history.map((item) => (
                <article className="settingsTrustedAutomationHistoryItem" key={item.id} role="listitem">
                  <div className="settingsTrustedAutomationHistoryHead">
                    <span>{getRuleLabel(item.ruleId)}</span>
                    <span className={`settingsTrustedAutomationOutcome settingsTrustedAutomationOutcome-${item.outcome.toLowerCase()}`}>{item.outcome}</span>
                  </div>
                  <div className="settingsTrustedAutomationHistoryMeta">{formatAutomationHistoryDate(item.createdAt)} · {item.trigger}</div>
                  <div className="settingsTrustedAutomationHistoryReason">Reason: {formatAutomationReasonCodes(item.reasonCodes)}</div>
                  <div className="settingsTrustedAutomationHistoryHelp">Reversal availability is recorded by the owning feature.</div>
                </article>
              ))}
            </div>
          ) : (
            <div className="settingsDetailNote">No automation history is available yet.</div>
          )}
        </section>
      </div>
    </SettingsDetailPane>
  );
}
