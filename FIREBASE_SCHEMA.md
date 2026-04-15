# TaskTimer Firebase Schema

Last verified: 2026-03-14

## Scope

This document captures the current Firebase data schema used by TaskTimer:

- Firestore database paths, document ID conventions, and field contracts
- Firebase Storage path usage (if any)

Primary sources:

- `firestore.rules`
- `src/app/tasktimer/lib/cloudStore.ts`
- `src/app/tasktimer/lib/friendsStore.ts`
- `src/app/tasktimer/components/SettingsPanel.tsx`

## Firestore

Configured database ID (`firebase.json`): `timebase`

This repository always uses the named Firestore database `timebase`.
It does not use the default Firestore database.

### Top-level collections

1. `users`
2. `userSubscriptions`
3. `retainedSubscriptions`
4. `usernames`
5. `friend_requests`
6. `friendships`
7. `userEmailLookup`
8. `shared_task_summaries`
9. `scheduled_time_goal_pushes`

---

### `users/{userId}`

Doc ID:

- `userId = Firebase Auth UID`

Allowed fields (`isUserDoc`):

- `email: string`
- `displayName: string | null`
- `username: string | null`
- `usernameKey: string | null`
- `avatarId: string`
- `avatarCustomSrc: string | null`
- `googlePhotoUrl: string | null`
- `rankThumbnailSrc: string | null`
- `rewardCurrentRankId: string | null`
- `rewardTotalXp: int`
- `plan: "free" | "pro"`
- `planUpdatedAt: timestamp`
- `createdAt: timestamp`
- `updatedAt: timestamp`
- `schemaVersion: int`

Access:

- Read/write/delete only by owner (`request.auth.uid == userId`)

Subcollections:

1. `preferences/{docId}`
2. `dashboard/{docId}`
3. `taskUi/{docId}`
4. `accountState/{docId}`
5. `tasks/{taskId}`
6. `deletedTasks/{taskId}`

Notes:

- `displayName` remains the presentation/profile name.
- `username` is the claimed handle stored separately from `displayName`.
- `usernameKey` is the normalized lowercase lookup key for the claimed username.
- `plan` is mirrored from billing state so the app can read entitlements from `users/{userId}` without reading Stripe metadata directly.

---

### `userSubscriptions/{userId}`

Doc ID:

- `userId = Firebase Auth UID`

Stored by:

- Server/admin billing flows only (`src/app/api/stripe/webhook/route.ts`, `src/lib/subscriptionStore.ts`)

Allowed fields in the current server write path:

- `schemaVersion: 1`
- `stripeCustomerId: string`
- `stripeSubscriptionId: string`
- `stripePriceId: string`
- `stripeSubscriptionStatus: string`
- `currentPeriodEndAt: timestamp`
- `stripeSyncedAt: timestamp`
- `createdAt: timestamp`
- `updatedAt: timestamp`

Access:

- Firestore rules currently deny all client reads/writes for this collection
- Server/admin writes use the Firebase Admin SDK and are not restricted by Firestore client rules

Notes:

- This is the canonical Firestore storage location for Stripe subscription metadata.
- The app currently mirrors only `plan` and `planUpdatedAt` into `users/{userId}` for client-side entitlement reads.

---

### `retainedSubscriptions/{normalizedEmail}`

Doc ID:

- `normalizedEmail = lowercase(trim(email))`

Stored by:

- Server/admin account-deletion and billing flows only (`src/app/api/account/retain-subscription-before-delete/route.ts`, `src/app/api/stripe/webhook/route.ts`, `functions/index.js`)

Allowed fields in the current server write path:

- `schemaVersion: 1`
- `email: string`
- `stripeCustomerId: string`
- `stripeSubscriptionId: string`
- `stripePriceId: string`
- `stripeSubscriptionStatus: string`
- `currentPeriodEndAt: timestamp`
- `plan: "pro"`
- `sourceUid: string`
- `retainedAt: timestamp`
- `updatedAt: timestamp`
- `stripeSyncedAt: timestamp`

