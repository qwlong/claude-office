# Phase C: Multi-Agent Integration Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect merge conflicts between open PRs from multiple agents before merging, recommend safe merge order.

**Architecture:** IntegrationVerifier service uses git operations in ephemeral worktrees to test pairwise and full-set PR merging. Triggered on-demand via API. Results broadcast via WebSocket to frontend Integration Status card.

**Tech Stack:** Git (subprocess), FastAPI, asyncio, Zustand (frontend)

---

## File Structure

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `backend/app/services/integration_verifier.py` | Core service: pairwise checks, full-set merge, greedy optimizer |
| `backend/app/models/integration.py` | Pydantic models: `ConflictMatrix`, `PairResult`, `MergeResult`, `IntegrationStatus` |
| `backend/app/api/routes/integration.py` | REST endpoints: trigger check, get status |
| `backend/tests/test_integration_verifier.py` | Unit tests for IntegrationVerifier (mocked git) |
| `backend/tests/test_integration_api.py` | API endpoint tests |
| `frontend/src/types/integration.ts` | TypeScript types matching backend models |
| `frontend/src/components/integration/IntegrationStatusCard.tsx` | Status card with conflict matrix + merge order |
| `frontend/src/components/integration/ConflictMatrix.tsx` | Expandable pairwise conflict matrix table |
| `frontend/src/components/integration/MergeOrderList.tsx` | Recommended merge order as numbered list |

### Backend — Modified Files
| File | Change |
|------|--------|
| `backend/app/main.py` | Register integration router |
| `backend/app/core/broadcast_service.py` | Add `broadcast_integration_status()` |
| `frontend/src/stores/taskStore.ts` | Add integration status state + selectors |
| `frontend/src/hooks/useProjectWebSocket.ts` | Handle `integration_status` message type |
| `frontend/src/components/tasks/TaskDrawer.tsx` | Render `IntegrationStatusCard` above task list |

---

### Task 1: Integration Models

**Files:**
- Create: `backend/app/models/integration.py`
- Test: Validated transitively through Task 2 tests

- [ ] **Step 1: Create Pydantic models for integration verification results**

Create `backend/app/models/integration.py`:

```python
"""Models for multi-agent integration verification."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class IntegrationHealth(StrEnum):
    """Overall integration health indicator."""

    green = "green"    # All PRs merge cleanly in every order
    yellow = "yellow"  # Some pairwise conflicts, but a clean order exists
    red = "red"        # Irreducible conflicts — no clean merge order


class PairResult(BaseModel):
    """Result of merging branch A into branch B."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    branch_a: str
    branch_b: str
    conflicts: bool
    conflicting_files: list[str] = Field(default_factory=list)


class ConflictMatrix(BaseModel):
    """Pairwise conflict results for all branch combinations."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    branches: list[str]
    pairs: list[PairResult]

    def has_conflict(self, a: str, b: str) -> bool:
        """Check if merging a into b produces conflicts."""
        for p in self.pairs:
            if p.branch_a == a and p.branch_b == b:
                return p.conflicts
        return False


class MergeResult(BaseModel):
    """Result of attempting to merge all branches sequentially."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    order: list[str]
    merged: list[str]
    skipped: list[str]
    conflicting_files: dict[str, list[str]] = Field(default_factory=dict)
    success: bool


class IntegrationStatus(BaseModel):
    """Full integration verification result for a project."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    project_key: str
    health: IntegrationHealth
    conflict_matrix: ConflictMatrix
    full_merge: MergeResult
    recommended_order: list[str]
    irreducible_conflicts: list[tuple[str, str]] = Field(default_factory=list)
    checked_at: datetime
    base_branch: str = "main"
```

Key design decisions:
- `PairResult` stores both directions (A into B vs B into A) as separate entries since conflicts are NOT commutative
- `ConflictMatrix.branches` lists all branches tested so the frontend can render a grid
- `MergeResult.conflicting_files` is keyed by skipped branch name so users know which branch hit which files
- `IntegrationHealth` maps directly to the green/yellow/red badge colors
- All models use `to_camel` alias generator to match the frontend camelCase convention used by `Task` model

---

### Task 2: IntegrationVerifier Service — Pairwise Check

**Files:**
- Create: `backend/app/services/integration_verifier.py`
- Create: `backend/tests/test_integration_verifier.py`

- [ ] **Step 1: Write tests for pairwise conflict detection**

Create `backend/tests/test_integration_verifier.py`:

