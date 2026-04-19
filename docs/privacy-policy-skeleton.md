# TaskLaunch Privacy Policy Skeleton

Internal drafting scaffold for the public `/privacy` page and any longer-form privacy policy work.

This file uses the structure of a modern privacy policy as a guide only. It is not legal advice, and it should not be copied verbatim into the public site without review.

## Drafting Rules

- Ground every statement in one of these sources:
  - current product code;
  - confirmed product behavior;
  - explicit business/legal decisions recorded elsewhere.
- If the code does not prove a fact, mark it as a placeholder instead of guessing.
- Replace all bracketed placeholders before publication.
- Keep public claims narrower than internal assumptions.

## Placeholders To Resolve

- `[LEGAL_ENTITY_NAME]`
- `[TRADE_NAME_IF_DIFFERENT]`
- `[EFFECTIVE_DATE]`
- `[PRIMARY_JURISDICTION]`
- `[MAILING_ADDRESS]`
- `[PRIVACY_CONTACT_EMAIL]`
- `[DPO_OR_PRIVACY_CONTACT_NAME_IF_ANY]`
- `[AGE_THRESHOLD_IF_NOT_13]`
- `[RETENTION_SCHEDULE_IF_FORMALLY_DEFINED]`
- `[ADDITIONAL_PROVIDER_LIST_IF_ANY]`

## 1. Overview

Purpose:
Explain what the product is, which surfaces are covered, and that the document describes current information-handling practices.

Draft notes:
- Covered surfaces likely include:
  - public website;
  - authenticated app routes;
  - feedback flows;
  - billing flows;
  - launch-updates signup;
  - push notification features.
- Avoid claiming coverage for products or services that do not exist in the codebase.

Template:

> This Privacy Policy explains how `[LEGAL_ENTITY_NAME]` handles information in connection with `[TRADE_NAME_IF_DIFFERENT or product name]`. It applies to the public website, signed-in application features, and other related product flows identified in this policy.

## 2. Information We Collect

List only data types supported by current implementation.

Current code-backed categories:
- Sign-in/account data:
  - Firebase Authentication UID;
  - email address;
  - Google sign-in profile details returned by auth flows.
- Profile/account customization:
  - display name;
  - username;
  - username reservation/lookup records;
  - avatar selection;
  - custom avatar data;
  - rank thumbnail / rank-related display fields.
- Task/productivity data:
  - tasks;
  - timers;
  - milestones;
  - notes;
  - history;
  - deleted-task data;
  - dashboard state;
  - preferences;
  - schedule/reward-related state.
- Social data:
  - friend requests;
  - friendships;
  - shared task summaries.
- Device/notification data:
  - device IDs;
  - push tokens;
  - provider markers;
  - native/web flags;
  - app-active state;
  - push preferences.
- Billing data:
  - Stripe customer ID;
  - subscription ID;
  - price ID;
  - subscription status;
  - subscription timing/retention fields.
- Feedback data:
  - title;
  - details;
  - vote records;
  - PNG screenshot attachments;
  - author email/display metadata unless anonymous;
  - Jira issue linkage when enabled.
- Launch-updates signup data:
  - email;
  - normalized email;
  - source;
  - user-agent;
  - referrer;
  - timestamps.

## 3. Sources Of Information

Template categories:
- Directly from the user.
- Automatically from device/app/browser behavior.
- From integrated service providers.

Current provider examples:
- Firebase Authentication;
- Cloud Firestore;
- Firebase Cloud Messaging;
- Stripe;
- Jira integration when enabled.

## 4. Local Storage, Session Storage, And Device State

Current code-backed examples:
- theme;
- menu style;
- task view state;
- mode settings;
- local task/runtime data;
- push preference flags;
- navigation stack;
- signed-out redirect bypass;
- pending push action/task identifiers.

Drafting note:
- Do not promise that every locally stored key is listed exhaustively unless audited and maintained.

## 5. How We Use Information

