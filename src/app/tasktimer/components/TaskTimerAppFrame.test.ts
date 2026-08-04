import { createElement, type ComponentProps, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const rankLadderModalMock = vi.fn((_props: Record<string, unknown>) => null);

vi.mock("next/navigation", () => ({
  usePathname: () => "/tasklaunch",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/AppImg", () => ({
  default: (props: Record<string, unknown>) => createElement("img", props),
}));

vi.mock("./DesktopAppRail", () => ({
  default: () => createElement("div", { "data-testid": "desktop-app-rail" }),
}));

vi.mock("./RankLadderModal", () => ({
  default: (props: Record<string, unknown>) => rankLadderModalMock(props),
}));

vi.mock("./RankThumbnail", () => ({
  default: ({ rankId, className }: { rankId: string; className?: string }) =>
    createElement("span", { className, "data-rank-id": rankId }),
}));
import {
  default as TaskTimerAppFrame,
  getDesktopHeaderRankId,
  getDesktopInsigniaUpgradeAudioCallback,
  getTaskLaunchMobileMenuItems,
  getXpProgressSubtext,
  scheduleDesktopInsigniaUpgradeActivation,
  shouldRenderDesktopInsigniaUpgrade,
  type DesktopInsigniaUpgradePayload,
} from "./TaskTimerAppFrame";

const TaskTimerAppFrameForTest = TaskTimerAppFrame as ComponentType<Omit<ComponentProps<typeof TaskTimerAppFrame>, "children">>;

function renderTaskTimerAppFrameMarkup(overrides: Partial<ComponentProps<typeof TaskTimerAppFrame>> = {}) {
  return renderToStaticMarkup(
    createElement(
      TaskTimerAppFrameForTest,
      {
        activePage: "tasks",
        currentRankId: "operator",
        rankPromotionsById: {},
        currentUserLabel: "User",
        rewardsHeader: {
          rankLabel: "Operator",
          totalXp: 60,
          progressPct: 25,
          progressLabel: "60/240 XP",
          xpToNext: 180,
        },
        ...overrides,
      },
      createElement("div")
    )
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  rankLadderModalMock.mockClear();
});

describe("TaskTimerAppFrame mobile menu", () => {
  it("shows Profile, Settings, User Guide, and Sign Out in the hamburger menu", () => {
    const items = getTaskLaunchMobileMenuItems();

    expect(items.map((item) => item.label)).toEqual(["Profile", "Settings", "User Guide", "Sign Out"]);
    expect(items.map((item) => item.label)).not.toContain("Account");
    expect(items.filter((item) => item.kind === "link").map((item) => item.href)).toEqual(["/account", "/settings", "/user-guide"]);
    expect(items.find((item) => item.label === "Profile")?.iconSrc).toBe("/icons/icons_default/account.webp");
    expect(items.find((item) => item.label === "Sign Out")).toMatchObject({
      kind: "action",
      actionId: "signOut",
    });
  });

  it("keeps the hamburger and menu ids stable", () => {
    const html = renderTaskTimerAppFrameMarkup();

    expect(html).toContain('id="menuIcon"');
    expect(html).toContain('aria-controls="mobileSettingsMenu"');
    expect(html).toContain('id="mobileSettingsMenu"');
  });

  it("renders the mobile menu as a dialog-style bottom sheet structure", () => {
    const html = renderTaskTimerAppFrameMarkup();

    expect(html).toContain('class="taskLaunchMobileMenuPanel"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('class="taskLaunchMobileMenuSwipeHandle"');
    expect(html).toContain('class="taskLaunchMobileMenuList"');
    expect(html).toContain('class="menuItem taskLaunchMobileMenuItem"');
  });

  it("does not server-render the bordered initial auth overlay as visible on leaderboard pages", () => {
    const html = renderTaskTimerAppFrameMarkup({ activePage: "leaderboard" });

    expect(html).toContain('id="initialAuthBusyOverlay"');
    expect(html).toContain('class="initialAuthBusyOverlay"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('class="initialAuthBusyOverlay isOn"');
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

describe("TaskTimerAppFrame XP header animation", () => {
  it("keeps the animation class on the desktop and mobile xp values only", () => {
    const html = renderToStaticMarkup(
      createElement(
        TaskTimerAppFrameForTest,
        {
          activePage: "tasks",
          currentRankId: "operator",
          rankPromotionsById: {},
          currentUserLabel: "User",
          rewardsHeader: {
            rankLabel: "Operator",
            totalXp: 60,
            progressPct: 25,
            progressLabel: "60/240 XP",
            xpToNext: 180,
          },
          isXpCountAnimating: true,
        },
        createElement("div")
      )
    );

    expect(html).toContain('id="taskLaunchTopbarXpValue"');
    expect(html).toContain('class="taskLaunchTopbarXpValue isAnimatingXpCount"');
    expect(html).toContain('id="appShellHeaderXpValue"');
    expect(html).toContain('class="appShellHeaderXpValue isAnimatingXpCount"');
    expect(html).not.toContain("taskLaunchTopbarXpMetaLine");
    expect(html).not.toContain("appShellHeaderXpPromotionLabel");
  });

  it("renders XP award unit payloads through the shared payload layer", () => {
    const html = renderTaskTimerAppFrameMarkup({
      xpAwardFx: {
        visible: true,
        payloads: [
          {
            id: "unit-test-0",
            text: "*",
            style: { left: "120px", top: "80px" },
            className: "xpAwardFxPayloadUnit xpAwardFxPayloadStar",
          },
        ],
      },
    });

    expect(html).toContain('class="xpAwardFxPayload xpAwardFxPayloadUnit xpAwardFxPayloadStar"');
    expect(html).toContain("*");
    expect(html).not.toContain("xpAwardFxShard");
  });
});

describe("TaskTimerAppFrame rank ladder wiring", () => {
  it("passes stored rank promotion metadata into the rank ladder modal", () => {
    renderTaskTimerAppFrameMarkup({
      rankPromotionsById: {
        operator: {
          promotedAt: Date.parse("2026-05-05T10:00:00.000Z"),
          promotedAtXp: 60,
        },
      },
    });

    expect(rankLadderModalMock).toHaveBeenCalled();
    const lastCall = rankLadderModalMock.mock.calls[rankLadderModalMock.mock.calls.length - 1];
    expect(lastCall?.[0]).toMatchObject({
      rankPromotionsById: {
        operator: {
          promotedAt: Date.parse("2026-05-05T10:00:00.000Z"),
          promotedAtXp: 60,
        },
      },
    });
  });
});

describe("TaskTimerAppFrame XP award CSS contracts", () => {
  const shellCss = readFileSync(resolve(__dirname, "../styles/01-shell.css"), "utf8");
  const overlaysCss = readFileSync(resolve(__dirname, "../styles/04-overlays.css"), "utf8");

  it("keeps the XP award spotlight transparent without applying backdrop blur", () => {
    const spotlightRule = shellCss.match(/\.xpAwardSpotlightLayer\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(spotlightRule).not.toBe("");
    expect(spotlightRule).toContain("background:transparent;");
    expect(spotlightRule).not.toContain("rgba(");
    expect(spotlightRule).not.toContain("backdrop-filter");
  });

  it("defines the XP award unit payload animation contract", () => {
    const unitRule = overlaysCss.match(/\.xpAwardFxPayloadUnit\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(unitRule).toContain("animation: xpAwardPayloadUnit 760ms");
    expect(overlaysCss).toContain(".xpAwardFxPayloadStar");
    expect(overlaysCss).toContain("@keyframes xpAwardPayloadUnit");
    expect(overlaysCss).not.toContain(".xpAwardFxShard");
    expect(overlaysCss).not.toContain("xpAwardPayloadSmash");
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