```python
"""Tests for IntegrationVerifier service."""

import asyncio
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path

from app.services.integration_verifier import IntegrationVerifier
from app.models.integration import ConflictMatrix, PairResult


class TestPairwiseCheck:
    """Tests for check_pairwise method."""

    @pytest.mark.asyncio
    async def test_two_clean_branches(self, temp_dir):
        """Two branches with no overlap should report no conflicts."""
        verifier = IntegrationVerifier()

        with patch.object(verifier, "_run_git") as mock_git:
            # Simulate: worktree add succeeds, merge succeeds, cleanup succeeds
            mock_git.return_value = (0, "")
            matrix = await verifier.check_pairwise(
                str(temp_dir), ["feature-a", "feature-b"], base_branch="main"
            )

        assert len(matrix.branches) == 2
        assert len(matrix.pairs) == 4  # A->B, B->A tested from both bases
        assert not any(p.conflicts for p in matrix.pairs)

    @pytest.mark.asyncio
    async def test_conflicting_branches(self, temp_dir):
        """When git merge fails, the pair should be marked as conflicting."""
        verifier = IntegrationVerifier()

        def fake_git(args, cwd):
            # merge command fails with conflict
            if "merge" in args and "--no-commit" in args:
                return (1, "CONFLICT (content): Merge conflict in shared.py")
            # diff --name-only to list conflicting files
            if "diff" in args and "--name-only" in args:
                return (0, "shared.py")
            return (0, "")

        with patch.object(verifier, "_run_git", side_effect=fake_git):
            matrix = await verifier.check_pairwise(
                str(temp_dir), ["feature-a", "feature-b"], base_branch="main"
            )

        conflicting = [p for p in matrix.pairs if p.conflicts]
        assert len(conflicting) >= 1
        assert "shared.py" in conflicting[0].conflicting_files

    @pytest.mark.asyncio
    async def test_both_orderings_tested(self, temp_dir):
        """Verify both A->B and B->A orderings are tested."""
        verifier = IntegrationVerifier()
        call_log = []

        def fake_git(args, cwd):
            if "merge" in args:
                call_log.append(tuple(args))
            return (0, "")

        with patch.object(verifier, "_run_git", side_effect=fake_git):
            await verifier.check_pairwise(
                str(temp_dir), ["feat-a", "feat-b"], base_branch="main"
            )

        # Should have merge calls for both orderings
        assert len(call_log) >= 2

    @pytest.mark.asyncio
    async def test_single_branch_returns_empty(self, temp_dir):
        """Single branch has nothing to compare — empty matrix."""
        verifier = IntegrationVerifier()
        with patch.object(verifier, "_run_git", return_value=(0, "")):
            matrix = await verifier.check_pairwise(
                str(temp_dir), ["only-one"], base_branch="main"
            )
        assert len(matrix.pairs) == 0

    @pytest.mark.asyncio
    async def test_cleanup_on_error(self, temp_dir):
        """Worktree is cleaned up even if merge check raises."""
        verifier = IntegrationVerifier()
        cleanup_calls = []

        def fake_git(args, cwd):
            if "worktree" in args and "remove" in args:
                cleanup_calls.append(args)
                return (0, "")
            if "merge" in args:
                raise RuntimeError("unexpected error")
            return (0, "")

        with patch.object(verifier, "_run_git", side_effect=fake_git):
            # Should not raise — errors are caught per-pair
            matrix = await verifier.check_pairwise(
                str(temp_dir), ["feat-a", "feat-b"], base_branch="main"
            )

        # Cleanup should have been called
        assert len(cleanup_calls) > 0
```

Run tests:
```bash
cd backend && uv run pytest tests/test_integration_verifier.py -x -v
```

- [ ] **Step 2: Implement IntegrationVerifier with pairwise check**

Create `backend/app/services/integration_verifier.py`:

```python
"""Integration verification service — detects merge conflicts between PR branches."""

from __future__ import annotations

import asyncio
import logging
import subprocess
import tempfile
import uuid
from pathlib import Path

from app.models.integration import (
    ConflictMatrix,
    IntegrationHealth,
    IntegrationStatus,
    MergeResult,
    PairResult,
)

logger = logging.getLogger(__name__)


class IntegrationVerifier:
    """Detects merge conflicts between branches using ephemeral git worktrees.

    All git operations use --no-commit to avoid modifying any real branch.
    Worktrees are created in a temp directory and cleaned up in finally blocks.
    A mutex lock prevents concurrent worktree operations on the same repo.
    """

    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}

    def _get_lock(self, project_root: str) -> asyncio.Lock:
        """Get or create a per-repo mutex lock."""
        if project_root not in self._locks:
            self._locks[project_root] = asyncio.Lock()
        return self._locks[project_root]

    def _run_git(self, args: list[str], cwd: str | Path) -> tuple[int, str]:
        """Run a git command synchronously. Returns (returncode, stdout+stderr)."""
        try:
            result = subprocess.run(
                ["git", *args],
                cwd=str(cwd),
                capture_output=True,
                text=True,
                timeout=30,
            )
            output = result.stdout.strip()
            if result.returncode != 0:
                output = f"{output}\n{result.stderr.strip()}".strip()
            return result.returncode, output
        except subprocess.TimeoutExpired:
            return 1, "git command timed out"
        except FileNotFoundError:
            return 1, "git not found"

    async def _run_git_async(
        self, args: list[str], cwd: str | Path
    ) -> tuple[int, str]:
        """Run git in a thread pool to avoid blocking the event loop."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._run_git, args, cwd)

    async def check_pairwise(
        self,
        project_root: str,
        branches: list[str],
        base_branch: str = "main",
    ) -> ConflictMatrix:
        """Test merging every pair of branches in both orderings.

        For each pair (A, B):
        1. Create ephemeral worktree from base_branch
        2. Merge A, then try merging B (test A-then-B ordering)
        3. Create another worktree, merge B, then try A (test B-then-A ordering)

        Returns a ConflictMatrix with results for all pairs.
        """
        pairs: list[PairResult] = []

        if len(branches) < 2:
            return ConflictMatrix(branches=branches, pairs=[])

        lock = self._get_lock(project_root)
        async with lock:
            for i, branch_a in enumerate(branches):
                for j, branch_b in enumerate(branches):
                    if i == j:
                        continue
                    result = await self._test_merge_pair(
                        project_root, branch_a, branch_b, base_branch
                    )
                    pairs.append(result)

        return ConflictMatrix(branches=branches, pairs=pairs)

    async def _test_merge_pair(
        self,
        project_root: str,
        branch_a: str,
        branch_b: str,
        base_branch: str,
    ) -> PairResult:
        """Test merging branch_a then branch_b onto base_branch.

        Creates ephemeral worktree, merges A, attempts B.
        If B conflicts, records the conflicting files.
        Always cleans up the worktree.
        """
        worktree_id = f"integration-check-{uuid.uuid4().hex[:8]}"
        worktree_path = Path(tempfile.gettempdir()) / worktree_id

        try:
            # Create ephemeral worktree from base branch
            rc, out = await self._run_git_async(
                ["worktree", "add", str(worktree_path), base_branch, "--detach"],
                project_root,
            )
            if rc != 0:
                logger.warning(f"Failed to create worktree: {out}")
                return PairResult(
                    branch_a=branch_a,
                    branch_b=branch_b,
                    conflicts=True,
                    conflicting_files=[],
                )

            # Merge branch_a first (assumed clean against base)
            rc, out = await self._run_git_async(
                ["merge", "--no-commit", "--no-ff", branch_a],
                worktree_path,
            )
            if rc != 0:
                # A itself conflicts with base — still record it
                await self._run_git_async(["merge", "--abort"], worktree_path)
                return PairResult(
                    branch_a=branch_a,
                    branch_b=branch_b,
                    conflicts=True,
                    conflicting_files=await self._get_conflicting_files(worktree_path),
                )

            # Commit the merge of A so we can attempt B
            await self._run_git_async(
                ["commit", "--no-verify", "-m", f"temp merge {branch_a}"],
                worktree_path,
            )

            # Now attempt to merge branch_b
            rc, out = await self._run_git_async(
                ["merge", "--no-commit", "--no-ff", branch_b],
                worktree_path,
            )
            if rc != 0:
                conflicting = await self._get_conflicting_files(worktree_path)
                await self._run_git_async(["merge", "--abort"], worktree_path)
                return PairResult(
                    branch_a=branch_a,
                    branch_b=branch_b,
                    conflicts=True,
                    conflicting_files=conflicting,
                )

            # Clean merge
            return PairResult(
                branch_a=branch_a,
                branch_b=branch_b,
                conflicts=False,
            )
        except Exception as e:
            logger.error(f"Error testing merge {branch_a}->{branch_b}: {e}")
            return PairResult(
                branch_a=branch_a,
                branch_b=branch_b,
                conflicts=True,
                conflicting_files=[],
            )
        finally:
            # Always clean up the worktree
            await self._run_git_async(
                ["worktree", "remove", "--force", str(worktree_path)],
                project_root,
            )

    async def _get_conflicting_files(self, worktree_path: Path) -> list[str]:
        """Get list of files with merge conflicts in the worktree."""
        rc, out = await self._run_git_async(
            ["diff", "--name-only", "--diff-filter=U"],
            worktree_path,
        )
        if rc == 0 and out:
            return [f.strip() for f in out.splitlines() if f.strip()]
        return []
```

