import { sortMilestones } from "./milestones";
import type { Task } from "../types";

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function pctToEndColor(pct: number): string {
  const p = Math.max(0, Math.min(100, pct || 0));
  const g = { r: 12, g: 245, b: 127 };
  const o = { r: 255, g: 140, b: 0 };
  const rC = { r: 255, g: 59, b: 48 };

  let c1: typeof g, c2: typeof g, tt: number;
  if (p <= 50) {
    c1 = g;
    c2 = o;
    tt = p / 50;
  } else {
    c1 = o;
    c2 = rC;
    tt = (p - 50) / 50;
  }

  const rr = Math.round(lerp(c1.r, c2.r, tt));
  const gg = Math.round(lerp(c1.g, c2.g, tt));
  const bb = Math.round(lerp(c1.b, c2.b, tt));
  return `rgb(${rr},${gg},${bb})`;
}

export function fillBackgroundForPct(pct: number): string {
  return pctToEndColor(pct);
}

export function sessionColorForTaskMs(t: Task, elapsedMs: number): string {
  try {
    const ms = Math.max(0, elapsedMs || 0);
    const elapsedSec = ms / 1000;

    const hasMilestones =
      !!t &&
      !!t.milestonesEnabled &&
      Array.isArray(t.milestones) &&
      t.milestones.length > 0;

    if (!hasMilestones) return pctToEndColor(0);

    const msSorted = sortMilestones(t.milestones);
    const maxValue = Math.max(...msSorted.map((m) => +m.hours || 0), 0);
    const unitSec = t.milestoneTimeUnit === "day" ? 86400 : 3600;
    const maxSec = Math.max(maxValue * unitSec, 1);
    const pct = Math.min((elapsedSec / maxSec) * 100, 100);
    return fillBackgroundForPct(pct);
  } catch {
    return pctToEndColor(0);
  }
}
