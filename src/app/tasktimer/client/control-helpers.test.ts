import { describe, expect, it, vi } from "vitest";

import { bindToggleRow } from "./control-helpers";

type Listener = (event: Event) => void;

class FakeElement {
  parent: FakeElement | null = null;
  private listeners = new Map<string, Listener[]>();

  constructor(public id: string) {}

  closest(selector: string) {
    if (!selector.startsWith("#")) return null;
    const targetId = selector.slice(1);
    let current: FakeElement | null = this;
    while (current) {
      if (current.id === targetId) return current;
      current = current.parent;
    }
    return null;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }

  dispatchClick() {
    const event = {
      target: this,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event;
    for (const listener of this.listeners.get("click") || []) {
      listener(event);
    }
    if (!(event as Event & { stopPropagation: ReturnType<typeof vi.fn> }).stopPropagation.mock.calls.length && this.parent) {
      this.parent.dispatchBubbledClick(this);
    }
    return event as Event & {
      preventDefault: ReturnType<typeof vi.fn>;
      stopPropagation: ReturnType<typeof vi.fn>;
    };
  }

  private dispatchBubbledClick(target: FakeElement) {
    const event = { target } as Event;
    for (const listener of this.listeners.get("click") || []) {
      listener(event);
    }
    if (this.parent) this.parent.dispatchBubbledClick(target);
  }
}

describe("bindToggleRow", () => {
  it("handles a control click once without bubbling to the row handler", () => {
    const control = new FakeElement("taskFullColorCardsToggle");
    const row = new FakeElement("taskFullColorCardsToggleRow");
    control.parent = row;
    const handleToggle = vi.fn();

    bindToggleRow({
      on: (target, type, listener) => {
        (target as FakeElement | null)?.addEventListener(type, listener as Listener);
        return () => {};
      },
      control,
      row,
      ignoreSelector: "#taskFullColorCardsToggle",
      handleToggle,
    });

    const event = control.dispatchClick();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
