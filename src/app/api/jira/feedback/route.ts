import { NextResponse } from "next/server";

import {
  asString,
  describeError,
  fetchJiraIssueStatuses,
} from "./shared";
import {
  FeedbackApiError,
  recordFeedbackRefresh,
  verifyFeedbackRequestUser,
} from "../../feedback/shared";

const isStaticExportBuild = process.env.NEXT_ANDROID_EXPORT === "1";
export const dynamic = "force-dynamic";

function parseIssueKeysParam(value: unknown) {
  return asString(value)
    .split(",")
    .map((part) => asString(part, 120))
    .filter(Boolean);
}

export async function GET(req: Request) {
  if (isStaticExportBuild) {
    return NextResponse.json(
      { ok: true, statuses: {} },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
  try {
    const { uid } = await verifyFeedbackRequestUser(req);
    await recordFeedbackRefresh(uid);

    const url = new URL(req.url);
    const jiraIssueKeys = parseIssueKeysParam(url.searchParams.get("keys"));
    if (!jiraIssueKeys.length) {
      return NextResponse.json(
        { ok: true, statuses: {} },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }

    const jiraBaseUrl = asString(process.env.JIRA_BASE_URL).replace(/\/+$/, "");
    if (!jiraBaseUrl) {
      throw new Error("Missing JIRA_BASE_URL.");
    }
    const statuses = await fetchJiraIssueStatuses({ jiraBaseUrl, jiraIssueKeys });
    console.info("[api/jira/feedback] Jira status sync result", {
      uid,
      requestedKeys: jiraIssueKeys,
      returnedKeys: Object.keys(statuses),
    });
    return NextResponse.json(
      { ok: true, statuses },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("[api/jira/feedback] Jira status load failed", {
      error: describeError(error),
    });
    if (error instanceof FeedbackApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        }
      );
    }
    const message = error instanceof Error && error.message ? error.message : "Could not load Jira feedback status.";
    return NextResponse.json(
      { error: message, code: "feedback/internal" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: "Not supported.", code: "feedback/not-supported" }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: "Not supported.", code: "feedback/not-supported" }, { status: 405 });
}
