import type { FeedbackStatus } from "./feedbackStore";

export type JiraFeedbackStatus = {
  name?: string | null;
  category?: string | null;
  categoryName?: string | null;
};

function normalizeLower(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function mapJiraStatusToFeedbackStatus(
  jiraStatus: JiraFeedbackStatus | null | undefined,
  fallbackStatus: FeedbackStatus
): FeedbackStatus {
  if (!jiraStatus) return fallbackStatus;
  const name = normalizeLower(jiraStatus.name);
  const category = normalizeLower(jiraStatus.category);
  const categoryName = normalizeLower(jiraStatus.categoryName);

  if (/closed|cancelled|canceled|rejected|declined|duplicate|won't fix|wont fix|invalid/.test(name)) return "closed";
  if (/shipped|released|release|deployed|complete|completed|done|fixed|resolve|resolved|implemented|merged/.test(name)) return "shipped";
  if (/in progress|progress|implement|implementing|doing|active|review|testing|test|qa|verify|verified|ready for qa|ready for test/.test(name)) {
    return "in_progress";
  }
  if (/planned|plan|backlog|selected|queued|next|triage|groom|groomed|refine|refined|to do|todo/.test(name)) return "planned";
  if (category === "done" || /done|complete|completed/.test(categoryName)) return "shipped";
  if (category === "indeterminate") return "in_progress";
  return fallbackStatus;
}
