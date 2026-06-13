export type DashboardTasksCompletedLabelLayoutInput = {
  key: string;
  sliceStartPct: number;
  slicePct: number;
  labelWidth?: number;
  labelHeight?: number;
};

export type DashboardTasksCompletedPoint = {
  x: number;
  y: number;
};

export type DashboardTasksCompletedRect = DashboardTasksCompletedPoint & {
  width: number;
  height: number;
};

export type DashboardTasksCompletedLabelLayout = {
  key: string;
  isRightSide: boolean;
  isExternal: boolean;
  labelX: number;
  labelY: number;
  rect: DashboardTasksCompletedRect;
  slicePoint: DashboardTasksCompletedPoint;
  connectorPath: string | null;
};

type MutableDashboardTasksCompletedLabelLayout = DashboardTasksCompletedLabelLayout & {
  labelPct: number;
  orderIndex: number;
  preferredPct: number;
  labelWidth?: number;
  labelHeight?: number;
};

type LayoutConfig = {
  chartSize: number;
  center: number;
  labelWidth: number;
  labelHeight: number;
  labelGap: number;
  ringOuterRadius: number;
  labelOrbitRadius: number;
};

type LabelSafetyConfig = Partial<Pick<LayoutConfig, "chartSize" | "center" | "ringOuterRadius">> & {
  viewportWidth?: number;
  viewportHeight?: number;
  padding?: number;
  protectedRadius?: number;
};

const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  chartSize: 380,
  center: 190,
  labelWidth: 96,
  labelHeight: 30,
  labelGap: 5,
  ringOuterRadius: 104,
  labelOrbitRadius: 148,
};

const DEFAULT_LABEL_SAFETY_PADDING = 1;
const DEFAULT_LABEL_PROTECTED_RADIUS = 88;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pctToAngleRad(pct: number) {
  return ((-90 + pct * 3.6) * Math.PI) / 180;
}

function normalizePct(pct: number) {
  return ((pct % 100) + 100) % 100;
}

function signedCircularPctDelta(fromPct: number, toPct: number) {
  let delta = normalizePct(toPct) - normalizePct(fromPct);
  if (delta > 50) delta -= 100;
  if (delta < -50) delta += 100;
  return delta;
}

function pointOnCircle(angleRad: number, radius: number, center: number): DashboardTasksCompletedPoint {
  return {
    x: center + Math.cos(angleRad) * radius,
    y: center + Math.sin(angleRad) * radius,
  };
}

function rectForLabel(
  labelX: number,
  labelY: number,
  config: LayoutConfig,
  labelWidth = config.labelWidth,
  labelHeight = config.labelHeight
): DashboardTasksCompletedRect {
  return {
    x: labelX - labelWidth / 2,
    y: labelY - labelHeight / 2,
    width: labelWidth,
    height: labelHeight,
  };
}

function meanCircularPct(pcts: number[]) {
  if (pcts.length === 0) return 0;
  const angle = Math.atan2(
    pcts.reduce((sum, pct) => sum + Math.sin((normalizePct(pct) / 100) * Math.PI * 2), 0),
    pcts.reduce((sum, pct) => sum + Math.cos((normalizePct(pct) / 100) * Math.PI * 2), 0)
  );
  return normalizePct((angle / (Math.PI * 2)) * 100);
}

function updateLabelOrbitPosition(
  layout: MutableDashboardTasksCompletedLabelLayout,
  labelPct: number,
  config: LayoutConfig
) {
  const normalizedPct = normalizePct(labelPct);
  const labelAngleRad = pctToAngleRad(normalizedPct);
  const labelPoint = pointOnCircle(labelAngleRad, config.labelOrbitRadius, config.center);
  layout.labelPct = normalizedPct;
  layout.labelX = labelPoint.x;
  layout.labelY = labelPoint.y;
  layout.isRightSide = Math.cos(labelAngleRad) >= 0;
  layout.rect = rectForLabel(labelPoint.x, labelPoint.y, config, layout.labelWidth, layout.labelHeight);
}

function getLabelCollisionPairs(labels: MutableDashboardTasksCompletedLabelLayout[]) {
  const pairs: Array<[number, number]> = [];
  labels.forEach((label, index) => {
    labels.slice(index + 1).forEach((other, offset) => {
      if (dashboardTasksCompletedRectsIntersect(label.rect, other.rect, 1)) {
        pairs.push([index, index + 1 + offset]);
      }
    });
  });
  return pairs;
}

