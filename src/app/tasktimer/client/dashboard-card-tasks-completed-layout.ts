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

type LayoutConfig = {
  chartSize: number;
  center: number;
  labelWidth: number;
  labelHeight: number;
  labelGap: number;
  ringOuterRadius: number;
  labelOrbitRadius: number;
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function pctToAngleRad(pct: number) {
  return ((-90 + pct * 3.6) * Math.PI) / 180;
}

function normalizePct(pct: number) {
  return ((pct % 100) + 100) % 100;
}

function circularPctDistance(a: number, b: number) {
  const diff = Math.abs(normalizePct(a) - normalizePct(b));
  return Math.min(diff, 100 - diff);
}

function chooseLabelSlotRotationPct(inputs: DashboardTasksCompletedLabelLayoutInput[], slotStep: number) {
  if (inputs.length === 0) return 0;
  const candidateRotations = inputs.map((input, index) => normalizePct(input.sliceStartPct + input.slicePct / 2 - index * slotStep));
  const meanRotationRadians = Math.atan2(
    candidateRotations.reduce((total, rotation) => total + Math.sin((rotation / 100) * Math.PI * 2), 0),
    candidateRotations.reduce((total, rotation) => total + Math.cos((rotation / 100) * Math.PI * 2), 0)
  );
  candidateRotations.push(normalizePct((meanRotationRadians / (Math.PI * 2)) * 100));
  let bestRotation = candidateRotations[0] ?? 0;
  let bestScore = Number.POSITIVE_INFINITY;

  candidateRotations.forEach((rotation) => {
    const score = inputs.reduce((total, input, index) => {
      const midPct = input.sliceStartPct + input.slicePct / 2;
      const labelPct = rotation + index * slotStep;
      const distance = circularPctDistance(midPct, labelPct);
      return total + distance * distance;
    }, 0);
    if (score < bestScore) {
      bestScore = score;
      bestRotation = rotation;
    }
  });

  return bestRotation;
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
  const labelSlotCount = Math.max(1, sortedInputs.length);
  const labelSlotStep = 100 / labelSlotCount;
  const labelSlotRotation = chooseLabelSlotRotationPct(sortedInputs, labelSlotStep);
  const layoutByKey = new Map<string, DashboardTasksCompletedLabelLayout>();

  sortedInputs.forEach((input, index) => {
    const midPct = input.sliceStartPct + input.slicePct / 2;
    const sliceAngleRad = pctToAngleRad(midPct);
    const labelAngleRad = pctToAngleRad(labelSlotRotation + index * labelSlotStep);
    const slicePoint = pointOnCircle(sliceAngleRad, config.ringOuterRadius, config.center);
    const labelPoint = pointOnCircle(labelAngleRad, config.labelOrbitRadius, config.center);
    const isRightSide = Math.cos(labelAngleRad) >= 0;
    const layout = {
      key: input.key,
      isRightSide,
      isExternal: true,
      labelX: labelPoint.x,
      labelY: labelPoint.y,
      rect: rectForLabel(labelPoint.x, labelPoint.y, config, input.labelWidth, input.labelHeight),
      slicePoint,
      connectorPath: null,
    };
    layoutByKey.set(input.key, layout);
  });
  const labels = inputs.map((input) => layoutByKey.get(input.key)).filter((layout): layout is DashboardTasksCompletedLabelLayout => !!layout);

  const allRects = labels.map((label) => label.rect);
  labels.forEach((label) => {
    label.connectorPath = buildConnectorPath(label, allRects, config);
  });

  return labels;
}
