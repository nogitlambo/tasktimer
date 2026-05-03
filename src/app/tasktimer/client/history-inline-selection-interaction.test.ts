import { describe, expect, it } from "vitest";
import { createHistoryInlineSelectionInteraction } from "./history-inline-selection-interaction";
import type { HistoryViewState } from "./types";

function createState(overrides: Partial<HistoryViewState> = {}): HistoryViewState {
  return {
    page: 0,
    rangeDays: 7,
    rangeMode: "entries",
    revealPhase: "open",
    revealTimer: null,
    barRevealProgress: 1,
    barRevealAnimRaf: null,
    layoutRetryRaf: null,
    editMode: false,
    barRects: [],
    labelHitRects: [],
    lockedAbsIndexes: new Set<number>(),
    selectedAbsIndex: null,
    selectedRelIndex: null,
    selectionClearTimer: null,
    visualSelectedAbsIndex: null,
    selectionZoom: 1,
    selectionAnimRaf: null,
    slideDir: null,
    ...overrides,
  };
}

describe("history inline selection interaction", () => {
  it("syncs selected relative index inside the rendered window", () => {
    const selection = createHistoryInlineSelectionInteraction();
    const state = createState({ selectedAbsIndex: 9 });

    selection.syncSelectedRelIndex(state, 7, 4);

    expect(state.selectedRelIndex).toBe(2);
    expect(state.selectedAbsIndex).toBe(9);
  });

  it("clears transient selection when selected index leaves the rendered window", () => {
    const selection = createHistoryInlineSelectionInteraction();
    const state = createState({ selectedAbsIndex: 4, selectedRelIndex: 1 });

    selection.syncSelectedRelIndex(state, 7, 4);

    expect(state.selectedAbsIndex).toBeNull();
    expect(state.selectedRelIndex).toBeNull();
  });

  it("derives delete and summary availability from current mode and selection", () => {
    const selection = createHistoryInlineSelectionInteraction();
    const state = createState({ selectedAbsIndex: 3, selectedRelIndex: 1 });

    expect(selection.getRenderTargets(state, false)).toEqual({
      hasDeleteTarget: true,
      hasSummaryTarget: true,
    });
    expect(selection.getRenderTargets(state, true)).toEqual({
      hasDeleteTarget: false,
      hasSummaryTarget: false,
    });
  });

  it("selects, locks, unlocks, and clears by chart hit", () => {
    const selection = createHistoryInlineSelectionInteraction();
    const state = createState();

    expect(selection.applyHit(state, { rel: 1, abs: 4 })).toEqual({ kind: "selected", animateTo: 4 });
    expect(state.selectedAbsIndex).toBe(4);
    expect(state.selectedRelIndex).toBe(1);

    expect(selection.applyHit(state, { rel: 1, abs: 4 })).toEqual({ kind: "locked", animateTo: null });
    expect(state.selectedAbsIndex).toBeNull();
    expect(state.selectedRelIndex).toBeNull();
    expect(Array.from(state.lockedAbsIndexes)).toEqual([4]);

    expect(selection.applyHit(state, { rel: 1, abs: 4 })).toEqual({ kind: "unlocked", animateTo: null });
    expect(state.lockedAbsIndexes.size).toBe(0);

    state.lockedAbsIndexes.add(2);
    state.selectedAbsIndex = 5;
    state.selectedRelIndex = 3;
    expect(selection.applyHit(state, null)).toEqual({ kind: "cleared", animateTo: null });
    expect(state.selectedAbsIndex).toBeNull();
    expect(state.selectedRelIndex).toBeNull();
    expect(state.lockedAbsIndexes.size).toBe(0);
  });

  it("prefers transient selection over locked selection for delete target", () => {
    const selection = createHistoryInlineSelectionInteraction();
    const state = createState({
      selectedAbsIndex: 8,
      lockedAbsIndexes: new Set([2, 5]),
    });

    expect(selection.getDeleteTargetIndex(state)).toBe(8);

    state.selectedAbsIndex = null;
    expect(selection.getDeleteTargetIndex(state)).toBe(5);
  });

  it("uses the first sorted locked index as the summary primary target", () => {
    const selection = createHistoryInlineSelectionInteraction();
    const state = createState({
      selectedAbsIndex: 8,
      lockedAbsIndexes: new Set([5, 2]),
    });

    expect(selection.getSortedLockedIndexes(state)).toEqual([2, 5]);
    expect(selection.getSummaryPrimaryIndex(state)).toBe(2);
  });

  it("shifts selection and locks after a deleted history index", () => {
    const selection = createHistoryInlineSelectionInteraction();
    const state = createState({
      selectedAbsIndex: 6,
      selectedRelIndex: 2,
      lockedAbsIndexes: new Set([2, 4, 7]),
    });

    expect(selection.applyDeletedIndex(state, 4)).toEqual({ clearedSelected: false });
    expect(state.selectedAbsIndex).toBe(5);
    expect(Array.from(state.lockedAbsIndexes).sort((a, b) => a - b)).toEqual([2, 6]);
  });

  it("reports when deletion clears the selected history index", () => {
    const selection = createHistoryInlineSelectionInteraction();
    const state = createState({
      selectedAbsIndex: 4,
      selectedRelIndex: 1,
      lockedAbsIndexes: new Set([3, 4]),
    });

    expect(selection.applyDeletedIndex(state, 4)).toEqual({ clearedSelected: true });
    expect(state.selectedAbsIndex).toBeNull();
    expect(state.selectedRelIndex).toBeNull();
    expect(Array.from(state.lockedAbsIndexes)).toEqual([3]);
  });

  it("requires entitlement and at least two locked entries for analysis", () => {
    const selection = createHistoryInlineSelectionInteraction();
    const state = createState({ lockedAbsIndexes: new Set([1, 3]) });

    expect(selection.getCanAnalyse(state, true)).toBe(true);
    expect(selection.getCanAnalyse(state, false)).toBe(false);

    state.lockedAbsIndexes.delete(3);
    expect(selection.getCanAnalyse(state, true)).toBe(false);
  });
});
