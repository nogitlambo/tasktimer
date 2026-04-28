import { beforeEach, describe, expect, it, vi } from "vitest";

type RateLimitDoc = Record<string, unknown>;

const docs = new Map<string, RateLimitDoc>();
const getFirebaseAdminDb = vi.fn();

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminDb,
}));

function docRef(path: string) {
  return { path };
}

function createDb() {
  return {
    collection(name: string) {
      return {
        doc(id: string) {
          return docRef(`${name}/${id}`);
        },
      };
    },
    async runTransaction<T>(handler: (tx: {
      get: (ref: { path: string }) => Promise<{ exists: boolean; get: (field: string) => unknown; data: () => Record<string, unknown> | undefined }>;
      set: (ref: { path: string }, value: Record<string, unknown>, options?: { merge?: boolean }) => void;
    }) => Promise<T>) {
      const tx = {
        async get(ref: { path: string }) {
          const value = docs.get(ref.path);
          return {
            exists: !!value,
            get(field: string) {
              return value?.[field];
            },
            data() {
              return value;
            },
          };
        },
        set(ref: { path: string }, value: Record<string, unknown>, options?: { merge?: boolean }) {
          const existing = docs.get(ref.path) || {};
          docs.set(ref.path, options?.merge ? { ...existing, ...value } : value);
        },
      };
      return handler(tx);
    },
  };
}

describe("shared rate limiter", () => {
  beforeEach(() => {
    docs.clear();
    getFirebaseAdminDb.mockReset().mockReturnValue(createDb());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T02:00:00.000Z"));
  });

  it("allows uid requests until the threshold, then throws", async () => {
    const { ApiRateLimitError, enforceUidRateLimit } = await import("./rateLimit");
    await enforceUidRateLimit({
      namespace: "test-uid",
      uid: "user-1",
      windowMs: 10 * 60 * 1000,
      maxEvents: 2,
      code: "test/rate-limited",
      message: "Too many requests.",
    });
    await enforceUidRateLimit({
      namespace: "test-uid",
      uid: "user-1",
      windowMs: 10 * 60 * 1000,
      maxEvents: 2,
      code: "test/rate-limited",
      message: "Too many requests.",
    });
    await expect(
      enforceUidRateLimit({
        namespace: "test-uid",
        uid: "user-1",
        windowMs: 10 * 60 * 1000,
        maxEvents: 2,
        code: "test/rate-limited",
        message: "Too many requests.",
      })
    ).rejects.toBeInstanceOf(ApiRateLimitError);
  });

  it("stores deterministic hashes for public composite keys", async () => {
    const { buildPublicRateLimitActorKey, enforcePublicRateLimit } = await import("./rateLimit");
    const actorKey = buildPublicRateLimitActorKey({ ip: "203.0.113.10", secondaryKey: "person@example.com" });

    await enforcePublicRateLimit({
      namespace: "subscribe-public",
      actorKey,
      windowMs: 10 * 60 * 1000,
      maxEvents: 5,
      code: "subscribe/rate-limited",
      message: "Too many subscribe attempts.",
    });
    await enforcePublicRateLimit({
      namespace: "subscribe-public",
      actorKey,
      windowMs: 10 * 60 * 1000,
      maxEvents: 5,
      code: "subscribe/rate-limited",
      message: "Too many subscribe attempts.",
    });

    expect(docs.size).toBe(1);
    const stored = Array.from(docs.values())[0];
    expect(stored.actorType).toBe("public");
    expect(typeof stored.actorKeyHash).toBe("string");
    expect((stored.actorKeyHash as string).length).toBe(64);
  });

  it("prunes expired events from the active window", async () => {
    const { enforceUidRateLimit } = await import("./rateLimit");
    docs.set("api_rate_limits/test-window__uid__seed", {
      namespace: "test-window",
      actorType: "uid",
      actorKeyHash: "seed",
      uid: "user-1",
      events: [Date.now() - 61_000, Date.now() - 5_000],
    });

    await enforceUidRateLimit({
      namespace: "test-window",
      uid: "user-1",
      windowMs: 60_000,
      maxEvents: 2,
      code: "test/rate-limited",
      message: "Too many requests.",
    });

    const stored = Array.from(docs.values()).find((entry) => entry.namespace === "test-window");
    expect(Array.isArray(stored?.events)).toBe(true);
    expect((stored?.events as number[]).length).toBe(2);
  });

  it("extracts the client ip with the expected precedence", async () => {
    const { extractClientIp } = await import("./rateLimit");

    expect(
      extractClientIp(
        new Request("http://localhost", {
          headers: { "x-forwarded-for": "198.51.100.5, 203.0.113.10", "x-real-ip": "192.0.2.10", "cf-connecting-ip": "192.0.2.11" },
        })
      )
    ).toBe("198.51.100.5");
    expect(extractClientIp(new Request("http://localhost", { headers: { "x-real-ip": "192.0.2.10" } }))).toBe("192.0.2.10");
    expect(extractClientIp(new Request("http://localhost", { headers: { "cf-connecting-ip": "192.0.2.11" } }))).toBe("192.0.2.11");
    expect(extractClientIp(new Request("http://localhost"))).toBe("unknown");
  });
});
