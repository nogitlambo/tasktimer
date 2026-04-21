# TaskLaunch Privacy Policy Skeleton

Internal drafting scaffold for the public `/privacy` page.

This file should track the current live page format in `src/app/privacy/page.tsx` so future edits preserve the existing structure, numbering, and public-safe wording style.

This is not legal advice.

## Current Page Format

The live privacy page currently follows this top-level structure:

1. Hero tag: `TASKLAUNCH`
2. Page title: `Privacy Policy`
3. Hero subline: `UPDATED: [MONTH DAY, YEAR]`
4. Table of contents section:
   - section label number is `00`
   - TOC entries use the same visual pattern as section headings
   - TOC entries include two-digit numbers and exact section titles
5. Numbered policy sections:
   - `01` through `20`
   - each section uses the same heading format:
     - two-digit number
     - divider line
     - uppercase section label styling

## Drafting Rules

- Ground every statement in one of these sources:
  - current product code;
  - confirmed product behavior;
  - explicit business/legal decisions recorded elsewhere.
- If the code does not prove a fact, mark it as a placeholder instead of guessing.
- Replace all bracketed placeholders before publication.
- Keep public claims narrower than internal assumptions.
- Match the live page tone:
  - direct;
  - implementation-grounded;
  - conservative;
  - no marketing language.
- Prefer wording like `current implementation`, `current code paths`, and `currently includes` where appropriate.

## Formatting Rules For The Public Page

- Preserve the hero structure:
  - `TASKLAUNCH`
  - `Privacy Policy`
  - `UPDATED: [DATE]`
- Preserve the numbered TOC format.
- Preserve the exact section numbering pattern with zero-padded display in the TOC and section labels.
- Keep TOC labels identical to the actual section titles.
- Keep section anchors and TOC links in sync.
- Keep the current `PolicySection` / `Clause` style structure in mind when editing page content.
- Use plain paragraphs for simple sections and clause lists for multi-part sections.

## Placeholders To Resolve

- `[UPDATED_DATE]`
- `[LEGAL_ENTITY_NAME_IF_NEEDED]`
- `[PRIMARY_JURISDICTION_IF_FORMALLY_DEFINED]`
- `[MAILING_ADDRESS_IF_PUBLISHED]`
- `[RETENTION_SCHEDULE_IF_FORMALLY_DEFINED]`
- `[ADDITIONAL_PROVIDER_LIST_IF_ANY]`

## Current Live Section Order

The live page currently uses this exact numbering and title set:

- `00` Table of contents
- `01` Introduction
- `02` What information we collect
- `03` How we collect information
- `04` Local storage and session storage
- `05` Cloud storage and app infrastructure
- `06` How we use information
- `07` Third-party services and processors
- `08` Sharing and disclosure
- `09` Push notifications
- `10` Billing and subscriptions
- `11` Feedback and issue tracking
- `12` Launch-updates subscription list
- `13` Overseas and cross-border handling
- `14` Security safeguards
- `15` Retention and deletion
- `16` Your choices, access, and correction
- `17` Account deletion and local reset guidance
- `18` Children
- `19` Policy updates
- `20` Contact

## Current TOC Anchor Map

The live page currently maps TOC entries to these section anchors:

- `#introduction`
- `#what-information-we-collect`
- `#how-we-collect-information`
- `#local-storage-and-session-storage`
- `#cloud-storage-and-app-infrastructure`
- `#how-we-use-information`
- `#third-party-services-and-processors`
- `#sharing-and-disclosure`
- `#push-notifications`
- `#billing-and-subscriptions`
- `#feedback-and-issue-tracking`
- `#launch-updates-subscription-list`
- `#overseas-and-cross-border-handling`
- `#security-safeguards`
- `#retention-and-deletion`
- `#your-choices-access-and-correction`
- `#account-deletion-and-local-reset-guidance`
- `#children`
- `#policy-updates`
- `#contact`

Legacy inner anchors still exist in some sections and should not be broken casually:

- `#collection`
- `#use`
- `#billing`
- `#feedback`
- `#launch-updates`
- `#retention`
- `#rights`

## Section-By-Section Drafting Skeleton

### 01. Introduction

Purpose:
Explain which product surfaces are covered and that the policy describes current information-handling behavior.

Current live pattern:
- paragraph describing covered surfaces and current-code basis;
- paragraph describing the current feature set at a high level.

### 02. What information we collect

Purpose:
List the actual categories of information supported by the current implementation.

Current live pattern:
- clause list `(a)` through `(h)`.

Current code-backed categories:
- sign-in and account details;
- profile and account customisation data;
- task and productivity data;
- social data;
- device and notification data;
- billing data;
- feedback data;
- launch-updates signup data.

### 03. How we collect information

Purpose:
Explain direct collection, automatic collection, and provider-derived collection.

Current live pattern:
- clause list `(a)` through `(c)`.

### 04. Local storage and session storage

Purpose:
Explain browser/device-local storage and session storage behavior.

Current live pattern:
- two paragraphs.

Drafting guidance:
- state that the current implementation primarily uses browser or device-local storage mechanisms such as local storage, session storage where applicable, and IndexedDB-backed persistence;
- explain that these mechanisms support signed-in state, app preferences, runtime state, and navigation continuity;
- do not claim that the product uses `no cookies` unless that has been separately verified across all enabled providers and deployment environments;
- if cookies are mentioned, describe them conservatively as possible provider-side or browser-side technologies associated with authentication, security, or abuse-prevention services rather than as the app's primary storage layer.

Current code-backed examples:
- task/runtime state;
- history-related state;
- navigation state;
- theme and menu style preferences;
- notification preferences;
- pending push action state;
- mode settings;
- signed-out redirect bypass state.
- Firebase Auth persistence uses IndexedDB and browser-local persistence in the current web implementation.

