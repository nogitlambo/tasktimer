import { describe, expect, it, vi } from "vitest";
import {
  applyXpAwardButtonLabelOverride,
  clearXpAwardButtonLabelOverride,
  getXpAwardButtonLabelOverride,
  setXpAwardButtonLabelOverride,
} from "./xp-award-button-label-override";

function fakeTaskElement() {
  const classNames = new Set<string>();
  const button = {
    disabled: true,
    classList: {
      add: vi.fn((...classes: string[]) => classes.forEach((className) => classNames.add(className))),
      remove: vi.fn((...classes: string[]) => classes.forEach((className) => classNames.delete(className))),
    },
    setAttribute: vi.fn(),
  };
  const label = {
    textContent: "Reset",
  };
  const taskEl = {
    querySelector: vi.fn((selector: string) => {
      if (selector === ".taskPrimaryAction") return button;
      if (selector === ".taskPrimaryActionPrimary") return label;
      return null;
    }),
  };
  return { taskEl, button, label, classNames };
}

describe("XP award button label override", () => {
  it("applies the active XP label to a freshly rendered task button", () => {
    const { taskEl, button, label, classNames } = fakeTaskElement();

    setXpAwardButtonLabelOverride("task-1", "+12 XP");
    applyXpAwardButtonLabelOverride(taskEl as unknown as HTMLElement, "task-1");

    expect(label.textContent).toBe("+12 XP");
    expect(button.classList.add).toHaveBeenCalledWith("isXpAwardReceiving");
    expect(classNames.has("isXpAwardReceiving")).toBe(true);

    clearXpAwardButtonLabelOverride("task-1");
  });

  it("clears the label override when countdown cleanup finishes", () => {
    setXpAwardButtonLabelOverride("task-1", "3 XP");

    clearXpAwardButtonLabelOverride("task-1");

    expect(getXpAwardButtonLabelOverride("task-1")).toBe("");
  });

  it("promotes a held Reset label to reset button state", () => {
    const { taskEl, button, label, classNames } = fakeTaskElement();

    setXpAwardButtonLabelOverride("task-1", "Reset");
    applyXpAwardButtonLabelOverride(taskEl as unknown as HTMLElement, "task-1");

    expect(label.textContent).toBe("Reset");
    expect(classNames.has("isXpAwardReceiving")).toBe(false);
    expect(classNames.has("taskPrimaryActionReset")).toBe(true);
    expect(button.setAttribute).toHaveBeenCalledWith("data-action", "reset");
    expect(button.setAttribute).toHaveBeenCalledWith("title", "Reset");
    expect(button.setAttribute).toHaveBeenCalledWith("aria-label", "Reset");
    expect(button.disabled).toBe(false);

    clearXpAwardButtonLabelOverride("task-1");
  });
});
