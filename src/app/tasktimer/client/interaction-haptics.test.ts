import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
  },
}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    impact: vi.fn(() => Promise.resolve()),
  },
  ImpactStyle: {
    Heavy: "HEAVY",
    Medium: "MEDIUM",
    Light: "LIGHT",
  },
}));

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import {
  getInteractionHapticImpact,
  isInteractionHapticsRuntimeAvailable,
  playInteractionHaptic,
  registerInteractionHaptics,
} from "./interaction-haptics";

function makeElement(opts: {
  selectorMatches?: Record<string, boolean>;
  attributes?: Record<string, string | null>;
  textContent?: string;
  disabled?: boolean;
  disabledAncestor?: boolean;
} = {}) {
  const element = {
    textContent: opts.textContent || "",
    disabled: !!opts.disabled,
    getAttribute: (name: string) => opts.attributes?.[name] ?? null,
    closest: (selector: string) => {
      if (selector === "button:disabled,input:disabled,[aria-disabled='true']") {
        return opts.disabledAncestor ? element : null;
      }
      return opts.selectorMatches?.[selector] ? element : null;
    },
  };
  return element as unknown as HTMLElement;
}

const PRIMARY_CLICK_SELECTOR = "#saveEditBtn, #addTaskConfirmBtn, .closePopup.isSaveAndClose";
const TASK_LAUNCH_CLICK_SELECTOR =
  'button[data-action="start"][title="Launch"], button[data-action="start"][title="Resume"], #confirmOverlay.isResetTaskConfirm #confirmOkBtn, #timeGoalCompleteOverlay [data-time-goal-next-task-id]';
const SECONDARY_DIRECT_SELECTOR =
  '.switch,[role="switch"],#closeMenuBtn,#menuIcon,[data-nav-page],.appFooterBtn,.dashboardRailMenuBtn,.settingsNavTile,.taskLaunchMobileMenuItem,#openAddTaskBtn,[data-action="openAddTask"],[data-action="reset"],[data-action="edit"],#openFriendRequestModalBtn';
const CHECKBOX_SELECTOR = 'input[type="checkbox"],[role="checkbox"]';
const DESTRUCTIVE_CONFIRM_SELECTOR =
  "#confirmOverlay.isResetTaskConfirm #confirmOkBtn,#confirmOverlay.isResetAllDeleteConfirm #confirmOkBtn,#confirmOverlay.isDeleteTaskConfirm #confirmOkBtn,#confirmOverlay.isDeleteFriendConfirm #confirmOkBtn,#confirmOverlay #confirmOkBtn.btn-warn,#confirmOverlay #confirmAltBtn.btn-warn,.modal .btn-warn";

describe("interaction haptics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", { location: { protocol: "capacitor:" } });
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
  });

  it("classifies destructive confirmations as heavy", () => {
    const target = makeElement({ selectorMatches: { [DESTRUCTIVE_CONFIRM_SELECTOR]: true, [TASK_LAUNCH_CLICK_SELECTOR]: true } });

    expect(getInteractionHapticImpact(target)).toBe("heavy");
  });

  it("classifies primary task actions as medium", () => {
    expect(getInteractionHapticImpact(makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } }))).toBe("medium");
    expect(getInteractionHapticImpact(makeElement({ selectorMatches: { [TASK_LAUNCH_CLICK_SELECTOR]: true } }))).toBe("medium");
  });

  it("classifies secondary and checkbox controls as light", () => {
    expect(getInteractionHapticImpact(makeElement({ selectorMatches: { [SECONDARY_DIRECT_SELECTOR]: true } }))).toBe("light");
    expect(getInteractionHapticImpact(makeElement({ selectorMatches: { [CHECKBOX_SELECTOR]: true } }))).toBe("light");
  });

  it("ignores unrelated and disabled controls", () => {
    expect(getInteractionHapticImpact(makeElement({ textContent: "Plain text" }))).toBeNull();
    expect(getInteractionHapticImpact(makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true }, disabled: true }))).toBeNull();
  });

  it("detects native or file runtime availability", () => {
    expect(isInteractionHapticsRuntimeAvailable()).toBe(true);

    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    expect(isInteractionHapticsRuntimeAvailable()).toBe(false);

    vi.stubGlobal("window", { location: { protocol: "file:" } });
    expect(isInteractionHapticsRuntimeAvailable()).toBe(true);
  });

  it("plays matching Capacitor impact styles and swallows failures", () => {
    vi.mocked(Haptics.impact).mockRejectedValueOnce(new Error("unavailable"));

    expect(() => playInteractionHaptic("heavy")).not.toThrow();
    playInteractionHaptic("medium");
    playInteractionHaptic("light");

    expect(Haptics.impact).toHaveBeenNthCalledWith(1, { style: ImpactStyle.Heavy });
    expect(Haptics.impact).toHaveBeenNthCalledWith(2, { style: ImpactStyle.Medium });
    expect(Haptics.impact).toHaveBeenNthCalledWith(3, { style: ImpactStyle.Light });
  });

  it("registers one trusted-click listener gated by the haptics preference", () => {
    const on = vi.fn();
    const playHaptic = vi.fn();
    let enabled = true;

    registerInteractionHaptics({
      on,
      documentRef: {} as Document,
      isEnabled: () => enabled,
      playHaptic,
    });

    const handler = on.mock.calls[0]?.[2] as EventListener;
    expect(on).toHaveBeenCalledWith({}, "click", expect.any(Function), { capture: true });

    handler({ defaultPrevented: true, target: makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } }) } as unknown as Event);
    handler({ defaultPrevented: false, isTrusted: false, target: makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } }) } as unknown as Event);
    enabled = false;
    handler({ defaultPrevented: false, isTrusted: true, target: makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } }) } as unknown as Event);
    enabled = true;
    handler({ defaultPrevented: false, isTrusted: true, target: makeElement({ selectorMatches: { [PRIMARY_CLICK_SELECTOR]: true } }) } as unknown as Event);

    expect(playHaptic).toHaveBeenCalledTimes(1);
    expect(playHaptic).toHaveBeenCalledWith("medium");
  });
});
