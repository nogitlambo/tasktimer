import { afterEach, describe, expect, it, vi } from "vitest";
import { getVisibleXpTargetRectFromDocument } from "./xp-award-target";

type ElementStub = HTMLElement & {
  id: string;
  parentElement: ElementStub | null;
  __style: { display?: string; visibility?: string; opacity?: string };
};

function makeElement(
  id: string,
  rect: { left?: number; top?: number; width: number; height: number },
  style: ElementStub["__style"] = {},
  parentElement: ElementStub | null = null
): ElementStub {
  return {
    id,
    parentElement,
    __style: style,
    getBoundingClientRect: () =>
      ({
        left: rect.left ?? 0,
        top: rect.top ?? 0,
        width: rect.width,
        height: rect.height,
        right: (rect.left ?? 0) + rect.width,
        bottom: (rect.top ?? 0) + rect.height,
        x: rect.left ?? 0,
        y: rect.top ?? 0,
        toJSON: () => ({}),
      }) as DOMRect,
  } as ElementStub;
}

function makeDocument(elements: ElementStub[]): Document {
  return {
    getElementById: (id: string) => elements.find((element) => element.id === id) ?? null,
  } as Document;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("xp award target selection", () => {
  it("skips a target whose ancestor tree is hidden and falls back to the mobile topbar target", () => {
    vi.stubGlobal("window", {
      getComputedStyle: (element: ElementStub) => ({
        display: element.__style.display ?? "block",
        visibility: element.__style.visibility ?? "visible",
        opacity: element.__style.opacity ?? "1",
      }),
    });

    const hiddenShell = makeElement("hidden-shell", { width: 200, height: 40 }, { display: "none" });
    const desktopTarget = makeElement("appShellHeaderXpValue", { left: 10, top: 20, width: 120, height: 24 }, {}, hiddenShell);
    const mobileTarget = makeElement("taskLaunchTopbarXpValue", { left: 30, top: 40, width: 96, height: 18 });

    const rect = getVisibleXpTargetRectFromDocument(makeDocument([desktopTarget, mobileTarget]));

    expect(rect).not.toBeNull();
    expect(rect?.left).toBe(30);
    expect(rect?.top).toBe(40);
    expect(rect?.width).toBe(96);
  });

  it("returns null when no candidate is visible", () => {
    vi.stubGlobal("window", {
      getComputedStyle: (element: ElementStub) => ({
        display: element.__style.display ?? "block",
        visibility: element.__style.visibility ?? "visible",
        opacity: element.__style.opacity ?? "1",
      }),
    });

    const desktopTarget = makeElement("appShellHeaderXpValue", { width: 120, height: 24 }, { display: "none" });

    const rect = getVisibleXpTargetRectFromDocument(makeDocument([desktopTarget]));

    expect(rect).toBeNull();
  });
});
