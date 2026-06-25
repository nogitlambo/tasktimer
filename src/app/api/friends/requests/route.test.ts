import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceUidRateLimit: vi.fn(),
  getFirebaseAdminDb: vi.fn(),
  getFirebaseAdminMessaging: vi.fn(),
  getFirebaseAdminProjectId: vi.fn(),
  sendEachForMulticast: vi.fn(),
  deleteField: vi.fn(() => "DELETE_FIELD"),
  serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
  verifyFirebaseRequestUser: vi.fn(),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: mocks.deleteField,
    serverTimestamp: mocks.serverTimestamp,
  },
}));

vi.mock("../../shared/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/auth")>();
  return {
    ...actual,
    verifyFirebaseRequestUser: mocks.verifyFirebaseRequestUser,
  };
});

vi.mock("../../shared/rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/rateLimit")>();
  return {
    ...actual,
    enforceUidRateLimit: mocks.enforceUidRateLimit,
  };
});

vi.mock("@/lib/firebaseAdmin", () => ({
  getFirebaseAdminDb: mocks.getFirebaseAdminDb,
  getFirebaseAdminMessaging: mocks.getFirebaseAdminMessaging,
  getFirebaseAdminProjectId: mocks.getFirebaseAdminProjectId,
}));

import { OPTIONS, POST } from "./route";

function friendRequest(body: Record<string, unknown>, origin = "capacitor://localhost") {
  return new Request("https://tasklaunch.app/api/friends/requests", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-firebase-auth": "token",
    },
    body: JSON.stringify(body),
  });
}

function createDocSnapshot(id: string, data: Record<string, unknown> | null) {
  return {
    id,
    exists: !!data,
    get: (field: string) => data?.[field],
    data: () => data || undefined,
  };
}

function createFriendRequestDb(docOverrides: Record<string, Record<string, unknown> | null> = {}) {
  type FakeDocRef = {
    path: string;
    id: string;
    collection: (name: string) => FakeCollectionRef;
    get: () => Promise<ReturnType<typeof createDocSnapshot>>;
    set: (data: Record<string, unknown>, options?: unknown) => Promise<void>;
    update: (data: Record<string, unknown>) => Promise<void>;
  };
  type FakeCollectionRef = {
    path: string;
    doc: (id: string) => FakeDocRef;
    collection: (name: string) => FakeCollectionRef;
    get: () => Promise<{ docs: Array<ReturnType<typeof createDocSnapshot>> }>;
  };
  type FakeTransaction = {
    get: (ref: { path: string }) => Promise<ReturnType<typeof createDocSnapshot>>;
    set: (ref: { path: string }, data: Record<string, unknown>, options?: unknown) => void;
    update: (ref: { path: string }, data: Record<string, unknown>) => void;
  };
  const writes: Array<{ path: string; data: Record<string, unknown>; options?: unknown }> = [];
  const docs: Record<string, Record<string, unknown> | null> = {
    "userEmailLookup/receiver%40example.com": {
      uid: "receiver-uid",
      email: "receiver@example.com",
    },
    "friend_requests/pending:sender-uid:receiver-uid": null,
    "friend_requests/pending:receiver-uid:sender-uid": null,
    "friendships/pair:receiver-uid:sender-uid": null,
    "users/sender-uid": {
      username: "Sender",
    },
    "users/receiver-uid": {
      username: "Receiver",
    },
    "users/receiver-uid/preferences/v1": {
      mobilePushAlertsEnabled: true,
      webPushAlertsEnabled: false,
    },
    "users/receiver-uid/devices/receiver-native-device": {
      id: "receiver-native-device",
      token: "receiver-native-token",
      enabled: true,
      native: true,
      provider: "fcm",
      platform: "android",
    },
    ...docOverrides,
  };
  const collectionDocs: Record<string, Array<Record<string, unknown> & { id: string }>> = {
    "users/receiver-uid/devices": [
      {
        id: "receiver-native-device",
        token: "receiver-native-token",
        enabled: true,
        native: true,
        provider: "fcm",
        platform: "android",
      },
    ],
  };

  function docRef(path: string): FakeDocRef {
    return {
      path,
      id: path.split("/").pop() || "",
      collection: (name: string) => collectionRef(`${path}/${name}`),
      get: async () => createDocSnapshot(path.split("/").pop() || "", docs[path] || null),
      set: async (data: Record<string, unknown>, options?: unknown) => {
        writes.push({ path, data, options });
        docs[path] = { ...(docs[path] || {}), ...data };
      },
      update: async (data: Record<string, unknown>) => {
        writes.push({ path, data });
        docs[path] = { ...(docs[path] || {}), ...data };
      },
    };
  }

  function collectionRef(path: string): FakeCollectionRef {
    return {
      path,
      doc: (id: string) => docRef(`${path}/${id}`),
      collection: (name: string) => collectionRef(`${path}/${name}`),
      get: async () => ({
        docs: (collectionDocs[path] || []).map((row) => createDocSnapshot(row.id, row)),
      }),
    };
  }

  return {
    docs,
    writes,
    collection: (name: string) => collectionRef(name),
    runTransaction: async (handler: (tx: FakeTransaction) => Promise<unknown>) =>
      handler({
        get: async (ref: { path: string }) => createDocSnapshot(ref.path.split("/").pop() || "", docs[ref.path] || null),
        set: (ref: { path: string }, data: Record<string, unknown>, options?: unknown) => {
          writes.push({ path: ref.path, data, options });
          docs[ref.path] = { ...(docs[ref.path] || {}), ...data };
        },
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          writes.push({ path: ref.path, data });
          docs[ref.path] = { ...(docs[ref.path] || {}), ...data };
        },
      }),
  };
}

