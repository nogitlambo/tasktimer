# Trusted Automation rollout checklist

## Before internal rollout

- Confirm the security, privacy, accessibility, and account-lifecycle tests are green.
- Confirm Firestore indexes, retention/TTL configuration, dashboards, alert thresholds, and the operations runbook are deployed.
- Set the global flag off, then enable only named internal UIDs and explicitly enabled rules.
- Verify existing Daily Executive Brief, Adaptive Capacity, Next Best Action, Schedule Repair, Recovery Mode, Brain Dump, and Task Clarification contracts remain the mutation owners.
- Validate rollback gates with legacy readers and existing Executive Function behaviour.

## Staged rollout

- Move rules from INTERNAL to BETA, LIMITED, and GENERAL one cohort at a time.
- Review success, failure, latency, retries, stale outcomes, rollout-disabled events, and user opt-out metrics between stages.
- Keep the kill switch available and verify it skips only new work; completed executions and audit history must remain unchanged.

## Rollback criteria

Rollback or disable the affected rule when any configured alert fires for the agreed observation window, including high failure rate, retry storm, lock leakage, queue backlog, authorization spike, or schema incompatibility.

After disabling:

1. Confirm new executions return a rollout-disabled outcome.
2. Confirm no queued work is replayed implicitly.
3. Confirm existing execution and audit records remain readable and content-safe.
4. Confirm legacy readers and existing Executive Function endpoints remain healthy.
5. Record the incident, alert evidence, and re-enable approval before restoring the cohort.
