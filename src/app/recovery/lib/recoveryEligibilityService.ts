import type { DailyCapacitySnapshot } from "@/app/adaptivecapacity/lib/dailyCapacityContract";

import { RECOVERY_DEFAULT_THRESHOLDS } from "./recoveryContract";
import { evaluateRecoveryEligibility } from "./recoveryEligibility";
import type { RecoveryEligibilityRepository } from "./recoveryRepository";

type CapacitySnapshot = Pick<DailyCapacitySnapshot, "remainingRange"> | null;

export async function loadRecoveryEligibility(input: {
  uid: string;
  localDate: string;
  timezone: string;
  nowMs: number;
  userRequested?: boolean;
  repository: RecoveryEligibilityRepository;
  capacityLoader?: () => Promise<CapacitySnapshot>;
}) {
  const source = await input.repository.loadSource({ uid: input.uid, localDate: input.localDate, timezone: input.timezone, nowMs: input.nowMs });
  let capacitySnapshot: CapacitySnapshot = null;
  if (input.capacityLoader) {
    try {
      capacitySnapshot = await input.capacityLoader();
    } catch {
      capacitySnapshot = null;
    }
  }
  const eligibility = evaluateRecoveryEligibility({
    ...source,
    localDate: input.localDate,
    evaluatedAtMs: input.nowMs,
    capacityMaxMinutes: capacitySnapshot?.remainingRange.max ?? null,
    userRequested: input.userRequested === true,
    thresholds: RECOVERY_DEFAULT_THRESHOLDS,
  });
  return { eligibility, capacitySnapshot };
}
