import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/app/tasktimer/lib/types";
import { processTypedBrainDump, type BrainDumpAiProvider, type BrainDumpSessionStore } from "./brainDumpProcessing";

function workspaceTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-existing",
    name: "Existing task",
    taskType: "recurring",
    onceOffDay: null,
    onceOffTargetDate: null,
    createdAtMs: 100,
    order: 1,
    accumulatedMs: 0,
    running: false,
    startMs: null,
    collapsed: false,
    milestonesEnabled: false,
    milestoneTimeUnit: "hour",
    milestones: [],
    hasStarted: false,
    ...overrides,
  };
}

describe("processTypedBrainDump", () => {
  it("turns typed input into a validated review session without creating tasks", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(async () => ({
        items: [
          {
            itemType: "task",
            title: "Finish Play Store screenshots",
            sourceEvidence: ["finish the Play Store screenshots"],
            confidence: 0.94,
            ambiguityFlags: [],
          },
          {
            itemType: "task",
            title: "Call dentist",
            sourceEvidence: ["call the dentist before Thursday"],
            confidence: 0.88,
            ambiguityFlags: [],
          },
        ],
      })),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };

    const session = await processTypedBrainDump({
      uid: "uid-1",
      text: "Finish the Play Store screenshots and call the dentist before Thursday.",
      timezone: "Australia/Sydney",
      provider,
      store,
      createId: () => "brain-dump-session-1",
      now: () => 1_800_000_000_000,
    });

    expect(provider.extractTyped).toHaveBeenCalledWith({
      promptId: "brain-dump-v1",
      text: "Finish the Play Store screenshots and call the dentist before Thursday.",
      timezone: "Australia/Sydney",
    });
    expect(store.saveSession).toHaveBeenCalledWith(session);
    expect(session).toMatchObject({
      id: "brain-dump-session-1",
      ownerUid: "uid-1",
      mode: "typed",
      state: "review",
      promptId: "brain-dump-v1",
      createdAtMs: 1_800_000_000_000,
      expiresAtMs: 1_800_604_800_000,
      review: {
        selectedCount: 2,
        items: [
          {
            itemType: "task",
            title: "Finish Play Store screenshots",
            selected: true,
            sourceEvidence: ["finish the Play Store screenshots"],
            confidence: 0.94,
            ambiguityFlags: [],
            supported: true,
          },
          {
            itemType: "task",
            title: "Call dentist",
            selected: true,
            sourceEvidence: ["call the dentist before Thursday"],
            confidence: 0.88,
            ambiguityFlags: [],
            supported: true,
          },
        ],
      },
    });
    expect(JSON.stringify(session)).not.toContain("createdTask");
  });

  it("rejects provider output with fields outside the review schema before storage", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(async () => ({
        items: [
          {
            itemType: "task",
            title: "Call dentist",
            sourceEvidence: ["call the dentist"],
            confidence: 0.9,
            ambiguityFlags: [],
            createdTaskId: "task-should-not-exist",
          },
        ],
      })),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };

    await expect(
      processTypedBrainDump({
        uid: "uid-1",
        text: "Call dentist.",
        provider,
        store,
        createId: () => "brain-dump-session-1",
      })
    ).rejects.toMatchObject({
      code: "brain-dump/provider-schema-invalid",
      status: 502,
    });
    expect(store.saveSession).not.toHaveBeenCalled();
  });

  it("preserves explicit source dates separately from AI-suggested dates in review items", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(async () => ({
        items: [
          {
            itemType: "task",
            title: "Call dentist",
            sourceEvidence: ["call dentist tomorrow"],
            confidence: 0.9,
            ambiguityFlags: [],
            dueDateText: "tomorrow",
            dateSource: "explicit",
          },
          {
            itemType: "task",
            title: "Clean desk",
            sourceEvidence: ["clean desk"],
            confidence: 0.72,
            ambiguityFlags: [],
            dueDateText: "Friday",
            dateSource: "suggested",
          },
        ],
      })),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };

    const session = await processTypedBrainDump({
      uid: "uid-1",
      text: "Call dentist tomorrow. Clean desk.",
      timezone: "Australia/Sydney",
      provider,
      store,
      createId: () => "brain-dump-session-1",
      now: () => Date.parse("2026-08-05T02:00:00.000Z"),
    });

    expect(session.review.items[0].date).toMatchObject({
      originalDateText: "tomorrow",
      dateSource: "explicit",
      timezone: "Australia/Sydney",
      resolvedDate: "2026-08-06",
      userConfirmedDate: false,
      ambiguity: "none",
    });
    expect(session.review.items[1].date).toMatchObject({
      originalDateText: "Friday",
      dateSource: "suggested",
      timezone: "Australia/Sydney",
      resolvedDate: "2026-08-07",
      userConfirmedDate: false,
      ambiguity: "none",
    });
  });

  it("preserves optional enrichment only when the provider supplies it", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(async () => ({
        items: [
          {
            itemType: "task",
            title: "Prepare investor update",
            sourceEvidence: ["prepare investor update"],
            confidence: 0.88,
            ambiguityFlags: [],
            notes: "Mention onboarding metrics.",
            estimatedDurationMinutes: 45,
            priority: "high",
            firstAction: "Open the draft deck",
          },
          {
            itemType: "task",
            title: "Clean desk",
            sourceEvidence: ["clean desk"],
            confidence: 0.74,
            ambiguityFlags: [],
          },
        ],
      })),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };

    const session = await processTypedBrainDump({
      uid: "uid-1",
      text: "Prepare investor update. Clean desk.",
      provider,
      store,
      createId: () => "brain-dump-session-1",
    });

    expect(session.review.items[0].enrichment).toEqual({
      notes: "Mention onboarding metrics.",
      estimatedDurationMinutes: 45,
      priority: "high",
      firstAction: "Open the draft deck",
    });
    expect(session.review.items[1].enrichment).toEqual({
      notes: null,
      estimatedDurationMinutes: null,
      priority: null,
      firstAction: null,
    });
  });

  it("adds advisory duplicate warnings for similar existing tasks without sending workspace content to the provider", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(async () => ({
        items: [
          {
            itemType: "task",
            title: "Call dentist",
            sourceEvidence: ["call dentist"],
            confidence: 0.9,
            ambiguityFlags: [],
          },
        ],
      })),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };

    const session = await processTypedBrainDump({
      uid: "uid-1",
      text: "Call dentist.",
      provider,
      store,
      createId: () => "brain-dump-session-1",
      workspaceTasks: [workspaceTask({ id: "task-dentist", name: "Call the dentist" })],
    });

    expect(provider.extractTyped).toHaveBeenCalledWith({
      promptId: "brain-dump-v1",
      text: "Call dentist.",
      timezone: "UTC",
    });
    expect(JSON.stringify(vi.mocked(provider.extractTyped).mock.calls)).not.toContain("Call the dentist");
    expect(session.review.items[0].duplicateWarnings).toEqual([
      expect.objectContaining({
        source: "workspace",
        matchedTaskId: "task-dentist",
        matchedTitle: "Call the dentist",
        matchedState: "active",
        reason: "Similar existing task title.",
      }),
    ]);
    expect(session.review.items[0].duplicateDecision).toBe("undecided");
  });

  it("adds same-dump warnings and ignores distinct titles", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(async () => ({
        items: [
          {
            itemType: "task",
            title: "Call dentist",
            sourceEvidence: ["call dentist"],
            confidence: 0.9,
            ambiguityFlags: [],
          },
          {
            itemType: "task",
            title: "Call the dentist",
            sourceEvidence: ["call the dentist"],
            confidence: 0.86,
            ambiguityFlags: [],
          },
          {
            itemType: "task",
            title: "Call plumber",
            sourceEvidence: ["call plumber"],
            confidence: 0.86,
            ambiguityFlags: [],
          },
        ],
      })),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };

    const session = await processTypedBrainDump({
      uid: "uid-1",
      text: "Call dentist. Call the dentist. Call plumber.",
      provider,
      store,
      createId: () => "brain-dump-session-1",
    });

    expect(session.review.items[1].duplicateWarnings).toEqual([
      expect.objectContaining({
        source: "same-dump",
        matchedItemId: "brain-dump-session-1-item-1",
        matchedState: "proposed",
      }),
    ]);
    expect(session.review.items[2].duplicateWarnings).toEqual([]);
  });

  it("classifies recent and archived workspace duplicate matches", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(async () => ({
        items: [
          {
            itemType: "task",
            title: "Submit report",
            sourceEvidence: ["submit report"],
            confidence: 0.9,
            ambiguityFlags: [],
          },
          {
            itemType: "task",
            title: "Renew passport",
            sourceEvidence: ["renew passport"],
            confidence: 0.9,
            ambiguityFlags: [],
          },
        ],
      })),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };

    const session = await processTypedBrainDump({
      uid: "uid-1",
      text: "Submit report. Renew passport.",
      provider,
      store,
      createId: () => "brain-dump-session-1",
      now: () => 1_800_000_000_000,
      workspaceTasks: [
        workspaceTask({
          id: "task-report",
          name: "Submit report",
          timeGoalCompletedAtMs: 1_799_999_000_000,
        }),
      ],
      archivedTaskMeta: {
        "archived-passport": {
          name: "Renew passport",
          color: null,
          deletedAt: 1,
          state: "archived",
        },
      },
    });

    expect(session.review.items[0].duplicateWarnings[0]).toMatchObject({
      matchedTaskId: "task-report",
      matchedState: "recent",
    });
    expect(session.review.items[1].duplicateWarnings[0]).toMatchObject({
      matchedTaskId: "archived-passport",
      matchedState: "archived",
    });
  });

  it("keeps unsupported extracted items visible and unselected", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(async () => ({
        items: [
          {
            itemType: "task",
            title: "Call dentist",
            sourceEvidence: ["call the dentist"],
            confidence: 0.9,
            ambiguityFlags: [],
          },
          {
            itemType: "event",
            title: "Dentist appointment is next Thursday",
            sourceEvidence: ["dentist next Thursday"],
            confidence: 0.84,
            ambiguityFlags: ["Unsupported item type for task creation."],
          },
        ],
      })),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };

    const session = await processTypedBrainDump({
      uid: "uid-1",
      text: "Call dentist. Dentist appointment is next Thursday.",
      provider,
      store,
      createId: () => "brain-dump-session-1",
    });

    expect(session.review.selectedCount).toBe(1);
    expect(session.review.items[1]).toMatchObject({
      itemType: "event",
      title: "Dentist appointment is next Thursday",
      selected: false,
      supported: false,
      ambiguityFlags: ["Unsupported item type for task creation."],
    });
  });

  it("does not invent missing dates and flags approximate timing as ambiguous", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(async () => ({
        items: [
          {
            itemType: "task",
            title: "Clean desk",
            sourceEvidence: ["clean desk"],
            confidence: 0.8,
            ambiguityFlags: [],
          },
          {
            itemType: "task",
            title: "Review budget",
            sourceEvidence: ["review budget sometime next week"],
            confidence: 0.8,
            ambiguityFlags: [],
            dueDateText: "sometime next week",
            dateSource: "explicit",
          },
        ],
      })),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };

    const session = await processTypedBrainDump({
      uid: "uid-1",
      text: "Clean desk. Review budget sometime next week.",
      timezone: "Australia/Sydney",
      provider,
      store,
      createId: () => "brain-dump-session-1",
      now: () => Date.parse("2026-08-05T02:00:00.000Z"),
    });

    expect(session.review.items[0].date).toMatchObject({
      originalDateText: null,
      dateSource: "none",
      resolvedDate: null,
      ambiguity: "none",
    });
    expect(session.review.items[1].date).toMatchObject({
      originalDateText: "sometime next week",
      dateSource: "explicit",
      resolvedDate: null,
      ambiguity: "ambiguous",
    });
    expect(session.review.items[1].date.ambiguityFlags[0]).toContain("needs review");
  });

  it("resolves relative dates against the user's timezone across a daylight-saving boundary", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(async () => ({
        items: [
          {
            itemType: "task",
            title: "Pack charger",
            sourceEvidence: ["pack charger tomorrow"],
            confidence: 0.9,
            ambiguityFlags: [],
            dueDateText: "tomorrow",
            dateSource: "explicit",
          },
        ],
      })),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };

    const session = await processTypedBrainDump({
      uid: "uid-1",
      text: "Pack charger tomorrow.",
      timezone: "Australia/Sydney",
      provider,
      store,
      createId: () => "brain-dump-session-1",
      now: () => Date.parse("2026-10-03T13:30:00.000Z"),
    });

    expect(session.review.items[0].date).toMatchObject({
      originalDateText: "tomorrow",
      timezone: "Australia/Sydney",
      resolvedDate: "2026-10-04",
      ambiguity: "none",
    });
  });

  it("rejects empty and oversized typed input before provider processing", async () => {
    const provider: BrainDumpAiProvider = {
      extractTyped: vi.fn(),
    };
    const store: BrainDumpSessionStore = {
      saveSession: vi.fn(async () => {}),
      getSession: vi.fn(),
    };
    const baseInput = {
      uid: "uid-1",
      provider,
      store,
      createId: () => "brain-dump-session-1",
    };

    await expect(processTypedBrainDump({ ...baseInput, text: "   " })).rejects.toMatchObject({
      code: "brain-dump/invalid-input",
      status: 400,
    });
    await expect(processTypedBrainDump({ ...baseInput, text: "a".repeat(20_001) })).rejects.toMatchObject({
      code: "brain-dump/invalid-input",
      status: 400,
    });
    expect(provider.extractTyped).not.toHaveBeenCalled();
    expect(store.saveSession).not.toHaveBeenCalled();
  });
});
