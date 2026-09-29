// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindDailyRewardClaimAction } from "./daily-reward-claim-action";
import { awardDailyOpenReward, DEFAULT_REWARD_PROGRESS } from "../lib/rewards";
import type { DailyRewardClaimResult } from "../lib/dailyRewardClaims";

afterEach(() => { document.body.innerHTML = ""; });

function setup() {
  document.body.innerHTML = '<button id="dailyRewardClaimBtn">Claim</button>';
  const button = document.querySelector("button")!;
  let resolve!: (result: DailyRewardClaimResult) => void;
  const pending = new Promise<DailyRewardClaimResult>((done) => { resolve = done; });
  const account = { uid: "user-1", generation: 0 };
  const options = {
    button,
    inFlight: { current: false },
    getAccount: () => ({ ...account }),
    claim: vi.fn(() => pending),
    acceptRewards: vi.fn(), onAward: vi.fn(), close: vi.fn(),
  };
  const dispose = bindDailyRewardClaimAction(options);
  return { ...options, account, resolve, dispose };
}

describe("daily reward claim interaction", () => {
  it("disables immediately, rejects duplicate clicks, and animates only after commit", async () => {
    const ui = setup();
    ui.button.click();
    ui.button.click();
    ui.button.dispatchEvent(new Event("click"));
    expect(ui.claim).toHaveBeenCalledTimes(1);
    expect(ui.button.disabled).toBe(true);
    expect(ui.onAward).not.toHaveBeenCalled();
    const award = awardDailyOpenReward(DEFAULT_REWARD_PROGRESS, Date.now());
    ui.resolve({ status: "awarded", award });
    await Promise.resolve();
    expect(ui.acceptRewards).toHaveBeenCalledWith("user-1", award.next);
    expect(ui.onAward).toHaveBeenCalledExactlyOnceWith(award);
    expect(ui.close).toHaveBeenCalledTimes(1);
  });

  it("closes without effects if another device already claimed", async () => {
    const ui = setup();
    ui.button.click();
    ui.resolve({ status: "alreadyClaimed", rewards: DEFAULT_REWARD_PROGRESS });
    await Promise.resolve();
    expect(ui.acceptRewards).toHaveBeenCalledTimes(1);
    expect(ui.onAward).not.toHaveBeenCalled();
    expect(ui.close).toHaveBeenCalledTimes(1);
  });

  it("leaves a failed claim retryable without provisional XP", async () => {
    const ui = setup();
    ui.button.click();
    ui.resolve({ status: "retryable" });
    await Promise.resolve();
    expect(ui.button.disabled).toBe(false);
    expect(ui.button.textContent).toBe("Retry claim");
    expect(ui.acceptRewards).not.toHaveBeenCalled();
    expect(ui.onAward).not.toHaveBeenCalled();
    expect(ui.close).not.toHaveBeenCalled();
    ui.button.click();
    expect(ui.claim).toHaveBeenCalledTimes(2);
    await Promise.resolve();
  });

  it.each(["unmount", "switch", "signOutAndBack"])("ignores results after %s", async (change) => {
    const ui = setup();
    ui.button.click();
    if (change === "unmount") ui.dispose();
    if (change === "switch") ui.account.uid = "user-2";
    if (change === "signOutAndBack") ui.account.generation++;
    ui.resolve({ status: "awarded", award: awardDailyOpenReward(DEFAULT_REWARD_PROGRESS, Date.now()) });
    await Promise.resolve();
    expect(ui.acceptRewards).not.toHaveBeenCalled();
    expect(ui.onAward).not.toHaveBeenCalled();
    expect(ui.close).not.toHaveBeenCalled();
  });
});
