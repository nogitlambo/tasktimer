import type { HistoryViewState } from "./types";

export type HistoryInlineSelectionHit = {
  rel: number;
  abs: number;
};

export type HistoryInlineSelectionResult =
  | { kind: "cleared"; animateTo: null }
  | { kind: "unlocked"; animateTo: null }
  | { kind: "locked"; animateTo: null }
  | { kind: "selected"; animateTo: number };

export type HistoryInlineSelectionWindow = {
  hasDeleteTarget: boolean;
  hasSummaryTarget: boolean;
};

export type HistoryInlineSelectionInteraction = {
  clearSelection(state: HistoryViewState): void;
  clearLockedSelections(state: HistoryViewState): void;
  syncSelectedRelIndex(state: HistoryViewState, start: number, sliceLength: number): void;
  getRenderTargets(state: HistoryViewState, isDayMode: boolean): HistoryInlineSelectionWindow;
  getSortedLockedIndexes(state: HistoryViewState): number[];
  getSummaryPrimaryIndex(state: HistoryViewState): number | null;
  getDeleteTargetIndex(state: HistoryViewState): number | null;
  getCanAnalyse(state: HistoryViewState, hasHistoryEntitlement: boolean): boolean;
  applyDeletedIndex(state: HistoryViewState, deletedAbsIndex: number): { clearedSelected: boolean };
  applyHit(state: HistoryViewState, hit: HistoryInlineSelectionHit | null): HistoryInlineSelectionResult;
};

function clearTransientSelection(state: HistoryViewState) {
  state.selectedRelIndex = null;
  state.selectedAbsIndex = null;
}

function getSortedLockedIndexes(state: HistoryViewState) {
  return Array.from(state.lockedAbsIndexes.values()).sort((a, b) => a - b);
}

export function createHistoryInlineSelectionInteraction(): HistoryInlineSelectionInteraction {
  return {
    clearSelection(state) {
      clearTransientSelection(state);
      state.lockedAbsIndexes.clear();
    },

    clearLockedSelections(state) {
      state.lockedAbsIndexes.clear();
    },

    syncSelectedRelIndex(state, start, sliceLength) {
      if (state.selectedAbsIndex == null) {
        state.selectedRelIndex = null;
        return;
      }
      const rel = state.selectedAbsIndex - start;
      if (rel >= 0 && rel < sliceLength) {
        state.selectedRelIndex = rel;
        return;
      }
      clearTransientSelection(state);
    },

    getRenderTargets(state, isDayMode) {
      const hasLocked = state.lockedAbsIndexes.size > 0;
      return {
        hasDeleteTarget: !isDayMode && (state.selectedRelIndex != null || hasLocked),
        hasSummaryTarget: state.selectedAbsIndex != null || hasLocked,
      };
    },

    getSortedLockedIndexes(state) {
      return getSortedLockedIndexes(state);
    },

    getSummaryPrimaryIndex(state) {
      return getSortedLockedIndexes(state)[0] ?? state.selectedAbsIndex ?? null;
    },

    getDeleteTargetIndex(state) {
      const lockedList = Array.from(state.lockedAbsIndexes.values());
      return state.selectedAbsIndex != null ? state.selectedAbsIndex : lockedList[lockedList.length - 1] ?? null;
    },

    getCanAnalyse(state, hasHistoryEntitlement) {
      return hasHistoryEntitlement && state.lockedAbsIndexes.size >= 2;
    },

    applyDeletedIndex(state, deletedAbsIndex) {
      let clearedSelected = false;
      if (state.selectedAbsIndex === deletedAbsIndex) {
        clearTransientSelection(state);
        clearedSelected = true;
      } else if (state.selectedAbsIndex != null && state.selectedAbsIndex > deletedAbsIndex) {
        state.selectedAbsIndex -= 1;
      }

      if (state.lockedAbsIndexes.size > 0) {
        const nextLocked = new Set<number>();
        state.lockedAbsIndexes.forEach((idx) => {
          if (idx === deletedAbsIndex) return;
          nextLocked.add(idx > deletedAbsIndex ? idx - 1 : idx);
        });
        state.lockedAbsIndexes = nextLocked;
      }

      return { clearedSelected };
    },

    applyHit(state, hit) {
      if (!hit) {
        clearTransientSelection(state);
        state.lockedAbsIndexes.clear();
        return { kind: "cleared", animateTo: null };
      }

      const isSameTransient = state.selectedAbsIndex != null && state.selectedAbsIndex === hit.abs;
      const isSameLocked = state.lockedAbsIndexes.has(hit.abs);
      if (isSameLocked) {
        state.lockedAbsIndexes.delete(hit.abs);
        return { kind: "unlocked", animateTo: null };
      }

      if (isSameTransient) {
        state.lockedAbsIndexes.add(hit.abs);
        clearTransientSelection(state);
        return { kind: "locked", animateTo: null };
      }

      state.selectedRelIndex = hit.rel;
      state.selectedAbsIndex = hit.abs;
      return { kind: "selected", animateTo: hit.abs };
    },
  };
}