Run tests:
```bash
cd backend && uv run pytest tests/test_integration_verifier.py -x -v
```

- [ ] **Step 3: Verify all pairwise tests pass**

```bash
cd backend && uv run pytest tests/test_integration_verifier.py -x -v
```

Commit:
```
feat: add IntegrationVerifier with pairwise conflict detection

Tests both A->B and B->A merge orderings in ephemeral worktrees.
```

---

### Task 3: Full-Set Merge Check

**Files:**
- Modify: `backend/app/services/integration_verifier.py`
- Modify: `backend/tests/test_integration_verifier.py`

- [ ] **Step 1: Write tests for full-set merge**

Add to `backend/tests/test_integration_verifier.py`:

```python
class TestFullMerge:
    """Tests for check_full_merge method."""

    @pytest.mark.asyncio
    async def test_all_merge_cleanly(self, temp_dir):
        """All branches merge without conflict."""
        verifier = IntegrationVerifier()
        with patch.object(verifier, "_run_git", return_value=(0, "")):
            result = await verifier.check_full_merge(
                str(temp_dir), ["feat-a", "feat-b", "feat-c"], base_branch="main"
            )
        assert result.success
        assert result.merged == ["feat-a", "feat-b", "feat-c"]
        assert result.skipped == []

    @pytest.mark.asyncio
    async def test_one_conflicts_others_continue(self, temp_dir):
        """When one branch conflicts, it's skipped and the rest continue."""
        verifier = IntegrationVerifier()
        merge_count = 0

        def fake_git(args, cwd):
            nonlocal merge_count
            if "merge" in args and "--no-commit" in args:
                merge_count += 1
                # Second merge attempt conflicts
                if merge_count == 2:
                    return (1, "CONFLICT")
            if "diff" in args and "--name-only" in args:
                return (0, "overlap.py")
            return (0, "")

        with patch.object(verifier, "_run_git", side_effect=fake_git):
            result = await verifier.check_full_merge(
                str(temp_dir), ["feat-a", "feat-b", "feat-c"], base_branch="main"
            )

        assert not result.success
        assert len(result.skipped) == 1
        assert "overlap.py" in result.conflicting_files.get(result.skipped[0], [])

    @pytest.mark.asyncio
    async def test_empty_branches(self, temp_dir):
        """No branches = trivial success."""
        verifier = IntegrationVerifier()
        with patch.object(verifier, "_run_git", return_value=(0, "")):
            result = await verifier.check_full_merge(
                str(temp_dir), [], base_branch="main"
            )
        assert result.success
        assert result.merged == []
```

- [ ] **Step 2: Implement check_full_merge**

Add to `IntegrationVerifier` class in `backend/app/services/integration_verifier.py`:

```python
    async def check_full_merge(
        self,
        project_root: str,
        branches: list[str],
        base_branch: str = "main",
    ) -> MergeResult:
        """Attempt to merge all branches sequentially into an ephemeral worktree.

        On conflict: record the branch and conflicting files, git merge --abort,
        skip the branch, and continue with the remaining branches.

        Returns which branches merged, which were skipped, and conflict details.
        """
        merged: list[str] = []
        skipped: list[str] = []
        conflicting_files: dict[str, list[str]] = {}

        if not branches:
            return MergeResult(
                order=branches,
                merged=merged,
                skipped=skipped,
                conflicting_files=conflicting_files,
                success=True,
            )

        worktree_id = f"integration-full-{uuid.uuid4().hex[:8]}"
        worktree_path = Path(tempfile.gettempdir()) / worktree_id
        lock = self._get_lock(project_root)

        async with lock:
            try:
                # Create worktree from base branch
                rc, out = await self._run_git_async(
                    ["worktree", "add", str(worktree_path), base_branch, "--detach"],
                    project_root,
                )
                if rc != 0:
                    logger.error(f"Failed to create worktree for full merge: {out}")
                    return MergeResult(
                        order=branches,
                        merged=[],
                        skipped=branches,
                        conflicting_files={},
                        success=False,
                    )

                for branch in branches:
                    rc, out = await self._run_git_async(
                        ["merge", "--no-commit", "--no-ff", branch],
                        worktree_path,
                    )
                    if rc != 0:
                        # Conflict — record and abort
                        files = await self._get_conflicting_files(worktree_path)
                        conflicting_files[branch] = files
                        await self._run_git_async(
                            ["merge", "--abort"], worktree_path
                        )
                        skipped.append(branch)
                        logger.info(
                            f"Branch {branch} conflicts during full merge, "
                            f"files: {files}"
                        )
                        continue

                    # Commit this merge so next branch starts from combined state
                    await self._run_git_async(
                        ["commit", "--no-verify", "-m", f"temp merge {branch}"],
                        worktree_path,
                    )
                    merged.append(branch)

            finally:
                await self._run_git_async(
                    ["worktree", "remove", "--force", str(worktree_path)],
                    project_root,
                )

        return MergeResult(
            order=branches,
            merged=merged,
            skipped=skipped,
            conflicting_files=conflicting_files,
            success=len(skipped) == 0,
        )
```

- [ ] **Step 3: Run tests**

```bash
cd backend && uv run pytest tests/test_integration_verifier.py::TestFullMerge -x -v
```

Commit:
```
feat: add full-set sequential merge check to IntegrationVerifier

On conflict, records files, aborts, skips, and continues remaining branches.
```

---

### Task 4: Greedy Merge Order Optimizer

**Files:**
- Modify: `backend/app/services/integration_verifier.py`
- Modify: `backend/tests/test_integration_verifier.py`

- [ ] **Step 1: Write tests for greedy merge ordering**

Add to `backend/tests/test_integration_verifier.py`:

```python
class TestGreedyOrder:
    """Tests for find_best_order method."""

    def test_no_conflicts_preserves_order(self):
        """When nothing conflicts, original order is returned."""
        verifier = IntegrationVerifier()
        matrix = ConflictMatrix(
            branches=["a", "b", "c"],
            pairs=[
                PairResult(branch_a="a", branch_b="b", conflicts=False),
                PairResult(branch_a="b", branch_b="a", conflicts=False),
                PairResult(branch_a="a", branch_b="c", conflicts=False),
                PairResult(branch_a="c", branch_b="a", conflicts=False),
                PairResult(branch_a="b", branch_b="c", conflicts=False),
                PairResult(branch_a="c", branch_b="b", conflicts=False),
            ],
        )
        order, irreducible = verifier.find_best_order(matrix, ["a", "b", "c"])
        assert len(order) == 3
        assert irreducible == []

    def test_conflicting_pair_reported(self):
        """Branches that conflict in both orderings are irreducible."""
        verifier = IntegrationVerifier()
        matrix = ConflictMatrix(
            branches=["a", "b"],
            pairs=[
                PairResult(branch_a="a", branch_b="b", conflicts=True,
                           conflicting_files=["shared.py"]),
                PairResult(branch_a="b", branch_b="a", conflicts=True,
                           conflicting_files=["shared.py"]),
            ],
        )
        order, irreducible = verifier.find_best_order(matrix, ["a", "b"])
        assert ("a", "b") in irreducible or ("b", "a") in irreducible

    def test_asymmetric_conflict_picks_safe_order(self):
        """If A->B conflicts but B->A is clean, B should come before A."""
        verifier = IntegrationVerifier()
        matrix = ConflictMatrix(
            branches=["a", "b"],
            pairs=[
                PairResult(branch_a="a", branch_b="b", conflicts=True,
                           conflicting_files=["f.py"]),
                PairResult(branch_a="b", branch_b="a", conflicts=False),
            ],
        )
        order, irreducible = verifier.find_best_order(matrix, ["a", "b"])
        # b should come first since merging b then a works
        assert order.index("b") < order.index("a")
        assert irreducible == []

    def test_greedy_picks_fewest_conflicts_first(self):
        """Branch with fewest outgoing conflicts should be placed first."""
        verifier = IntegrationVerifier()
        # c conflicts with everything, a and b are clean with each other
        matrix = ConflictMatrix(
            branches=["a", "b", "c"],
            pairs=[
                PairResult(branch_a="a", branch_b="b", conflicts=False),
                PairResult(branch_a="b", branch_b="a", conflicts=False),
                PairResult(branch_a="a", branch_b="c", conflicts=True,
                           conflicting_files=["x.py"]),
                PairResult(branch_a="c", branch_b="a", conflicts=True,
                           conflicting_files=["x.py"]),
                PairResult(branch_a="b", branch_b="c", conflicts=True,
                           conflicting_files=["y.py"]),
                PairResult(branch_a="c", branch_b="b", conflicts=True,
                           conflicting_files=["y.py"]),
            ],
        )
        order, irreducible = verifier.find_best_order(matrix, ["a", "b", "c"])
        # a and b should come before c since they are clean with each other
        assert order.index("a") < order.index("c")
        assert order.index("b") < order.index("c")
```

- [ ] **Step 2: Implement find_best_order**

Add to `IntegrationVerifier` class:

```python
    def find_best_order(
        self,
        matrix: ConflictMatrix,
        branches: list[str],
    ) -> tuple[list[str], list[tuple[str, str]]]:
        """Find a merge order that minimizes conflicts using a greedy algorithm.

        Algorithm:
        1. Build a "conflict score" for each branch = number of branches it
           conflicts with when merged AFTER them.
        2. Greedily pick the branch with the lowest conflict score.
        3. Remove it from the pool and recalculate scores.
        4. Track irreducible conflicts: pairs that conflict in BOTH orderings.

        Returns:
            (recommended_order, irreducible_conflicts)
            where irreducible_conflicts is a list of (branch_a, branch_b) tuples
            that conflict regardless of ordering.
        """
        if len(branches) <= 1:
            return list(branches), []

        # Identify irreducible conflicts (conflict in both directions)
        irreducible: list[tuple[str, str]] = []
        seen_pairs: set[tuple[str, str]] = set()
        for a in branches:
            for b in branches:
                if a >= b:
                    continue
                a_then_b = matrix.has_conflict(a, b)
                b_then_a = matrix.has_conflict(b, a)
                if a_then_b and b_then_a:
                    irreducible.append((a, b))
                    seen_pairs.add((a, b))

        # Greedy ordering: pick branch with fewest "as-second" conflicts
        remaining = set(branches)
        order: list[str] = []

        while remaining:
            best = None
            best_score = float("inf")

            for candidate in remaining:
                # Score = how many remaining branches conflict when candidate
                # is merged AFTER them (i.e., has_conflict(other, candidate))
                score = sum(
                    1
                    for other in remaining
                    if other != candidate
                    and matrix.has_conflict(other, candidate)
                )
                if score < best_score:
                    best_score = score
                    best = candidate

            if best is None:
                break
            order.append(best)
            remaining.remove(best)

        return order, irreducible
```

- [ ] **Step 3: Run all tests**

```bash
cd backend && uv run pytest tests/test_integration_verifier.py -x -v
```

Commit:
```
feat: add greedy merge order optimizer to IntegrationVerifier

Picks branches with fewest conflicts first and reports irreducible conflicts.
```

---

### Task 5: Orchestration Method + API Endpoints

**Files:**
- Modify: `backend/app/services/integration_verifier.py` — add `run_check()` orchestrator
- Create: `backend/app/api/routes/integration.py`
- Modify: `backend/app/main.py` — register router
- Create: `backend/tests/test_integration_api.py`

- [ ] **Step 1: Add run_check orchestrator to IntegrationVerifier**

Add to `IntegrationVerifier`:

```python
    async def run_check(
        self,
        project_root: str,
        branches: list[str],
        project_key: str,
        base_branch: str = "main",
    ) -> IntegrationStatus:
        """Run full integration check: pairwise + full-set merge + ordering.

        This is the main entry point. It:
        1. Runs pairwise conflict detection
        2. Finds the recommended merge order
        3. Runs full-set merge in the recommended order
        4. Determines overall health (green/yellow/red)
        """
        from datetime import UTC, datetime

        # Step 1: Pairwise
        matrix = await self.check_pairwise(project_root, branches, base_branch)

        # Step 2: Find best order
        recommended, irreducible = self.find_best_order(matrix, branches)

        # Step 3: Full merge in recommended order
        full_merge = await self.check_full_merge(
            project_root, recommended, base_branch
        )

        # Step 4: Determine health
        if not matrix.pairs or not any(p.conflicts for p in matrix.pairs):
            health = IntegrationHealth.green
        elif irreducible:
            health = IntegrationHealth.red
        else:
            health = IntegrationHealth.yellow

        return IntegrationStatus(
            project_key=project_key,
            health=health,
            conflict_matrix=matrix,
            full_merge=full_merge,
            recommended_order=recommended,
            irreducible_conflicts=irreducible,
            checked_at=datetime.now(UTC),
            base_branch=base_branch,
        )
```

Add module-level singleton and getter:

```python
_verifier: IntegrationVerifier | None = None


def get_integration_verifier() -> IntegrationVerifier:
    global _verifier
    if _verifier is None:
        _verifier = IntegrationVerifier()
    return _verifier
```

- [ ] **Step 2: Write API endpoint tests**

Create `backend/tests/test_integration_api.py`:

```python
"""Tests for /api/v1/integration endpoints."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime, UTC

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.integration import (
    ConflictMatrix,
    IntegrationHealth,
    IntegrationStatus,
    MergeResult,
    PairResult,
)


def _make_status(**overrides) -> IntegrationStatus:
    defaults = {
        "project_key": "my-project",
        "health": IntegrationHealth.green,
        "conflict_matrix": ConflictMatrix(branches=["a", "b"], pairs=[]),
        "full_merge": MergeResult(
            order=["a", "b"], merged=["a", "b"], skipped=[],
            conflicting_files={}, success=True,
        ),
        "recommended_order": ["a", "b"],
        "irreducible_conflicts": [],
        "checked_at": datetime.now(UTC),
        "base_branch": "main",
    }
    defaults.update(overrides)
    return IntegrationStatus(**defaults)


@pytest.mark.asyncio
class TestIntegrationAPI:
    async def test_trigger_check(self):
        """POST /integration/check triggers verification and returns result."""
        mock_verifier = MagicMock()
        mock_verifier.run_check = AsyncMock(return_value=_make_status())

        with patch(
            "app.api.routes.integration.get_integration_verifier",
            return_value=mock_verifier,
        ), patch(
            "app.api.routes.integration._get_branches_for_project",
            return_value=["feat-a", "feat-b"],
        ), patch(
            "app.api.routes.integration._get_project_root",
            return_value="/tmp/repo",
        ), patch(
            "app.api.routes.integration.broadcast_integration_status",
            new_callable=AsyncMock,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/integration/check",
                    json={"project_key": "my-project"},
                )
                assert resp.status_code == 200
                data = resp.json()
                assert data["health"] == "green"
                assert data["projectKey"] == "my-project"

    async def test_get_status_not_found(self):
        """GET /integration/status/{key} returns 404 when no check has run."""
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.get("/api/v1/integration/status/nonexistent")
            assert resp.status_code == 404

    async def test_get_status_found(self):
        """GET /integration/status/{key} returns cached result."""
        with patch(
            "app.api.routes.integration._results",
            {"my-project": _make_status()},
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.get("/api/v1/integration/status/my-project")
                assert resp.status_code == 200
                data = resp.json()
                assert data["health"] == "green"
```

