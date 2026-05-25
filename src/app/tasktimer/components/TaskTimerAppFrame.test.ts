import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDesktopHeaderRankId,
  getDesktopInsigniaUpgradeAudioCallback,
  getTaskLaunchMobileMenuItems,
  getXpProgressSubtext,
  scheduleDesktopInsigniaUpgradeActivation,
  shouldRenderDesktopInsigniaUpgrade,
  type DesktopInsigniaUpgradePayload,
} from "./TaskTimerAppFrame";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TaskTimerAppFrame mobile menu", () => {
  it("shows User Guide and Settings without Account in the hamburger menu", () => {
    const items = getTaskLaunchMobileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["User Guide", "Settings", "Sign Out"]);
    expect(items.map((item) => item.label)).not.toContain("Account");
    expect(items.filter((item) => item.kind === "link").map((item) => item.href)).toEqual(["/user-guide", "/settings"]);
  });
});

describe("TaskTimerAppFrame XP progress sub-text", () => {
  it("formats the next-rank sub-text with the next rank label", () => {
    expect(getXpProgressSubtext(60, 180)).toBe("You are 180 XP away from Technician");
  });

  it("falls back to max-rank copy when no next rank exists", () => {
    expect(getXpProgressSubtext(50000, null)).toBe("Max rank reached");
  });
});

describe("TaskTimerAppFrame desktop promotion insignia", () => {
  it("holds the previous rank in the desktop header while the promotion modal is active", () => {
    expect(getDesktopHeaderRankId("operator", "initiate", null)).toBe("initiate");
  });

  it("uses the promoted rank while the close-triggered insignia upgrade is active", () => {
    expect(getDesktopHeaderRankId("operator", "initiate", { nextRankId: "operator" })).toBe("operator");
  });

  it("renders the desktop insignia upgrade only for the active payload sequence", () => {
    const upgrade: DesktopInsigniaUpgradePayload = {
      seq: 2,
      previousRankId: "initiate",
      nextRankId: "operator",
    };

    expect(shouldRenderDesktopInsigniaUpgrade(upgrade, 2)).toBe(true);
    expect(shouldRenderDesktopInsigniaUpgrade(upgrade, 1)).toBe(false);
    expect(shouldRenderDesktopInsigniaUpgrade(null, 2)).toBe(false);
  });

  it("does not render a desktop insignia upgrade without both rank ids", () => {
    expect(shouldRenderDesktopInsigniaUpgrade({ seq: 1, previousRankId: "", nextRankId: "operator" }, 1)).toBe(false);
    expect(shouldRenderDesktopInsigniaUpgrade({ seq: 1, previousRankId: "initiate", nextRankId: "" }, 1)).toBe(false);
  });

  it("delays the desktop insignia upgrade activation and audio by 600ms", () => {
    vi.useFakeTimers();
    let activeSeq: number | null = null;
    const playAudio = vi.fn();
    const setActiveSeq = vi.fn((updater: (current: number | null) => number | null) => {
      activeSeq = updater(activeSeq);
    });

    scheduleDesktopInsigniaUpgradeActivation(
      { seq: 3, previousRankId: "initiate", nextRankId: "operator" },
      globalThis,
      setActiveSeq,
      playAudio
    );

    vi.advanceTimersByTime(599);
    expect(activeSeq).toBeNull();
    expect(playAudio).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(activeSeq).toBe(3);
    expect(playAudio).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3399);
    expect(activeSeq).toBe(3);

    vi.advanceTimersByTime(1);
    expect(activeSeq).toBeNull();
  });

  it("keeps the desktop insignia upgrade animation but mutes audio when achievements sounds are disabled", () => {
    vi.useFakeTimers();
    let activeSeq: number | null = null;
    const playAudio = vi.fn();
    const setActiveSeq = vi.fn((updater: (current: number | null) => number | null) => {
      activeSeq = updater(activeSeq);
    });

    scheduleDesktopInsigniaUpgradeActivation(
      { seq: 6, previousRankId: "operator", nextRankId: "specialist" },
      globalThis,
      setActiveSeq,
      getDesktopInsigniaUpgradeAudioCallback(false, playAudio)
    );

    vi.advanceTimersByTime(600);
    expect(activeSeq).toBe(6);
    expect(playAudio).not.toHaveBeenCalled();
  });

  it("cancels stale delayed desktop insignia upgrade playback on cleanup", () => {
    vi.useFakeTimers();
    let activeSeq: number | null = null;
    const playAudio = vi.fn();
    const setActiveSeq = vi.fn((updater: (current: number | null) => number | null) => {
      activeSeq = updater(activeSeq);
    });
    const cancelFirst = scheduleDesktopInsigniaUpgradeActivation(
      { seq: 4, previousRankId: "initiate", nextRankId: "operator" },
      globalThis,
      setActiveSeq,
      playAudio
    );

    vi.advanceTimersByTime(300);
    cancelFirst();
    scheduleDesktopInsigniaUpgradeActivation(
      { seq: 5, previousRankId: "operator", nextRankId: "specialist" },
      globalThis,
      setActiveSeq,
      playAudio
    );

    vi.advanceTimersByTime(299);
    expect(activeSeq).toBeNull();
    expect(playAudio).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(activeSeq).toBeNull();
    expect(playAudio).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(activeSeq).toBe(5);
    expect(playAudio).toHaveBeenCalledTimes(1);
  });
});
