import type { Task } from "./types";

export type ArchieAssistantPage = "dashboard" | "tasks" | "friends" | "leaderboard" | "settings" | "none";

export type ArchieConfidence = "high" | "medium" | "low";
export type ArchieResponseMode = "product_answer" | "workflow_advice" | "navigation_hint" | "fallback";
export type ArchieDraftKind = "schedule_adjustment" | "workflow_adjustment" | "task_prioritization" | "product_answer";

export type ArchieSettingsPane =
  | "general"
  | "preferences"
  | "appearance"
  | "notifications"
  | "privacy"
  | "userGuide"
  | "about"
  | "feedback"
  | "data"
  | "reset";

export type ArchieKnowledgeCitation = {
  id: string;
  title: string;
  section: string;
  route?: "/tasklaunch" | "/dashboard" | "/settings" | "/history-manager" | "/user-guide" | "/feedback";
  settingsPane?: ArchieSettingsPane;
  sourceKind?: "user-guide" | "settings" | "policy";
};

export type ArchieSuggestedAction =
  | { kind: "navigate"; label: string; href: string }
  | { kind: "openSettingsPane"; label: string; pane: ArchieSettingsPane }
  | { kind: "jumpToTask"; label: string; taskId: string }
  | { kind: "reviewDraft"; label: string; draftId: string };

export type ArchieScheduleSnapshot = {
  plannedStartDay: Task["plannedStartDay"];
  plannedStartTime: string | null;
  plannedStartOpenEnded: boolean;
};

export type ArchieDraftChange =
  | {
      kind: "reorder_task";
      taskId: string;
      taskName: string;
      beforeOrder: number;
      afterOrder: number;
    }
  | {
      kind: "update_schedule";
      taskId: string;
      taskName: string;
      before: ArchieScheduleSnapshot;
      after: ArchieScheduleSnapshot;
    }
  | {
      kind: "recommendation_note";
      taskId?: string;
      taskName?: string;
      note: string;
    };

export type ArchieRecommendationDraft = {
  id: string;
  kind: ArchieDraftKind;
  summary: string;
  reasoning: string;
  evidence: string[];
  proposedChanges: ArchieDraftChange[];
  createdAt: number;
  status?: "draft" | "applied" | "discarded";
  sessionId?: string | null;
};

export type ArchieQueryRequest = {
  message: string;
  activePage: ArchieAssistantPage;
  intentHint?: string | null;
  focusSessionNotesByTaskId?: Record<string, string> | null;
};

export type ArchieQueryResponse = {
  mode: ArchieResponseMode;
  message: string;
  citations: ArchieKnowledgeCitation[];
  confidence: ArchieConfidence;
  suggestedAction?: ArchieSuggestedAction;
  draftId?: string;
  draft?: ArchieRecommendationDraft;
  sessionId?: string;
};

export type ArchieRecommendationDraftRequest = ArchieQueryRequest & {
  source?: "widget" | "manual";
};

export type ArchieRecommendationApplyRequest = {
  draftId: string;
  decision?: "apply" | "discard";
  sessionId?: string | null;
};

export type ArchieRecentDraftResponse = {
  draft: ArchieRecommendationDraft | null;
  suggestedAction?: Extract<ArchieSuggestedAction, { kind: "reviewDraft" }>;
  sessionId?: string | null;
};

export type ArchieTelemetryEventType =
  | "review_opened"
  | "apply"
  | "discard"
  | "response_upvote"
  | "response_downvote";

export type ArchieTelemetryEventRequest = {
  sessionId: string;
  draftId?: string | null;
  eventType: ArchieTelemetryEventType;
};

export function normalizeArchieAssistantPage(value: unknown): ArchieAssistantPage {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "dashboard" || raw === "tasks" || raw === "friends" || raw === "leaderboard" || raw === "settings") return raw;
  return "none";
}

export function isArchieDraftAction(
  action: ArchieSuggestedAction | null | undefined
): action is Extract<ArchieSuggestedAction, { kind: "reviewDraft" }> {
  return !!action && action.kind === "reviewDraft";
}
