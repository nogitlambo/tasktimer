export function findDelegatedElement(target: EventTarget | null, selector: string) {
  const node = target as HTMLElement | null;
  if (!node) return null;
  return node.closest?.(selector) as HTMLElement | null;
}

export function getDelegatedAction(target: EventTarget | null, attributeName: string) {
  const element = findDelegatedElement(target, `[${attributeName}]`);
  if (!element) return null;
  const action = String(element.getAttribute(attributeName) || "").trim();
  if (!action) return null;
  return { element, action };
}
