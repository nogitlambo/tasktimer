import type { DashboardCardSize } from "./types";

export type DashboardCardPlacement = {
  col: number;
  row: number;
};

export type DashboardLayoutItem = {
  id: string;
  size: DashboardCardSize | null;
  requested: DashboardCardPlacement | null;
  orderIndex: number;
  placementPriority?: number;
};

function clampPositiveInt(value: unknown) {
  const normalized = Math.max(1, Math.floor(Number(value) || 0));
  return Number.isFinite(normalized) ? normalized : 1;
}

export function sanitizeDashboardCardPlacements(value: unknown) {
  const out: Record<string, DashboardCardPlacement> = {};
  if (!value || typeof value !== "object") return out;
  Object.entries(value as Record<string, unknown>).forEach(([cardId, placement]) => {
    if (!cardId || !placement || typeof placement !== "object") return;
    const next = placement as Record<string, unknown>;
    out[cardId] = {
      col: clampPositiveInt(next.col),
      row: clampPositiveInt(next.row),
    };
  });
  return out;
}

export function getDashboardColumnSpan(size: DashboardCardSize | null, columnCount: number) {
  const columns = clampPositiveInt(columnCount);
  if (columns <= 1) return 1;
  if (columns <= 2) return size === "quarter" ? 1 : 2;
  if (size === "full") return Math.min(columns, 12);
  if (size === "half") return Math.min(columns, 6);
  return Math.min(columns, 3);
}

export function getDashboardGridColumnValue(
  placement: DashboardCardPlacement,
  size: DashboardCardSize | null,
  columnCount: number
) {
  const clampedPlacement = clampDashboardPlacement(placement, size, columnCount);
  const span = getDashboardColumnSpan(size, columnCount);
  return `${clampedPlacement.col} / span ${span}`;
}

export function clampDashboardPlacement(
  placement: DashboardCardPlacement,
  size: DashboardCardSize | null,
  columnCount: number
) {
  const columns = clampPositiveInt(columnCount);
  const span = getDashboardColumnSpan(size, columns);
  const maxStartCol = Math.max(1, columns - span + 1);
  return {
    col: Math.max(1, Math.min(maxStartCol, clampPositiveInt(placement.col))),
    row: Math.max(1, clampPositiveInt(placement.row)),
  };
}

function isSlotFree(
  occupied: Set<string>,
  row: number,
  col: number,
  span: number,
  columnCount: number
) {
  if (col < 1 || row < 1 || col + span - 1 > columnCount) return false;
  for (let offset = 0; offset < span; offset += 1) {
    if (occupied.has(`${row}:${col + offset}`)) return false;
  }
  return true;
}

function reserveSlot(occupied: Set<string>, row: number, col: number, span: number) {
  for (let offset = 0; offset < span; offset += 1) {
    occupied.add(`${row}:${col + offset}`);
  }
}

function findNextFreeSlot(
  occupied: Set<string>,
  requested: DashboardCardPlacement | null,
  span: number,
  columnCount: number
) {
  const maxStartCol = Math.max(1, columnCount - span + 1);
  let row = clampPositiveInt(requested?.row ?? 1);
  let col = Math.min(maxStartCol, clampPositiveInt(requested?.col ?? 1));
  while (row < 500) {
    for (let candidateCol = col; candidateCol <= maxStartCol; candidateCol += 1) {
      if (isSlotFree(occupied, row, candidateCol, span, columnCount)) {
        return { row, col: candidateCol };
      }
    }
    row += 1;
    col = 1;
  }
  return { row: 1, col: 1 };
}

export function resolveDashboardCardPlacements(items: DashboardLayoutItem[], columnCount: number) {
  const normalizedColumns = clampPositiveInt(columnCount);
  const occupied = new Set<string>();
  const out: Record<string, DashboardCardPlacement> = {};
  const ordered = [...items].sort((a, b) => {
    const aRequested = a.requested;
    const bRequested = b.requested;
    if (aRequested && bRequested) {
      if (aRequested.row !== bRequested.row) return aRequested.row - bRequested.row;
      if (aRequested.col !== bRequested.col) return aRequested.col - bRequested.col;
      const priorityDelta = (b.placementPriority || 0) - (a.placementPriority || 0);
      if (priorityDelta) return priorityDelta;
    } else if (aRequested || bRequested) {
      return aRequested ? -1 : 1;
    }
    return a.orderIndex - b.orderIndex;
  });
  ordered.forEach((item) => {
    const span = getDashboardColumnSpan(item.size, normalizedColumns);
    const placement = findNextFreeSlot(occupied, item.requested, span, normalizedColumns);
    reserveSlot(occupied, placement.row, placement.col, span);
    out[item.id] = placement;
  });
  return out;
}
