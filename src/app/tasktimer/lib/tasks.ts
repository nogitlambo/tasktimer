import { formatTwo } from "./time";

export function formatFocusElapsed(ms: number): { daysText: string; clockText: string; showDays: boolean } {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return {
    daysText: `${formatTwo(days)}d`,
    clockText: `${formatTwo(hours)}:${formatTwo(minutes)}:${formatTwo(seconds)}`,
    showDays: days >= 1,
  };
}

export function formatMainTaskElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return `${formatTwo(days)} ${formatTwo(hours)} ${formatTwo(minutes)} ${formatTwo(seconds)}`;
}

export function formatMainTaskElapsedHtml(ms: number, isRunning = false): string {
  const parts = formatMainTaskElapsed(ms).split(" ");
  const panelStateClass = !isRunning ? " isStopped" : "";
  const chunkClass = (value: string) => `timeChunk${value === "00" ? " timeChunkZero" : ""}`;
  return `
      <span class="timePanel${panelStateClass}">
        <span class="${chunkClass(parts[0])}"><span class="timeBoxValue"><span class="timeBoxNum">${parts[0]}</span><span class="timeBoxUnit">D</span></span></span>
        <span class="${chunkClass(parts[1])}"><span class="timeBoxValue"><span class="timeBoxNum">${parts[1]}</span><span class="timeBoxUnit">H</span></span></span>
        <span class="${chunkClass(parts[2])}"><span class="timeBoxValue"><span class="timeBoxNum">${parts[2]}</span><span class="timeBoxUnit">M</span></span></span>
        <span class="${chunkClass(parts[3])}"><span class="timeBoxValue"><span class="timeBoxNum">${parts[3]}</span><span class="timeBoxUnit">S</span></span></span>
      </span>
    `;
}
