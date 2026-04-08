import { NextResponse } from "next/server";

import {
  asString,
  createJiraIssue,
  describeError,
  parseJiraIssueKeyFromBrowseUrl,
  syncJiraIssueVote,
} from "../jira/feedback/shared";
import {
  FeedbackApiError,
  toggleFeedbackVoteWithLimits,
  validateAndRecordFeedbackSubmission,
  verifyFeedbackRequestUser,
} from "./shared";

export const dynamic = "force-dynamic";

function normalizeFeedbackType(value: unknown): "bug" | "general" | "feature" {
  const raw = asString(value, 32).toLowerCase();
  if (raw === "bug" || raw === "feature") return raw;
  return "general";
}

function normalizeBoolean(value: unknown) {
  return value === true;
}

function createErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof FeedbackApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error && error.message ? error.message : fallbackMessage;
  return NextResponse.json({ error: message, code: "feedback/internal" }, { status: 500 });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { uid } = await verifyFeedbackRequestUser(req, body);

    const title = asString(body.title, 160);
    const details = asString(body.details, 8000);
    const type = normalizeFeedbackType(body.type);
    const isAnonymous = normalizeBoolean(body.isAnonymous);
    const authorEmail = isAnonymous ? null : asString(body.authorEmail, 320) || null;
    const authorDisplayName = isAnonymous ? null : asString(body.authorDisplayName, 120) || null;
    const authorRankThumbnailSrc = isAnonymous ? null : asString(body.authorRankThumbnailSrc, 1024) || null;
    const authorCurrentRankId = isAnonymous ? null : asString(body.authorCurrentRankId, 120) || null;

    if (!title) {
      throw new FeedbackApiError("feedback/invalid-title", "A feedback title is required.", 400);
    }
    if (!details) {
      throw new FeedbackApiError("feedback/invalid-details", "Feedback details are required.", 400);
    }
    if (!isAnonymous && !authorEmail) {
      throw new FeedbackApiError("feedback/invalid-email", "A feedback email address is required unless submitted anonymously.", 400);
    }

    const jira = await createJiraIssue({
      uid,
      type,
      title,
      details,
      isAnonymous,
      authorEmail,
      authorDisplayName,
    });

    const result = await validateAndRecordFeedbackSubmission({
      uid,
      type,
      title,
      details,
      createPayload: {
        ownerUid: uid,
        authorDisplayName,
        authorEmail,
        authorRankThumbnailSrc,
        authorCurrentRankId,
        isAnonymous,
        type,
        title,
        details,
        status: "open",
        upvoteCount: 0,
        commentCount: 0,
        jiraIssueBrowseUrl: asString(jira.jiraIssueBrowseUrl, 2048) || null,
      },
    });

    return NextResponse.json({
      ok: true,
      feedbackId: result.feedbackId,
      jiraIssueId: jira.jiraIssueId || null,
      jiraIssueKey: jira.jiraIssueKey || null,
      jiraIssueBrowseUrl: jira.jiraIssueBrowseUrl || null,
      deduplicated: jira.deduplicated,
    });
  } catch (error) {
    console.error("[api/feedback] Feedback submission failed", {
      error: describeError(error),
    });
    return createErrorResponse(error, "Could not submit feedback.");
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { uid } = await verifyFeedbackRequestUser(req, body);
    const feedbackId = asString(body.feedbackId, 120);
    if (!feedbackId) {
      throw new FeedbackApiError("feedback/invalid-vote", "Feedback vote target is unavailable.", 400);
    }

    const result = await toggleFeedbackVoteWithLimits({
      uid,
      feedbackId,
    });

    const jiraIssueKey = parseJiraIssueKeyFromBrowseUrl(result.jiraIssueBrowseUrl);
    if (jiraIssueKey) {
      const jiraBaseUrl = asString(process.env.JIRA_BASE_URL).replace(/\/+$/, "");
      if (jiraBaseUrl) {
        void syncJiraIssueVote({
          jiraBaseUrl,
          jiraIssueKey,
          upvoteCount: result.upvoteCount,
          upvoted: result.upvoted,
        }).catch((error) => {
          console.error("[api/feedback] Jira vote sync failed", {
            feedbackId,
            jiraIssueKey,
            error: describeError(error),
          });
        });
      }
    }

    return NextResponse.json({
      ok: true,
      upvoted: result.upvoted,
      upvoteCount: result.upvoteCount,
      jiraIssueBrowseUrl: result.jiraIssueBrowseUrl,
    });
  } catch (error) {
    console.error("[api/feedback] Feedback vote failed", {
      error: describeError(error),
    });
    return createErrorResponse(error, "Could not update vote.");
  }
}
