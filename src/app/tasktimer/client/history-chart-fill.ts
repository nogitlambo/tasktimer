export function createHistorySpectrumFill(
  context: CanvasRenderingContext2D,
  gradientTopY: number,
  gradientBottomY: number
): CanvasGradient {
  const safeBottomY = Math.max(gradientTopY + 1, gradientBottomY);
  const gradient = context.createLinearGradient(0, safeBottomY, 0, gradientTopY);
  gradient.addColorStop(0, "#ff4d4d");
  gradient.addColorStop(0.25, "#ff8a3d");
  gradient.addColorStop(0.5, "#ffd84d");
  gradient.addColorStop(0.75, "#b8f34f");
  gradient.addColorStop(1, "#32d96b");
  return gradient;
}

export function getHistorySpectrumColor(progress: number): string {
  const stops = [
    { at: 0, color: "#ff4d4d" },
    { at: 0.25, color: "#ff8a3d" },
    { at: 0.5, color: "#ffd84d" },
    { at: 0.75, color: "#b8f34f" },
    { at: 1, color: "#32d96b" },
  ] as const;
  const clamped = Math.max(0, Math.min(1, progress));

  for (let index = 1; index < stops.length; index += 1) {
    const prev = stops[index - 1];
    const next = stops[index];
    if (clamped > next.at) continue;
    const span = Math.max(0.0001, next.at - prev.at);
    const local = (clamped - prev.at) / span;
    return mixHexColor(prev.color, next.color, local);
  }

  return stops[stops.length - 1].color;
}

function mixHexColor(startHex: string, endHex: string, weight: number): string {
  const t = Math.max(0, Math.min(1, weight));
  const start = parseHexColor(startHex);
  const end = parseHexColor(endHex);
  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const safe = normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
}
