---
name: tdd
description: >
  Test-driven development workflow. Write failing test first, implement minimal code
  to pass, then refactor. Applies to all features, bug fixes, and behavior changes.
triggers:
  - write tests
  - test driven
  - tdd
  - add feature
  - fix bug
---

# Test-Driven Development

## The Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

Wrote code before the test? Delete it. Start over. No exceptions.

## Red-Green-Refactor Cycle

### 1. RED - Write Failing Test

- One test, one behavior
- Clear name describing what should happen
- Use real code, not mocks (unless unavoidable)

### 2. Verify RED

**MANDATORY. Never skip.**

```bash
uv run pytest path/to/test.py::test_name -x
```

Confirm:
- Test **fails** (not errors)
- Failure message matches expectation
- Fails because feature is missing, not because of typos

### 3. GREEN - Minimal Code

Write the **simplest** code to make the test pass. No extras.

### 4. Verify GREEN

**MANDATORY.**

```bash
uv run pytest path/to/test.py -x
```

- New test passes
- All other tests still pass

### 5. REFACTOR

Only after green:
- Remove duplication
- Improve names
- Extract helpers if needed

Keep all tests green. Don't add behavior.

### 6. Repeat

Next failing test for next behavior.

## Bug Fix Flow

1. Write a failing test that reproduces the bug
2. Verify it fails
3. Fix the code
4. Verify it passes
5. Never fix bugs without a test

## Anti-Patterns

| Don't | Do |
|-------|-----|
| Write code then tests | Write test first, always |
| Test mock behavior | Test real behavior |
| Multiple behaviors per test | One assertion per test |
| Skip verify steps | Always run and check output |
| Over-engineer in GREEN | Minimal code only |