function getCollisionComponents(labels: MutableDashboardTasksCompletedLabelLayout[], pairs: Array<[number, number]>) {
  const parent = labels.map((_, index) => index);
  const find = (index: number): number => {
    const parentIndex = parent[index] ?? index;
    if (parentIndex === index) return index;
    const root = find(parentIndex);
    parent[index] = root;
    return root;
  };
  const union = (a: number, b: number) => {
    const aRoot = find(a);
    const bRoot = find(b);
    if (aRoot !== bRoot) parent[bRoot] = aRoot;
  };
  pairs.forEach(([a, b]) => union(a, b));
  const byRoot = new Map<number, number[]>();
  labels.forEach((_, index) => {
    const root = find(index);
    byRoot.set(root, [...(byRoot.get(root) || []), index]);
  });
  return [...byRoot.values()].filter((component) => component.length > 1);
}

function fallbackCollisionComponentsToLocalSlots(
  labels: MutableDashboardTasksCompletedLabelLayout[],
  components: number[][],
  config: LayoutConfig
) {
  const labelOrbitCircumference = Math.PI * 2 * config.labelOrbitRadius;
  const fallbackStepPct = Math.max(6, ((config.labelWidth + config.labelGap) / labelOrbitCircumference) * 100);
  components.forEach((component) => {
    const ordered = [...component].sort((a, b) => labels[a].orderIndex - labels[b].orderIndex);
    const centerPct = meanCircularPct(ordered.map((index) => labels[index].preferredPct));
    const middle = (ordered.length - 1) / 2;
    ordered.forEach((index, position) => {
      updateLabelOrbitPosition(labels[index], centerPct + (position - middle) * fallbackStepPct, config);
    });
  });
}

function resolveLabelCollisions(labels: MutableDashboardTasksCompletedLabelLayout[], config: LayoutConfig) {
  const nudgeStepPct = 0.8;
  const maxPasses = 80;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const collisionPairs = getLabelCollisionPairs(labels);
    if (collisionPairs.length === 0) return;
    const deltas = labels.map(() => 0);
    collisionPairs.forEach(([a, b]) => {
      const delta = signedCircularPctDelta(labels[a].labelPct, labels[b].labelPct);
      if (delta >= 0) {
        deltas[a] -= nudgeStepPct;
        deltas[b] += nudgeStepPct;
      } else {
        deltas[a] += nudgeStepPct;
        deltas[b] -= nudgeStepPct;
      }
    });
    deltas.forEach((delta, index) => {
      if (delta !== 0) updateLabelOrbitPosition(labels[index], labels[index].labelPct + delta, config);
    });
  }

  const remainingPairs = getLabelCollisionPairs(labels);
  if (remainingPairs.length === 0) return;
  fallbackCollisionComponentsToLocalSlots(labels, getCollisionComponents(labels, remainingPairs), config);
}

export function dashboardTasksCompletedRectsIntersect(
  a: DashboardTasksCompletedRect,
  b: DashboardTasksCompletedRect,
  padding = 0
) {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
}

