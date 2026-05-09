import { describe, expect, it } from "vitest";
import {
  clearActiveXpAward,
  createXpAwardAnimationState,
  enqueuePendingXpAward,
  notifyXpAwardOverlayClosed,
  type PendingXpAward,
  XP_AWARD_COUNT_DURATION_MS,
  XP_AWARD_FX_DURATION_MS,
} from "./xp-award-animation";

function award(overrides: Partial<PendingXpAward> = {}): PendingXpAward {
  return {
    fromXp: 10,
    toXp: 22,
    awardedXp: 12,
    sourceModal: "timeGoalComplete",
    sourceTaskId: "task-1",
    sourceOverlayId: "timeGoalCompleteOverlay",
    sourceElementKey: "timeGoalCompleteAwardText",
    sourceRect: { left: 10, top: 20, width: 30, height: 12 },
    ...overrides,
  };
}

describe("xp award animation state", () => {
  it("uses a fixed two-second count animation duration", () => {
    expect(XP_AWARD_COUNT_DURATION_MS).toBe(2000);
  });

  it("keeps the xp payload visible before the count animation starts", () => {
    expect(XP_AWARD_FX_DURATION_MS).toBe(1600);
  });

  it("queues a pending award without starting until the matching overlay closes", () => {
    const queued = enqueuePendingXpAward(createXpAwardAnimationState(), award());

    expect(queued.pending).toMatchObject({ fromXp: 10, toXp: 22, awardedXp: 12 });
    expect(queued.active).toBeNull();

    const ignored = notifyXpAwardOverlayClosed(queued, "confirmOverlay");
    expect(ignored).toEqual(queued);

    const started = notifyXpAwardOverlayClosed(queued, "timeGoalCompleteOverlay");
    expect(started.pending).toBeNull();
    expect(started.active).toMatchObject({ fromXp: 10, toXp: 22, awardedXp: 12 });
  });

  it("merges multiple pending awards before the animation starts", () => {
    const first = enqueuePendingXpAward(createXpAwardAnimationState(), award({ fromXp: 10, toXp: 22, awardedXp: 12 }));
    const merged = enqueuePendingXpAward(
      first,
      award({
        fromXp: 22,
        toXp: 31,
        awardedXp: 9,
        sourceOverlayId: "confirmOverlay",
        sourceModal: "resetConfirm",
        sourceElementKey: "confirmResetTaskAwardText",
      })
    );

    expect(merged.pending).toMatchObject({
      fromXp: 10,
      toXp: 31,
      awardedXp: 21,
      sourceOverlayId: "timeGoalCompleteOverlay",
      sourceElementKey: "timeGoalCompleteAwardText",
    });
  });

  it("merges new awards into the active animation instead of creating a second one", () => {
    const queued = enqueuePendingXpAward(createXpAwardAnimationState(), award());
    const active = notifyXpAwardOverlayClosed(queued, "timeGoalCompleteOverlay");
    const merged = enqueuePendingXpAward(
      active,
      award({
        fromXp: 22,
        toXp: 30,
        awardedXp: 8,
        sourceOverlayId: "confirmOverlay",
        sourceModal: "resetConfirm",
      })
    );

    expect(merged.pending).toBeNull();
    expect(merged.active).toMatchObject({
      fromXp: 10,
      toXp: 30,
      awardedXp: 20,
      sourceOverlayId: "timeGoalCompleteOverlay",
    });

    expect(clearActiveXpAward(merged)).toEqual(createXpAwardAnimationState());
  });
});
