import { NextResponse } from "next/server";

import {
  ApiRateLimitError,
  buildPublicRateLimitActorKey,
  enforcePublicRateLimit,
  enforceUidRateLimit,
  extractClientIp,
} from "../shared/rateLimit";
import {
  asString,
  createJiraIssue,
  describeError,
  parseJiraIssueKeyFromBrowseUrl,
  syncJiraIssueVote,
  uploadJiraIssueAttachment,
} from "../jira/feedback/shared";
import {
  FeedbackApiError,
  loadFeedbackAuthorProfile,
  toggleFeedbackVoteWithLimits,
  validateAndRecordFeedbackSubmission,
  verifyFeedbackRequestUser,
} from "./shared";

export const dynamic = "force-dynamic";

const MAX_FEEDBACK_ATTACHMENTS = 8;
const MAX_FEEDBACK_ATTACHMENT_BYTES = 6 * 1024 * 1024;
const MAX_GUEST_FEEDBACK_ATTACHMENTS = 2;

type ParsedFeedbackAttachment = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  data: Uint8Array;
};

function normalizeFeedbackType(value: unknown): "bug" | "general" | "feature" {
  const raw = asString(value, 32).toLowerCase();
  if (raw === "bug" || raw === "feature") return raw;
  return "general";
}

function normalizeBoolean(value: unknown) {
  return value === true || asString(value, 16).toLowerCase() === "true";
}

function createErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiRateLimitError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  if (error instanceof FeedbackApiError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error && error.message ? error.message : fallbackMessage;
  return NextResponse.json({ error: message, code: "feedback/internal" }, { status: 500 });
}

