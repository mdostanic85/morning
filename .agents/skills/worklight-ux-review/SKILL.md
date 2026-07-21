---
name: worklight-ux-review
description: Reviews Worklight UX, AI trust, evidence, confidence, actions, statuses and UI copy.
---

# Worklight UX Review

Use `ux-heuristics` and `ux-writing` as supporting skills.

Audit Worklight as an evidence-based daily work assistant, not as a generic task manager.

Do not modify code unless explicitly asked.

## Preserve

- One clear daily priority
- Calm interface
- Evidence-backed conclusions
- Clear next action
- Clear done criteria
- Progressive disclosure
- User correction controls

## Check

### Comprehension

Can the user immediately understand:

1. What matters most?
2. Why?
3. What should they do?
4. What does done mean?
5. How confident is the system?
6. What source supports the conclusion?
7. How can they correct the system?

### AI trust

Check that:

- confidence cannot be confused with priority;
- confidence appears next to its source;
- facts and AI inference are distinguishable;
- conflicting sources are visible;
- failed or partial sync is visible;
- original evidence can be opened.

### Status and actions

Check that:

- status is separate from CTA;
- local Worklight actions are separate from Jira actions;
- external writes require confirmation;
- ownership can be confirmed or rejected;
- action labels explain the outcome.

### UX copy

Replace vague copy such as:

- Needs your attention
- Review
- Resolve
- Continue

with specific actions such as:

- Needs your input
- Confirm this is yours
- Review evidence
- Choose the correct project
- Mark as not mine

## Output

For each finding provide:

- Severity
- Problem
- Evidence
- Recommended change
- Exact replacement copy
- Acceptance criteria
- Regression risk

Order findings from highest to lowest risk.
