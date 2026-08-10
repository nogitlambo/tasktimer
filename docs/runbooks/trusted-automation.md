# Trusted Automation operations runbook

Trusted Automation is deterministic and server-authoritative. Operators must not replay a dead letter by editing Firestore or by changing a client setting.

## Queue backlog

1. Check `/api/automation/health` and queue-depth/throughput metrics.
2. Confirm the configured queue limit and dependency health.
3. Pause new automation through the server policy if backlog growth risks stale work.
4. Process or expire queued work only through the worker contract; verify stale work is skipped and audited.

## Worker failure or lock leakage

1. Check lock contention, stale execution, timeout, and worker restart metrics.
2. Allow the configured lock TTL to expire before investigating a replacement worker.
3. Verify the replacement worker uses the same idempotency key and current entity version.
4. Never delete a lock or execution record to force a replay.

## Dependency outage or partial execution

1. Keep automation paused or leave affected rules disabled.
2. Confirm failures are recorded with content-free error codes and audit history.
3. Retry only transient failures within the configured retry limit.
4. After retry exhaustion, preserve the dead-letter audit reference and require manual review.

## Deployment/schema rollback

1. Disable the affected rule or kill switch at the server policy boundary.
2. Confirm unknown rule/schema versions fail closed without execution.
3. Verify additive readers still parse retained records and that incompatible records remain untouched.
4. Re-enable only after health, failure-rate, and stale-state metrics return to normal.

## Audit verification

Verify that each execution has an owner-scoped execution record, terminal audit history, and—when retries are exhausted—a blocked dead-letter reference. Task titles, notes, Brain Dump text, prompts, and model responses must never appear in these records or operational metrics.
