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
- `src/app/tasktimer/lib/userPreferencesSync.ts`
- `src/app/tasktimer/components/SettingsPanel.tsx`

## Firestore

Configured database ID (`firebase.json`): `timebase`

### Top-level collections

1. `users`
2. `friend_requests`
3. `friendships`
4. `userEmailLookup`
5. `shared_task_summaries`

---

### `users/{userId}`

Doc ID:

- `userId = Firebase Auth UID`

Allowed fields (`isUserDoc`):

- `email: string`
- `displayName: string | null`
- `avatarId: string`
- `avatarCustomSrc: string | null`
- `googlePhotoUrl: string | null`
- `rankThumbnailSrc: string | null`
- `rewardCurrentRankId: string | null`
- `rewardTotalXp: int`
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
- Replace path: `${ts}-${ms}-${fnv1a32(ts|ms|name)}`

Allowed fields (`isHistoryDoc`):

- `ts: int`
- `name: string`
- `ms: int`
- `color: string | null`
- `note: string | null`
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

### Firestore security summary

- All `users/{userId}` tree data is owner-scoped.
- Social collections (`friend_requests`, `friendships`, `userEmailLookup`, `shared_task_summaries`) are auth-gated with path/data constraints.
- Several operations intentionally allow read on non-existent docs for transaction pre-reads (`friend_requests`, `friendships`).

## Firebase Storage

Current status:

- No Firebase Storage SDK usage found in `src` (`firebase/storage`, `getStorage`, `uploadBytes`, `getDownloadURL`, `deleteObject` not present).
- No `storage.rules` file is present in this repo.
- No app-defined Storage object path conventions are currently implemented.

Existing configuration reference:

- `src/lib/firebaseClient.ts` includes `storageBucket` from `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, but this app currently does not read/write Storage objects.

Documented storage paths:

- None (not in active use).