Access:

- No Firestore client rule currently grants client access to this collection
- Server/admin writes use the Firebase Admin SDK and are not restricted by Firestore client rules

Notes:

- This collection intentionally survives account deletion when a paid subscription is still active.
- It stores the minimum billing linkage needed to restore `pro` entitlement for a returning user signing in again with the same email before the current paid period ends.
- It is not user workspace data and should not be deleted as part of normal user Firestore cleanup.

---

### `usernames/{usernameKey}`

Doc ID:

- `usernameKey = lowercase(trim(username))`

Allowed fields:

- `uid: string`
- `username: string`
- `usernameKey: string`

Access:

- Read by authenticated users
- Create/update/delete by the owning authenticated user when client-written
- Server/admin claim flow may also manage this collection transactionally

Write flow:

- Claim creates or updates `usernames/{usernameKey}` for the owner uid
- Rename deletes the old username reservation doc and creates/updates the new one in the same transaction
- `username` and `usernameKey` are currently stored as the same normalized lowercase value

Runtime usage:

- Used as the reservation/uniqueness index for claimed usernames
- Queried by username availability and username claim endpoints

---

### `users/{userId}/preferences/v1`

Doc ID:

- `docId = "v1"` (fixed)

Allowed fields (`isPreferencesV1`):

- `schemaVersion: int`
- `theme: "purple" | "cyan"`
- `menuButtonStyle: "parallelogram" | "square"`
- `defaultTaskTimerFormat: "day" | "hour" | "minute"`
- `taskView: "list" | "tile"`
- `autoFocusOnTaskLaunchEnabled: bool`
- `dynamicColorsEnabled: bool`
- `checkpointAlertSoundEnabled: bool`
- `checkpointAlertToastEnabled: bool`
- `modeSettings: map | null`
- `rewards: map`
- `updatedAtMs: int`
- `updatedAt: timestamp`

Notes:

- Client runtime also keeps a local fallback key for this setting: ``${STORAGE_KEY}:autoFocusOnTaskLaunchEnabled``.

---

### `users/{userId}/dashboard/v1`

Doc ID:

- `docId = "v1"` (fixed)

Allowed fields (`isDashboardV1`):

- `schemaVersion: int`
- `order: list`
- `widgets: map`
- `updatedAt: timestamp`

---

### `users/{userId}/taskUi/v1`

Doc ID:

- `docId = "v1"` (fixed)

Allowed fields (`isTaskUiV1`):

- `schemaVersion: int`
- `historyRangeDaysByTaskId: map`
- `historyRangeModeByTaskId: map`
- `pinnedHistoryTaskIds: list`
- `customTaskNames: list`
- `updatedAt: timestamp`

Runtime shape (`TaskUiConfig`):

- `historyRangeDaysByTaskId: Record<taskId, 7 | 14>`
- `historyRangeModeByTaskId: Record<taskId, "entries" | "day">`
- `pinnedHistoryTaskIds: string[]`
- `customTaskNames?: string[]` (write path currently caps to 5)

---

### `users/{userId}/accountState/v1`

Doc ID:

- `docId = "v1"` (fixed)

Allowed fields (`isAccountStateV1`):

- `schemaVersion: int`
- `friendInviteKey: string | null`
- `friendInviteKeyExpiresAt: int | null`
- `deleteReauthPending: bool`
- `updatedAt: timestamp`

---

### `users/{userId}/tasks/{taskId}`

Doc ID:

- `taskId` is app task ID (`Task.id`)

Allowed fields (`isTaskDoc`):

