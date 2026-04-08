---
name: systematic-debugging
description: >
  Systematic approach to debugging. Investigate root cause before attempting fixes.
  Read errors completely, reproduce consistently, trace data flow backward.
triggers:
  - debug
  - fix error
  - investigate bug
  - test failing
  - broken
---

# Systematic Debugging

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

## Phase 1: Investigate

1. **Read the error completely** - every line, every stack frame
2. **Reproduce consistently** - write a command or test that triggers it
3. **Check recent changes** - `git log --oneline -10` and `git diff`
4. **Trace data flow backward** - from error site to data origin

## Phase 2: Analyze

- What changed recently?
- What assumptions might be wrong?
- Is this a local issue or systemic?

## Phase 3: Hypothesis

Form **one** hypothesis. Test it with the **smallest** possible change.

- Change one variable at a time
- If fix doesn't work, **revert** before trying next
- If 3+ fixes fail, stop - question the architecture

## Phase 4: Fix with Test

1. Write a failing test that reproduces the bug
2. Apply the minimal fix
3. Verify the test passes
4. Verify all other tests still pass

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Guess and shotgun fixes | Investigate first |
| Change multiple things | One variable at a time |
| Skip reading the full error | Read every line |
| Fix symptoms | Fix root cause |
| Leave without a regression test | Always add a test |
