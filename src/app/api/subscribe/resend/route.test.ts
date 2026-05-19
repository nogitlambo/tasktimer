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

vi.mock("../../shared/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/rateLimit")>();
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

function resendRequest(email = "User@Example.com") {
  return new Request("https://tasklaunch.test/api/subscribe/resend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/subscribe/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    mocks.enforcePublicRateLimit.mockResolvedValue(undefined);
    mocks.sendEarlyAccessConfirmationEmail.mockResolvedValue(undefined);
  });

  it("resends confirmation for an existing subscribed email and stores a one-hour lock", async () => {
    const firestore = createFirestoreMock({ status: "subscribed" });
    mocks.getFirebaseAdminDb.mockReturnValue(firestore.db);

    const response = await POST(resendRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, resent: true, resendLockedUntilMs: 1_700_003_600_000 });
    expect(mocks.sendEarlyAccessConfirmationEmail).toHaveBeenCalledWith({ email: "User@Example.com" });
    expect(firestore.setCalls.at(-1)?.data).toMatchObject({
      confirmationEmailSentAt: "SERVER_TIMESTAMP",
      confirmationEmailLastError: null,
      confirmationEmailResendLockedUntilMs: 1_700_003_600_000,
    });
  });

  it("returns an existing lock without resending", async () => {
    const firestore = createFirestoreMock({
      status: "subscribed",
      confirmationEmailResendLockedUntilMs: 1_700_000_120_000,
    });
    mocks.getFirebaseAdminDb.mockReturnValue(firestore.db);

    const response = await POST(resendRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, resent: false, resendLockedUntilMs: 1_700_000_120_000 });
    expect(mocks.sendEarlyAccessConfirmationEmail).not.toHaveBeenCalled();
    expect(firestore.setCalls).toHaveLength(0);
  });

  it("rejects unknown and unsubscribed emails", async () => {
    const unknownFirestore = createFirestoreMock(null);
    mocks.getFirebaseAdminDb.mockReturnValue(unknownFirestore.db);

    const unknownResponse = await POST(resendRequest());
    expect(unknownResponse.status).toBe(404);
    expect(await unknownResponse.json()).toEqual({ error: "This email is not on the early access list." });

    const unsubscribedFirestore = createFirestoreMock({ status: "unsubscribed" });
    mocks.getFirebaseAdminDb.mockReturnValue(unsubscribedFirestore.db);

    const unsubscribedResponse = await POST(resendRequest());
    expect(unsubscribedResponse.status).toBe(404);
    expect(await unsubscribedResponse.json()).toEqual({ error: "This email is not on the early access list." });
    expect(mocks.sendEarlyAccessConfirmationEmail).not.toHaveBeenCalled();
  });

  it("records send failures without storing a resend lock", async () => {
    const firestore = createFirestoreMock({ status: "subscribed" });
    mocks.getFirebaseAdminDb.mockReturnValue(firestore.db);
    mocks.sendEarlyAccessConfirmationEmail.mockRejectedValue(new Error("SMTP rejected the message"));

    const response = await POST(resendRequest());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "Could not send the confirmation email right now." });
    expect(firestore.setCalls.at(-1)?.data).toMatchObject({
      confirmationEmailLastAttemptAt: "SERVER_TIMESTAMP",
      confirmationEmailLastError: "SMTP rejected the message",
    });
    expect(firestore.setCalls.some((call) => "confirmationEmailResendLockedUntilMs" in call.data)).toBe(false);
  });
});