- [ ] **Step 3: Implement API endpoints**

Create `backend/app/api/routes/integration.py`:

```python
"""API routes for multi-agent integration verification."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.broadcast_service import broadcast_integration_status
from app.models.integration import IntegrationStatus
from app.services.integration_verifier import get_integration_verifier
from app.services.task_service import get_task_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/integration", tags=["integration"])

# In-memory cache of latest results, keyed by project_key
_results: dict[str, IntegrationStatus] = {}


class CheckRequest(BaseModel):
    project_key: str
    base_branch: str = "main"


def _get_project_root(project_key: str) -> str | None:
    """Resolve the git repo root for a project from active tasks."""
    svc = get_task_service()
    tasks = svc.get_tasks(project_key=project_key)
    for task in tasks:
        if task.worktree_path:
            # Worktree paths look like /repo/.worktrees/branch
            # The project root is the parent of .worktrees
            from pathlib import Path

            wt = Path(task.worktree_path)
            # Walk up to find the actual repo root
            for parent in wt.parents:
                if (parent / ".git").exists():
                    return str(parent)
    return None


def _get_branches_for_project(project_key: str) -> list[str]:
    """Get branch names for all open PR tasks in a project."""
    svc = get_task_service()
    tasks = svc.get_tasks(project_key=project_key)
    branches: list[str] = []
    for task in tasks:
        if task.status in ("pr_open", "review_pending", "approved") and task.worktree_path:
            # Extract branch name from worktree path (last component)
            from pathlib import Path

            branch = Path(task.worktree_path).name
            if branch:
                branches.append(branch)
    return branches


@router.post("/check")
async def trigger_check(req: CheckRequest) -> dict:
    """Trigger an integration check for a project.

    Discovers branches from open PR tasks, runs pairwise + full-set merge
    checks, caches result, broadcasts via WebSocket, and returns the result.
    """
    project_root = _get_project_root(req.project_key)
    if not project_root:
        raise HTTPException(
            status_code=404,
            detail=f"No repository found for project '{req.project_key}'",
        )

    branches = _get_branches_for_project(req.project_key)
    if len(branches) < 2:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least 2 open PR branches to check "
            f"(found {len(branches)})",
        )

    verifier = get_integration_verifier()
    status = await verifier.run_check(
        project_root=project_root,
        branches=branches,
        project_key=req.project_key,
        base_branch=req.base_branch,
    )

    _results[req.project_key] = status

    # Broadcast to all /ws/projects subscribers
    await broadcast_integration_status(status)

    return status.model_dump(by_alias=True, mode="json")


@router.get("/status/{project_key}")
async def get_status(project_key: str) -> dict:
    """Get the latest integration check result for a project."""
    status = _results.get(project_key)
    if not status:
        raise HTTPException(
            status_code=404,
            detail=f"No integration check results for '{project_key}'",
        )
    return status.model_dump(by_alias=True, mode="json")
```

- [ ] **Step 4: Register router in main.py**

In `backend/app/main.py`, add the import and router registration:

```python
# Add import at top with other route imports:
from app.api.routes import agents, events, integration, preferences, projects, sessions, tasks

# Add router registration after the tasks router:
app.include_router(integration.router, prefix=f"{settings.API_V1_STR}")
```

- [ ] **Step 5: Run tests**

```bash
cd backend && uv run pytest tests/test_integration_api.py -x -v
cd backend && uv run pytest tests/test_integration_verifier.py -x -v
```

Commit:
```
feat: add integration verification API endpoints

POST /api/v1/integration/check triggers pairwise + full-set merge verification.
GET /api/v1/integration/status/{project_key} returns cached results.
```

---

### Task 6: WebSocket Integration

**Files:**
- Modify: `backend/app/core/broadcast_service.py`
- No new test file needed — covered by API tests that mock broadcast

- [ ] **Step 1: Add broadcast_integration_status to broadcast_service.py**

Add to `backend/app/core/broadcast_service.py`:

```python
async def broadcast_integration_status(status: "IntegrationStatus") -> None:
    """Push integration_status to all /ws/projects subscribers."""
    if not manager.project_connections:
        return
    from app.models.integration import IntegrationStatus

    await manager.broadcast_to_project_subscribers(
        {
            "type": "integration_status",
            "data": status.model_dump(by_alias=True, mode="json"),
        },
    )
```

Also add `"broadcast_integration_status"` to the `__all__` list in the same file.

- [ ] **Step 2: Verify broadcast format with a test**

Add to `backend/tests/test_integration_api.py`:

```python
    async def test_broadcast_called_on_check(self):
        """Verify broadcast_integration_status is called after check completes."""
        mock_verifier = MagicMock()
        mock_verifier.run_check = AsyncMock(return_value=_make_status())
        mock_broadcast = AsyncMock()

        with patch(
            "app.api.routes.integration.get_integration_verifier",
            return_value=mock_verifier,
        ), patch(
            "app.api.routes.integration._get_branches_for_project",
            return_value=["feat-a", "feat-b"],
        ), patch(
            "app.api.routes.integration._get_project_root",
            return_value="/tmp/repo",
        ), patch(
            "app.api.routes.integration.broadcast_integration_status",
            mock_broadcast,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                await client.post(
                    "/api/v1/integration/check",
                    json={"project_key": "my-project"},
                )

        mock_broadcast.assert_called_once()
        call_arg = mock_broadcast.call_args[0][0]
        assert call_arg.project_key == "my-project"
        assert call_arg.health.value == "green"
```

