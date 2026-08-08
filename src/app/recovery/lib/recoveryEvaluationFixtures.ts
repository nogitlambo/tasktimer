import { RECOVERY_DEFAULT_THRESHOLDS, type RecoveryEligibilityInput, type RecoveryEligibilityResult } from "./recoveryContract";
import { evaluateRecoveryEligibility } from "./recoveryEligibility";
import type { RecoveryBacklogTask } from "./recoveryPlanning";

export type RecoveryEvaluationFixture = {
  id: string;
  localDate: string;
  eligibilityInput: RecoveryEligibilityInput;
  tasks: RecoveryBacklogTask[];
  expectedEligible: boolean;
  expectedClassificationCoverage: Set<RecoveryBacklogTask["taskId"]>;
};

const INACTIVITY_DAYS = [0, 3, 7, 10] as const;
const BACKLOG_COUNTS = [2, 8, 12, 16] as const;
const OVERDUE_COUNTS = [0, 1, 4, 6] as const;
const CAPACITY_MAX = [15, 30, 60, 120] as const;

function dateOffset(localDate: string, days: number) {
  return new Date(Date.parse(`${localDate}T00:00:00.000Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function buildTask(index: number, localDate: string, backlogCount: number, overdueCount: number): RecoveryBacklogTask {
  const isOverdue = index < overdueCount;
  const isHardDeadline = index % 5 === 0;
  const isFlexible = index % 4 === 1;
  const isStale = index % 6 === 2;
  const requiresClarification = index % 7 === 3;
  return {
    taskId: `fixture-task-${index}`,
    taskVersion: `fixture-version-${index}`,
    title: requiresClarification ? "" : `Fixture task ${index}`,
    dueDate: isOverdue ? dateOffset(localDate, -1) : index % 3 === 0 ? dateOffset(localDate, 2) : null,
    priority: index % 9 === 0 ? "urgent" : index % 3 === 0 ? "high" : "low",
    hardDeadline: isHardDeadline,
    pinned: index % 11 === 0,
    inProgress: index % 17 === 0,
    blocksImportantWork: index % 13 === 0,
    flexible: isFlexible,
    stale: isStale,
    requiresClarification,
    carriedOver: index < backlogCount,
    recentlyMoved: index % 8 === 0,
    postponementCount: isStale ? 3 : index % 5,
    nextBestActionCandidate: null,
  };
}

export function buildRecoveryEvaluationFixtures(): RecoveryEvaluationFixture[] {
  const fixtures: RecoveryEvaluationFixture[] = [];
  const localDate = "2026-08-08";
  for (let index = 0; index < 120; index += 1) {
    const inactiveLocalDays = INACTIVITY_DAYS[index % INACTIVITY_DAYS.length]!;
    const actionableBacklogCount = BACKLOG_COUNTS[Math.floor(index / INACTIVITY_DAYS.length) % BACKLOG_COUNTS.length]!;
    const overdueCount = OVERDUE_COUNTS[Math.floor(index / 7) % OVERDUE_COUNTS.length]!;
    const capacityMaxMinutes = CAPACITY_MAX[Math.floor(index / 13) % CAPACITY_MAX.length]!;
    const missedScheduledDays = index % 7 === 0 ? 3 : 0;
    const repeatedPlanOverloadCount = index % 11 === 0 ? 2 : 0;
    const repeatedRepairDismissalCount = index % 13 === 0 ? 2 : 0;
    const backlogEstimatedMinutes = actionableBacklogCount * (index % 2 === 0 ? 20 : 45);
    const eligibilityInput: RecoveryEligibilityInput = {
      localDate,
      evaluatedAtMs: Date.parse("2026-08-08T12:00:00.000Z"),
      inactiveLocalDays,
      actionableBacklogCount,
      overdueCount,
      missedScheduledDays,
      repeatedPlanOverloadCount,
      repeatedRepairDismissalCount,
      backlogEstimatedMinutes,
      capacityMaxMinutes,
      lastDismissedAtMs: null,
      userRequested: false,
      thresholds: RECOVERY_DEFAULT_THRESHOLDS,
    };
    const expectedEligible = inactiveLocalDays >= RECOVERY_DEFAULT_THRESHOLDS.inactivityDays ||
      actionableBacklogCount >= RECOVERY_DEFAULT_THRESHOLDS.actionableBacklogCount ||
      overdueCount >= RECOVERY_DEFAULT_THRESHOLDS.overdueCount ||
      missedScheduledDays >= RECOVERY_DEFAULT_THRESHOLDS.missedScheduledDays ||
      repeatedPlanOverloadCount >= RECOVERY_DEFAULT_THRESHOLDS.repeatedPlanOverloadCount ||
      repeatedRepairDismissalCount >= RECOVERY_DEFAULT_THRESHOLDS.repeatedRepairDismissalCount ||
      backlogEstimatedMinutes > capacityMaxMinutes * RECOVERY_DEFAULT_THRESHOLDS.capacityBacklogMultiplier;
    const tasks = Array.from({ length: actionableBacklogCount }, (_, taskIndex) => buildTask(taskIndex, localDate, actionableBacklogCount, overdueCount));
    fixtures.push({ id: `recovery-fixture-${String(index + 1).padStart(3, "0")}`, localDate, eligibilityInput, tasks, expectedEligible, expectedClassificationCoverage: new Set(tasks.map((task) => task.taskId)) });
  }
  return fixtures;
}

export function evaluateRecoveryFixtureEligibility(fixture: RecoveryEvaluationFixture): RecoveryEligibilityResult {
  return evaluateRecoveryEligibility(fixture.eligibilityInput);
}

export const RECOVERY_EVALUATION_FIXTURES = buildRecoveryEvaluationFixtures();
