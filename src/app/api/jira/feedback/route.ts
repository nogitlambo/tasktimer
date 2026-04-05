import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getFirebaseAdminAuth } from "@/lib/firebaseAdmin";

type FeedbackType = "bug" | "general" | "feature";

function asString(value: unknown, maxLength = 0) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return maxLength > 0 ? normalized.slice(0, maxLength) : normalized;
}

function normalizeFeedbackType(value: unknown): FeedbackType {
  const raw = asString(value, 32).toLowerCase();
  if (raw === "bug" || raw === "feature") return raw;
  return "general";
}

function normalizeBoolean(value: unknown) {
  return value === true;
}

function getRequiredEnv(name: string) {
  const value = asString(process.env[name]);
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function getIssueTypeName(type: FeedbackType) {
  if (type === "bug") return asString(process.env.JIRA_ISSUE_TYPE_BUG) || asString(process.env.JIRA_ISSUE_TYPE_DEFAULT) || "Bug";
  if (type === "feature") return asString(process.env.JIRA_ISSUE_TYPE_FEATURE) || asString(process.env.JIRA_ISSUE_TYPE_DEFAULT) || "Task";
  return asString(process.env.JIRA_ISSUE_TYPE_GENERAL) || asString(process.env.JIRA_ISSUE_TYPE_DEFAULT) || "Task";
}

function getJiraAuthHeaders() {
  const jiraEmail = getRequiredEnv("JIRA_EMAIL");
  const jiraApiToken = getRequiredEnv("JIRA_API_TOKEN");
  const auth = Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString("base64");
  return {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function buildSubmissionSignature(input: {
  uid: string;
  type: FeedbackType;
  title: string;
  details: string;
  isAnonymous: boolean;
  authorEmail: string | null;
}) {
  return JSON.stringify({
    uid: input.uid,
    type: input.type,
    title: input.title.trim(),
    details: input.details.trim(),
    isAnonymous: input.isAnonymous,
    authorEmail: input.authorEmail?.trim().toLowerCase() || null,
  });
}

function buildSubmissionLabel(signature: string) {
  const hash = createHash("sha256").update(signature).digest("hex").slice(0, 20);
  return `tasklaunch-submit-${hash}`;
}

async function searchJiraIssueBySubmissionLabel(input: {
  jiraBaseUrl: string;
  jiraProjectKey: string;
  submissionLabel: string;
}) {
  const response = await fetch(`${input.jiraBaseUrl}/rest/api/3/search/jql`, {
    method: "POST",
    headers: getJiraAuthHeaders(),
    body: JSON.stringify({
      jql: `project = "${input.jiraProjectKey}" AND labels = "${input.submissionLabel}" ORDER BY created DESC`,
      maxResults: 1,
      fields: ["key"],
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { issues?: Array<{ id?: string; key?: string }> }
    | { errorMessages?: string[]; errors?: Record<string, string> }
    | null;

  if (!response.ok) {
    const errorMessages = payload && "errorMessages" in payload && Array.isArray(payload.errorMessages) ? payload.errorMessages : [];
    const fieldErrors =
      payload && "errors" in payload && payload.errors && typeof payload.errors === "object"
        ? Object.values(payload.errors)
            .map((value) => asString(value))
            .filter(Boolean)
        : [];
    throw new Error(errorMessages[0] || fieldErrors[0] || "Jira search failed.");
  }

  const issue = payload && "issues" in payload ? payload.issues?.[0] : null;
  return issue?.key ? { jiraIssueKey: asString(issue.key, 120), jiraIssueId: asString(issue.id, 120) } : null;
}

function describeError(error: unknown) {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown };
    return {
      name: error.name,
      message: error.message,
      code: typeof withCode.code === "string" ? withCode.code : null,
      stack: error.stack || null,
    };
  }
  return { value: error };
}

function createAdfParagraph(text: string) {
  return {
    type: "paragraph",
    content: text ? [{ type: "text", text }] : [],
  };
}

function createJiraDescription(details: {
  type: FeedbackType;
  message: string;
  isAnonymous: boolean;
  submittedEmail: string | null;
  displayName: string | null;
  uid: string;
}) {
  const lines = [
    `Feedback type: ${details.type}`,
    `Submitted by: ${details.isAnonymous ? "Anonymous user" : details.displayName || details.submittedEmail || "TaskLaunch user"}`,
    `Email: ${details.isAnonymous ? "Anonymous" : details.submittedEmail || "Not provided"}`,
    `Firebase UID: ${details.uid}`,
    "",
    details.message,
  ];

  return {
    type: "doc",
    version: 1,
    content: lines.map((line) => createAdfParagraph(line)),
  };
}

async function createJiraIssue(input: {
  uid: string;
  type: FeedbackType;
  title: string;
  details: string;
  isAnonymous: boolean;
  authorEmail: string | null;
  authorDisplayName: string | null;
}) {
  const jiraBaseUrl = getRequiredEnv("JIRA_BASE_URL").replace(/\/+$/, "");
  const jiraProjectKey = getRequiredEnv("JIRA_PROJECT_KEY");
  const issueTypeName = getIssueTypeName(input.type);
  const submissionSignature = buildSubmissionSignature({
    uid: input.uid,
    type: input.type,
    title: input.title,
    details: input.details,
    isAnonymous: input.isAnonymous,
    authorEmail: input.authorEmail,
  });
  const submissionLabel = buildSubmissionLabel(submissionSignature);
  const existing = await searchJiraIssueBySubmissionLabel({
    jiraBaseUrl,
    jiraProjectKey,
    submissionLabel,
  });
  if (existing?.jiraIssueKey) {
    return {
      jiraIssueId: existing.jiraIssueId || "",
      jiraIssueKey: existing.jiraIssueKey,
      jiraIssueApiUrl: existing.jiraIssueId ? `${jiraBaseUrl}/rest/api/3/issue/${existing.jiraIssueId}` : "",
      jiraIssueBrowseUrl: `${jiraBaseUrl}/browse/${existing.jiraIssueKey}`,
      deduplicated: true,
    };
  }

  const response = await fetch(`${jiraBaseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: getJiraAuthHeaders(),
    body: JSON.stringify({
      fields: {
        project: { key: jiraProjectKey },
        summary: `[TaskLaunch] ${input.title}`,
        description: createJiraDescription({
          type: input.type,
          message: input.details,
          isAnonymous: input.isAnonymous,
          submittedEmail: input.authorEmail,
          displayName: input.authorDisplayName,
          uid: input.uid,
        }),
        issuetype: { name: issueTypeName },
        labels: ["tasklaunch-feedback", `feedback-${input.type}`, submissionLabel],
      },
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | { key?: string; id?: string; self?: string; errorMessages?: string[]; errors?: Record<string, string> }
    | null;

  if (!response.ok) {
    const fieldErrors = payload?.errors ? Object.values(payload.errors).filter(Boolean) : [];
    const message = payload?.errorMessages?.[0] || fieldErrors[0] || "Jira issue creation failed.";
    throw new Error(message);
  }

  return {
    jiraIssueId: asString(payload?.id, 120),
    jiraIssueKey: asString(payload?.key, 120),
    jiraIssueApiUrl: asString(payload?.self, 1024),
    jiraIssueBrowseUrl: payload?.key ? `${jiraBaseUrl}/browse/${payload.key}` : "",
    deduplicated: false,
  };
}

export async function POST(req: Request) {
  try {
    const authHeader = asString(req.headers.get("authorization"));
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!idToken) {
      return NextResponse.json({ error: "You must be signed in to submit feedback." }, { status: 401 });
    }

    let decodedToken: { uid: string };
    try {
      decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Your sign-in session is no longer valid. Please sign in again." }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const title = asString(body.title, 160);
    const details = asString(body.details, 8000);
    const type = normalizeFeedbackType(body.type);
    const isAnonymous = normalizeBoolean(body.isAnonymous);
    const authorEmail = isAnonymous ? null : asString(body.authorEmail, 320) || null;
    const authorDisplayName = isAnonymous ? null : asString(body.authorDisplayName, 120) || null;
    if (!title) {
      return NextResponse.json({ error: "A feedback title is required." }, { status: 400 });
    }
    if (!details) {
      return NextResponse.json({ error: "Feedback details are required." }, { status: 400 });
    }
    if (!isAnonymous && !authorEmail) {
      return NextResponse.json({ error: "A feedback email address is required unless submitted anonymously." }, { status: 400 });
    }

    let jira: Awaited<ReturnType<typeof createJiraIssue>>;
    try {
      jira = await createJiraIssue({
        uid: decodedToken.uid,
        type,
        title,
        details,
        isAnonymous,
        authorEmail,
        authorDisplayName,
      });
    } catch (error) {
      console.error("[api/jira/feedback] Jira issue creation failed", {
        uid: decodedToken.uid,
        projectKey: process.env.JIRA_PROJECT_KEY || null,
        issueType: getIssueTypeName(type),
        error: describeError(error),
      });
      const message = error instanceof Error && error.message ? error.message : "Jira issue creation failed.";
      return NextResponse.json({ error: message, stage: "jira" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      jiraIssueId: jira.jiraIssueId || null,
      jiraIssueKey: jira.jiraIssueKey || null,
      jiraIssueApiUrl: jira.jiraIssueApiUrl || null,
      jiraIssueBrowseUrl: jira.jiraIssueBrowseUrl || null,
      deduplicated: jira.deduplicated,
    });
  } catch (error) {
    console.error("[api/jira/feedback] Unexpected failure", {
      error: describeError(error),
    });
    const message = error instanceof Error && error.message ? error.message : "Could not submit feedback.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
