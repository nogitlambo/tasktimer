import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  devices: [],
  tasks: {},
  prefExists: true,
  prefs: {
    mobilePushAlertsEnabled: true,
    webPushAlertsEnabled: true,
  },
  sendEachForMulticast: vi.fn(),
};

function createDocSnapshot(id, data) {
  return {
    id,
    get: (field) => data[field],
    data: () => data,
  };
}

function createCollectionRef(path) {
  const set = vi.fn(async () => {});
  const deleteRef = vi.fn(async () => {});
  return {
    path,
    doc(id) {
      const nextPath = `${path}/${id}`;
      if (nextPath.endsWith("/preferences/v1")) {
        return {
          get: async () => ({
            exists: state.prefExists,
            get: (field) => state.prefs[field],
          }),
        };
      }
      return createCollectionRef(nextPath);
    },
    collection(name) {
      return createCollectionRef(`${path}/${name}`);
    },
    async get() {
      if (path.includes("/devices")) {
        return {
          docs: state.devices.map((row) => createDocSnapshot(row.id, row)),
        };
      }
      const task = state.tasks[path];
      if (task) {
        return {
          exists: true,
          id: path.split("/").pop(),
          get: (field) => task[field],
          data: () => task,
        };
      }
      return { docs: [] };
    },
    set,
    delete: deleteRef,
    where() {
      return this;
    },
  };
}

vi.mock("firebase-admin/app", () => ({
  getApp: vi.fn(() => ({ name: "app" })),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: "app" })),
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: vi.fn(() => "SERVER_TIMESTAMP"),
    delete: vi.fn(() => "DELETE_FIELD"),
  },
  getFirestore: vi.fn(() => ({
    collection: (name) => createCollectionRef(name),
    batch: vi.fn(),
    runTransaction: vi.fn(),
  })),
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: vi.fn(() => ({
    sendEachForMulticast: (...args) => state.sendEachForMulticast(...args),
  })),
}));

vi.mock("firebase-functions/v2/https", () => ({
  HttpsError: class HttpsError extends Error {},
  onCall: vi.fn((_options, handler) => handler),
}));

vi.mock("firebase-functions/v2/scheduler", () => ({
  onSchedule: vi.fn((_config, handler) => handler),
}));

