# Trusted Automation API contract

Authenticated endpoints use the version-ready envelope:

```json
{
  "success": true,
  "requestId": "request-id",
  "timestamp": "2026-08-09T00:00:00.000Z",
  "data": {}
}
```

Errors use `success: false` with a stable `{ code, message }` object. Controllers validate transport data and delegate execution to the server-side Trusted Automation handler; feature adapters remain responsible for their own domain mutations.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/automation/settings` | Read the authenticated user's policy |
| PUT | `/api/automation/settings` | Update validated consent, pause, and rule policy |
| POST | `/api/automation/execute` | Submit a rule/entity/version/idempotency request |
| POST | `/api/automation/retry` | Retry a failed transient execution |
| GET | `/api/automation/history` | Read bounded, filtered, cursor-paged audit history |
| GET | `/api/automation/trust` | Read advisory trust progression/reduction recommendations |
| GET | `/api/automation/health` | Read content-free policy, queue, and dependency health |

All endpoints authenticate from the server request, ignore client-owned identity and trust claims, and keep task content outside response and history contracts.

Rollout flags are server-only. Invalid or missing rollout configuration fails closed, and the kill switch stops new work without rewriting completed execution or audit history.
