import { describe, expect, it } from "vitest";
import { createHistoryInlineSelectionSession } from "./history-inline-selection-interaction";

describe("history inline selection session", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const nowMs = Date.UTC(2026, 6, 14, 12);

  function enabledDelete(view: ReturnType<ReturnType<typeof createHistoryInlineSelectionSession>["refresh"]>) {
    const action = view.actions.delete;
    expect(action.enabled).toBe(true);
    if (!action.enabled) throw new Error(`Expected delete to be enabled, received ${action.reason}`);
    return action;
  }

  it("deletes the selected recent entry when older entries are outside the 30-day projection", () => {
    const old = { sessionId: "old", ts: nowMs - 31 * DAY_MS, ms: 60_000, name: "Focus" };
    const target = { sessionId: "target", ts: nowMs - DAY_MS, ms: 120_000, name: "Focus" };
    const session = createHistoryInlineSelectionSession("task-1");
    let view = session.refresh({ entries: [old, target], mode: "entries", nowMs, analysisEntitled: true });

    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.kind).toBe("entry");
    expect(view.rows[0]?.value).toBe(target);

    const selected = view.rows[0]?.activate();
    expect(selected?.kind).toBe("changed");
    if (!selected || selected.kind !== "changed") throw new Error("Expected the recent entry to be selected");
    view = selected.view;

    const result = enabledDelete(view).resolve([old, target]);
    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") throw new Error(`Expected delete resolution, received ${result.reason}`);
    expect(result.deletedEntry).toBe(target);
    expect(result.remainingFinalizedEntries).toEqual([old]);
  });

  it("re-resolves a pending delete against refreshed full history after confirmation", () => {
    const old = { sessionId: "old", ts: nowMs - 31 * DAY_MS, ms: 60_000, name: "Focus" };
    const target = { sessionId: "target", ts: nowMs - DAY_MS, ms: 120_000, name: "Focus" };
    const inserted = { sessionId: "inserted", ts: nowMs - 2 * DAY_MS, ms: 90_000, name: "Inserted" };
    const session = createHistoryInlineSelectionSession("task-1");
    let view = session.refresh({ entries: [old, target], mode: "entries", nowMs, analysisEntitled: true });
    const selected = view.rows[0]?.activate();
    if (!selected || selected.kind !== "changed") throw new Error("Expected the recent entry to be selected");
    view = selected.view;
    const pendingDelete = enabledDelete(view);

    const result = pendingDelete.resolve([old, inserted, target]);

    expect(result.kind).toBe("resolved");
    if (result.kind !== "resolved") throw new Error(`Expected delete resolution, received ${result.reason}`);
    expect(result.deletedEntry).toBe(target);
    expect(result.remainingFinalizedEntries).toEqual([old, inserted]);
  });

  it("normalizes legacy second timestamps for the recent-window projection", () => {
    const old = { sessionId: "old", ts: Math.floor((nowMs - 31 * DAY_MS) / 1000), ms: 60_000, name: "Old" };
    const recent = { sessionId: "recent", ts: Math.floor((nowMs - DAY_MS) / 1000), ms: 90_000, name: "Recent" };
    const session = createHistoryInlineSelectionSession("task-1");

    const view = session.refresh({ entries: [old, recent], mode: "entries", nowMs, analysisEntitled: true });

    expect(view.windowKind).toBe("recent-30-days");
    expect(view.rows.map((row) => row.value)).toEqual([recent]);
  });

  it("refuses a pending delete when its stable identity disappears or becomes ambiguous", () => {
    const target = { sessionId: "target", ts: nowMs - DAY_MS, ms: 120_000, name: "Focus" };
    const duplicate = { ...target, ts: nowMs, note: "Concurrent duplicate" };
    const session = createHistoryInlineSelectionSession("task-1");
    let view = session.refresh({ entries: [target], mode: "entries", nowMs, analysisEntitled: true });
    const selected = view.rows[0]?.activate();
    if (!selected || selected.kind !== "changed") throw new Error("Expected selection");
    view = selected.view;
    const pendingDelete = enabledDelete(view);

    expect(pendingDelete.resolve([])).toEqual({ kind: "refused", reason: "missing-target" });
    expect(pendingDelete.resolve([target, duplicate])).toEqual({ kind: "refused", reason: "ambiguous-target" });
  });

  it("issues an opaque capability for a unique external summary candidate", () => {
    const current = { sessionId: "target", ts: nowMs - DAY_MS, ms: 120_000, name: "Focus", note: "Current" };
    const externalCopy = { sessionId: "target", ts: nowMs, ms: 1, name: "Copied display row" };
    const session = createHistoryInlineSelectionSession("task-1");

    const capability = session.resolveEntryCandidate(externalCopy, [current]);

    expect(capability.kind).toBe("resolved");
    if (capability.kind !== "resolved") throw new Error("Expected an external entry capability");
    expect(capability.entry).toBe(current);
    expect(session.resolveEntryTarget(capability.targetKey, [current])).toEqual({ kind: "resolved", entry: current });
  });

  it("fails safely when duplicate legacy rows have an ambiguous identity", () => {
    const first = { ts: nowMs - DAY_MS, ms: 60_000, name: "Focus", note: "First" };
    const second = { ts: nowMs - DAY_MS, ms: 60_000, name: "Focus", note: "Second" };
    const session = createHistoryInlineSelectionSession("task-1");
    const view = session.refresh({ entries: [first, second], mode: "entries", nowMs, analysisEntitled: true });

    expect(view.rows).toHaveLength(2);
    expect(view.rows.every((row) => !row.interactive && row.blockedReason === "ambiguous-target")).toBe(true);
    expect(view.actions.delete).toEqual({ enabled: false, reason: "selection-required" });
  });

  it("treats the legacy raw name as part of the exact identity", () => {
    const plain = { ts: nowMs - DAY_MS, ms: 60_000, name: "Focus" };
    const spaced = { ts: nowMs - DAY_MS, ms: 60_000, name: " Focus " };
    const session = createHistoryInlineSelectionSession("task-1");
    let view = session.refresh({ entries: [plain, spaced], mode: "entries", nowMs, analysisEntitled: true });

    expect(view.rows.every((row) => row.interactive)).toBe(true);
    const selected = view.rows.find((row) => row.value === spaced)?.activate();
    if (!selected || selected.kind !== "changed") throw new Error("Expected the raw-name target to be selected");
    view = selected.view;
    const summary = view.actions.summary;
    if (!summary.enabled) throw new Error("Expected summary to be enabled");
    const summaryResolution = summary.resolve([plain, spaced]);
    if (summaryResolution.kind !== "resolved") throw new Error("Expected summary resolution");
    const targetKey = summaryResolution.entries[0]?.targetKey;
    if (!targetKey) throw new Error("Expected an opaque entry target");

    const deletion = session.resolveEntryDelete(targetKey, [plain, spaced]);

    expect(deletion.kind).toBe("resolved");
    if (deletion.kind !== "resolved") throw new Error("Expected keyed delete resolution");
    expect(deletion.deletedEntry).toBe(spaced);
    expect(deletion.remainingFinalizedEntries).toEqual([plain]);
  });

  it("fails closed when distinct raw values collapse to the same persisted legacy tuple", () => {
    const first = { ts: nowMs - DAY_MS + 0.1, ms: 60_000.1, name: "Focus" };
    const second = { ts: nowMs - DAY_MS + 0.9, ms: 60_000.9, name: "Focus" };
    const session = createHistoryInlineSelectionSession("task-1");

    const view = session.refresh({ entries: [first, second], mode: "entries", nowMs, analysisEntitled: true });

    expect(view.rows.every((row) => !row.interactive && row.blockedReason === "ambiguous-target")).toBe(true);
  });

  it("treats duplicate finalized session ids as ambiguous even when their display tuples differ", () => {
    const first = { sessionId: "duplicate", ts: nowMs - 2 * DAY_MS, ms: 60_000, name: "First" };
    const second = { sessionId: "duplicate", ts: nowMs - DAY_MS, ms: 120_000, name: "Second" };
    const session = createHistoryInlineSelectionSession("task-1");

    const view = session.refresh({ entries: [first, second], mode: "entries", nowMs, analysisEntitled: true });

    expect(view.rows.every((row) => !row.interactive && row.blockedReason === "ambiguous-target")).toBe(true);
  });

  it("keeps live and finalized identity namespaces separate and forbids live deletion", () => {
    const finalized = { sessionId: "same-id", ts: nowMs - DAY_MS, ms: 60_000, name: "Finalized" };
    const live = {
      sessionId: "same-id",
      liveSessionId: "same-id",
      isLiveSession: true,
      ts: nowMs,
      ms: 30_000,
      name: "Live",
    } as const;
    const session = createHistoryInlineSelectionSession("task-1");
    let view = session.refresh({ entries: [finalized, live], mode: "entries", nowMs, analysisEntitled: true });

    expect(view.rows.every((row) => row.interactive)).toBe(true);
    const selected = view.rows.find((row) => row.value === live)?.activate();
    if (!selected || selected.kind !== "changed") throw new Error("Expected live selection");
    view = selected.view;

    expect(view.actions.delete).toEqual({ enabled: false, reason: "live-target" });
    expect(view.actions.summary.enabled).toBe(true);
  });

  it("preserves unique locked targets across refresh and clears them on Entries to Day changes", () => {
    const first = { sessionId: "first", ts: nowMs - 2 * DAY_MS, ms: 60_000, name: "Focus" };
    const second = { sessionId: "second", ts: nowMs - DAY_MS, ms: 120_000, name: "Focus" };
    const inserted = { sessionId: "inserted", ts: nowMs - 3 * DAY_MS, ms: 30_000, name: "Inserted" };
    const session = createHistoryInlineSelectionSession("task-1");
    let view = session.refresh({ entries: [first, second], mode: "entries", nowMs, analysisEntitled: true });
    const transition = view.rows[0]?.activate();
    if (!transition || transition.kind !== "changed") throw new Error("Expected first selection");
    view = transition.view;
    const lockedTransition = view.rows.find((row) => row.value === first)?.activate();
    if (!lockedTransition || lockedTransition.kind !== "changed") throw new Error("Expected first lock");
    view = lockedTransition.view;

    view = session.refresh({ entries: [inserted, second, first], mode: "entries", nowMs, analysisEntitled: true });
    expect(view.lockedCount).toBe(1);
    expect(view.rows.find((row) => row.value === first)?.selection).toBe("locked");

    view = session.refresh({ entries: [inserted, second, first], mode: "day", nowMs, analysisEntitled: true });
    expect(view.lockedCount).toBe(0);
    expect(view.rows.every((row) => row.selection === "none")).toBe(true);
  });

  it("disables the main Delete action when multiple targets are locked", () => {
    const first = { sessionId: "first", ts: nowMs - 2 * DAY_MS, ms: 60_000, name: "Focus" };
    const second = { sessionId: "second", ts: nowMs - DAY_MS, ms: 120_000, name: "Focus" };
    const session = createHistoryInlineSelectionSession("task-1");
    let view = session.refresh({ entries: [first, second], mode: "entries", nowMs, analysisEntitled: true });

    for (const entry of [first, second]) {
      let transition = view.rows.find((row) => row.value === entry)?.activate();
      if (!transition || transition.kind !== "changed") throw new Error("Expected selection");
      view = transition.view;
      transition = view.rows.find((row) => row.value === entry)?.activate();
      if (!transition || transition.kind !== "changed") throw new Error("Expected lock");
      view = transition.view;
    }

    expect(view.lockedCount).toBe(2);
    expect(view.actions.delete).toEqual({ enabled: false, reason: "multiple-targets" });
  });

  it("orders locked summaries chronologically and lets an explicit transient target override multiple locks for Delete", () => {
    const first = { sessionId: "first", ts: nowMs - 3 * DAY_MS, ms: 60_000, name: "First" };
    const second = { sessionId: "second", ts: nowMs - 2 * DAY_MS, ms: 90_000, name: "Second" };
    const explicit = { sessionId: "explicit", ts: nowMs - DAY_MS, ms: 120_000, name: "Explicit" };
    const session = createHistoryInlineSelectionSession("task-1");
    let view = session.refresh({ entries: [first, second, explicit], mode: "entries", nowMs, analysisEntitled: true });

    for (const entry of [second, first]) {
      let transition = view.rows.find((row) => row.value === entry)?.activate();
      if (!transition || transition.kind !== "changed") throw new Error("Expected selection");
      view = transition.view;
      transition = view.rows.find((row) => row.value === entry)?.activate();
      if (!transition || transition.kind !== "changed") throw new Error("Expected lock");
      view = transition.view;
    }

    const summary = view.actions.summary;
    if (!summary.enabled) throw new Error("Expected summary");
    const summaryResolution = summary.resolve([explicit, second, first]);
    if (summaryResolution.kind !== "resolved") throw new Error("Expected summary resolution");
    expect(summaryResolution.entries.map(({ entry }) => entry)).toEqual([first, second]);
    expect(view.actions.delete).toEqual({ enabled: false, reason: "multiple-targets" });

    const selected = view.rows.find((row) => row.value === explicit)?.activate();
    if (!selected || selected.kind !== "changed") throw new Error("Expected explicit selection");
    view = selected.view;
    const deletion = enabledDelete(view).resolve([explicit, second, first]);
    if (deletion.kind !== "resolved") throw new Error("Expected explicit delete resolution");
    expect(deletion.deletedEntry).toBe(explicit);
    expect(deletion.remainingFinalizedEntries).toEqual([first, second]);
  });

  it("projects Day rows as non-destructive aggregate capabilities", () => {
    const first = { sessionId: "first", ts: nowMs - 2 * DAY_MS, ms: 60_000, name: "First" };
    const second = { sessionId: "second", ts: nowMs - 2 * DAY_MS + 60 * 60 * 1000, ms: 90_000, name: "Second" };
    const third = { sessionId: "third", ts: nowMs - DAY_MS, ms: 120_000, name: "Third" };
    const session = createHistoryInlineSelectionSession("task-1");
    let view = session.refresh({ entries: [third, second, first], mode: "day", nowMs, analysisEntitled: true });

    expect(view.rows).toHaveLength(2);
    expect(view.rows.map((row) => row.value.ms)).toEqual([150_000, 120_000]);
    let transition = view.rows[0]?.activate();
    if (!transition || transition.kind !== "changed") throw new Error("Expected day selection");
    view = transition.view;
    expect(view.actions.delete).toEqual({ enabled: false, reason: "day-delete-forbidden" });
    const summary = view.actions.summary;
    if (!summary.enabled) throw new Error("Expected day summary");
    const summaryResolution = summary.resolve([third, first, second]);
    if (summaryResolution.kind !== "resolved") throw new Error("Expected day summary resolution");
    expect(summaryResolution.entries.map(({ entry }) => entry)).toEqual([first, second]);

    transition = view.rows[0]?.activate();
    if (!transition || transition.kind !== "changed") throw new Error("Expected first day lock");
    view = transition.view;
    transition = view.rows[1]?.activate();
    if (!transition || transition.kind !== "changed") throw new Error("Expected second day selection");
    view = transition.view;
    transition = view.rows[1]?.activate();
    if (!transition || transition.kind !== "changed") throw new Error("Expected second day lock");
    view = transition.view;
    expect(view.actions.analyse.enabled).toBe(true);
  });

  it("drops a locked target that becomes ambiguous on a same-mode refresh", () => {
    const target = { ts: nowMs - DAY_MS, ms: 60_000, name: "Legacy" };
    const duplicate = { ...target, note: "Concurrent duplicate" };
    const session = createHistoryInlineSelectionSession("task-1");
    let view = session.refresh({ entries: [target], mode: "entries", nowMs, analysisEntitled: true });
    let transition = view.rows[0]?.activate();
    if (!transition || transition.kind !== "changed") throw new Error("Expected selection");
    view = transition.view;
    transition = view.rows[0]?.activate();
    if (!transition || transition.kind !== "changed") throw new Error("Expected lock");

    view = session.refresh({ entries: [target, duplicate], mode: "entries", nowMs, analysisEntitled: true });

    expect(view.lockedCount).toBe(0);
    expect(view.rows.every((row) => !row.interactive)).toBe(true);
  });

  it("refuses capabilities retained from an older projection generation", () => {
    const target = { sessionId: "target", ts: nowMs - DAY_MS, ms: 60_000, name: "Focus" };
    const session = createHistoryInlineSelectionSession("task-1");
    const staleView = session.refresh({ entries: [target], mode: "entries", nowMs, analysisEntitled: true });
    const currentView = session.refresh({ entries: [target], mode: "entries", nowMs, analysisEntitled: true });

    expect(staleView.rows[0]?.activate().kind).toBe("refused");
    expect(currentView.rows[0]?.selection).toBe("none");
  });
});
