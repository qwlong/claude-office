---
name: code-review
description: >
  How to request and receive code reviews. Dispatch review after each major task.
  When receiving feedback, verify before implementing, push back if wrong.
triggers:
  - review
  - code review
  - PR feedback
  - review comments
---

# Code Review

## Requesting Review

After completing a task or before merging:

1. Know what you changed: `git diff main...HEAD --stat`
2. Summarize what was implemented and why
3. Run all tests before requesting review

## Receiving Review Feedback

### Process

1. **READ** - Read all feedback completely
2. **UNDERSTAND** - Restate each item in your own words
3. **VERIFY** - Check against codebase before acting
4. **EVALUATE** - Does this improve the code? Or is it YAGNI?
5. **RESPOND** - Technical reasoning, not performative agreement
6. **IMPLEMENT** - One item at a time, test after each

### Priority

| Level | Action |
|-------|--------|
| Critical (bugs, security) | Fix immediately |
| Important (design, correctness) | Fix before proceeding |
| Minor (style, naming) | Fix if quick, note for later |

### Push Back When

- Suggestion violates YAGNI (adds unused complexity)
- Change would break existing functionality
- Reviewer misunderstands the context

Push back with **technical reasoning**, not just disagreement.

### Never Do

- Performative agreement ("Great point!", "You're absolutely right!")
- Implement without verifying it won't break things
- Ignore feedback without responding
