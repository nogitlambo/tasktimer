import {beforeEach, describe, expect, it, vi} from "vitest";

type DeviceRow = {
  id: string;
  token: string;
  enabled?: boolean;
  native?: boolean;
  provider?: string;
  platform?: string;
  appActive?: boolean;
  appStateUpdatedAtMs?: number;
};

type TaskRow = Record<string, unknown>;

type UserState = {
  devices: DeviceRow[];
  preferences: {
    mobilePushAlertsEnabled?: boolean;
    webPushAlertsEnabled?: boolean;
  };
  tasks: Record<string, TaskRow>;
};

const state = {
  users: new Map<string, UserState>(),
};

const sendEachForMulticast = vi.fn();

function getUserState(uid: string): UserState {
  const existing = state.users.get(uid);
  if (existing) return existing;
  const created: UserState = {
    devices: [],
    preferences: {},
    tasks: {},
  };
  state.users.set(uid, created);
  return created;
}

function resetState() {
  state.users.clear();
  sendEachForMulticast.mockReset();
  sendEachForMulticast.mockImplementation(async (payload: {tokens?: string[]}) => ({
    successCount: Array.isArray(payload?.tokens) ? payload.tokens.length : 0,
    failureCount: 0,
    responses: Array.from({length: Array.isArray(payload?.tokens) ? payload.tokens.length : 0}, () => ({success: true})),
  }));
}

function makeDocSnapshot(id: string, data: Record<string, unknown> | null | undefined, exists = true) {
  return {
    id,
    exists,
    data: () => (data ? {...data} : {}),
    get: (field: string) => data?.[field],
  };
}

function createDbMock() {
  return {
    collection(name: string) {
      if (name !== "users") throw new Error(`Unsupported root collection: ${name}`);
      return {
        doc(uid: string) {
          return {
            collection(subName: string) {
              if (subName === "devices") {
                return {
                  async get() {
                    const user = getUserState(uid);
                    return {
                      docs: user.devices.map((device) => ({
                        id: device.id,
                        data: () => ({...device}),
                        get: (field: string) => (device as Record<string, unknown>)[field],
                      })),
                    };
                  },
                  doc(deviceId: string) {
                    return {
                      async set() {
                        return undefined;
                      },
                      id: deviceId,
                    };
                  },
                };
              }
              if (subName === "preferences") {
                return {
                  doc(prefId: string) {
                    return {
                      async get() {
                        const prefs = getUserState(uid).preferences;
                        const exists = prefId === "v1" && Object.keys(prefs).length > 0;
                        return makeDocSnapshot(prefId, prefs, exists);
                      },
                    };
                  },
                };
              }
              if (subName === "tasks") {
                return {
                  doc(taskId: string) {
                    return {
                      async get() {
                        const task = getUserState(uid).tasks[taskId];
                        return makeDocSnapshot(taskId, task || {}, !!task);
                      },
                    };
                  },
                };
              }
              throw new Error(`Unsupported user subcollection: ${subName}`);
            },
          };
        },
      };
    },
  };
}

const dbMock = createDbMock();

vi.mock("firebase-admin/app", () => ({
  getApps: () => [],
  getApp: () => ({}),
  initializeApp: () => ({}),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => "__serverTimestamp__",
    delete: () => "__delete__",
  },
  getFirestore: () => dbMock,
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: () => ({
    sendEachForMulticast,
  }),
}));

vi.mock("firebase-functions/v2/https", () => ({
  HttpsError: class HttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
  onCall: (_options: unknown, handler: unknown) => handler,
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: (_options: unknown, handler: unknown) => handler,
}));