Current code-backed purposes:
- sign-in and session handling;
- account-backed feature access;
- task timing/history/dashboard/productivity features;
- preferences and UI continuity;
- social/sharing features;
- notification registration and delivery;
- billing, entitlement, and subscription portal access;
- feedback intake and issue mirroring;
- launch-updates list management;
- deletion, rate limiting, abuse prevention, and integrity operations.

## 6. Sharing And Disclosure

Code-backed sharing buckets:
- infrastructure/service providers;
- other users through friends/sharing features;
- operational/legal/integrity disclosures.

Avoid unsupported claims like:
- “we never share any data with anyone”;
- “we comply with every global privacy regime”;
- “we only process data in one country”.

## 7. Third-Party Services

Known integrations from code:
- Google / Firebase;
- Stripe;
- Atlassian Jira when enabled.

Optional template wording:

> Third-party providers operate under their own terms and privacy notices. This policy describes how the product uses those integrations, not the provider policies themselves.

## 8. Billing And Payments

Code-backed facts:
- Stripe checkout sessions are created.
- Stripe billing portal sessions are created.
- Subscription state is stored in app records.
- Full card details are not intentionally stored on TaskLaunch servers.

Do not add claims about taxes, invoicing law, refund rights, or processor certifications unless separately confirmed.

## 9. Feedback And Support

Code-backed facts:
- signed-in feedback is required;
- anonymous option exists;
- PNG attachments are accepted;
- author metadata may be stored when not anonymous;
- Jira mirroring may occur;
- rate limits and vote records exist.

## 10. Push Notifications

Code-backed facts:
- web and mobile push preference flags exist;
- device records are stored under user device subcollections;
- scheduled push documents exist;
- invalid device tokens may be cleaned up.

## 11. Retention And Deletion

Code-backed public-safe points:
- local data stays until the user clears or resets it;
- cloud data remains while needed for product operation and related workflows;
- launch-updates signup records remain while needed for that list;
- account deletion removes a defined set of cloud-backed records.

Deletion scope visible in code currently includes:
- user document tree;
- user subscription record;
- scheduled time-goal push records;
- friend requests;
- friendships;
- shared task summaries;
- authored feedback trees;
- feedback votes by user;
- feedback limits;
- username record;
- user email lookup record.

Drafting note:
- Phrase this as “current deletion flow removes…” rather than “all data is always permanently deleted everywhere immediately”.

## 12. User Choices And Controls

Code-backed controls:
- update username;
- update avatar/custom avatar;
- toggle web/mobile push;
- delete account;
- reset local app data.

Potential placeholders if policy becomes more formal:
- `[EXPORT_MECHANISM_IF_ANY]`
- `[DATA_ACCESS_REQUEST_PROCESS]`
- `[CORRECTION_REQUEST_PROCESS]`

## 13. Security

Safe, code-grounded wording should stay high-level:
- managed auth;
- authenticated backend routes;
- hosted infrastructure;
- provider access controls.

Avoid unverifiable promises such as:
- “military-grade security”;
- “fully encrypted at every layer”;
- “completely secure”.

## 14. Children

Use conservative wording unless a formal product age decision exists.

Template:

> The product is not intended to be a child-directed service. If you believe a child has provided personal information through the product, contact `[PRIVACY_CONTACT_EMAIL]`.

## 15. International / Cross-Border Handling

Code-backed basis:
- major providers operate multi-region infrastructure.

Template:

> Because integrated service providers may process data in multiple countries, information may be handled outside your local jurisdiction.

## 16. Policy Updates

Template:

> We may update this policy as product behavior, integrations, or legal/business decisions change. The latest version will be posted on this page with an updated effective date where used.

## 17. Contact

Template:

> For privacy questions or data-related requests, contact `[PRIVACY_CONTACT_EMAIL]`.

Optional additions if confirmed:
- mailing address;
- support portal;
- designated privacy contact name.

## Public Page Editing Checklist

- Preserve the current privacy page layout and simple document structure.
- Keep TOC anchors and section IDs in sync.
- Remove or narrow any statement the code does not support.
- Prefer “current implementation” wording for technical behaviors.
- Do not copy text from third-party privacy policies.
- Run lint/type checks on touched files after edits.