- [ ] **Step 3: Run tests**

```bash
cd backend && uv run pytest tests/test_integration_api.py -x -v
```

Commit:
```
feat: broadcast integration_status via WebSocket after each check

Uses existing project_connections channel for /ws/projects subscribers.
```

---

### Task 7: Frontend — Types + Store Integration

**Files:**
- Create: `frontend/src/types/integration.ts`
- Modify: `frontend/src/stores/taskStore.ts`
- Modify: `frontend/src/hooks/useProjectWebSocket.ts`

- [ ] **Step 1: Create TypeScript types**

Create `frontend/src/types/integration.ts`:

```typescript
/**
 * Types for multi-agent integration verification.
 * Matches backend models in app/models/integration.py.
 */

export type IntegrationHealth = "green" | "yellow" | "red";

export interface PairResult {
  branchA: string;
  branchB: string;
  conflicts: boolean;
  conflictingFiles: string[];
}

export interface ConflictMatrix {
  branches: string[];
  pairs: PairResult[];
}

export interface MergeResult {
  order: string[];
  merged: string[];
  skipped: string[];
  conflictingFiles: Record<string, string[]>;
  success: boolean;
}

export interface IntegrationStatus {
  projectKey: string;
  health: IntegrationHealth;
  conflictMatrix: ConflictMatrix;
  fullMerge: MergeResult;
  recommendedOrder: string[];
  irreducibleConflicts: [string, string][];
  checkedAt: string;
  baseBranch: string;
}
```

- [ ] **Step 2: Add integration status to taskStore**

Modify `frontend/src/stores/taskStore.ts` to add integration state:

```typescript
import type { IntegrationStatus } from "../types/integration";

interface TaskStoreState {
  // ... existing fields ...

  // Integration status per project
  integrationStatuses: Record<string, IntegrationStatus>;

  // Actions
  // ... existing actions ...
  updateIntegrationStatus: (status: IntegrationStatus) => void;
}

// Inside create():
  integrationStatuses: {},

  updateIntegrationStatus: (status) =>
    set((s) => ({
      integrationStatuses: {
        ...s.integrationStatuses,
        [status.projectKey]: status,
      },
    })),
```

Add selectors at the bottom of the file:

```typescript
export const selectIntegrationStatus =
  (projectKey: string) => (s: TaskStoreState) =>
    s.integrationStatuses[projectKey] ?? null;

export const selectIntegrationStatuses = (s: TaskStoreState) =>
  s.integrationStatuses;
```

**Important:** These selectors return either a primitive, `null`, or an existing object reference from the store, so they will NOT create new objects on every render. This avoids the Zustand re-render trap described in project memory (`feedback_zustand_selectors.md`). If a consumer needs to select multiple integration statuses as a derived collection, it must use `useShallow`.

- [ ] **Step 3: Handle integration_status in WebSocket hook**

Modify `frontend/src/hooks/useProjectWebSocket.ts`:

```typescript
import { useTaskStore } from "@/stores/taskStore";
import type { IntegrationStatus } from "@/types/integration";

// Inside the useEffect connect() function, add to ws.onmessage handler:
      } else if (msg.type === "integration_status" && msg.data) {
        useTaskStore.getState().updateIntegrationStatus(
          msg.data as IntegrationStatus
        );
      }
```

Note: We use `useTaskStore.getState()` here since `updateIntegrationStatus` is a stable action reference — this avoids adding it to the effect dependency array.

- [ ] **Step 4: Run frontend type check**

```bash
cd frontend && npx tsc --noEmit
```

Commit:
```
feat: add integration status types, store slice, and WebSocket handling

Frontend receives and stores integration_status messages per project.
```

---

### Task 8: Frontend — IntegrationStatusCard Component

**Files:**
- Create: `frontend/src/components/integration/IntegrationStatusCard.tsx`
- Create: `frontend/src/components/integration/ConflictMatrix.tsx`
- Create: `frontend/src/components/integration/MergeOrderList.tsx`
- Modify: `frontend/src/components/tasks/TaskDrawer.tsx`

- [ ] **Step 1: Create MergeOrderList component**

Create `frontend/src/components/integration/MergeOrderList.tsx`:

```tsx
import type { IntegrationStatus } from "@/types/integration";

interface Props {
  status: IntegrationStatus;
}

export function MergeOrderList({ status }: Props) {
  return (
    <div className="mt-2">
      <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
        Recommended Merge Order
      </h4>
      <ol className="list-decimal list-inside text-sm text-slate-600 dark:text-slate-300 space-y-0.5">
        {status.recommendedOrder.map((branch, i) => {
          const wasSkipped = status.fullMerge.skipped.includes(branch);
          return (
            <li
              key={branch}
              className={wasSkipped ? "text-red-400 line-through" : ""}
            >
              <span className="font-mono text-xs">{branch}</span>
              {wasSkipped && (
                <span className="ml-1 text-xs text-red-400">(conflicts)</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
```

- [ ] **Step 2: Create ConflictMatrix component**

