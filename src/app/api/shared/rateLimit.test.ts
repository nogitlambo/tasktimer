import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getFirebaseAdminDb: vi.fn() }));

vi.mock("@/lib/firebaseAdmin", () => ({ getFirebaseAdminDb: mocks.getFirebaseAdminDb }));

import { enforceUidRateLimit, extractClientIp } from "./rateLimit";

describe("extractClientIp", () => {
  it("ignores spoofable forwarding headers without trusted proxy secret", () => {
    delete process.env.TRUSTED_PROXY_HEADER_SECRET;
    const req = new Request("https://example.test", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-real-ip": "5.6.7.8",
        "cf-connecting-ip": "9.9.9.9",
      },
    });
    expect(extractClientIp(req)).toBe("unknown");
  });

  it("uses trusted proxy headers when authenticated", () => {
    process.env.TRUSTED_PROXY_HEADER_SECRET = "secret";
    const req = new Request("https://example.test", {
      headers: {
        "x-tasktimer-proxy-auth": "secret",
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
      },
    });
    expect(extractClientIp(req)).toBe("1.2.3.4");
  });
});

describe("enforceUidRateLimit", () => {
  it("encodes slash-containing namespaces before using them as Firestore document IDs", async () => {
    const documentIds: string[] = [];
    const set = vi.fn();
    mocks.getFirebaseAdminDb.mockReturnValue({
      collection: () => ({
        doc: (documentId: string) => {
          documentIds.push(documentId);
          return { path: `api_rate_limits/${documentId}` };
        },
      }),
      runTransaction: async (callback: (transaction: { get: () => Promise<{ get: () => undefined }>; set: typeof set }) => Promise<void>) =>
        callback({ get: async () => ({ get: () => undefined }), set }),
    });

    await enforceUidRateLimit({
      namespace: "next-best-action/explanation",
      uid: "uid-1",
      windowMs: 60_000,
      maxEvents: 10,
      code: "rate-limited",
      message: "Slow down.",
    });

    expect(documentIds).toHaveLength(1);
    expect(documentIds[0]).toContain("next-best-action%2Fexplanation");
    expect(documentIds[0]).not.toContain("next-best-action/explanation");
  });
});
