import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: mocks.serverTimestamp,
  },
}));

vi.mock("./firebaseAdmin", () => ({
  getFirebaseAdminDb: vi.fn(),
}));

import { createEarlyAccessUnsubscribeToken } from "./earlyAccessEmail";
import { unsubscribeEarlyAccessEmail } from "./earlyAccessUnsubscribe";

function createFirestoreMock(existingData: Record<string, unknown> | null) {
  const set = vi.fn().mockResolvedValue(undefined);
  const ref = {
    get: vi.fn().mockResolvedValue({
      exists: existingData !== null,
      get: vi.fn((field: string) => existingData?.[field]),
    }),
    set,
  };
  const db = {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ref),
    })),
  };
  return { db, ref, set };
}

describe("unsubscribeEarlyAccessEmail", () => {
  beforeEach(() => {
    process.env.EARLY_ACCESS_UNSUBSCRIBE_SECRET = "test-secret";
    vi.clearAllMocks();
  });

  it("marks a valid early access subscription as unsubscribed", async () => {
    const firestore = createFirestoreMock({ status: "subscribed" });
    const token = createEarlyAccessUnsubscribeToken("USER@example.com");

    const result = await unsubscribeEarlyAccessEmail({
      email: "user@example.com",
      token,
      db: firestore.db as never,
    });

    expect(result).toEqual({ status: "unsubscribed", email: "user@example.com" });
    expect(firestore.set).toHaveBeenCalledWith(
      {
        emailNormalized: "user@example.com",
        status: "unsubscribed",
        unsubscribedAt: "SERVER_TIMESTAMP",
        updatedAt: "SERVER_TIMESTAMP",
      },
      { merge: true }
    );
  });

  it("does not mutate Firestore for an invalid token", async () => {
    const firestore = createFirestoreMock({ status: "subscribed" });

    const result = await unsubscribeEarlyAccessEmail({
      email: "user@example.com",
      token: "invalid",
      db: firestore.db as never,
    });

    expect(result).toEqual({ status: "invalid", email: "user@example.com" });
    expect(firestore.set).not.toHaveBeenCalled();
  });

  it("returns already-unsubscribed without rewriting the row", async () => {
    const firestore = createFirestoreMock({ status: "unsubscribed" });
    const token = createEarlyAccessUnsubscribeToken("user@example.com");

    const result = await unsubscribeEarlyAccessEmail({
      email: "user@example.com",
      token,
      db: firestore.db as never,
    });

    expect(result).toEqual({ status: "already-unsubscribed", email: "user@example.com" });
    expect(firestore.set).not.toHaveBeenCalled();
  });
});
