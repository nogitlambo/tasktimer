import type { Milestone } from "../lib/types";

type TaskProgressMarkerModel =
  | {
      kind: "baseline";
      leftPos: number;
      edgeClass: string;
      label: string;
    }
  | {
      kind: "milestone";
      leftPos: number;
      edgeClass: string;
      reached: boolean;
      showLabel: boolean;
      wrapClass: string;
      label: string;
      description: string;
    }
  | {
      kind: "goal";
      leftPos: number;
      edgeClass: string;
      reached: boolean;
      label: string;
    };

type TaskProgressModel = {
  pct: number;
  markers: TaskProgressMarkerModel[];
};

export function buildTaskProgressModel({
  milestones,
  elapsedSec,
  milestoneUnitSec,
  unitSuffix,
  timeGoalSec,
}: {
  milestones: Milestone[];
  elapsedSec: number;
  milestoneUnitSec: number;
  unitSuffix: string;
  timeGoalSec: number;
}): TaskProgressModel | null {
  const safeMilestones = Array.isArray(milestones) ? milestones : [];
  const hasMilestones = safeMilestones.length > 0;
  const hasTimeGoal = Number(timeGoalSec || 0) > 0;
  if (!hasMilestones && !hasTimeGoal) return null;

  const maxValue = hasMilestones ? Math.max(...safeMilestones.map((m) => +m.hours || 0), 0) : 0;
  const maxSec = Math.max(maxValue * milestoneUnitSec, Math.max(0, Number(timeGoalSec || 0)), 1);
  const safeElapsedSec = Math.max(0, Number(elapsedSec || 0));
  const pct = Math.min((safeElapsedSec / maxSec) * 100, 100);
  const markers: TaskProgressMarkerModel[] = [
    {
      kind: "baseline",
      leftPos: 0,
      edgeClass: "mkEdgeL",
      label: `0${unitSuffix}`,
    },
  ];

  const nextPendingIndex = safeMilestones.findIndex((m) => safeElapsedSec < (+m.hours || 0) * milestoneUnitSec);
  const labelTargetIndex = nextPendingIndex >= 0 ? nextPendingIndex : Math.max(0, safeMilestones.length - 1);

  safeMilestones.forEach((milestone, milestoneIndex) => {
    const value = +milestone.hours || 0;
    const secTarget = value * milestoneUnitSec;
    const left = Math.max(0, Math.min((secTarget / maxSec) * 100, 100));
    const reached = safeElapsedSec >= secTarget;
    const edgeClass = left <= 1 ? "mkEdgeL" : left >= 99 ? "mkEdgeR" : "";
    const leftPos = edgeClass === "mkEdgeL" ? 0 : edgeClass === "mkEdgeR" ? 100 : left;
    const label = `${value}${unitSuffix}`;
    markers.push({
      kind: "milestone",
      leftPos,
      edgeClass,
      reached,
      showLabel: milestoneIndex === labelTargetIndex,
      wrapClass: edgeClass && label.length > 8 ? "mkWrap8" : "",
      label,
      description: String(milestone.description || "").trim(),
    });
  });

  if (hasTimeGoal) {
    const goalSec = Math.max(0, Number(timeGoalSec || 0));
    const goalLeft = Math.max(0, Math.min((Math.max(0, Number(timeGoalSec || 0)) / maxSec) * 100, 100));
    const edgeClass = goalLeft <= 1 ? "mkEdgeL" : goalLeft >= 99 ? "mkEdgeR" : "";
    const leftPos = edgeClass === "mkEdgeL" ? 0 : edgeClass === "mkEdgeR" ? 100 : goalLeft;
    const goalMinutes = Math.round(goalSec / 60);
    const label =
      goalMinutes > 0 && goalMinutes % 60 === 0 ? `${goalMinutes / 60}h` : goalMinutes >= 60 ? `${Math.floor(goalMinutes / 60)}h ${goalMinutes % 60}m` : `${goalMinutes}m`;
    markers.push({
      kind: "goal",
      leftPos,
      edgeClass,
      reached: safeElapsedSec >= Math.max(0, Number(timeGoalSec || 0)),
      label,
    });
  }

  return { pct, markers };
}

export function renderTaskProgressHtml(
  model: TaskProgressModel | null,
  opts: { fillColor: string; escapeHtml: (value: string) => string }
) {
  if (!model) return "";
  const { escapeHtml, fillColor } = opts;
  const markersHtml = model.markers
    .map((marker) => {
      if (marker.kind === "baseline") {
        return `
          <div class="mkLine" style="left:0%"></div>
          <div class="mkTime mkAch ${marker.edgeClass}" style="left:${marker.leftPos}%">${escapeHtml(marker.label)}</div>`;
      }
      if (marker.kind === "goal") {
        return `
            <div class="mkFlag mkGoal ${marker.reached ? "mkAch" : "mkPend"} ${marker.edgeClass}" style="left:${marker.leftPos}%"></div>
            <div class="mkTime mkGoalTime ${marker.reached ? "mkAch" : "mkPend"} ${marker.edgeClass}" style="left:${marker.leftPos}%">${escapeHtml(marker.label)}</div>`;
      }
      const markerClass = marker.reached ? "mkAch" : "mkPend";
      return `
            <div class="mkFlag ${markerClass}" style="left:${marker.leftPos}%"></div>
            ${
              marker.showLabel
                ? `<div class="mkTime ${markerClass} ${marker.edgeClass} ${marker.wrapClass}" style="left:${marker.leftPos}%">${escapeHtml(marker.label)}</div>`
                : ``
            }
            ${
              marker.showLabel && marker.description
                ? `<div class="mkDesc ${markerClass} ${marker.edgeClass}" style="left:${marker.leftPos}%">${escapeHtml(marker.description)}</div>`
                : ``
            }`;
    })
    .join("");

  return `
          <div class="progressRow">
            <div class="progressWrap">
              <div class="progressTrack">
                <div class="progressFill" style="width:${model.pct}%;background:${fillColor}"></div>
                ${markersHtml}
              </div>
            </div>
          </div>`;
}