- `id: string`
- `name: string`
- `order: int`
- `collapsed: bool`
- `color: string | null`
- `accumulatedMs: int`
- `running: bool`
- `startMs: int | null`
- `hasStarted: bool`
- `checkpointsEnabled: bool`
- `checkpointTimeUnit: "day" | "hour" | "minute"`
- `checkpoints: list`
- `milestonesEnabled: bool`
- `milestoneTimeUnit: "day" | "hour" | "minute"`
- `milestones: list`
- `checkpointSoundEnabled: bool`
- `checkpointSoundMode: "once" | "repeat"`
- `checkpointToastEnabled: bool`
- `checkpointToastMode: "auto5s" | "auto3s" | "manual"`
- `finalCheckpointAction: "continue" | "resetLog" | "resetNoLog"`
- `xpDisqualifiedUntilReset: bool`
- `presetIntervalsEnabled: bool`
- `presetIntervalValue: int | float`
- `presetIntervalLastCheckpointId: string | null`
- `presetIntervalLastMilestoneId: string | null`
- `presetIntervalNextSeq: int`
- `plannedStartTime: string | null`
- `plannedStartOpenEnded: bool`
- `mode: "mode1" | "mode2" | "mode3"`
- `createdAt: timestamp`
- `updatedAt: timestamp`
- `schemaVersion: int`

Runtime mapping notes (`cloudStore.ts`):

- App `Task` and Firestore now both persist `checkpoints*` and `milestones*` fields.

Subcollection:

- `history/{entryId}`

---

### `users/{userId}/tasks/{taskId}/history/{entryId}`

Doc ID patterns:

- Append path: `${ts}-${randomInt}`
- Replace path: `${ts}-${ms}-${fnv1a32(ts|ms|name|note|xpDisqualifiedUntilReset|completionDifficulty)}`

Allowed fields (`isHistoryDoc`):

- `ts: int`
- `name: string`
- `ms: int`
- `color: string | null`
- `note: string | null`
- `xpDisqualifiedUntilReset: bool`
- `completionDifficulty: 1 | 2 | 3 | 4 | 5`
- `createdAt: timestamp`

---

### `users/{userId}/deletedTasks/{taskId}`

Doc ID:

- `taskId` of removed task

Allowed fields (`isDeletedTaskDoc`):

- `name: string`
- `color: string | null`
- `deletedAt: int`
- `updatedAt: timestamp`

---

### `friend_requests/{requestId}`

Doc ID convention:

- `pending:{senderUid}:{receiverUid}`

Allowed fields (`isFriendRequestDocShape`):

- `requestId: string`
- `senderUid: string`
- `receiverUid: string`
- `senderEmail: string | null`
- `receiverEmail: string | null`
- `senderAlias: string | null`
- `senderAvatarId: string | null`
- `senderRankThumbnailSrc: string | null`
- `senderCurrentRankId: string | null`
- `receiverAlias: string | null`
- `receiverAvatarId: string | null`
- `receiverRankThumbnailSrc: string | null`
- `receiverCurrentRankId: string | null`
- `status: "pending" | "approved" | "declined"`
- `createdAt: timestamp-like (rules check non-null)`
- `updatedAt: timestamp-like (rules check non-null)`
- `respondedAt: timestamp-like | null`
- `respondedBy: string | null`

Write flow:

- Create by sender only (`status = "pending"`)
- Receiver can update pending request to `approved`/`declined`
- Sender can retry declined/approved request back to `pending`
- Sender can also cancel a pending request
- Delete allowed only for sender while request is still pending

Query patterns in app:

- `where("receiverUid", "==", uid)`
- `where("senderUid", "==", uid)`

---

### `friendships/{pairId}`

Doc ID convention:

- `pair:{sortedUidA}:{sortedUidB}` (sorted lexicographically)

Allowed fields (`isFriendshipDocCreate`):

- `pairId: string`
- `users: [uidA, uidB]` (2-element list, distinct strings)
- `profileByUid: map` (contains both users as keys, each value map with `alias`, `avatarId`, `avatarCustomSrc`, `googlePhotoUrl`, `rankThumbnailSrc`, `currentRankId`)
- `createdAt: timestamp`
- `createdBy: string`

Write flow:

- Create by either member
- Self-profile updates allowed for a member's own `profileByUid.{uid}` branch
- Delete allowed for either friendship member

Query pattern in app:

- `where("users", "array-contains", uid)`

---

### `userEmailLookup/{emailKey}`

Doc ID convention:

