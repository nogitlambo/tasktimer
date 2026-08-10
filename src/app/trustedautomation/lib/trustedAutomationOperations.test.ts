import { describe, expect, it } from "vitest";

import {
  buildTrustedAutomationAlerts,
  buildTrustedAutomationHealth,
  createTrustedAutomationMetricsRecorder,
  loadTrustedAutomationOperationalConfig,
} from "./trustedAutomationOperations";

describe("Trusted Automation operations", () => {
  it("loads bounded external configuration without accepting unsafe values", () => {
    const config = loadTrustedAutomationOperationalConfig({
      TRUSTED_AUTOMATION_MAX_RETRIES: "99",
      TRUSTED_AUTOMATION_LOCK_TTL_MS: "100",
      TRUSTED_AUTOMATION_QUEUE_MAX_ITEMS: "250",
    });

    expect(config.maxRetries).toBe(10);
    expect(config.lockTtlMs).toBe(1_000);
    expect(config.queueMaxItems).toBe(250);
  });

  it("records only bounded structured metrics and rolls up health safely", () => {
    const metrics = createTrustedAutomationMetricsRecorder();
    metrics.record({ name: "execution_outcome", value: 1, state: "SUCCEEDED", ruleId: "REFRESH_DAILY_BRIEF" });

    expect(metrics.snapshot()).toHaveLength(1);
    expect(buildTrustedAutomationHealth({ firestore: "ok", queue: "degraded", dependencies: "ok" })).toMatchObject({ status: "degraded" });
    expect(buildTrustedAutomationHealth({ firestore: "failed", queue: "ok", dependencies: "ok" })).toMatchObject({ status: "failed" });
    expect(buildTrustedAutomationAlerts([
      { name: "execution_error", value: 2, code: "DEPENDENCY_UNAVAILABLE" },
      { name: "lock_contention", value: 1 },
    ], { executionErrors: 2, lockContention: 1 })).toEqual([
      { code: "HIGH_FAILURE_RATE", value: 2, threshold: 2 },
      { code: "LOCK_LEAKAGE", value: 1, threshold: 1 },
    ]);
  });
});
