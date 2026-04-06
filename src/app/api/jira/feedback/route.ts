import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getFirebaseAdminAuth } from "@/lib/firebaseAdmin";

export const dynamic = "force-static";

type FeedbackType = "bug" | "general" | "feature";

const isStaticExportBuild = process.env.NEXT_ANDROID_EXPORT === "1";

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
  upvoteCount?: number;
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
    `Upvotes: ${Math.max(0, Math.floor(Number(details.upvoteCount || 0) || 0))}`,
    "",
    details.message,
  ];

  return {
    type: "doc",
    version: 1,
    content: lines.map((line) => createAdfParagraph(line)),
  };
}

function parseJiraIssueKeyFromBrowseUrl(urlRaw: unknown) {
  const url = asString(urlRaw, 2048);
  const match = url.match(/\/browse\/([^/?#]+)/i);
  return match?.[1] ? asString(match[1], 120) : "";
}

function parseIssueKeysParam(value: unknown) {
  return asString(value)
    .split(",")
    .map((part) => asString(part, 120))
    .filter(Boolean);
}

function normalizeAdfDescription(value: unknown) {
  if (value && typeof value === "object") {
    const doc = value as { type?: unknown; version?: unknown; content?: unknown };
    if (doc.type === "doc" && Number(doc.version) === 1 && Array.isArray(doc.content)) {
      return {
        type: "doc" as const,
        version: 1 as const,
        content: doc.content as Array<Record<string, unknown>>,
      };
    }
  }
  return {
    type: "doc" as const,
    version: 1 as const,
    content: [] as Array<Record<string, unknown>>,
  };
}

function extractParagraphText(node: Record<string, unknown>) {
  const content = Array.isArray(node.content) ? node.content : [];
  return content
    .map((part) => (part && typeof part === "object" && "text" in part ? asString((part as { text?: unknown }).text) : ""))
    .join("");
}

function upsertUpvoteLineInDescription(description: unknown, upvoteCountRaw: unknown) {
  const upvoteCount = Math.max(0, Math.floor(Number(upvoteCountRaw || 0) || 0));
  const doc = normalizeAdfDescription(description);
  const nextParagraph = createAdfParagraph(`Upvotes: ${upvoteCount}`);
  const nodes = [...doc.content];
  const existingIndex = nodes.findIndex((node) => node?.type === "paragraph" && /^Upvotes:\s*/i.test(extractParagraphText(node)));
  if (existingIndex >= 0) {
    nodes[existingIndex] = nextParagraph;
  } else {
    const uidIndex = nodes.findIndex((node) => node?.type === "paragraph" && /^Firebase UID:\s*/i.test(extractParagraphText(node)));
    const insertIndex = uidIndex >= 0 ? uidIndex + 1 : Math.min(nodes.length, 4);
    nodes.splice(insertIndex, 0, nextParagraph);
  }
  return {
    type: "doc" as const,
    version: 1 as const,
    content: nodes,
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
          upvoteCount: 0,
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

async function syncJiraIssueVote(input: {
  jiraBaseUrl: string;
  jiraIssueKey: string;
  upvoted: boolean;
}) {
  const response = await fetch(`${input.jiraBaseUrl}/rest/api/3/issue/${input.jiraIssueKey}/votes`, {
    method: input.upvoted ? "POST" : "DELETE",
    headers: getJiraAuthHeaders(),
    cache: "no-store",
  });
  if (response.ok) return;

  const payload = (await response.json().catch(() => null)) as
    | { errorMessages?: string[]; errors?: Record<string, string> }
    | null;
  const fieldErrors = payload?.errors ? Object.values(payload.errors).filter(Boolean) : [];
  const message = payload?.errorMessages?.[0] || fieldErrors[0] || "Jira vote update failed.";
  throw new Error(message);
}

async function fetchJiraIssueStatuses(input: {
  jiraBaseUrl: string;
  jiraProjectKey: string;
  jiraIssueKeys: string[];
}) {
  const jiraIssueKeys = Array.from(new Set(input.jiraIssueKeys.map((key) => asString(key, 120)).filter(Boolean)));
  if (!jiraIssueKeys.length) return {};

  const quotedKeys = jiraIssueKeys.map((key) => `"${key.replace(/"/g, '\\"')}"`).join(", ");
  const response = await fetch(`${input.jiraBaseUrl}/rest/api/3/search/jql`, {
    method: "POST",
    headers: getJiraAuthHeaders(),
    body: JSON.stringify({
      jql: `project = "${input.jiraProjectKey}" AND key in (${quotedKeys})`,
      maxResults: jiraIssueKeys.length,
      fields: ["status"],
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        issues?: Array<{
          key?: string;
          fields?: { status?: { name?: string; statusCategory?: { key?: string; name?: string } } };
        }>;
        errorMessages?: string[];
        errors?: Record<string, string>;
      }
    | null;

  if (!response.ok) {
    const fieldErrors = payload?.errors ? Object.values(payload.errors).filter(Boolean) : [];
    const message = payload?.errorMessages?.[0] || fieldErrors[0] || "Jira status lookup failed.";
    throw new Error(message);
  }

  const statuses: Record<string, { name: string; category: string; categoryName: string }> = {};
  (payload?.issues || []).forEach((issue) => {
    const key = asString(issue?.key, 120);
    if (!key) return;
    statuses[key] = {
      name: asString(issue?.fields?.status?.name, 120),
      category: asString(issue?.fields?.status?.statusCategory?.key, 120).toLowerCase(),
      categoryName: asString(issue?.fields?.status?.statusCategory?.name, 120).toLowerCase(),
    };
  });
  return statuses;
}

export async function POST(req: Request) {
  if (isStaticExportBuild) {
    return NextResponse.json({ error: "Jira feedback API is unavailable in static export builds." }, { status: 503 });
  }
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

export async function GET(req: Request) {
  if (isStaticExportBuild) {
    return NextResponse.json({ ok: true, statuses: {} }, { status: 200 });
  }
  try {
    const authHeader = asString(req.headers.get("authorization"));
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!idToken) {
      return NextResponse.json({ error: "You must be signed in to load feedback." }, { status: 401 });
    }

    try {
      await getFirebaseAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Your sign-in session is no longer valid. Please sign in again." }, { status: 401 });
    }

    const url = new URL(req.url);
    const jiraIssueKeys = parseIssueKeysParam(url.searchParams.get("keys"));
    if (!jiraIssueKeys.length) {
      return NextResponse.json({ ok: true, statuses: {} });
    }

    const jiraBaseUrl = getRequiredEnv("JIRA_BASE_URL").replace(/\/+$/, "");
    const jiraProjectKey = getRequiredEnv("JIRA_PROJECT_KEY");
    const statuses = await fetchJiraIssueStatuses({ jiraBaseUrl, jiraProjectKey, jiraIssueKeys });
    return NextResponse.json({ ok: true, statuses });
  } catch (error) {
    console.error("[api/jira/feedback] Jira status load failed", {
      error: describeError(error),
    });
    const message = error instanceof Error && error.message ? error.message : "Could not load Jira feedback status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  if (isStaticExportBuild) {
    return NextResponse.json({ error: "Jira feedback API is unavailable in static export builds." }, { status: 503 });
  }
  try {
    const authHeader = asString(req.headers.get("authorization"));
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
    if (!idToken) {
      return NextResponse.json({ error: "You must be signed in to update feedback." }, { status: 401 });
    }

    try {
      await getFirebaseAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Your sign-in session is no longer valid. Please sign in again." }, { status: 401 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const jiraIssueKey = parseJiraIssueKeyFromBrowseUrl(body.jiraIssueBrowseUrl);
    const upvoteCount = Math.max(0, Math.floor(Number(body.upvoteCount || 0) || 0));
    const upvoted = normalizeBoolean(body.upvoted);
    if (!jiraIssueKey) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const jiraBaseUrl = getRequiredEnv("JIRA_BASE_URL").replace(/\/+$/, "");
    await syncJiraIssueVote({ jiraBaseUrl, jiraIssueKey, upvoted });

    const issueResponse = await fetch(`${jiraBaseUrl}/rest/api/3/issue/${jiraIssueKey}?fields=description`, {
      method: "GET",
      headers: getJiraAuthHeaders(),
      cache: "no-store",
    });
    const issuePayload = (await issueResponse.json().catch(() => null)) as
      | { fields?: { description?: unknown }; errorMessages?: string[]; errors?: Record<string, string> }
      | null;
    if (!issueResponse.ok) {
      const fieldErrors = issuePayload?.errors ? Object.values(issuePayload.errors).filter(Boolean) : [];
      const message = issuePayload?.errorMessages?.[0] || fieldErrors[0] || "Jira issue lookup failed.";
      throw new Error(message);
    }

    const nextDescription = upsertUpvoteLineInDescription(issuePayload?.fields?.description, upvoteCount);
    const updateResponse = await fetch(`${jiraBaseUrl}/rest/api/3/issue/${jiraIssueKey}`, {
      method: "PUT",
      headers: getJiraAuthHeaders(),
      body: JSON.stringify({
        fields: {
          description: nextDescription,
        },
      }),
      cache: "no-store",
    });
    const updatePayload = (await updateResponse.json().catch(() => null)) as
      | { errorMessages?: string[]; errors?: Record<string, string> }
      | null;
    if (!updateResponse.ok) {
      const fieldErrors = updatePayload?.errors ? Object.values(updatePayload.errors).filter(Boolean) : [];
      const message = updatePayload?.errorMessages?.[0] || fieldErrors[0] || "Jira issue update failed.";
      throw new Error(message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/jira/feedback] Jira vote sync failed", {
      error: describeError(error),
    });
    const message = error instanceof Error && error.message ? error.message : "Could not update Jira feedback vote count.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
