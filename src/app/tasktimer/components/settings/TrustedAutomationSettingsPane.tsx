"use client";

import { useCallback, useEffect, useState } from "react";
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

type AutomationHistoryPayload = { success?: boolean; data?: { items?: unknown[] }; error?: { code?: unknown } };
type AutomationSettingsPayload = { success?: boolean; data?: { settings?: unknown }; error?: { code?: unknown } };
type TrustRecommendationPayload = { success?: boolean; data?: { recommendations?: unknown[] }; error?: { code?: unknown } };
const PLUS_REQUIRED_MESSAGE = "Upgrade to PLUS to use executive function features.";

function getRuleLabel(ruleId: AutomationRuleType) {
  return RULE_LABELS[ruleId];
}

function getSafeAutomationError(payload: { error?: { code?: unknown } } | null, fallback: string) {
  const code = typeof payload?.error?.code === "string" ? payload.error.code : "";
  if (code === "AUTH_REQUIRED" || code === "UNAUTHENTICATED") return "Sign in again to manage Trusted Automation.";
  if (code === "automation/consent-required") return "Grant consent before enabling a Trusted rule.";
  if (code === "INVALID_SCHEMA" || code === "INVALID_ENUM") return "That automation setting was not accepted. Refresh and try again.";
  return fallback;
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
    throw new Error(getSafeAutomationError(envelope, fallback));
  }
  return payload;
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
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [canUseExecutiveFunction, setCanUseExecutiveFunction] = useState(true);

  useEffect(() => {
    const syncPlan = () => {
      setCanUseExecutiveFunction(hasTaskTimerEntitlement(readTaskTimerPlanFromStorage(), "executiveFunction"));
    };
    syncPlan();
    window.addEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncPlan);
    return () => window.removeEventListener(TASKTIMER_PLAN_CHANGED_EVENT, syncPlan);
  }, []);

  const loadData = useCallback(async () => {
    if (!canUseExecutiveFunction) {
      setSettings(null);
      setHistory([]);
      setTrustRecommendations([]);
      setStatus("");
      setError(PLUS_REQUIRED_MESSAGE);
      return;
    }
    setLoading(true);
    setError("");
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
      setStatus("Trusted Automation settings refreshed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Trusted Automation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [canUseExecutiveFunction]);

  useEffect(() => {
    if (!active) return;
    const timerId = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timerId);
  }, [active, loadData]);

  const savePatch = useCallback(async (patch: AutomationSettingsPatch) => {
    if (!canUseExecutiveFunction) {
      setError(PLUS_REQUIRED_MESSAGE);
      return;
    }
    if (!settings || saving) return;
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(getApiUrl("/api/automation/settings"), {
        method: "PUT",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await readAutomationResponse<AutomationSettingsPayload>(response, "Trusted Automation settings could not be saved.");
      setSettings(parseSettings(payload));
      setStatus("Trusted Automation settings saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Trusted Automation settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }, [canUseExecutiveFunction, saving, settings]);

  function updateRule(ruleId: AutomationRuleType, update: Partial<AutomationRulePolicy>) {
    if (!settings) return;
    const rules = settings.rules.map((rule) => rule.ruleId === ruleId ? { ...rule, ...update } : rule);
    void savePatch({ rules });
  }

  const controlsDisabled = loading || saving || !settings;

  if (!canUseExecutiveFunction) {
    return (
      <SettingsDetailPane
        active={active}
        exiting={exiting}
        paneClassName="settingsTrustedAutomationPane isPlanLocked"
        title="Trusted Automation"
        subtitle={PLUS_REQUIRED_MESSAGE}
      >
        <div className="settingsInlineStack" data-plan-locked="executiveFunction">
          <section className="settingsInlineSection" aria-labelledby="trustedAutomationLockedHeading">
            <div className="settingsInlineSectionHead">
              <div>
                <div className="settingsInlineSectionTitle" id="trustedAutomationLockedHeading">PLUS required</div>
                <div className="settingsPreferenceControlHelp">Trusted Automation can refresh executive briefs, capacity, recovery, schedule repair, Brain Dump maintenance, and task clarification for PLUS users.</div>
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
      title="Trusted Automation"
      subtitle="Control consent, rule permissions, pause state, and read-only automation history."
    >
      <div className="settingsInlineStack">
        <div className="settingsTrustedAutomationStatus" aria-live="polite">
          {loading ? "Loading Trusted Automation settings..." : null}
          {!loading && error ? error : null}
          {!loading && !error && status ? status : null}
        </div>

        <section className="settingsInlineSection" aria-labelledby="trustedAutomationControlHeading">
          <div className="settingsInlineSectionHead">
            <div>
              <div className="settingsInlineSectionTitle" id="trustedAutomationControlHeading">Consent and availability</div>
              <div className="settingsPreferenceControlHelp">The server remains authoritative. Consent withdrawal disables new automation work and preserves completed history.</div>
            </div>
          </div>
          <div className="toggleRow settingsTrustedAutomationToggleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Allow Trusted Automation</span>
              <span className="settingsPreferenceControlHelp">Grant consent before enabling supported rules.</span>
            </div>
            <button
              className={`switch${settings?.consentGranted ? " on" : ""}`}
              type="button"
              role="switch"
              aria-label="Allow Trusted Automation"
              aria-checked={settings?.consentGranted ?? false}
              disabled={controlsDisabled}
              onClick={() => settings && void savePatch({ consentGranted: !settings.consentGranted, automationEnabled: settings.consentGranted ? false : settings.automationEnabled })}
            />
          </div>
          <div className="toggleRow settingsTrustedAutomationToggleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Enable automation processing</span>
              <span className="settingsPreferenceControlHelp">When disabled, no new rule execution is started.</span>
            </div>
            <button
              className={`switch${settings?.automationEnabled ? " on" : ""}`}
              type="button"
              role="switch"
              aria-label="Enable automation processing"
              aria-checked={settings?.automationEnabled ?? false}
              disabled={controlsDisabled || !settings?.consentGranted}
              onClick={() => settings && void savePatch({ automationEnabled: !settings.automationEnabled })}
            />
          </div>
          <div className="toggleRow settingsTrustedAutomationToggleRow">
            <div className="settingsPreferenceControlCopy">
              <span className="settingsPreferenceControlLabel">Pause All</span>
              <span className="settingsPreferenceControlHelp">Stops new automation work. Already completed history is preserved; queued work remains safely recorded.</span>
            </div>
            <button
              className={`switch${settings?.pauseAll ? " on" : ""}`}
              type="button"
              role="switch"
              aria-label="Pause all Trusted Automation"
              aria-checked={settings?.pauseAll ?? false}
              disabled={controlsDisabled}
              onClick={() => settings && void savePatch({ pauseAll: !settings.pauseAll })}
            />
          </div>
        </section>

        <section className="settingsInlineSection" aria-labelledby="trustedAutomationRulesHeading">
          <div className="settingsInlineSectionHead">
            <div>
              <div className="settingsInlineSectionTitle" id="trustedAutomationRulesHeading">Rule permissions</div>
              <div className="settingsPreferenceControlHelp">Each rule can be enabled independently. Assisted work requires confirmation; Trusted work uses the consented server policy.</div>
            </div>
          </div>
          <div className="settingsTrustedAutomationRuleList">
            {(settings?.rules || AUTOMATION_RULE_TYPE_VALUES.map((ruleId) => ({ ruleId, enabled: false, trustLevel: "ASSISTED" as const }))).map((rule) => (
              <div className="settingsTrustedAutomationRule" key={rule.ruleId}>
                <div className="settingsPreferenceControlCopy">
                  <span className="settingsPreferenceControlLabel">{getRuleLabel(rule.ruleId)}</span>
                  <span className="settingsPreferenceControlHelp">{rule.trustLevel === "TRUSTED" ? "Trusted: eligible for consented automation." : "Assisted: confirmation remains required."}</span>
                </div>
                <div className="settingsTrustedAutomationRuleControls">
                  <button
                    className={`switch${rule.enabled ? " on" : ""}`}
                    type="button"
                    role="switch"
                    aria-label={`${rule.enabled ? "Disable" : "Enable"} ${getRuleLabel(rule.ruleId)}`}
                    aria-checked={rule.enabled}
                    disabled={controlsDisabled}
                    onClick={() => updateRule(rule.ruleId, { enabled: !rule.enabled })}
                  />
                  <label className="settingsTrustedAutomationTrustLabel">
                    <span className="srOnly">Trust level for {getRuleLabel(rule.ruleId)}</span>
                    <select
                      aria-label={`Trust level for ${getRuleLabel(rule.ruleId)}`}
                      value={rule.trustLevel}
                      disabled={controlsDisabled}
                      onChange={(event) => updateRule(rule.ruleId, { trustLevel: event.currentTarget.value as AutomationRulePolicy["trustLevel"] })}
                    >
                      <option value="ASSISTED">Assisted</option>
                      <option value="TRUSTED">Trusted</option>
                    </select>
                  </label>
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
