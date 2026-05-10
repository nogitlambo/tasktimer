export function isElementActuallyVisible(element: HTMLElement | null | undefined): element is HTMLElement {
  if (!element) return false;
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

export function getVisibleXpTargetRectFromDocument(doc: Document): DOMRect | null {
  const candidates = ["appShellHeaderXpValue", "taskLaunchTopbarXpValue"]
    .map((id) => doc.getElementById(id))
    .filter((element): element is HTMLElement => !!element);

  for (const element of candidates) {
    if (!isElementActuallyVisible(element)) continue;
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) continue;
    return rect;
  }

  return null;
}
