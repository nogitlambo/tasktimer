
# Trusted Automation Architecture
## Chapter 4 — Trust Progression, Permissions, Consent & Explainability

**Document:** TaskLaunch Trusted Automation Architecture Specification  
**Chapter:** 4 of 6

---

# 1. Purpose

This chapter defines how TaskLaunch earns, manages, and maintains user trust before any automation executes.

Automation is not simply a technical capability. It is a user relationship.

The architecture must ensure that users always understand:

- what TaskLaunch may automate
- why it is allowed
- what happened
- how to disable it
- how to reverse it

---

# 2. Trust Philosophy

Automation authority is never assumed.

It progresses through four stages:

```text
Observe
    ↓
Recommend
    ↓
Assist
    ↓
Trusted Automation
```

Every promotion requires explicit user consent.

---

# 3. Trust Levels

## OFF

Recommendations only.

## ASSISTED

Automation prepares an action and waits for confirmation.

## TRUSTED

Approved low-risk rules execute automatically.

## FUTURE (Reserved)

Autonomous orchestration across multiple features.
Not part of MVP.

---

# 4. Automation Permission Matrix

| Capability | OFF | ASSISTED | TRUSTED |
|------------|:---:|:--------:|:-------:|
| Refresh Daily Brief | Manual | Confirm | Auto |
| Refresh Next Best Action | Manual | Confirm | Auto |
| Refresh Capacity | Manual | Confirm | Auto |
| Refresh Schedule Repair | Manual | Confirm | Auto |
| Apply Schedule Repair | No | Confirm | No |
| Apply Recovery | No | Confirm | No |
| Move Tasks | No | No | No |

High-impact actions always require confirmation in the MVP.

---

# 5. Consent Requirements

Every automation must have:

- clear description
- expected behaviour
- scope
- reversibility
- enable/disable control

Consent is granular.

Users never enable "all automation" without understanding individual categories.

---

# 6. Automation Settings UX

Recommended layout:

```text
Trusted Automation

Planning

☑ Refresh Daily Brief
☑ Refresh Next Best Action
☑ Refresh Capacity

Recovery

☐ Recovery assistance

Scheduling

☐ Automatic proposal refresh

Safety

Pause all automation
View automation history
```

---

# 7. Explainability

Every automated action should answer:

- What happened?
- Why did it happen?
- Which rule triggered?
- What changed?
- Can it be undone?

Example:

```text
Daily Brief refreshed automatically because it became stale after you completed a task.
```

---

# 8. User Notifications

Low-risk refreshes:

Silent.

Medium-risk actions:

Non-intrusive in-app notification.

High-impact actions:

Explicit confirmation required.

---

# 9. Undo Policy

Undo is available whenever the underlying feature supports safe reversal.

Undo availability should be shown before execution where practical.

Automation must never claim an action is reversible if it is not.

---

# 10. Automation History

History should display:

- action
- timestamp
- rule
- outcome
- explanation
- undo status

History is read-only.

---

# 11. Pause Behaviour

Pause All Automation immediately:

- stops queued work
- prevents new executions
- preserves settings
- does not delete history

Queued work should be cancelled safely.

---

# 12. Trust Escalation

TaskLaunch may recommend upgrading a rule from ASSISTED to TRUSTED after repeated successful confirmations.

Requirements:

- user has accepted the same action multiple times
- no recent undo
- no recent failures

Promotion is always optional.

---

# 13. Trust Reduction

Automatically suggest reducing trust when:

- repeated undo
- repeated rejection
- repeated failures

The system should recommend, never force.

---

# 14. Accessibility

Automation controls must support:

- keyboard navigation
- screen readers
- visible focus
- plain-language explanations
- no colour-only state indicators

---

# 15. Privacy

Automation settings are private.

Trust decisions must never be shared, ranked, or exposed outside the user's account.

---

# 16. Analytics

Track:

```text
automation_enabled
automation_disabled
automation_paused
automation_resumed
automation_consent_granted
automation_consent_withdrawn
automation_history_viewed
automation_undo_used
```

Never include task content.

---

# 17. Failure UX

Failures should explain:

- what failed
- what did not change
- whether retry is possible

Avoid technical jargon.

---

# 18. Codex Implementation Guidance

Implementation order:

1. Permission model
2. Settings persistence
3. Consent dialogs
4. Explainability templates
5. Automation history UI
6. Pause/resume
7. Trust promotion recommendations
8. Accessibility
9. Tests

---

# 19. Testing

Unit:

- permission evaluation
- trust transitions
- consent persistence

Integration:

- settings propagation
- history rendering
- pause behaviour

E2E:

- enable automation
- disable automation
- pause all
- explainability display
- undo availability

---

# 20. Definition of Done

- Trust levels implemented
- Permission matrix enforced
- Consent flows complete
- Automation history available
- Explainability present
- Pause behaviour implemented
- Accessibility requirements satisfied
- Privacy preserved
- Analytics implemented
- Tests passing
