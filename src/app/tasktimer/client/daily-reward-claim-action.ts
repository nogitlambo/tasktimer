import type { DailyRewardClaimResult } from "../lib/dailyRewardClaims";
import type { RewardAwardResult, RewardProgressV1 } from "../lib/rewards";

type DailyRewardClaimActionOptions = {
  button: HTMLButtonElement;
  inFlight: { current: boolean };
  getAccount: () => { uid: string; generation: number };
  claim: (uid: string) => Promise<DailyRewardClaimResult>;
  acceptRewards: (uid: string, rewards: RewardProgressV1) => void;
  onAward: (award: RewardAwardResult) => void;
  close: () => void;
};

/** Bind the actual claim interaction so duplicate clicks and abandoned requests share one guard. */
export function bindDailyRewardClaimAction(options: DailyRewardClaimActionOptions): () => void {
  const { button, inFlight } = options;
  let cancelled = false;
  const handleClaim = async () => {
    if (button.disabled || inFlight.current) return;
    const account = options.getAccount();
    if (!account.uid) return;
    button.disabled = true;
    button.textContent = "Claiming...";
    inFlight.current = true;
    let result: DailyRewardClaimResult;
    try {
      result = await options.claim(account.uid);
    } catch {
      result = { status: "retryable" };
    }
    inFlight.current = false;
    const current = options.getAccount();
    if (cancelled || current.uid !== account.uid || current.generation !== account.generation) return;
    if (result.status === "retryable") {
      button.disabled = false;
      button.textContent = "Retry claim";
      return;
    }
    options.acceptRewards(account.uid, result.status === "awarded" ? result.award.next : result.rewards);
    if (result.status === "awarded") options.onAward(result.award);
    options.close();
  };
  button.addEventListener("click", handleClaim);
  return () => { cancelled = true; button.removeEventListener("click", handleClaim); };
}
