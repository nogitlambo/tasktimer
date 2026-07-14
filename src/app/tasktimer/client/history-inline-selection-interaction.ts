import type { HistoryEntry, ProjectedHistoryEntry } from "../lib/types";
import { normalizeHistoryTimestampMs } from "../lib/history";

export type HistoryInlineSelectionMode = "entries" | "day";
export type HistoryInlineSelectionMark = "none" | "selected" | "locked";
export type HistoryInlineSelectionClearScope = "transient" | "locks" | "all";

export type HistoryInlineDayValue = ProjectedHistoryEntry & {
  dayKey: string;
  count: number;
};

export type HistoryInlineSelectionRow = {
  renderKey: string;
  kind: "entry" | "day";
  value: ProjectedHistoryEntry | HistoryInlineDayValue;
  selection: HistoryInlineSelectionMark;
  interactive: boolean;
  blockedReason?: "ambiguous-target";
  activate(): HistoryInlineRowTransition;
};

export type HistoryInlineRowTransition =
  | {
      kind: "changed";
      change: "selected" | "locked" | "unlocked";
      animateTo: string | null;
      view: HistoryInlineSelectionView;
    }
  | {
      kind: "refused";
      reason: "stale-row" | "ambiguous-target";
      view: HistoryInlineSelectionView;
    };

export type HistoryInlineResolvedEntry = {
  entry: ProjectedHistoryEntry;
  targetKey: string | null;
};

export type HistoryInlineEntriesResolution =
  | { kind: "resolved"; entries: HistoryInlineResolvedEntry[] }
  | { kind: "refused"; reason: "missing-target" | "ambiguous-target" };

export type HistoryInlineDeleteResolution =
  | {
      kind: "resolved";
      deletedEntry: ProjectedHistoryEntry;
      remainingFinalizedEntries: HistoryEntry[];
    }
  | {
      kind: "refused";
      reason: "missing-target" | "ambiguous-target" | "live-target";
    };

type HistoryInlineDeleteDisabledReason =
  | "selection-required"
  | "multiple-targets"
  | "day-delete-forbidden"
  | "live-target";

export type HistoryInlineDeleteAction =
  | { enabled: false; reason: HistoryInlineDeleteDisabledReason }
  | {
      enabled: true;
      preview: { entryCount: 1; totalMs: number; primaryName: string };
      resolve(currentEntries: readonly ProjectedHistoryEntry[]): HistoryInlineDeleteResolution;
    };

type HistoryInlineResolveDisabledReason =
  | "selection-required"
  | "analysis-not-allowed"
  | "analysis-needs-two-locks";

export type HistoryInlineResolveAction =
  | { enabled: false; reason: HistoryInlineResolveDisabledReason }
  | {
      enabled: true;
      resolve(currentEntries: readonly ProjectedHistoryEntry[]): HistoryInlineEntriesResolution;
    };

export type HistoryInlineSelectionView = {
  mode: HistoryInlineSelectionMode;
  windowKind: "empty" | "recent-30-days" | "all-entries-fallback";
  sourceEntryCount: number;
  dayCount: number;
  rows: HistoryInlineSelectionRow[];
  selectedRenderKey: string | null;
  lockedCount: number;
  actions: {
    delete: HistoryInlineDeleteAction;
    summary: HistoryInlineResolveAction;
    analyse: HistoryInlineResolveAction;
  };
  clear(scope: HistoryInlineSelectionClearScope): HistoryInlineSelectionView;
};

export type HistoryInlineSelectionRefreshInput = {
  entries: readonly ProjectedHistoryEntry[];
  mode: HistoryInlineSelectionMode;
  nowMs: number;
  analysisEntitled: boolean;
};

export type HistoryInlineEntryTargetResolution =
  | { kind: "resolved"; entry: ProjectedHistoryEntry }
  | { kind: "refused"; reason: "missing-target" | "ambiguous-target" };

export type HistoryInlineEntryCapabilityResolution =
  | { kind: "resolved"; entry: ProjectedHistoryEntry; targetKey: string }
  | { kind: "refused"; reason: "missing-target" | "ambiguous-target" };

