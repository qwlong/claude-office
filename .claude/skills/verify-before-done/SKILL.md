---
name: verify-before-done
description: >
  Always run fresh verification before claiming work is complete.
  No "should pass" or "probably works" — run it and show evidence.
triggers:
  - done
  - complete
  - finished
  - ready to commit
  - ready to push
---

# Verify Before Completion

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

## Before Claiming Done

1. **Run tests fresh** - not from cache, not from memory
   ```bash
   make checkall
   # or
   uv run pytest tests/ -x -q
   ```

2. **Read full output** - check exit codes, warnings, errors

3. **Verify your claim matches evidence**
   - "All tests pass" requires seeing `X passed` with zero failures
   - "No regressions" requires running the full suite, not just new tests
   - "Build succeeds" requires seeing successful build output

4. **Only then** say "done"

## Forbidden Phrases (without evidence)

- "should pass"
- "probably works"
- "I believe this is correct"
- "this looks good"
- "done" (without test output)

## Before Commit/Push

- [ ] All tests pass (fresh run)
- [ ] No lint errors
- [ ] No type errors
- [ ] Output is clean (no unexpected warnings)
