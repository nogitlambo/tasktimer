import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskTimerConfirmOverlay } from "./confirm-overlay";

function createClassList(initial: string[] = []) {
  const classes = new Set(initial);
  return {
    add: (...tokens: string[]) => tokens.forEach((token) => classes.add(token)),
    remove: (...tokens: string[]) => tokens.forEach((token) => classes.delete(token)),
    contains: (token: string) => classes.has(token),
    toggle: (token: string, force?: boolean) => {
      const next = typeof force === "boolean" ? force : !classes.has(token);
      if (next) classes.add(token);
      else classes.delete(token);
      return next;
    },
    toString: () => [...classes].join(" "),
  };
}

function makeElement(initialClasses: string[] = []) {
  const el = {
    classList: createClassList(initialClasses),
    disabled: false,
    hidden: false,
    placeholder: "",
    querySelector: vi.fn(() => null),
    style: { display: "" },
    textContent: "",
    value: "",
  };
  return el as unknown as HTMLElement & HTMLButtonElement & HTMLInputElement;
}

function createHarness() {
  const modal = makeElement(["modal", "modalConfirmation"]);
  const confirmOverlay = makeElement(["overlay"]);
  confirmOverlay.id = "confirmOverlay";
  confirmOverlay.querySelector = vi.fn((selector: string) => (selector === ".modal" ? modal : null));

  const confirmChkLabelText = makeElement();
  const confirmChkLabel = makeElement();
  confirmChkLabel.querySelector = vi.fn((selector: string) => (selector === ".confirmChkLabelText" ? confirmChkLabelText : null));

  const els = {
    confirmAltBtn: makeElement(["btn", "btn-ghost"]),
    confirmCancelBtn: makeElement(["btn", "btn-ghost"]),
    confirmChkLabel,
    confirmChkLabel2: makeElement(),
    confirmChkNote: makeElement(),
    confirmChkRow: makeElement(),
    confirmChkRow2: makeElement(),
    confirmDangerInput: makeElement(),
    confirmDangerInputLabel: makeElement(),
    confirmDangerInputRow: makeElement(),
    confirmDeleteAll: makeElement(),
    confirmLogChk: makeElement(),
    confirmOkBtn: makeElement(["btn", "btn-accent"]),
    confirmOverlay,
    confirmText: makeElement(),
    confirmTitle: makeElement(),
  };

  const overlay = createTaskTimerConfirmOverlay({
    els: els as any,
    on: vi.fn(),
    closeEdit: vi.fn(),
    closeElapsedPad: vi.fn(),
    closeConfirm: vi.fn(),
    closeTaskExportModal: vi.fn(),
    closeShareTaskModal: vi.fn(),
    getConfirmAction: vi.fn(() => null),
    setConfirmAction: vi.fn(),
    getConfirmActionAlt: vi.fn(() => null),
    setConfirmActionAlt: vi.fn(),
    getConfirmActionCancel: vi.fn(() => null),
    setConfirmActionCancel: vi.fn(),
  });

  return { els, modal, overlay };
}

describe("createTaskTimerConfirmOverlay", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { activeElement: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classifies default confirmations as non-destructive", () => {
    const { modal, overlay } = createHarness();

    overlay.confirm("Confirm", "Continue?");

    expect(modal.classList.contains("modalConfirmation")).toBe(true);
    expect(modal.classList.contains("modalConfirmationDestructive")).toBe(false);
  });

  it("classifies explicit warn OK buttons as destructive", () => {
    const { modal, overlay } = createHarness();

    overlay.confirm("Confirm", "Delete?", { okButtonClassName: "btn btn-warn" });

    expect(modal.classList.contains("modalConfirmation")).toBe(false);
    expect(modal.classList.contains("modalConfirmationDestructive")).toBe(true);
  });

  it("classifies Delete-labelled OK buttons as destructive", () => {
    const { modal, overlay } = createHarness();

    overlay.confirm("Confirm", "Delete?", { okLabel: "Delete" });

    expect(modal.classList.contains("modalConfirmation")).toBe(false);
    expect(modal.classList.contains("modalConfirmationDestructive")).toBe(true);
  });

  it("keeps named destructive task flows on the non-destructive modal shell", () => {
    const { modal, overlay } = createHarness();

    overlay.confirm("Delete Task", "Delete?", {
      okButtonClassName: "btn btn-warn",
      overlayClassName: "isDeleteTaskConfirm",
    });

    expect(modal.classList.contains("modalConfirmation")).toBe(true);
    expect(modal.classList.contains("modalConfirmationDestructive")).toBe(false);
  });

  it("keeps remove friend on the non-destructive modal shell", () => {
    const { modal, overlay } = createHarness();

    overlay.confirm("Remove Friend", "Remove?", {
      okButtonClassName: "btn btn-warn",
      overlayClassName: "isDeleteFriendConfirm",
    });

    expect(modal.classList.contains("modalConfirmation")).toBe(true);
    expect(modal.classList.contains("modalConfirmationDestructive")).toBe(false);
  });

  it("removes modal type classes when closing", () => {
    const { modal, overlay } = createHarness();
    overlay.confirm("Confirm", "Delete?", { okButtonClassName: "btn btn-warn" });

    overlay.closeConfirm();

    expect(modal.classList.contains("modalConfirmation")).toBe(false);
    expect(modal.classList.contains("modalConfirmationDestructive")).toBe(false);
  });
});
