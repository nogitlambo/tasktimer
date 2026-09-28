# Feedback email delivery

New feedback is saved in the `timebase` Firestore database and atomically queued in
`feedback_email_outbox`. Existing feedback is not backfilled. Voting remains local
to Firestore; no Jira requests are made.

The scheduled `sendFeedbackEmails` function checks up to five due jobs every minute.
It uses Hostinger SMTP and the existing `SMTP_PASS` Secret Manager secret, explicitly
bound to the function. Defaults: `smtp.hostinger.com`, port 465, TLS enabled, user
`support@tasklaunch.app`. The sender and recipient are fixed to that support address.
Only non-anonymous feedback has a Reply-To address. Anonymous emails still contain
the internal Firebase user ID.

Screenshots are server-uploaded to `feedback-email/<feedbackId>/<attempt>/<index>.png`
in the existing Storage bucket. The existing default-deny Storage and Firestore
rules deny client access to this prefix, the outbox, and maintenance state. The
owner-only delivery API exposes only a reference and pending/sent/failed status.
Do not add these collections to public feedback allowlists.

## Retries and recovery

Jobs have a five-minute lease. Retry delays are 1 minute, 5 minutes, 15 minutes,
1 hour, then 6 hours, capped at seven days after submission (or operator requeue).
Only SMTP acceptance of the support recipient counts as sent; this cannot prove
inbox placement. SMTP can deliver a duplicate if a connection/process dies after
acceptance but before Firestore records success. A stable Message-ID and feedback
reference identify those duplicates.

Screenshots are deleted after sending. `cleanupFeedbackEmailAttachments` sweeps
200 objects hourly with a persisted pagination cursor. It removes unreferenced
uploads older than 24 hours, sent-job files left by interrupted cleanup, and files
30 days after delivery failed. Feedback records are retained.

Use Google Cloud Logs event names `feedback_email_delivery_failed`,
`feedback_email_delivery_exhausted`, `feedback_email_worker_failed`, and
`feedback_email_cleanup_failed` to investigate failures. Logs omit message bodies,
addresses, screenshots, and SMTP error responses. Outbox metadata remains server-only.
After fixing SMTP configuration, requeue an individual failed record:

```powershell
node --env-file=.env.local scripts/requeue-feedback-email.mjs <feedbackId>
node --env-file=.env.local scripts/requeue-feedback-email.mjs <feedbackId> --write
```

The command uses configured Firebase Admin credentials or Application Default
Credentials and refuses to resend sent/pending jobs or jobs with expired/missing
screenshots. It preserves the record and message reference and starts a fresh
seven-day delivery window. It does not email historical feedback without a job.

## Deployment

Deploy only the two new functions first:

```powershell
firebase deploy --only functions:sendFeedbackEmails,functions:cleanupFeedbackEmailAttachments --project tasktimer-prod
```

Their runtime service account needs Firestore access, Storage object read/write,
and secret access to `SMTP_PASS` (the cleanup function does not need that secret).
App Hosting's runtime service account needs Storage object read/write for screenshot
uploads and cleanup, as well as its existing Firestore access. Existing default-deny
client rules need no widening. Do not deploy unrelated local rules changes.

After worker readiness, deploy the hosted API and web client, then release the
native client through its normal release process. Older native clients remain
accepted without a submission UUID; legacy Jira response fields remain nullable.
New clients send a UUID and reuse it on retries of unchanged form contents.

Validate one identified and one anonymous submission with screenshots, owner-only
status, recipient acceptance, and file cleanup. Confirm support inbox receipt
separately. Avoid resubmitting real user feedback as a smoke test.

For rollback, restore the preceding App Hosting rollout and pause the email
scheduler if needed. Keep queued records and screenshots for recovery. Do not
delete existing Jira issues or remote Jira secrets.