describe("POST /api/friends/requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforceUidRateLimit.mockResolvedValue(undefined);
    mocks.verifyFirebaseRequestUser.mockResolvedValue({
      uid: "sender-uid",
      email: "sender@example.com",
      idToken: "token",
    });
    mocks.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
    mocks.getFirebaseAdminMessaging.mockReturnValue({
      sendEachForMulticast: mocks.sendEachForMulticast,
    });
    mocks.getFirebaseAdminProjectId.mockReturnValue("tasktimer-prod");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "tasktimer-prod");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "996538028829");
  });

  it("allows Capacitor preflight requests with the Firebase auth header", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/friends/requests", {
        method: "OPTIONS",
        headers: {
          origin: "capacitor://localhost",
          "access-control-request-headers": "content-type,x-firebase-auth",
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(response.headers.get("access-control-allow-headers")).toContain("X-Firebase-Auth");
  });

  it("allows Android WebView localhost preflight requests", () => {
    const response = OPTIONS(
      new Request("https://tasklaunch.app/api/friends/requests/", {
        method: "OPTIONS",
        headers: {
          origin: "https://localhost",
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type,x-firebase-auth",
        },
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://localhost");
  });

  it("keeps CORS headers on validation errors returned to native clients", async () => {
    const response = await POST(friendRequest({ receiverEmail: "" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe("capacitor://localhost");
    expect(payload).toEqual({ error: "Email address is required." });
  });

  it("creates a pending request for the Firestore trigger to deliver", async () => {
    const db = createFriendRequestDb();
    mocks.getFirebaseAdminDb.mockReturnValue(db);

    const response = await POST(friendRequest({ receiverEmail: "receiver@example.com" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, requestId: "pending:sender-uid:receiver-uid" });
    expect(db.writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "friend_requests/pending:sender-uid:receiver-uid",
          data: expect.objectContaining({
            requestId: "pending:sender-uid:receiver-uid",
            senderUid: "sender-uid",
            receiverUid: "receiver-uid",
            status: "pending",
          }),
        }),
      ])
    );
    expect(db.writes[0].data).not.toHaveProperty("notificationDeliveryMode");
    expect(mocks.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("rejects duplicate pending requests in the same direction without writing or sending push", async () => {
    const db = createFriendRequestDb({
      "friend_requests/pending:sender-uid:receiver-uid": {
        requestId: "pending:sender-uid:receiver-uid",
        senderUid: "sender-uid",
        receiverUid: "receiver-uid",
        status: "pending",
      },
    });
    mocks.getFirebaseAdminDb.mockReturnValue(db);

    const response = await POST(friendRequest({ receiverEmail: "receiver@example.com" }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({ error: "A pending request already exists for this user." });
    expect(db.writes).toEqual([]);
    expect(mocks.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("rejects crossed pending requests without writing or sending push", async () => {
    const db = createFriendRequestDb({
      "friend_requests/pending:receiver-uid:sender-uid": {
        requestId: "pending:receiver-uid:sender-uid",
        senderUid: "receiver-uid",
        receiverUid: "sender-uid",
        status: "pending",
      },
    });
    mocks.getFirebaseAdminDb.mockReturnValue(db);

    const response = await POST(friendRequest({ receiverEmail: "receiver@example.com" }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({ error: "This user has already sent you a pending friend request." });
    expect(db.writes).toEqual([]);
    expect(mocks.sendEachForMulticast).not.toHaveBeenCalled();
  });
});