async function parseFeedbackPostBody(req: Request) {
  const contentType = asString(req.headers.get("content-type"), 240).toLowerCase();
  if (!contentType.includes("multipart/form-data")) {
    const body = (await req.json()) as Record<string, unknown>;
    return { body, attachments: [] as ParsedFeedbackAttachment[] };
  }

  const formData = await req.formData();
  const body: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string" && key !== "attachments") {
      body[key] = value;
    }
  });

  const attachmentEntries = formData.getAll("attachments");
  if (attachmentEntries.length > MAX_FEEDBACK_ATTACHMENTS) {
    throw new FeedbackApiError(
      "feedback/too-many-attachments",
      `You can attach up to ${MAX_FEEDBACK_ATTACHMENTS} screenshots per submission.`,
      400
    );
  }

  const attachments = await Promise.all(
    attachmentEntries.map(async (entry, index) => {
      if (!(entry instanceof File)) {
        throw new FeedbackApiError("feedback/invalid-attachment", "One of the screenshots could not be read.", 400);
      }
      const sizeBytes = Math.max(0, Math.floor(Number(entry.size || 0) || 0));
      if (!sizeBytes || sizeBytes > MAX_FEEDBACK_ATTACHMENT_BYTES) {
        throw new FeedbackApiError(
          "feedback/attachment-too-large",
          `Each screenshot must be a PNG under ${Math.round(MAX_FEEDBACK_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
          400
        );
      }
      const mimeType = asString(entry.type, 120).toLowerCase();
      if (mimeType !== "image/png") {
        throw new FeedbackApiError("feedback/invalid-attachment-type", "Screenshots must be submitted as PNG images.", 400);
      }
      const metaRaw = asString(formData.get(`attachmentMeta:${index}`), 4000);
      let width = 0;
      let height = 0;
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw) as { width?: unknown; height?: unknown };
          width = Math.max(0, Math.floor(Number(meta.width || 0) || 0));
          height = Math.max(0, Math.floor(Number(meta.height || 0) || 0));
        } catch {
          width = 0;
          height = 0;
        }
      }
      return {
        filename: asString(entry.name, 240) || `feedback-screenshot-${index + 1}.png`,
        mimeType: "image/png",
        sizeBytes,
        width,
        height,
        data: new Uint8Array(await entry.arrayBuffer()),
      } satisfies ParsedFeedbackAttachment;
    })
  );

  return { body, attachments };
}

export async function POST(req: Request) {
  try {
    const { body, attachments } = await parseFeedbackPostBody(req);
    const { uid, email } = await verifyFeedbackRequestUser(req, body);

    const title = asString(body.title, 160);
    const details = asString(body.details, 8000);
    const type = normalizeFeedbackType(body.type);
    const isAnonymous = normalizeBoolean(body.isAnonymous);
    const isGuest = uid.startsWith("guest:");
    const clientIp = extractClientIp(req);
    if (isGuest) {
      await enforcePublicRateLimit({
        namespace: "feedback-guest-submission-ip",
        actorKey: buildPublicRateLimitActorKey({ ip: clientIp }),
        windowMs: 24 * 60 * 60 * 1000,
        maxEvents: 5,
        code: "feedback/guest-rate-limited",
        message: "Too many guest feedback submissions recently. Please sign in or try again later.",
      });
      await enforcePublicRateLimit({
        namespace: "feedback-guest-submission-burst",
        actorKey: buildPublicRateLimitActorKey({ ip: clientIp, secondaryKey: `${type}:${title}` }),
        windowMs: 10 * 60 * 1000,
        maxEvents: 2,
        code: "feedback/guest-burst-rate-limited",
        message: "Please wait before submitting similar guest feedback again.",
      });
      if (attachments.length > MAX_GUEST_FEEDBACK_ATTACHMENTS) {
        throw new FeedbackApiError(
          "feedback/guest-too-many-attachments",
          `Guest submissions can attach up to ${MAX_GUEST_FEEDBACK_ATTACHMENTS} screenshots.`,
          400
        );
      }
    } else {
      await enforceUidRateLimit({
        namespace: "feedback-submission",
        uid,
        windowMs: 10 * 60 * 1000,
        maxEvents: 6,
        code: "feedback/submission-burst-rate-limited",
        message: "Too many feedback submissions recently. Please wait before trying again.",
      });
    }
    const authorProfile = isAnonymous ? null : await loadFeedbackAuthorProfile(uid);
    const authorEmail = isAnonymous ? null : email || (isGuest ? asString(body.authorEmail, 320) || null : null);
    const authorDisplayName = isAnonymous ? null : authorProfile?.displayName || null;
    const authorRankThumbnailSrc = isAnonymous ? null : authorProfile?.rankThumbnailSrc || null;
    const authorCurrentRankId = isAnonymous ? null : authorProfile?.currentRankId || null;

    if (!title) {
      throw new FeedbackApiError("feedback/invalid-title", "A feedback title is required.", 400);
    }
    if (!details) {
      throw new FeedbackApiError("feedback/invalid-details", "Feedback details are required.", 400);
    }
    if (!isAnonymous && !authorEmail) {
      throw new FeedbackApiError("feedback/invalid-email", "A feedback email address is required unless submitted anonymously.", 400);
    }

    let jira: Awaited<ReturnType<typeof createJiraIssue>> | null = null;
    try {
      jira = await createJiraIssue({
        uid,
        type,
        title,
        details,
        isAnonymous,
        authorEmail,
        authorDisplayName,
      });
    } catch (error) {
      console.error("[api/feedback] Jira issue creation failed; persisting feedback without Jira mirror", {
        uid,
        type,
        error: describeError(error),
      });
      jira = null;
    }

    const jiraIssueTarget = jira ? asString(jira.jiraIssueId, 120) || asString(jira.jiraIssueKey, 120) : "";
    if (jiraIssueTarget) {
      for (const attachment of attachments) {
        try {
          await uploadJiraIssueAttachment({
            jiraIssueIdOrKey: jiraIssueTarget,
            filename: attachment.filename,
            contentType: attachment.mimeType,
            data: attachment.data,
          });
        } catch (error) {
          console.error("[api/feedback] Jira attachment upload failed; continuing without attachment mirror", {
            uid,
            jiraIssueTarget,
            filename: attachment.filename,
            error: describeError(error),
          });
        }
      }
    }

    const result = await validateAndRecordFeedbackSubmission({
      uid,
      type,
      title,
      details,
      createPayload: {
        ownerUid: uid,
        authorDisplayName,
        authorRankThumbnailSrc,
        authorCurrentRankId,
        isAnonymous,
        type,
        title,
        details,
        status: "open",
        upvoteCount: 0,
        commentCount: 0,
        jiraIssueBrowseUrl: asString(jira?.jiraIssueBrowseUrl, 2048) || null,
      },
      privatePayload: authorEmail
        ? {
            authorEmail,
            isAnonymous,
            type,
            title,
          }
        : undefined,
    });

    return NextResponse.json({
      ok: true,
      feedbackId: result.feedbackId,
      jiraIssueId: jira?.jiraIssueId || null,
      jiraIssueKey: jira?.jiraIssueKey || null,
      jiraIssueBrowseUrl: jira?.jiraIssueBrowseUrl || null,
      deduplicated: jira?.deduplicated || false,
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
    await enforceUidRateLimit({
      namespace: "feedback-vote-toggle",
      uid,
      windowMs: 10 * 60 * 1000,
      maxEvents: 60,
      code: "feedback/vote-rate-limited",
      message: "Too many feedback vote attempts recently. Please wait before trying again.",
    });
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
