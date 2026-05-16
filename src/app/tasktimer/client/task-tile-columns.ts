export function getTaskTimerTileColumnCount(windowRef: Pick<Window, "matchMedia"> | null | undefined) {
  if (!windowRef?.matchMedia) return 1;
  if (windowRef.matchMedia("(min-width: 1500px)").matches) return 4;
  if (windowRef.matchMedia("(min-width: 1200px)").matches) return 3;
  if (windowRef.matchMedia("(min-width: 720px)").matches) return 2;
  return 1;
}
