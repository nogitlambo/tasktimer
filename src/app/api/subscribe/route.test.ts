import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforcePublicRateLimit: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  sendEarlyAccessConfirmationEmail: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: mocks.serverTimestamp,
  },
}));

vi.mock("../shared/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../shared/rateLimit")>();
  return {
    ...actual,
    enforcePublicRateLimit: mocks.enforcePublicRateLimit,
  };
});

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminDb: mocks.getFirebaseAdminDb,
}));

vi.mock("@/lib/earlyAccessEmail", () => ({
  sendEarlyAccessConfirmationEmail: mocks.sendEarlyAccessConfirmationEmail,
}));

import { POST } from "./route";
import { ApiRateLimitError } from "../shared/rateLimit";

function createFirestoreMock(existingData: Record<string, unknown> | null) {
  const setCalls: Array<{ data: Record<string, unknown>; options: Record<string, unknown> }> = [];
  const snap = {
    exists: existingData !== null,
    get: vi.fn((field: string) => existingData?.[field]),
  };
  const ref = {
    get: vi.fn().mockResolvedValue(snap),
    set: vi.fn((data: Record<string, unknown>, options: Record<string, unknown>) => {
      setCalls.push({ data, options });
      return Promise.resolve();
    }),
  };
  const collection = {
    doc: vi.fn(() => ref),
  };
  const db = {
    collection: vi.fn(() => collection),
  };
  return { db, ref, setCalls };
}

function subscribeRequest(email = "User@Example.com") {
  return new Request("https://tasklaunch.test/api/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforcePublicRateLimit.mockResolvedValue(undefined);
    mocks.sendEarlyAccessConfirmationEmail.mockResolvedValue(undefined);
  });

  it("saves a new early access request and sends a confirmation email", async () => {
    const firestore = createFirestoreMock(null);
    mocks.getFirebaseAdminDb.mockReturnValue(firestore.db);

    const response = await POST(subscribeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, alreadySubscribed: false });
    expect(firestore.db.collection).toHaveBeenCalledWith("coming_soon_subscriptions");
    expect(firestore.setCalls[0].data).toMatchObject({
      email: "User@Example.com",
      emailNormalized: "user@example.com",
      status: "subscribed",
      unsubscribedAt: null,
      createdAt: "SERVER_TIMESTAMP",
    });
    expect(mocks.sendEarlyAccessConfirmationEmail).toHaveBeenCalledWith({ email: "User@Example.com" });
    expect(firestore.setCalls[2].data).toMatchObject({
      confirmationEmailSentAt: "SERVER_TIMESTAMP",
      confirmationEmailLastError: null,
    });
  });

  it("resends confirmation for an already subscribed email", async () => {
    const firestore = createFirestoreMock({ status: "subscribed" });
    mocks.getFirebaseAdminDb.mockReturnValue(firestore.db);

    const response = await POST(subscribeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, alreadySubscribed: true });
    expect(mocks.enforcePublicRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "subscribe-email-resend",
        windowMs: 60 * 60 * 1000,
        maxEvents: 1,
      })
    );
    expect(mocks.sendEarlyAccessConfirmationEmail).toHaveBeenCalledWith({ email: "User@Example.com" });
    expect(firestore.setCalls).toHaveLength(3);
    expect(firestore.setCalls[0].data).not.toHaveProperty("createdAt");
    expect(firestore.setCalls[2].data).toMatchObject({
      confirmationEmailSentAt: "SERVER_TIMESTAMP",
      confirmationEmailLastError: null,
    });
  });

  it("limits confirmation resends for already subscribed emails to once per hour", async () => {
    const firestore = createFirestoreMock({ status: "subscribed" });
    mocks.getFirebaseAdminDb.mockReturnValue(firestore.db);
    mocks.enforcePublicRateLimit.mockImplementation(async (input: { namespace: string }) => {
      if (input.namespace === "subscribe-email-resend") {
        throw new ApiRateLimitError(
          "subscribe/resend-rate-limited",
          "A confirmation email was already sent recently. Please wait before requesting another."
        );
      }
    });

    const response = await POST(subscribeRequest());
    const payload = await response.json();

    expect(response.status).toBe(429);
    expect(payload).toEqual({
      error: "A confirmation email was already sent recently. Please wait before requesting another.",
      code: "subscribe/resend-rate-limited",
    });
    expect(mocks.sendEarlyAccessConfirmationEmail).not.toHaveBeenCalled();
    expect(firestore.setCalls).toHaveLength(0);
  });

  it("reactivates an unsubscribed email and sends confirmation again", async () => {
    const firestore = createFirestoreMock({ status: "unsubscribed" });
    mocks.getFirebaseAdminDb.mockReturnValue(firestore.db);

    const response = await POST(subscribeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, alreadySubscribed: true });
    expect(firestore.setCalls[0].data).toMatchObject({
      status: "subscribed",
      unsubscribedAt: null,
    });
    expect(mocks.enforcePublicRateLimit).not.toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "subscribe-email-resend",
      })
    );
    expect(mocks.sendEarlyAccessConfirmationEmail).toHaveBeenCalledTimes(1);
  });

  it("returns success and records metadata when confirmation email sending fails", async () => {
    const firestore = createFirestoreMock(null);
    mocks.getFirebaseAdminDb.mockReturnValue(firestore.db);
    mocks.sendEarlyAccessConfirmationEmail.mockRejectedValue(new Error("SMTP rejected the message"));

    const response = await POST(subscribeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, alreadySubscribed: false });
    expect(firestore.setCalls.at(-1)?.data).toMatchObject({
      confirmationEmailLastAttemptAt: "SERVER_TIMESTAMP",
      confirmationEmailLastError: "SMTP rejected the message",
    });
  });
});