- `emailKey = encodeURIComponent(lowercase(trim(email)))`

Allowed fields (rules at `match /userEmailLookup/{emailKey}`):

- `uid: string` (must equal `request.auth.uid` on create/update)
- `email: string`
- `displayName?: string | null`
- No additional fields are allowed by rules
- `createdAt?: timestamp-like`
- `updatedAt?: timestamp-like`

Access:

- Read by authenticated users
- Delete allowed only if `resource.data.uid == request.auth.uid`

Runtime usage:

- Used to resolve receiver UID from email during friend request flow

---

### `shared_task_summaries/{shareDocId}`

Doc ID convention:

- `share:{ownerUid}:{friendUid}:{taskId}`

Allowed fields:

- `shareDocId: string`
- `ownerUid: string`
- `friendUid: string`
- `taskId: string`
- `taskName: string`
- `taskMode: "mode1" | "mode2" | "mode3"`
- `timerState: "running" | "stopped"`
- `focusTrend7dMs: [int, int, int, int, int, int, int]`
- `checkpointScaleMs: int | null`
- `taskCreatedAtMs: int | null`
- `avgTimeLoggedThisWeekMs: int`
- `totalTimeLoggedMs: int`
- `sharedAt: timestamp`
- `updatedAt: timestamp`
- `schemaVersion: int`

Access:

- Read by `ownerUid` or `friendUid`
- Create/update by `ownerUid` only
- Delete by `ownerUid` or `friendUid`

Runtime usage:

- Drives Friends page task summary cards under each friend row.

---

### `scheduled_time_goal_pushes/{scheduleDocId}`

Doc ID convention:

- `${ownerUid}__${taskId}`

Allowed fields (`isScheduledTimeGoalPushDoc`):

- `ownerUid: string`
- `taskId: string`
- `taskName: string`
- `notificationKind: string`
- `eventType: string`
- `baseEventType: string`
- `effectiveEventType: string`
- `dueAtMs: int`
- `timeGoalMinutes: int | null`
- `plannedStartDay: string | null`
- `plannedStartTime: string | null`
- `plannedStartPushRemindersEnabled: bool`
- `route: string`
- `snoozedUntilMs: int | null`
- `sentAtMs: int | null`
- `sentDueAtMs: int | null`
- `lastActionAtMs: int | null`
- `lastActionByDeviceId: string | null`
- `lastGapAlertDayKey: string | null`
- `lastGapAlertStartMs: int | null`
- `lastGapAlertEndMs: int | null`
- `activeGapDayKey: string | null`
- `activeGapStartMs: int | null`
- `activeGapEndMs: int | null`
- `postponedGapDayKey: string | null`
- `postponedGapStartMs: int | null`
- `postponedGapEndMs: int | null`
- `createdAt: timestamp`
- `updatedAt: timestamp`
- `schemaVersion: int`

Access:

- Read/create/update/delete only by `ownerUid` under client rules

Runtime usage:

- Stores pending scheduled push/reminder state for planned start and time-goal notifications.

---

### Firestore security summary

- All `users/{userId}` tree data is owner-scoped.
- Social collections (`friend_requests`, `friendships`, `userEmailLookup`, `shared_task_summaries`) are auth-gated with path/data constraints.
- Several operations intentionally allow read on non-existent docs for transaction pre-reads (`friend_requests`, `friendships`).
- Account deletion now uses an explicit server/admin cleanup route (`src/app/api/account/delete-user-data/route.ts`) against the named `timebase` database rather than relying on Firebase’s Delete User Data extension.

## Firebase Storage

Current status:

- No Firebase Storage SDK usage found in `src` (`firebase/storage`, `getStorage`, `uploadBytes`, `getDownloadURL`, `deleteObject` not present).
- No `storage.rules` file is present in this repo.
- No app-defined Storage object path conventions are currently implemented.

Existing configuration reference:

- `src/lib/firebaseClient.ts` includes `storageBucket` from `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, but this app currently does not read/write Storage objects.

Documented storage paths:

- None (not in active use).
