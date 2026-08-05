import { describe, expect, it, vi } from "vitest";

import { processTypedBrainDump, type BrainDumpAiProvider, type BrainDumpSessionStore } from "./brainDumpProcessing";

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