Create `frontend/src/components/integration/ConflictMatrix.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { ConflictMatrix as ConflictMatrixType } from "@/types/integration";

interface Props {
  matrix: ConflictMatrixType;
}

export function ConflictMatrix({ matrix }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { branches, pairs } = matrix;

  if (branches.length === 0) return null;

  const hasConflict = (a: string, b: string): boolean =>
    pairs.some((p) => p.branchA === a && p.branchB === b && p.conflicts);

  const getConflictFiles = (a: string, b: string): string[] => {
    const pair = pairs.find(
      (p) => p.branchA === a && p.branchB === b && p.conflicts
    );
    return pair?.conflictingFiles ?? [];
  };

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
      >
        <span>{expanded ? "\u25BC" : "\u25B6"}</span>
        Conflict Matrix ({pairs.filter((p) => p.conflicts).length} conflicts)
      </button>

      {expanded && (
        <div className="mt-1 overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="p-1 text-left text-slate-500 dark:text-slate-400">
                  A \\ B
                </th>
                {branches.map((b) => (
                  <th
                    key={b}
                    className="p-1 font-mono text-slate-500 dark:text-slate-400"
                  >
                    {b.slice(0, 12)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branches.map((a) => (
                <tr key={a}>
                  <td className="p-1 font-mono text-slate-600 dark:text-slate-300">
                    {a.slice(0, 12)}
                  </td>
                  {branches.map((b) => {
                    if (a === b) {
                      return (
                        <td
                          key={b}
                          className="p-1 text-center text-slate-300 dark:text-slate-600"
                        >
                          -
                        </td>
                      );
                    }
                    const conflict = hasConflict(a, b);
                    const files = getConflictFiles(a, b);
                    return (
                      <td
                        key={b}
                        className={`p-1 text-center ${
                          conflict
                            ? "text-red-500 dark:text-red-400"
                            : "text-green-500 dark:text-green-400"
                        }`}
                        title={
                          conflict
                            ? `Conflicts: ${files.join(", ")}`
                            : "Clean merge"
                        }
                      >
                        {conflict ? "\u2717" : "\u2713"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
            Cell (A, B) = merge A first, then B. Hover for conflicting files.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create IntegrationStatusCard**

Create `frontend/src/components/integration/IntegrationStatusCard.tsx`:

```tsx
"use client";

import { useTaskStore, selectIntegrationStatuses } from "@/stores/taskStore";
import { useShallow } from "zustand/react/shallow";
import { ConflictMatrix } from "./ConflictMatrix";
import { MergeOrderList } from "./MergeOrderList";
import type { IntegrationHealth } from "@/types/integration";

const HEALTH_STYLES: Record<IntegrationHealth, { bg: string; text: string; label: string }> = {
  green: {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-700 dark:text-green-400",
    label: "All Clear",
  },
  yellow: {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-700 dark:text-yellow-400",
    label: "Order Matters",
  },
  red: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-400",
    label: "Conflicts",
  },
};

export function IntegrationStatusCard() {
  const statuses = useTaskStore(useShallow(selectIntegrationStatuses));

  const entries = Object.values(statuses);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map((status) => {
        const style = HEALTH_STYLES[status.health];
        const checkedAt = new Date(status.checkedAt);
        const timeAgo = getRelativeTime(checkedAt);

        return (
          <div
            key={status.projectKey}
            className={`rounded-lg border p-3 ${style.bg} border-slate-200 dark:border-slate-700`}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
                >
                  {status.health === "green"
                    ? "\u2705"
                    : status.health === "yellow"
                      ? "\u26A0\uFE0F"
                      : "\u274C"}{" "}
                  {style.label}
                </span>
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {status.projectKey}
                </span>
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {timeAgo}
              </span>
            </div>

            {/* Summary */}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {status.fullMerge.merged.length} of{" "}
              {status.recommendedOrder.length} branches merge cleanly
              {status.irreducibleConflicts.length > 0 &&
                ` \u2014 ${status.irreducibleConflicts.length} irreducible conflict(s)`}
            </p>

            {/* Merge order */}
            <MergeOrderList status={status} />

            {/* Conflict matrix (expandable) */}
            <ConflictMatrix matrix={status.conflictMatrix} />
          </div>
        );
      })}
    </div>
  );
}

function getRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}
```

- [ ] **Step 4: Add IntegrationStatusCard to TaskDrawer**

In `frontend/src/components/tasks/TaskDrawer.tsx`, add the card above the task list:

```tsx
import { IntegrationStatusCard } from "../integration/IntegrationStatusCard";

// Inside the drawer content area, above the TaskList:
<IntegrationStatusCard />
```

The exact insertion point depends on the current TaskDrawer layout. Place it between the drawer header and the `<TaskList />` component.

- [ ] **Step 5: Run type check and visual verification**

```bash
cd frontend && npx tsc --noEmit
```

Then start the dev server with `make dev-tmux` and verify:
1. The IntegrationStatusCard renders when integration status data exists
2. Green/yellow/red badges display correctly
3. Conflict matrix expands and shows the grid
4. Merge order shows numbered list with strikethrough for skipped branches

Commit:
```
feat: add IntegrationStatusCard with conflict matrix and merge order

Renders per-project integration health in the task drawer with expandable details.
```

---

## Full Test Suite Verification

After all tasks are complete, run the full backend and frontend checks:

```bash
# Backend
cd backend && uv run pytest tests/ -x -v

# Frontend
cd frontend && npx tsc --noEmit

# Full project
make checkall
```

---

## Dependency Graph

```
Task 1 (Models)
  |
  +-- Task 2 (Pairwise Check) -- depends on models
  |     |
  |     +-- Task 3 (Full-Set Merge) -- depends on pairwise
  |           |
  |           +-- Task 4 (Greedy Order) -- depends on ConflictMatrix
  |                 |
  |                 +-- Task 5 (API + run_check) -- depends on all backend services
  |                       |
  |                       +-- Task 6 (WebSocket broadcast) -- depends on API
  |
  +-- Task 7 (Frontend types + store) -- can start after Task 1
        |
        +-- Task 8 (Frontend components) -- depends on Task 7 + Task 6
```

**Parallelizable:** Tasks 2-4 (backend core) and Task 7 (frontend types/store) can proceed in parallel since they share no files. Task 8 depends on both tracks.

---

## Out of Scope (V1)

These are explicitly NOT part of this plan:
- **Test execution in worktrees** — V1 detects git conflicts only
- **GitHub webhooks** — V1 uses manual API trigger only
- **Automatic re-check on PR update** — future enhancement
- **Conflict resolution suggestions** — future enhancement
- **Branch protection rule integration** — future enhancement
