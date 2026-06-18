import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  devices: [],
  tasks: {},
  activeSessions: {},
  historyEntries: [],
  writes: [],
  deletes: [],
  batchWrites: [],
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
    exists: true,
  };
}

function createCollectionRef(path, filters = []) {
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
      if (path.endsWith("/historyEntries")) {
        const rows = state.historyEntries.filter((row) =>
          filters.every((filter) => filter.field !== "taskId" || row.taskId === filter.value)
        );
        return {
          docs: rows.map((row, index) => createDocSnapshot(row.id || `history-${index}`, row)),
        };
      }
      if (path.endsWith("/activeSession/current")) {
        const activeSession = state.activeSessions[path];
        if (activeSession) {
          return {
            exists: true,
            id: "current",
            get: (field) => activeSession[field],
            data: () => activeSession,
          };
        }
        return { exists: false, id: "current", get: () => undefined, data: () => undefined };
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
    async set(data, options) {
      state.writes.push({ path, data, options });
      return set(data, options);
    },
    async delete() {
      state.deletes.push(path);
      return deleteRef();
    },
    where(field, op, value) {
      return createCollectionRef(path, [...filters, { field, op, value }]);
    },
    orderBy() { return this; },
    limit() { return this; },
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
    batch: vi.fn(() => {
      const writes = [];
      return {
        set: vi.fn((ref, data, options) => writes.push({ type: "set", path: ref.path, data, options })),
        delete: vi.fn((ref) => writes.push({ type: "delete", path: ref.path })),
        commit: vi.fn(async () => {
          state.batchWrites.push(...writes);
        }),
      };
    }),
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
    state.activeSessions = {};
    state.historyEntries = [];
    state.writes = [];
    state.deletes = [];
    state.batchWrites = [];
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

  it("sends a current-day planned-start push and reschedules without creating a missed-check doc", async () => {
    const dueAtMs = new Date(2026, 4, 29, 9, 0, 0).getTime();
    state.tasks["users/user-1/tasks/task-1"] = {
      id: "task-1",
      name: "Task 1",
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
    state.sendEachForMulticast = vi.fn(async () => ({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    }));
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

    expect(result.status).toBe("sent");
    expect(state.sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(ref.set).toHaveBeenCalledWith(
      expect.objectContaining({
        dueAtMs: new Date(2026, 5, 5, 9, 0, 0).getTime(),
        notificationKind: "plannedStart",
        eventType: "plannedStartReminder",
        effectiveEventType: "plannedStartReminder",
        missedCheckDueAtMs: null,
        missedScheduledStartDueAtMs: null,
        nextPlannedStartDueAtMs: null,
      }),
      { merge: true }
    );
    expect(ref.set.mock.calls[0][0]).not.toEqual(
      expect.objectContaining({
        notificationKind: "missedScheduledTask",
        eventType: "missedScheduledTask",
      })
    );
  });

  it("cleans up an existing missed scheduled task doc without sending a missed push", async () => {
    const scheduledStartMs = new Date(2026, 4, 29, 9, 0, 0).getTime();
    const dueAtMs = scheduledStartMs + 10 * 60_000;
    state.tasks["users/user-1/tasks/task-1"] = {
      id: "task-1",
      name: "Task 1",
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
    state.sendEachForMulticast = vi.fn(async () => ({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    }));
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
        eventType: "missedScheduledTask",
        baseEventType: "plannedStartReminder",
        effectiveEventType: "missedScheduledTask",
        notificationKind: "missedScheduledTask",
        plannedStartDay: "fri",
        plannedStartTime: "09:00",
        missedCheckDueAtMs: dueAtMs,
        missedScheduledStartDueAtMs: scheduledStartMs,
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
        effectiveEventType: "plannedStartReminder",
        missedCheckDueAtMs: null,
        missedScheduledStartDueAtMs: null,
      }),
      { merge: true }
    );
  });

  it("reschedules a previous-day planned-start doc without sending", async () => {
    const dueAtMs = new Date(2026, 4, 29, 9, 0, 0).getTime();
    const nowMs = new Date(2026, 4, 30, 8, 0, 0).getTime();
    state.tasks["users/user-1/tasks/task-1"] = {
      id: "task-1",
      name: "Task 1",
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
        appStateUpdatedAtMs: nowMs,
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

    const result = await __testing.processDuePlannedStartTask(docSnap, nowMs);

    expect(result.status).toBe("skipped");
    expect(state.sendEachForMulticast).not.toHaveBeenCalled();
    expect(ref.set).toHaveBeenCalledWith(
      expect.objectContaining({
        dueAtMs: new Date(2026, 5, 5, 9, 0, 0).getTime(),
        notificationKind: "plannedStart",
        eventType: "plannedStartReminder",
        missedCheckDueAtMs: null,
        missedScheduledStartDueAtMs: null,
      }),
      { merge: true }
    );
  });

  it("reschedules a current-day planned-start doc without sending when the task is already running", async () => {
    const dueAtMs = new Date(2026, 4, 29, 9, 0, 0).getTime();
    state.tasks["users/user-1/tasks/task-1"] = {
      id: "task-1",
      name: "Task 1",
      running: true,
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

    expect(result.status).toBe("running");
    expect(state.sendEachForMulticast).not.toHaveBeenCalled();
    expect(ref.set).toHaveBeenCalledWith(
      expect.objectContaining({
        dueAtMs: new Date(2026, 5, 5, 9, 0, 0).getTime(),
        notificationKind: "plannedStart",
        eventType: "plannedStartReminder",
        missedCheckDueAtMs: null,
        missedScheduledStartDueAtMs: null,
      }),
      { merge: true }
    );
  });
});

describe("processDueTimeGoalCompleteTask", () => {
  beforeEach(() => {
    state.devices = [];
    state.tasks = {};
    state.activeSessions = {};
    state.historyEntries = [];
    state.writes = [];
    state.deletes = [];
    state.batchWrites = [];
    state.prefExists = true;
    state.prefs = {
      mobilePushAlertsEnabled: true,
      webPushAlertsEnabled: true,
      weekStarting: "mon",
    };
    state.sendEachForMulticast = vi.fn(async () => ({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    }));
  });

  function dueDoc(data) {
    return {
      id: data.taskId || "task-1",
      ref: {
        path: `scheduled_time_goal_pushes/user-1__${data.taskId || "task-1"}`,
        set: vi.fn(async (payload, options) => {
          state.writes.push({ path: `scheduled_time_goal_pushes/user-1__${data.taskId || "task-1"}`, data: payload, options });
        }),
        delete: vi.fn(async () => {
          state.deletes.push(`scheduled_time_goal_pushes/user-1__${data.taskId || "task-1"}`);
        }),
      },
      data: () => data,
    };
  }

  it("reschedules to the corrected goal moment when the task has not reached the goal", async () => {
    const startMs = new Date(2026, 4, 29, 9, 0, 0).getTime();
    const nowMs = startMs + 20 * 60_000;
    state.tasks["users/user-1/tasks/task-1"] = {
      id: "task-1",
      name: "Focus",
      running: true,
      startMs,
      accumulatedMs: 0,
      timeGoalEnabled: true,
      timeGoalPeriod: "day",
      timeGoalMinutes: 60,
    };

    const docSnap = dueDoc({
      ownerUid: "user-1",
      taskId: "task-1",
      taskName: "Focus",
      dueAtMs: nowMs,
      eventType: "timeGoalComplete",
      baseEventType: "timeGoalComplete",
      route: "/tasklaunch",
    });

    const result = await __testing.processDueTimeGoalCompleteTask(docSnap, nowMs);

    expect(result.status).toBe("skipped");
    expect(docSnap.ref.set).toHaveBeenCalledWith(
      expect.objectContaining({
        dueAtMs: startMs + 60 * 60_000,
        timeGoalPeriod: "day",
        timeGoalGoalMs: 60 * 60_000,
      }),
      { merge: true }
    );
    expect(state.batchWrites).toEqual([]);
    expect(state.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it("finalizes an overdue weekly goal at the exact goal timestamp", async () => {
    const weekStartMs = new Date(2026, 4, 25, 0, 0, 0).getTime();
    const startMs = new Date(2026, 4, 29, 9, 0, 0).getTime();
    const completedAtMs = startMs + 30 * 60_000;
    const nowMs = startMs + 12 * 60 * 60_000;
    state.historyEntries = [
      {
        taskId: "task-1",
        ts: weekStartMs + 60_000,
        name: "Focus",
        ms: 30 * 60_000,
      },
    ];
    state.tasks["users/user-1/tasks/task-1"] = {
      id: "task-1",
      name: "Focus",
      color: "#c9ff24",
      running: true,
      startMs,
      accumulatedMs: 0,
      timeGoalEnabled: true,
      timeGoalPeriod: "week",
      timeGoalMinutes: 60,
    };
    state.activeSessions["users/user-1/tasks/task-1/activeSession/current"] = {
      sessionId: "session-1",
      taskId: "task-1",
      note: "cloud note",
    };
    state.devices = [
      {
        id: "web-1",
        token: "web-token",
        enabled: true,
        native: false,
        provider: "fcm",
        platform: "web",
        appActive: false,
        appStateUpdatedAtMs: nowMs,
      },
    ];

    const result = await __testing.processDueTimeGoalCompleteTask(dueDoc({
      ownerUid: "user-1",
      taskId: "task-1",
      taskName: "Focus",
      dueAtMs: startMs,
      eventType: "timeGoalComplete",
      baseEventType: "timeGoalComplete",
      route: "/tasklaunch",
      timeGoalPeriod: "week",
      weekStarting: "mon",
    }), nowMs);

    expect(result.status).toBe("sent");
    const historyWrite = state.batchWrites.find((write) => write.type === "set" && write.path.includes("/historyEntries/"));
    expect(historyWrite?.data).toEqual(expect.objectContaining({
      taskId: "task-1",
      ts: completedAtMs,
      ms: 30 * 60_000,
      sessionId: "session-1",
      note: "cloud note",
    }));
    const taskWrite = state.batchWrites.find((write) => write.type === "set" && write.path === "users/user-1/tasks/task-1");
    expect(taskWrite?.data).toEqual(expect.objectContaining({
      running: false,
      startMs: null,
      accumulatedMs: 0,
      timeGoalCompletedWeekKey: "2026-05-25",
      timeGoalCompletedAtMs: completedAtMs,
      timeGoalCompletedElapsedMs: 60 * 60_000,
    }));
    expect(state.batchWrites).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "delete", path: "users/user-1/tasks/task-1/activeSession/current" }),
      expect.objectContaining({ type: "delete", path: "scheduled_time_goal_pushes/user-1__task-1" }),
    ]));
    expect(state.sendEachForMulticast).toHaveBeenCalledTimes(1);
  });
});

describe("scheduled task schedule helpers", () => {
  it("does not classify by-day planned starts as unscheduled gaps when plannedStartTime is null", () => {
    expect(
      __testing.isUnscheduledGapCandidateTask({
        timeGoalEnabled: true,
        timeGoalPeriod: "day",
        timeGoalMinutes: 60,
        plannedStartTime: null,
        plannedStartByDay: { mon: "09:00", wed: "09:00", fri: "09:00" },
        plannedStartOpenEnded: false,
      })
    ).toBe(false);
  });

  it("builds scheduled blocks from by-day planned starts when plannedStartTime is null", () => {
    const blocks = __testing.buildScheduledBlocksForDay(
      [
        {
          timeGoalEnabled: true,
          timeGoalPeriod: "day",
          timeGoalMinutes: 60,
          plannedStartTime: null,
          plannedStartByDay: { mon: "09:00", wed: "10:00" },
          plannedStartOpenEnded: false,
        },
      ],
      new Date(2026, 5, 1, 9, 30, 0).getTime()
    );

    expect(blocks).toEqual([{ startMinutes: 9 * 60, endMinutes: 10 * 60 }]);
  });
});