export type HistoryInlineSelectionSession = {
  refresh(input: HistoryInlineSelectionRefreshInput): HistoryInlineSelectionView;
  resolveEntryTarget(
    targetKey: string,
    currentEntries: readonly ProjectedHistoryEntry[]
  ): HistoryInlineEntryTargetResolution;
  resolveEntryCandidate(
    candidate: ProjectedHistoryEntry,
    currentEntries: readonly ProjectedHistoryEntry[]
  ): HistoryInlineEntryCapabilityResolution;
  resolveEntryDelete(
    targetKey: string,
    currentEntries: readonly ProjectedHistoryEntry[]
  ): HistoryInlineDeleteResolution;
};

type InternalEntryIdentity = {
  key: string;
};

type InternalProjectionRow = {
  targetKey: string | null;
  renderKey: string;
  kind: "entry" | "day";
  value: ProjectedHistoryEntry | HistoryInlineDayValue;
  interactive: boolean;
  blockedReason?: "ambiguous-target";
};

const HISTORY_INLINE_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeHistoryInteger(value: unknown) {
  return Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0;
}

function normalizeHistoryElapsed(value: unknown) {
  return Math.max(0, normalizeHistoryInteger(value));
}

function historyInlineDayKey(value: unknown) {
  const ts = normalizeHistoryTimestampMs(value);
  if (ts <= 0) return "";
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function entryIdentity(taskId: string, entry: ProjectedHistoryEntry): InternalEntryIdentity | null {
  if (entry?.isLiveSession) {
    const liveSessionId = String(entry.liveSessionId || "").trim();
    if (!liveSessionId) return null;
    return {
      key: JSON.stringify([taskId, "live", liveSessionId]),
    };
  }

  const sessionId = String(entry?.sessionId || "").trim();
  if (sessionId) {
    return {
      key: JSON.stringify([taskId, "session", sessionId]),
    };
  }

  return {
    key: JSON.stringify([
      taskId,
      "legacy",
      normalizeHistoryInteger(entry?.ts),
      normalizeHistoryElapsed(entry?.ms),
      String(entry?.name || ""),
    ]),
  };
}

function sortHistoryEntries(entries: readonly ProjectedHistoryEntry[]) {
  return entries
    .map((entry, inputIndex) => ({ entry, inputIndex }))
    .sort(
      (left, right) =>
        normalizeHistoryTimestampMs(left.entry?.ts) - normalizeHistoryTimestampMs(right.entry?.ts) ||
        left.inputIndex - right.inputIndex
    )
    .map(({ entry }) => entry);
}

export function createHistoryInlineSelectionSession(taskIdRaw: string): HistoryInlineSelectionSession {
  const taskId = String(taskIdRaw || "").trim();
  let currentMode: HistoryInlineSelectionMode | null = null;
  let currentInput: HistoryInlineSelectionRefreshInput = {
    entries: [],
    mode: "entries",
    nowMs: 0,
    analysisEntitled: false,
  };
  let currentRows: InternalProjectionRow[] = [];
  let currentWindowKind: HistoryInlineSelectionView["windowKind"] = "empty";
  let currentSourceEntryCount = 0;
  let currentDayCount = 0;
  let selectedTargetKey: string | null = null;
  let lockedTargetKeys = new Set<string>();
  let generation = 0;
  let opaqueKeySequence = 0;
  const targetToOpaqueKey = new Map<string, string>();
  const opaqueKeyToTarget = new Map<string, string>();

  function opaqueKeyForTarget(targetKey: string) {
    const existing = targetToOpaqueKey.get(targetKey);
    if (existing) return existing;
    opaqueKeySequence += 1;
    const opaqueKey = `history-target-${opaqueKeySequence}`;
    targetToOpaqueKey.set(targetKey, opaqueKey);
    opaqueKeyToTarget.set(opaqueKey, targetKey);
    return opaqueKey;
  }

  function identityCounts(entries: readonly ProjectedHistoryEntry[]) {
    const counts = new Map<string, number>();
    entries.forEach((entry) => {
      const identity = entryIdentity(taskId, entry);
      if (!identity) return;
      counts.set(identity.key, (counts.get(identity.key) || 0) + 1);
    });
    return counts;
  }

  function resolveInternalTarget(targetKey: string, entries: readonly ProjectedHistoryEntry[]) {
    const sorted = sortHistoryEntries(entries);
    const matches = sorted.filter((entry) => entryIdentity(taskId, entry)?.key === targetKey);
    if (!matches.length) return { kind: "refused", reason: "missing-target" } as const;
    if (matches.length !== 1) return { kind: "refused", reason: "ambiguous-target" } as const;
    return { kind: "resolved", entry: matches[0]! } as const;
  }

  function resolveEntryTarget(targetKeyRaw: string, currentEntries: readonly ProjectedHistoryEntry[]) {
    const targetKey = opaqueKeyToTarget.get(String(targetKeyRaw || ""));
    if (!targetKey || targetKey.startsWith("day:")) {
      return { kind: "refused", reason: "missing-target" } as const;
    }
    return resolveInternalTarget(targetKey, currentEntries);
  }

  function resolveEntryCandidate(
    candidate: ProjectedHistoryEntry,
    currentEntries: readonly ProjectedHistoryEntry[]
  ): HistoryInlineEntryCapabilityResolution {
    const identity = entryIdentity(taskId, candidate);
    if (!identity) return { kind: "refused", reason: "missing-target" };
    const resolution = resolveInternalTarget(identity.key, currentEntries);
    if (resolution.kind !== "resolved") return resolution;
    return {
      kind: "resolved",
      entry: resolution.entry,
      targetKey: opaqueKeyForTarget(identity.key),
    };
  }

  function resolveDeleteInternalTarget(
    targetKey: string,
    currentEntries: readonly ProjectedHistoryEntry[]
  ): HistoryInlineDeleteResolution {
    const resolved = resolveInternalTarget(targetKey, currentEntries);
    if (resolved.kind !== "resolved") return resolved;
    if (resolved.entry.isLiveSession) return { kind: "refused", reason: "live-target" };
    const sorted = sortHistoryEntries(currentEntries);
    let removed = false;
    const remainingFinalizedEntries = sorted.filter((entry) => {
      if (!removed && entry === resolved.entry) {
        removed = true;
        return false;
      }
      return !entry.isLiveSession;
    }) as HistoryEntry[];
    return {
      kind: "resolved",
      deletedEntry: resolved.entry,
      remainingFinalizedEntries,
    };
  }

  function resolveEntryDelete(targetKeyRaw: string, currentEntries: readonly ProjectedHistoryEntry[]) {
    const targetKey = opaqueKeyToTarget.get(String(targetKeyRaw || ""));
    if (!targetKey || targetKey.startsWith("day:")) {
      return { kind: "refused", reason: "missing-target" } as const;
    }
    return resolveDeleteInternalTarget(targetKey, currentEntries);
  }

  function buildProjection(input: HistoryInlineSelectionRefreshInput) {
    const sorted = sortHistoryEntries(input.entries);
    const recent = sorted.filter(
      (entry) => normalizeHistoryTimestampMs(entry?.ts) >= normalizeHistoryInteger(input.nowMs) - HISTORY_INLINE_LOOKBACK_MS
    );
    const windowed = recent.length ? recent : sorted;
    currentWindowKind = !sorted.length ? "empty" : recent.length ? "recent-30-days" : "all-entries-fallback";
    currentSourceEntryCount = windowed.length;
    currentDayCount = new Set(windowed.map((entry) => historyInlineDayKey(entry?.ts)).filter(Boolean)).size;
    const counts = identityCounts(sorted);

    if (input.mode === "day") {
      const grouped = new Map<string, HistoryInlineDayValue>();
      windowed.forEach((entry) => {
        const dayKey = historyInlineDayKey(entry?.ts);
        if (!dayKey) return;
        const existing = grouped.get(dayKey);
        const ts = normalizeHistoryTimestampMs(entry?.ts);
        const ms = normalizeHistoryElapsed(entry?.ms);
        if (existing) {
          existing.ms += ms;
          existing.count += 1;
          if (ts >= existing.ts) {
            existing.ts = ts;
            if (entry.color) existing.color = entry.color;
          }
          return;
        }
        grouped.set(dayKey, {
          ts,
          ms,
          name: String(entry?.name || ""),
          ...(entry?.color ? { color: entry.color } : {}),
          dayKey,
          count: 1,
        });
      });
      currentRows = Array.from(grouped.values()).map((value) => {
        const targetKey = `day:${taskId}:${value.dayKey}`;
        return {
          targetKey,
          renderKey: opaqueKeyForTarget(targetKey),
          kind: "day" as const,
          value,
          interactive: true,
        };
      });
      return;
    }

    currentRows = windowed.map((entry, index) => {
      const identity = entryIdentity(taskId, entry);
      const interactive = !!identity && counts.get(identity.key) === 1;
      if (!identity || !interactive) {
        return {
          targetKey: null,
          renderKey: `history-unavailable-${generation}-${index}`,
          kind: "entry" as const,
          value: entry,
          interactive: false,
          blockedReason: "ambiguous-target" as const,
        };
      }
      return {
        targetKey: identity.key,
        renderKey: opaqueKeyForTarget(identity.key),
        kind: "entry" as const,
        value: entry,
        interactive: true,
      };
    });
  }

  function selectedActionTargetKeys() {
    return lockedTargetKeys.size
      ? currentRows
          .map((row) => row.targetKey)
          .filter((targetKey): targetKey is string => !!targetKey && lockedTargetKeys.has(targetKey))
      : selectedTargetKey
        ? [selectedTargetKey]
        : [];
  }

  function resolveSelectedEntries(
    targetKeys: readonly string[],
    currentEntries: readonly ProjectedHistoryEntry[]
  ): HistoryInlineEntriesResolution {
    const sorted = sortHistoryEntries(currentEntries);
    const resolved: HistoryInlineResolvedEntry[] = [];
    for (const targetKey of targetKeys) {
      if (targetKey.startsWith("day:")) {
        const dayKey = targetKey.slice(`day:${taskId}:`.length);
        const dayEntries = sorted.filter((entry) => historyInlineDayKey(entry?.ts) === dayKey);
        if (!dayEntries.length) return { kind: "refused", reason: "missing-target" };
        dayEntries.forEach((entry) => {
          const identity = entryIdentity(taskId, entry);
          const unique = identity && sorted.filter((candidate) => entryIdentity(taskId, candidate)?.key === identity.key).length === 1;
          resolved.push({
            entry,
            targetKey: identity && unique ? opaqueKeyForTarget(identity.key) : null,
          });
        });
        continue;
      }
      const result = resolveInternalTarget(targetKey, sorted);
      if (result.kind !== "resolved") return result;
      resolved.push({ entry: result.entry, targetKey: opaqueKeyForTarget(targetKey) });
    }
    return { kind: "resolved", entries: resolved };
  }

  function createSummaryAction(): HistoryInlineResolveAction {
    const targetKeys = selectedActionTargetKeys();
    if (!targetKeys.length) return { enabled: false, reason: "selection-required" };
    return {
      enabled: true,
      resolve(currentEntries) {
        return resolveSelectedEntries(targetKeys, currentEntries);
      },
    };
  }

  function createAnalyseAction(): HistoryInlineResolveAction {
    if (!currentInput.analysisEntitled) return { enabled: false, reason: "analysis-not-allowed" };
    if (lockedTargetKeys.size < 2) return { enabled: false, reason: "analysis-needs-two-locks" };
    const targetKeys = selectedActionTargetKeys();
    const mode = currentInput.mode;
    return {
      enabled: true,
      resolve(currentEntries) {
        if (mode === "day") {
          const sorted = sortHistoryEntries(currentEntries);
          const dayValues: HistoryInlineResolvedEntry[] = [];
          for (const targetKey of targetKeys) {
            const dayKey = targetKey.slice(`day:${taskId}:`.length);
            const entries = sorted.filter((entry) => historyInlineDayKey(entry?.ts) === dayKey);
            if (!entries.length) return { kind: "refused", reason: "missing-target" };
            const latest = entries[entries.length - 1]!;
            dayValues.push({
              entry: {
                ts: normalizeHistoryTimestampMs(latest.ts),
                ms: entries.reduce((sum, entry) => sum + normalizeHistoryElapsed(entry.ms), 0),
                name: String(latest.name || ""),
                ...(latest.color ? { color: latest.color } : {}),
              },
              targetKey: opaqueKeyForTarget(targetKey),
            });
          }
          return { kind: "resolved", entries: dayValues };
        }
        return resolveSelectedEntries(targetKeys, currentEntries);
      },
    };
  }

  function createDeleteAction(): HistoryInlineDeleteAction {
    let targetKey = selectedTargetKey;
    if (!targetKey) {
      if (!lockedTargetKeys.size) return { enabled: false, reason: "selection-required" };
      if (lockedTargetKeys.size > 1) return { enabled: false, reason: "multiple-targets" };
      targetKey = Array.from(lockedTargetKeys)[0] || null;
    }
    if (!targetKey) return { enabled: false, reason: "selection-required" };
    if (targetKey.startsWith("day:")) return { enabled: false, reason: "day-delete-forbidden" };
    const projectedRow = currentRows.find((row) => row.targetKey === targetKey);
    const projectedEntry = projectedRow?.value as ProjectedHistoryEntry | undefined;
    if (projectedEntry?.isLiveSession) return { enabled: false, reason: "live-target" };
    const capturedTargetKey = targetKey;
    return {
      enabled: true,
      preview: {
        entryCount: 1,
        totalMs: normalizeHistoryElapsed(projectedEntry?.ms),
        primaryName: String(projectedEntry?.name || ""),
      },
      resolve(currentEntries) {
        return resolveDeleteInternalTarget(capturedTargetKey, currentEntries);
      },
    };
  }

  function clear(scope: HistoryInlineSelectionClearScope) {
    if (scope === "transient" || scope === "all") selectedTargetKey = null;
    if (scope === "locks" || scope === "all") lockedTargetKeys.clear();
    generation += 1;
    return buildView();
  }

  function activateRow(rowGeneration: number, targetKey: string | null, interactive: boolean): HistoryInlineRowTransition {
    if (rowGeneration !== generation) {
      return { kind: "refused", reason: "stale-row", view: buildView() };
    }
    if (!interactive || !targetKey) {
      return { kind: "refused", reason: "ambiguous-target", view: buildView() };
    }
    let change: "selected" | "locked" | "unlocked";
    let animateTo: string | null = null;
    if (lockedTargetKeys.has(targetKey)) {
      lockedTargetKeys.delete(targetKey);
      change = "unlocked";
    } else if (selectedTargetKey === targetKey) {
      lockedTargetKeys.add(targetKey);
      selectedTargetKey = null;
      change = "locked";
    } else {
      selectedTargetKey = targetKey;
      animateTo = opaqueKeyForTarget(targetKey);
      change = "selected";
    }
    generation += 1;
    return { kind: "changed", change, animateTo, view: buildView() };
  }

  function buildView(): HistoryInlineSelectionView {
    const viewGeneration = generation;
    const rows = currentRows.map((row) => ({
      renderKey: row.renderKey,
      kind: row.kind,
      value: row.value,
      selection:
        row.targetKey && lockedTargetKeys.has(row.targetKey)
          ? ("locked" as const)
          : row.targetKey === selectedTargetKey
            ? ("selected" as const)
            : ("none" as const),
      interactive: row.interactive,
      ...(row.blockedReason ? { blockedReason: row.blockedReason } : {}),
      activate: () => activateRow(viewGeneration, row.targetKey, row.interactive),
    }));
    return {
      mode: currentInput.mode,
      windowKind: currentWindowKind,
      sourceEntryCount: currentSourceEntryCount,
      dayCount: currentDayCount,
      rows,
      selectedRenderKey: selectedTargetKey ? opaqueKeyForTarget(selectedTargetKey) : null,
      lockedCount: lockedTargetKeys.size,
      actions: {
        delete: createDeleteAction(),
        summary: createSummaryAction(),
        analyse: createAnalyseAction(),
      },
      clear,
    };
  }

  function refresh(input: HistoryInlineSelectionRefreshInput) {
    const nextMode = input.mode === "day" ? "day" : "entries";
    if (currentMode && currentMode !== nextMode) {
      selectedTargetKey = null;
      lockedTargetKeys.clear();
    }
    currentMode = nextMode;
    currentInput = {
      entries: Array.isArray(input.entries) ? input.entries.slice() : [],
      mode: nextMode,
      nowMs: normalizeHistoryInteger(input.nowMs),
      analysisEntitled: input.analysisEntitled === true,
    };
    generation += 1;
    buildProjection(currentInput);
    const availableTargets = new Set(
      currentRows.filter((row) => row.interactive && row.targetKey).map((row) => row.targetKey as string)
    );
    if (selectedTargetKey && !availableTargets.has(selectedTargetKey)) selectedTargetKey = null;
    lockedTargetKeys = new Set(Array.from(lockedTargetKeys).filter((targetKey) => availableTargets.has(targetKey)));
    return buildView();
  }

  return {
    refresh,
    resolveEntryTarget,
    resolveEntryCandidate,
    resolveEntryDelete,
  };
}