function linePoint(start: DashboardTasksCompletedPoint, end: DashboardTasksCompletedPoint, t: number) {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function pointInRect(point: DashboardTasksCompletedPoint, rect: DashboardTasksCompletedRect, padding = 0) {
  return point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding;
}

export function dashboardTasksCompletedPathIntersectsRect(
  path: {
    start: DashboardTasksCompletedPoint;
    points: DashboardTasksCompletedPoint[];
  },
  rect: DashboardTasksCompletedRect,
  padding = 0
) {
  let segmentStart = path.start;
  for (const segmentEnd of path.points) {
    for (let step = 1; step < 24; step += 1) {
      const point = linePoint(segmentStart, segmentEnd, step / 24);
      if (pointInRect(point, rect, padding)) return true;
    }
    segmentStart = segmentEnd;
  }
  return false;
}

function rectIntersectsCircle(rect: DashboardTasksCompletedRect, center: DashboardTasksCompletedPoint, radius: number) {
  const closestX = clamp(center.x, rect.x, rect.x + rect.width);
  const closestY = clamp(center.y, rect.y, rect.y + rect.height);
  return Math.hypot(closestX - center.x, closestY - center.y) < radius;
}

function rectFitsBounds(rect: DashboardTasksCompletedRect, width: number, height: number, padding: number) {
  return rect.x >= padding &&
    rect.y >= padding &&
    rect.x + rect.width <= width - padding &&
    rect.y + rect.height <= height - padding;
}

export function areDashboardTasksCompletedLabelsSafe(
  labels: DashboardTasksCompletedLabelLayout[],
  configOverrides: LabelSafetyConfig = {}
) {
  const chartSize = configOverrides.chartSize ?? DEFAULT_LAYOUT_CONFIG.chartSize;
  const center = configOverrides.center ?? DEFAULT_LAYOUT_CONFIG.center;
  const padding = configOverrides.padding ?? DEFAULT_LABEL_SAFETY_PADDING;
  const viewportWidth = configOverrides.viewportWidth ?? chartSize;
  const viewportHeight = configOverrides.viewportHeight ?? chartSize;
  const protectedRadius = configOverrides.protectedRadius ?? DEFAULT_LABEL_PROTECTED_RADIUS;
  const protectedCenter = { x: center, y: center };

  return labels.every((label) => (
    rectFitsBounds(label.rect, viewportWidth, viewportHeight, padding) &&
    !rectIntersectsCircle(label.rect, protectedCenter, protectedRadius)
  ));
}

function formatPathPoint(point: DashboardTasksCompletedPoint) {
  return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
}

function distanceBetweenPoints(a: DashboardTasksCompletedPoint, b: DashboardTasksCompletedPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function connectorTurnAngle(
  start: DashboardTasksCompletedPoint,
  bend: DashboardTasksCompletedPoint,
  end: DashboardTasksCompletedPoint
) {
  const first = { x: bend.x - start.x, y: bend.y - start.y };
  const second = { x: end.x - bend.x, y: end.y - bend.y };
  const firstLength = Math.hypot(first.x, first.y) || 1;
  const secondLength = Math.hypot(second.x, second.y) || 1;
  const dot = first.x * second.x + first.y * second.y;
  return Math.acos(clamp(dot / (firstLength * secondLength), -1, 1));
}

function angleBetweenVectors(a: DashboardTasksCompletedPoint, b: DashboardTasksCompletedPoint) {
  const aLength = Math.hypot(a.x, a.y) || 1;
  const bLength = Math.hypot(b.x, b.y) || 1;
  const dot = a.x * b.x + a.y * b.y;
  return Math.acos(clamp(dot / (aLength * bLength), -1, 1));
}

function getRectEdgePointTowardPoint(label: DashboardTasksCompletedLabelLayout, point: DashboardTasksCompletedPoint) {
  const centerX = label.rect.x + label.rect.width / 2;
  const centerY = label.rect.y + label.rect.height / 2;
  const halfWidth = label.rect.width / 2;
  const halfHeight = label.rect.height / 2;
  const dx = point.x - centerX;
  const dy = point.y - centerY;

  if (Math.abs(dx) / halfWidth > Math.abs(dy) / halfHeight) {
    const x = dx >= 0 ? label.rect.x + label.rect.width : label.rect.x;
    const scale = dx === 0 ? 0 : (x - centerX) / dx;
    return {
      x,
      y: centerY + dy * scale,
    };
  }

  const y = dy >= 0 ? label.rect.y + label.rect.height : label.rect.y;
  const scale = dy === 0 ? 0 : (y - centerY) / dy;
  return {
    x: centerX + dx * scale,
    y,
  };
}

function buildConnectorPath(
  label: DashboardTasksCompletedLabelLayout,
  allRects: DashboardTasksCompletedRect[],
  config: LayoutConfig
) {
  const end = label.slicePoint;
  const sliceVector = {
    x: end.x - config.center,
    y: end.y - config.center,
  };
  const vectorLength = Math.hypot(sliceVector.x, sliceVector.y) || 1;
  const unit = {
    x: sliceVector.x / vectorLength,
    y: sliceVector.y / vectorLength,
  };
  const directLabelEdge = getRectEdgePointTowardPoint(label, end);
  const directVector = {
    x: directLabelEdge.x - end.x,
    y: directLabelEdge.y - end.y,
  };
  const directPath = { start: end, points: [directLabelEdge] };
  const directAngle = angleBetweenVectors(unit, directVector);
  const directCollisions = allRects.filter((rect) => dashboardTasksCompletedPathIntersectsRect(directPath, rect, 0)).length;
  if (directAngle <= Math.PI / 4 && directCollisions === 0) {
    return `M ${formatPathPoint(end)} L ${formatPathPoint(directLabelEdge)}`;
  }

  const offsets = [0, -14, 14, -28, 28, -42, 42, -56, 56, -70, 70];
  const bendRadii = [config.ringOuterRadius + 18, config.ringOuterRadius + 26, config.ringOuterRadius + 34];
  let best: { points: DashboardTasksCompletedPoint[]; collisions: number; length: number; turnAngle: number } | null = null;

  for (const bendRadius of bendRadii) {
    const tangent = { x: -unit.y, y: unit.x };
    for (const offset of offsets) {
      const bend = {
        x: clamp(config.center + unit.x * bendRadius + tangent.x * offset, 0, config.chartSize),
        y: clamp(config.center + unit.y * bendRadius + tangent.y * offset, 0, config.chartSize),
      };
      const labelEdge = getRectEdgePointTowardPoint(label, bend);
      const points = [bend, labelEdge];
      const path = { start: end, points };
      const collisions = allRects.filter((rect) => dashboardTasksCompletedPathIntersectsRect(path, rect, 0)).length;
      const length = distanceBetweenPoints(bend, end) + distanceBetweenPoints(labelEdge, bend);
      const turnAngle = connectorTurnAngle(end, bend, labelEdge);
      if (
        !best ||
        collisions < best.collisions ||
        (collisions === best.collisions && turnAngle < best.turnAngle - 0.02) ||
        (collisions === best.collisions && Math.abs(turnAngle - best.turnAngle) <= 0.02 && length < best.length)
      ) {
        best = { points, collisions, length, turnAngle };
      }
    }
  }

  const points = best?.points || [end];
  return `M ${formatPathPoint(end)} ${points.map((point) => `L ${formatPathPoint(point)}`).join(" ")}`;
}

export function buildDashboardTasksCompletedLabelLayout(
  inputs: DashboardTasksCompletedLabelLayoutInput[],
  configOverrides: Partial<LayoutConfig> = {}
) {
  const config = { ...DEFAULT_LAYOUT_CONFIG, ...configOverrides };
  const sortedInputs = [...inputs].sort((a, b) => (a.sliceStartPct + a.slicePct / 2) - (b.sliceStartPct + b.slicePct / 2));
  const layoutByKey = new Map<string, DashboardTasksCompletedLabelLayout>();
  const mutableLabels: MutableDashboardTasksCompletedLabelLayout[] = [];

  sortedInputs.forEach((input, index) => {
    const midPct = input.sliceStartPct + input.slicePct / 2;
    const sliceAngleRad = pctToAngleRad(midPct);
    const labelAngleRad = pctToAngleRad(midPct);
    const slicePoint = pointOnCircle(sliceAngleRad, config.ringOuterRadius, config.center);
    const labelPoint = pointOnCircle(labelAngleRad, config.labelOrbitRadius, config.center);
    const isRightSide = Math.cos(labelAngleRad) >= 0;
    const layout: MutableDashboardTasksCompletedLabelLayout = {
      key: input.key,
      orderIndex: index,
      preferredPct: normalizePct(midPct),
      labelPct: normalizePct(midPct),
      labelWidth: input.labelWidth,
      labelHeight: input.labelHeight,
      isRightSide,
      isExternal: true,
      labelX: labelPoint.x,
      labelY: labelPoint.y,
      rect: rectForLabel(labelPoint.x, labelPoint.y, config, input.labelWidth, input.labelHeight),
      slicePoint,
      connectorPath: null,
    };
    layoutByKey.set(input.key, layout);
    mutableLabels.push(layout);
  });

  resolveLabelCollisions(mutableLabels, config);
  const labels = inputs.map((input) => layoutByKey.get(input.key)).filter((layout): layout is DashboardTasksCompletedLabelLayout => !!layout);

  const allRects = labels.map((label) => label.rect);
  labels.forEach((label) => {
    label.connectorPath = buildConnectorPath(label, allRects, config);
  });

  return labels;
}
