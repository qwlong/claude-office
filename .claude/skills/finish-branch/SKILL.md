---
name: finish-branch
description: >
  Workflow for finishing a development branch. Verify tests, commit, push,
  create PR, and clean up.
triggers:
  - finish branch
  - create pr
  - merge branch
  - ship it
  - ready to merge
---

# Finishing a Development Branch

## Before Finishing

1. **Verify all tests pass**
   ```bash
   make checkall
   ```
   Do NOT proceed if tests fail.

2. **Commit all changes**
   ```bash
   git add <specific-files>
   git commit -m "feat: description of what and why"
   ```
   Use conventional commits: feat:, fix:, chore:, docs:, refactor:, test:

3. **Push to remote**
   ```bash
   git push origin HEAD
   ```
   Always push to 'origin' remote.

4. **Create PR**
   ```bash
   gh pr create --repo qwlong/claude-office --base main --title "feat: short title" --body "$(cat <<'EOF'
   ## Summary
   - What changed and why

   ## Test plan
   - [ ] All tests pass
   - [ ] Manually verified behavior

   EOF
   )"
   ```

## Checklist

- [ ] Tests pass (fresh run, not from memory)
- [ ] No untracked files left behind
- [ ] Commit message explains WHY
- [ ] PR description has summary and test plan
- [ ] Pushed to correct remote (origin = qwlong/claude-office)
