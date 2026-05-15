export function showOverlay(overlay: HTMLElement | null) {
  if (!overlay) return;
  overlay.style.display = "flex";
}

export function hideOverlay(overlay: HTMLElement | null) {
  if (!overlay) return;
  overlay.style.display = "none";
}

export function isOverlayVisible(overlay: HTMLElement | null) {
  if (!overlay) return false;
  return overlay.style.display !== "none" && overlay.getAttribute("aria-hidden") !== "true";
}

export function getVisibleOverlays(documentRef: Document) {
  return Array.from(documentRef.querySelectorAll(".overlay")).filter((el) => {
    const node = el as HTMLElement;
    return getComputedStyle(node).display !== "none";
  }) as HTMLElement[];
}

const TIME_GOAL_COMPLETE_OVERLAY_IDS = new Set([
  "timeGoalCompleteOverlay",
  "timeGoalCompleteSaveNoteOverlay",
  "timeGoalCompleteNoteOverlay",
]);

export function isBlockingTimeGoalCompleteOverlay(overlay: Element | null | undefined) {
  if (!overlay) return false;
  const node = overlay as HTMLElement;
  if (TIME_GOAL_COMPLETE_OVERLAY_IDS.has(String(node.id || ""))) return false;
  if (node.getAttribute("aria-hidden") === "true") return false;
  if (node.style.display === "none") return false;
  if (typeof getComputedStyle === "function") return getComputedStyle(node).display !== "none";
  return node.style.display !== "none";
}

export function hasBlockingTimeGoalCompleteOverlay(documentRef: Pick<Document, "querySelectorAll"> | null | undefined) {
  if (!documentRef) return false;
  return Array.from(documentRef.querySelectorAll(".overlay")).some((overlay) =>
    isBlockingTimeGoalCompleteOverlay(overlay)
  );
}
