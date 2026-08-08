import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

import { parseNextBestActionRecommendationRecord } from "./nextBestActionRecommendation";

const record = {
  id: "nba-1",
  userId: "uid-1",
  type: "NEXT_BEST_ACTION",
  taskId: "task-1",
  sourceTaskVersion: "version-1",
  status: "ACTIVE",
  createdAt: "2026-08-07T00:00:00.000Z",
  expiresAt: "2026-08-07T00:30:00.000Z",
  auditExpiresAt: "2026-09-06T00:00:00.000Z",
  payload: {
    title: "Prepare launch",
    firstAction: "Open the launch checklist.",
    score: 82,
    confidence: "HIGH",
    reasonCodes: ["DUE_SOON", "HAS_CLEAR_FIRST_ACTION"],
    availableMinutes: 20,
    focusWindowMatched: true,
    durationMinutes: 20,
    durationSource: "ACCEPTED_CLARIFICATION",
    alternativeIndex: 0,
    explanation: "Due soon and already has a clear first action.",
  },
};

describe("Next Best Action recommendation contract", () => {
  it("parses a discriminated Next Best Action record through its own payload schema", () => {
    const parsed = parseNextBestActionRecommendationRecord(record);

    expect(parsed).toMatchObject({
      id: "nba-1",
      type: "NEXT_BEST_ACTION",
      status: "ACTIVE",
      payload: {
        title: "Prepare launch",
        durationSource: "ACCEPTED_CLARIFICATION",
      },
    });
  });

  it("does not parse a Task Clarification record as Next Best Action", () => {
    expect(parseNextBestActionRecommendationRecord({ ...record, type: "TASK_CLARIFICATION" })).toBeNull();
  });

  it("fails safely for invalid Next Best Action payloads", () => {
    expect(
      parseNextBestActionRecommendationRecord({
        ...record,
        payload: { ...record.payload, reasonCodes: ["UNSUPPORTED_REASON"] },
      })
    ).toBeNull();
  });

  it("normalizes Firestore timestamps from persisted shared recommendations", () => {
    const parsed = parseNextBestActionRecommendationRecord({
      ...record,
      createdAt: Timestamp.fromMillis(Date.parse(record.createdAt)),
      expiresAt: Timestamp.fromMillis(Date.parse(record.expiresAt)),
      auditExpiresAt: Timestamp.fromMillis(Date.parse(record.auditExpiresAt)),
    });

    expect(parsed).toMatchObject({ createdAt: record.createdAt, expiresAt: record.expiresAt, auditExpiresAt: record.auditExpiresAt });
  });
});