### 05. Cloud storage and app infrastructure

Purpose:
Describe Firebase-backed account and app storage behavior.

Current live pattern:
- one paragraph;
- clause list `(a)` through `(c)`.

Current code-backed systems:
- Firebase Authentication;
- Cloud Firestore;
- account lookup and username reservation records.
- Firebase App Check with reCAPTCHA Enterprise is initialized on web in the current implementation.

### 06. How we use information

Purpose:
Describe the operational uses of collected information.

Current live pattern:
- clause list `(a)` through `(g)`.

Current code-backed purposes:
- sign-in and account access;
- app functionality;
- device registration and push delivery;
- billing and subscription management;
- feedback workflows;
- launch-updates list operations;
- deletion, abuse controls, and integrity checks.

### 07. Third-party services and processors

Purpose:
List the major external providers used by the current product.

Current live pattern:
- clause list `(a)` through `(d)`;
- short follow-up paragraph.

Drafting guidance:
- include a conservative statement that third-party services used for authentication, security, billing, or issue tracking may use cookies or similar technologies under their own implementations;
- avoid stating that all third-party cookie use is known exhaustively unless separately verified for the live deployment;
- avoid promising a cookie-consent banner unless the business has decided to implement one or non-essential cookies are intentionally introduced.

Known integrations from code:
- Google / Firebase;
- Stripe;
- Atlassian Jira when enabled;
- push delivery infrastructure.

### 08. Sharing and disclosure

Purpose:
Describe the bounded ways information may be shared or disclosed.

Current live pattern:
- clause list `(a)` through `(c)`.

Code-backed sharing buckets:
- service providers;
- other users through social/sharing features;
- legal, integrity, misuse, or deletion workflows.

### 09. Push notifications

Purpose:
Describe per-device records and push preference handling.

Current live pattern:
- two paragraphs.

### 10. Billing and subscriptions

Purpose:
Describe Stripe-backed billing flows and stored subscription state.

Current live pattern:
- two paragraphs.

Code-backed facts:
- Stripe checkout sessions are created;
- Stripe billing portal sessions are created;
- subscription-related identifiers and status fields are stored;
- full card details are not intentionally stored on TaskLaunch servers.

### 11. Feedback and issue tracking

Purpose:
Describe feedback submission content, author data, votes, and Jira mirroring.

Current live pattern:
- two paragraphs.

### 12. Launch-updates subscription list

Purpose:
Describe the email signup list implementation.

Current live pattern:
- two paragraphs.

Current code-backed data:
- submitted email;
- normalized email;
- source;
- user-agent;
- referrer;
- created/updated timestamps.

### 13. Overseas and cross-border handling

Purpose:
Describe cross-border handling conservatively based on provider infrastructure.

Current live pattern:
- one paragraph.

### 14. Security safeguards

Purpose:
Describe security at a high level without unverifiable promises.

Current live pattern:
- two paragraphs.

Safe wording themes:
- managed authentication;
- hosted infrastructure;
- service-level access controls;
- authenticated API routes;
- account deletion flows.

Avoid claims like:
- `military-grade security`
- `fully secure`
- `fully encrypted at every layer`

### 15. Retention and deletion

Purpose:
Describe local retention, cloud retention, signup-list retention, and current deletion flow scope.

Current live pattern:
- clause list `(a)` through `(d)`.

Current deletion scope visible in code includes:
- user document tree;
- subscription records;
- scheduled push records;
- friend requests;
- friendships;
- shared task summaries;
- authored feedback;
- feedback votes;
- feedback limits;
- usernames;
- user email lookup records.

Draft conservatively:
- prefer `current account-deletion code removes...`
- avoid `all data is instantly and permanently deleted everywhere`

### 16. Your choices, access, and correction

Purpose:
Describe user controls currently available in the product.

Current live pattern:
- clause list `(a)` through `(e)`.

Current code-backed controls:
- update username and avatar-related settings;
- control web/mobile push preferences;
- delete account;
- reset local app data;
- contact support for help.

### 17. Account deletion and local reset guidance

Purpose:
Explain the distinction between cloud deletion and local reset.

Current live pattern:
- two paragraphs.

### 18. Children

Purpose:
Use conservative non-child-directed wording unless a formal age-position changes.

Current live pattern:
- one paragraph.

### 19. Policy updates

Purpose:
Explain that the page may change as product behavior changes.

Current live pattern:
- one paragraph.

### 20. Contact

Purpose:
Provide the live privacy contact point.

Current live pattern:
- one paragraph.

Current public contact:
- `support@tasklaunch.app`

## Hero Copy Skeleton

When updating the live page hero, use this structure:

- Tag:
  - `TASKLAUNCH`
- Title:
  - `Privacy Policy`
- Subline:
  - `UPDATED: [MONTH DAY, YEAR]`

Do not reintroduce the older descriptive overview paragraph unless the live design changes back to that format.

## Public Page Editing Checklist

- Preserve the current hero format:
  - `TASKLAUNCH`
  - `Privacy Policy`
  - `UPDATED: [DATE]`
- Preserve the `00` TOC section.
- Keep TOC labels identical to section titles.
- Keep TOC numbering and section numbering synchronized.
- Keep section IDs and TOC hrefs synchronized.
- Preserve any legacy inner anchors unless there is a deliberate cleanup.
- Remove or narrow any statement the code does not support.
- Prefer `current implementation` wording for technical behavior.
- Do not publish a blanket `we do not use cookies` statement based on the current repo alone.
- If the public page discusses cookies, distinguish first-party app storage from possible third-party authentication/security provider technologies.
- Do not copy text from third-party privacy policies.
- Re-check `src/app/privacy/page.tsx` before making legal/content edits so this skeleton does not drift again.