vi.mock("firebase-functions", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const mod = await import("./index.js");
const {__testing} = mod;

describe("timeGoalComplete push delivery", () => {
  beforeEach(() => {
    resetState();
  });

  it("sends web push when web alerts are enabled and mobile alerts are disabled", async () => {
    state.users.set("user-1", {
      devices: [
        {
          id: "web-1",
          token: "web-token-1",
          enabled: true,
          native: false,
          provider: "fcm",
          platform: "web",
          appActive: false,
          appStateUpdatedAtMs: 0,
        },
        {
          id: "native-1",
          token: "native-token-1",
          enabled: true,
          native: true,
          provider: "fcm",
          platform: "android",
          appActive: false,
          appStateUpdatedAtMs: 0,
        },
      ],
      preferences: {
        mobilePushAlertsEnabled: false,
        webPushAlertsEnabled: true,
      },
      tasks: {
        "task-1": {
          name: "Deep Work",
          running: true,
          startMs: 1_000,
          accumulatedMs: 0,
          timeGoalEnabled: true,
          timeGoalMinutes: 1,
        },
      },
    });

    const ref = {
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const result = await __testing.processDueTimeGoalCompleteTask({
      id: "user-1__task-1",
      data: () => ({
        ownerUid: "user-1",
        taskId: "task-1",
        taskName: "Deep Work",
        dueAtMs: 61_000,
        route: "/tasklaunch",
      }),
      ref,
    }, 61_000);

    expect(result.status).toBe("sent");
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(sendEachForMulticast).toHaveBeenCalledWith(expect.objectContaining({
      tokens: ["web-token-1"],
      notification: expect.objectContaining({
        title: "Time Goal Reached",
      }),
      webpush: expect.objectContaining({
        fcmOptions: expect.objectContaining({
          link: "/tasklaunch",
        }),
      }),
    }));
    expect(ref.set).toHaveBeenCalledTimes(1);
  });

  it("sends both native and web pushes even when a native device is foregrounded", async () => {
    state.users.set("user-2", {
      devices: [
        {
          id: "native-2",
          token: "native-token-2",
          enabled: true,
          native: true,
          provider: "fcm",
          platform: "android",
          appActive: true,
          appStateUpdatedAtMs: 120_000,
        },
        {
          id: "web-2",
          token: "web-token-2",
          enabled: true,
          native: false,
          provider: "fcm",
          platform: "web",
          appActive: false,
          appStateUpdatedAtMs: 0,
        },
      ],
      preferences: {
        mobilePushAlertsEnabled: true,
        webPushAlertsEnabled: true,
      },
      tasks: {
        "task-2": {
          name: "Admin Cleanup",
          running: true,
          startMs: 60_000,
          accumulatedMs: 0,
          timeGoalEnabled: true,
          timeGoalMinutes: 1,
        },
      },
    });

    const ref = {
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const result = await __testing.processDueTimeGoalCompleteTask({
      id: "user-2__task-2",
      data: () => ({
        ownerUid: "user-2",
        taskId: "task-2",
        taskName: "Admin Cleanup",
        dueAtMs: 120_000,
        route: "/tasklaunch",
      }),
      ref,
    }, 120_000);

    expect(result.status).toBe("sent");
    expect(sendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(sendEachForMulticast).toHaveBeenNthCalledWith(1, expect.objectContaining({
      tokens: ["native-token-2"],
      notification: expect.objectContaining({
        title: "Time Goal Reached",
      }),
      android: expect.objectContaining({
        notification: expect.objectContaining({
          channelId: "tasklaunch-default",
        }),
      }),
      apns: expect.objectContaining({
        payload: expect.objectContaining({
          aps: expect.objectContaining({
            sound: "default",
          }),
        }),
      }),
      data: expect.objectContaining({
        eventType: "timeGoalComplete",
      }),
    }));
    expect(sendEachForMulticast).toHaveBeenNthCalledWith(2, expect.objectContaining({
      tokens: ["web-token-2"],
    }));
    expect(ref.set).toHaveBeenCalledTimes(1);
  });

  it("does not resend duplicate time-goal pushes", async () => {
    const ref = {
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };

    const result = await __testing.processDueTimeGoalCompleteTask({
      id: "user-3__task-3",
      data: () => ({
        ownerUid: "user-3",
        taskId: "task-3",
        taskName: "Duplicate Guard",
        dueAtMs: 300_000,
        sentDueAtMs: 300_000,
        route: "/tasklaunch",
      }),
      ref,
    }, 300_000);

    expect(result).toEqual({status: "duplicate"});
    expect(sendEachForMulticast).not.toHaveBeenCalled();
    expect(ref.set).not.toHaveBeenCalled();
    expect(ref.delete).not.toHaveBeenCalled();
  });
});
