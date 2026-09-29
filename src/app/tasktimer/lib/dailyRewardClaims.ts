import { doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp } from "firebase/firestore";
import { getFirebaseFirestoreClient } from "@/lib/firebaseFirestoreClient";
import { getFirebaseAuthClient } from "@/lib/firebaseClient";
import { buildDefaultUserPreferences, normalizeUserPreferencesDocument, saveUserRootPatch } from "./cloudStore";
import { localDayKey } from "./history";
import { awardDailyOpenReward, isDailyOpenRewardEligible, type RewardAwardResult, type RewardProgressV1 } from "./rewards";

export type DailyRewardClaimResult =
  | { status: "awarded"; award: RewardAwardResult }
  | { status: "alreadyClaimed"; rewards: RewardProgressV1 }
  | { status: "retryable" };
export type DailyRewardEligibility = "eligible" | "alreadyClaimed" | "retryable";

function references(uid: string, dayKey: string) {
  const db = getFirebaseFirestoreClient();
  if (!db || !uid || getFirebaseAuthClient()?.currentUser?.uid !== uid) throw new Error("Daily reward account unavailable");
  return {
    db,
    claim: doc(db, "users", uid, "dailyRewardClaims", dayKey),
    preferences: doc(db, "users", uid, "preferences", "v1"),
  };
}

// Transactions require a server connection. Never queue an optimistic offline award.
async function transact(uid: string, now: number, claimReward: boolean): Promise<DailyRewardClaimResult | { status: "eligible" }> {
  const dayKey = localDayKey(now);
  const refs = references(uid, dayKey);
  return runTransaction(refs.db, async (transaction) => {
    const claim = await transaction.get(refs.claim);
    const snapshot = await transaction.get(refs.preferences);
    if (getFirebaseAuthClient()?.currentUser?.uid !== uid || localDayKey(Date.now()) !== dayKey) {
      throw new Error("Daily reward account or day changed");
    }
    const preferences = snapshot.exists()
      ? normalizeUserPreferencesDocument(snapshot.data())
      : buildDefaultUserPreferences();
    if (claim.exists()) return { status: "alreadyClaimed" as const, rewards: preferences.rewards };
    const eligible = isDailyOpenRewardEligible(preferences.rewards, now);
    if (eligible && !claimReward) return { status: "eligible" as const };
    const award = eligible ? awardDailyOpenReward(preferences.rewards, now) : null;
    // A rejected timestamp must not consume the day's claim.
    if (award && (award.amount !== 10 || award.next.awardLedger.at(-1)?.dayKey !== dayKey)) {
      throw new Error("Daily reward timestamp unavailable");
    }
    transaction.set(refs.claim, { dayKey, xp: 10, sourceKey: `dailyOpen:${dayKey}`, claimedAt: serverTimestamp() });
    if (!award) return { status: "alreadyClaimed" as const, rewards: preferences.rewards };
    transaction.set(refs.preferences, { ...preferences, rewards: award.next, updatedAtMs: now, updatedAt: serverTimestamp() });
    return { status: "awarded" as const, award };
  });
}

export async function checkDailyRewardEligibility(uid: string, now = Date.now()): Promise<DailyRewardEligibility> {
  try {
    const result = await transact(uid, now, false);
    return result.status === "eligible" ? "eligible" : "alreadyClaimed";
  } catch {
    return "retryable";
  }
}

export async function claimDailyReward(uid: string, now = Date.now()): Promise<DailyRewardClaimResult> {
  try {
    const result = await transact(uid, now, true);
    if (result.status === "awarded") {
      // The claim is already committed; a failed summary mirror must never turn it into a retry.
      void saveUserRootPatch(uid, {
        rewardCurrentRankId: result.award.next.currentRankId,
        rewardTotalXp: result.award.next.totalXp,
        completedTaskCount: result.award.next.completedSessions,
      }).catch(() => {});
    }
    return result.status === "eligible" ? { status: "retryable" } : result;
  } catch {
    return { status: "retryable" };
  }
}

export function subscribeDailyRewardClaim(uid: string, dayKey: string, onClaimed: (rewards: RewardProgressV1) => void): () => void {
  let active = true;
  try {
    const refs = references(uid, dayKey);
    const unsubscribe = onSnapshot(refs.claim, { includeMetadataChanges: true }, (snapshot) => {
      if (!snapshot.exists() || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      void getDocFromServer(refs.preferences).then((preferences) => {
        if (active && getFirebaseAuthClient()?.currentUser?.uid === uid && preferences.exists()) {
          onClaimed(normalizeUserPreferencesDocument(preferences.data()).rewards);
        }
      }).catch(() => { /* Foreground/reconnect will retry. */ });
    }, () => { /* Eligibility remains server-gated when subscriptions fail. */ });
    return () => { active = false; unsubscribe(); };
  } catch {
    return () => { active = false; };
  }
}