vi.mock("firebase-functions", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { __testing } = await import("./index.js");

describe("sendScheduledTaskNotification", () => {
  beforeEach(() => {
    state.devices = [];
    state.tasks = {};
    state.prefExists = true;
    state.prefs = {
      mobilePushAlertsEnabled: true,
      webPushAlertsEnabled: true,
    };
    state.sendEachForMulticast = vi.fn(async () => ({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    }));
  });

  it("still sends to web devices when the app is active", async () => {
    state.devices = [
      {
        id: "web-1",
        token: "web-token",
        enabled: true,
        native: false,
        provider: "fcm",
        platform: "web",
        appActive: true,
        appStateUpdatedAtMs: Date.now(),
      },
    ];

    const result = await __testing.sendScheduledTaskNotification({
      uid: "user-1",
      nowMs: Date.now(),
      route: "/tasklaunch",
      taskId: "task-1",
      taskName: "Task 1",
      payloadData: { taskId: "task-1", route: "/tasklaunch" },
      webTitle: "Task Reminder",
      webBody: "Task 1 is scheduled to start now.",
      allowWeb: true,
      skipIfForeground: true,
    });

    expect(result.status).toBe("sent");
    expect(state.sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(state.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["web-token"],
        webpush: expect.objectContaining({
          headers: { Urgency: "high" },
          fcmOptions: { link: "/tasklaunch" },
          data: expect.objectContaining({ route: "/tasklaunch", taskId: "task-1" }),
        }),
      })
    );
  });

  it("suppresses native sends when the native app is active", async () => {
    state.devices = [
      {
        id: "native-1",
        token: "native-token",
        enabled: true,
        native: true,
        provider: "fcm",
        platform: "android",
        appActive: true,
        appStateUpdatedAtMs: Date.now(),
      },
    ];

    const result = await __testing.sendScheduledTaskNotification({
      uid: "user-1",
      nowMs: Date.now(),
      route: "/tasklaunch",
      taskId: "task-1",
      taskName: "Task 1",
      payloadData: { taskId: "task-1", route: "/tasklaunch" },
      webTitle: "Task Reminder",
      webBody: "Task 1 is scheduled to start now.",
      allowWeb: true,
      skipIfForeground: true,
    });

    expect(result.status).toBe("foreground");
    expect(state.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("sends to web while suppressing active native devices in mixed sets", async () => {
    state.devices = [
      {
        id: "native-1",
        token: "native-token",
        enabled: true,
        native: true,
        provider: "fcm",
        platform: "android",
        appActive: true,
        appStateUpdatedAtMs: Date.now(),
      },
      {
        id: "web-1",
        token: "web-token",
        enabled: true,
        native: false,
        provider: "fcm",
        platform: "web",
        appActive: true,
        appStateUpdatedAtMs: Date.now(),
      },
    ];

    const result = await __testing.sendScheduledTaskNotification({
      uid: "user-1",
      nowMs: Date.now(),
      route: "/tasklaunch",
      taskId: "task-1",
      taskName: "Task 1",
      payloadData: { taskId: "task-1", route: "/tasklaunch" },
      webTitle: "Task Reminder",
      webBody: "Task 1 is scheduled to start now.",
      allowWeb: true,
      skipIfForeground: true,
    });

    expect(result.status).toBe("sent");
    expect(state.sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(state.sendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ["web-token"],
      })
    );
  });

  it("filters malformed device docs out of eligibility", async () => {
    state.devices = [
      {
        id: "bad-web-1",
        token: "bad-token",
        enabled: true,
        native: false,
        provider: "",
        platform: "",
        appActive: false,
        appStateUpdatedAtMs: Date.now(),
      },
    ];

    const result = await __testing.sendScheduledTaskNotification({
      uid: "user-1",
      nowMs: Date.now(),
      route: "/tasklaunch",
      taskId: "task-1",
      taskName: "Task 1",
      payloadData: { taskId: "task-1", route: "/tasklaunch" },
      webTitle: "Task Reminder",
      webBody: "Task 1 is scheduled to start now.",
      allowWeb: true,
      skipIfForeground: false,
    });

    expect(result).toEqual({ status: "no-devices" });
    expect(state.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("skips a due planned-start push when the task is already complete for that day", async () => {
    const dueAtMs = new Date(2026, 4, 29, 9, 0, 0).getTime();
    state.tasks["users/user-1/tasks/task-1"] = {
      id: "task-1",
      name: "Task 1",
      timeGoalCompletedDayKey: "2026-05-29",
      plannedStartDay: "fri",
      plannedStartTime: "09:00",
      plannedStartPushRemindersEnabled: true,
    };
    state.devices = [
      {
        id: "native-1",
        token: "native-token",
        enabled: true,
        native: true,
        provider: "fcm",
        platform: "android",
        appActive: false,
        appStateUpdatedAtMs: dueAtMs,
      },
    ];
    const ref = {
      path: "scheduled_time_goal_pushes/task-1",
      set: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
    };
    const docSnap = {
      id: "task-1",
      ref,
      data: () => ({
        ownerUid: "user-1",
        taskId: "task-1",
        taskName: "Task 1",
        dueAtMs,
        eventType: "plannedStartReminder",
        baseEventType: "plannedStartReminder",
        plannedStartDay: "fri",
        plannedStartTime: "09:00",
        plannedStartPushRemindersEnabled: true,
      }),
    };

    const result = await __testing.processDuePlannedStartTask(docSnap, dueAtMs);

    expect(result.status).toBe("skipped");
    expect(state.sendEachForMulticast).not.toHaveBeenCalled();
    expect(ref.set).toHaveBeenCalledWith(
      expect.objectContaining({
        dueAtMs: new Date(2026, 5, 5, 9, 0, 0).getTime(),
        notificationKind: "plannedStart",
        eventType: "plannedStartReminder",
      }),
      { merge: true }
    );
  });
});
