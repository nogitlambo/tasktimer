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
