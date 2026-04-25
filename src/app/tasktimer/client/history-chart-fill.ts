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
