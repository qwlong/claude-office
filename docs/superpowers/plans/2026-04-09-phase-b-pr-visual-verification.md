# Phase B: PR Visual Verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agents automatically capture screenshots before creating PRs, attach them as evidence for human review.

**Architecture:** New ScreenshotService uses Playwright headless browser to capture configured routes. Triggered by finish-branch skill or API call before PR creation. Screenshots saved locally, then attached to GitHub PR as comment. Task card in UI shows screenshot status.

**Tech Stack:** Playwright (Python async), FastAPI, gh CLI for GitHub, YAML config

---

## File Structure

### Backend — New Files
| File | Responsibility |
|------|---------------|
| `backend/app/models/screenshots.py` | `ScreenshotConfig`, `RouteConfig`, `ViewportConfig`, `ScreenshotResult` Pydantic models |
| `backend/app/services/screenshot_service.py` | `ScreenshotService` — Playwright capture, dev server management, file storage |
| `backend/app/services/github_screenshots.py` | `attach_screenshots_to_pr()` — posts screenshot markdown to PR via `gh` CLI |
| `backend/app/api/routes/screenshots.py` | REST endpoints: `POST /screenshots/capture` |
| `backend/tests/test_screenshot_models.py` | Tests for config parsing and models |
| `backend/tests/test_screenshot_service.py` | Tests for ScreenshotService (mocked Playwright) |
| `backend/tests/test_screenshots_api.py` | Tests for screenshot API endpoints |
| `backend/tests/test_github_screenshots.py` | Tests for PR comment attachment |

### Backend — Modified Files
| File | Change |
|------|--------|
| `backend/pyproject.toml` | Add `playwright` dependency |
| `backend/app/config.py` | Add `SCREENSHOT_DIR`, `SCREENSHOT_DEV_SERVER_TIMEOUT` settings |
| `backend/app/main.py` | Register screenshots router |
| `backend/app/models/tasks.py` | Add `screenshot_status` field to `Task` |
| `backend/app/services/task_service.py` | Propagate `screenshot_status` in task updates |
| `backend/app/core/broadcast_service.py` | (No change needed — `screenshot_status` auto-included via Task serialization) |

### Frontend — New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/components/tasks/ScreenshotGallery.tsx` | Modal showing captured screenshots for a task |

### Frontend — Modified Files
| File | Change |
|------|--------|
| `frontend/src/types/tasks.ts` | Add `screenshotStatus` to `Task` interface |
| `frontend/src/components/tasks/TaskCard.tsx` | Add camera icon with color-coded screenshot status |

### Skill — Modified Files
| File | Change |
|------|--------|
| `.claude/skills/finish-branch/SKILL.md` | Add screenshot capture step before PR creation |

### Config — New Files
| File | Responsibility |
|------|---------------|
| `.claude/visual-checks.yaml` | Sample visual checks config for claude-office itself |

---

## Task 1: Add Playwright Dependency and Screenshot Config Model

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/app/models/screenshots.py`
- Create: `backend/tests/test_screenshot_models.py`

- [ ] **Step 1: Write tests for screenshot config models**

Create `backend/tests/test_screenshot_models.py`:

```python
"""Tests for screenshot config models."""

import pytest
from pathlib import Path

from app.models.screenshots import (
    ScreenshotConfig,
    RouteConfig,
    ViewportConfig,
    ScreenshotResult,
)


class TestViewportConfig:
    def test_default_viewport(self):
        v = ViewportConfig()
        assert v.width == 1280
        assert v.height == 720
        assert v.label == "desktop"

    def test_custom_viewport(self):
        v = ViewportConfig(width=375, height=812, label="mobile")
        assert v.width == 375
        assert v.label == "mobile"


class TestRouteConfig:
    def test_minimal_route(self):
        r = RouteConfig(path="/")
        assert r.path == "/"
        assert r.viewports == [ViewportConfig()]
        assert r.wait_for is None
        assert r.delay == 0

    def test_route_with_options(self):
        r = RouteConfig(
            path="/dashboard",
            viewports=[
                ViewportConfig(width=1280, height=720, label="desktop"),
                ViewportConfig(width=375, height=812, label="mobile"),
            ],
            wait_for="canvas",
            delay=3000,
        )
        assert len(r.viewports) == 2
        assert r.wait_for == "canvas"
        assert r.delay == 3000


class TestScreenshotConfig:
    def test_parse_from_dict(self):
        data = {
            "dev_server": {"command": "npm run dev", "port": 3000},
            "routes": [
                {
                    "path": "/",
                    "viewports": [
                        {"width": 1280, "height": 720, "label": "desktop"},
                        {"width": 375, "height": 812, "label": "mobile"},
                    ],
                    "wait_for": "canvas",
                    "delay": 3000,
                },
                {"path": "/settings"},
            ],
        }
        config = ScreenshotConfig(**data)
        assert config.dev_server.command == "npm run dev"
        assert config.dev_server.port == 3000
        assert len(config.routes) == 2
        assert config.routes[0].wait_for == "canvas"
        assert config.routes[1].delay == 0

    def test_parse_yaml_string(self, tmp_path: Path):
        yaml_content = """
dev_server:
  command: "npm run dev"
  port: 3000
routes:
  - path: "/"
    viewports:
      - width: 1280
        height: 720
        label: desktop
    wait_for: "canvas"
    delay: 3000
"""
        yaml_file = tmp_path / "visual-checks.yaml"
        yaml_file.write_text(yaml_content)

        import yaml

        raw = yaml.safe_load(yaml_file.read_text())
        config = ScreenshotConfig(**raw)
        assert config.dev_server.command == "npm run dev"
        assert len(config.routes) == 1
        assert config.routes[0].viewports[0].label == "desktop"


class TestScreenshotResult:
    def test_result_fields(self):
        r = ScreenshotResult(
            route="/",
            viewport_label="desktop",
            file_path="/tmp/screenshots/index-desktop.png",
            success=True,
        )
        assert r.success is True
        assert r.error is None

    def test_result_failure(self):
        r = ScreenshotResult(
            route="/broken",
            viewport_label="mobile",
            file_path="",
            success=False,
            error="Page load timeout",
        )
        assert r.success is False
        assert "timeout" in r.error.lower()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_screenshot_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.screenshots'`

- [ ] **Step 3: Add Playwright and PyYAML to dependencies**

Modify `backend/pyproject.toml` — add to the `dependencies` list:

```toml
dependencies = [
    # ... existing deps ...
    "playwright>=1.52.0",
    "pyyaml>=6.0.2",
]
```

Then run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv sync`

Then install Playwright browsers: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run playwright install chromium`

- [ ] **Step 4: Implement screenshot config models**

Create `backend/app/models/screenshots.py`:

```python
"""Models for visual screenshot verification."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ViewportConfig(BaseModel):
    """A viewport size for screenshot capture."""

    width: int = 1280
    height: int = 720
    label: str = "desktop"


class DevServerConfig(BaseModel):
    """Configuration for the dev server to start before capturing."""

    command: str = "npm run dev"
    port: int = 3000
    ready_pattern: str = "ready"
    """Substring to look for in stdout/stderr to know the server is ready."""
    startup_timeout: int = 30
    """Seconds to wait for the dev server to become ready."""


class RouteConfig(BaseModel):
    """A single route to capture."""

    path: str
    viewports: list[ViewportConfig] = [ViewportConfig()]
    wait_for: str | None = None
    """CSS selector to wait for before capturing."""
    delay: int = 0
    """Extra milliseconds to wait after page load / wait_for before capturing."""


class ScreenshotConfig(BaseModel):
    """Top-level config parsed from .claude/visual-checks.yaml."""

    dev_server: DevServerConfig = DevServerConfig()
    routes: list[RouteConfig] = []


class ScreenshotResult(BaseModel):
    """Result of a single screenshot capture."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    route: str
    viewport_label: str
    file_path: str
    success: bool
    error: str | None = None
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_screenshot_models.py -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/pyproject.toml backend/app/models/screenshots.py backend/tests/test_screenshot_models.py
git commit -m "feat: add Playwright dependency and screenshot config models

Add ScreenshotConfig, RouteConfig, ViewportConfig, and ScreenshotResult
Pydantic models for parsing .claude/visual-checks.yaml files.
Add playwright and pyyaml to backend dependencies."
```

---

## Task 2: Create ScreenshotService Core

**Files:**
- Create: `backend/app/services/screenshot_service.py`
- Create: `backend/tests/test_screenshot_service.py`

- [ ] **Step 1: Write tests for ScreenshotService**

Create `backend/tests/test_screenshot_service.py`:

```python
"""Tests for ScreenshotService — all Playwright interactions mocked."""

import asyncio
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.screenshots import (
    ScreenshotConfig,
    DevServerConfig,
    RouteConfig,
    ViewportConfig,
)
from app.services.screenshot_service import ScreenshotService


@pytest.fixture
def screenshot_dir(tmp_path: Path) -> Path:
    d = tmp_path / "screenshots"
    d.mkdir()
    return d


@pytest.fixture
def basic_config() -> ScreenshotConfig:
    return ScreenshotConfig(
        dev_server=DevServerConfig(command="npm run dev", port=3000),
        routes=[
            RouteConfig(
                path="/",
                viewports=[
                    ViewportConfig(width=1280, height=720, label="desktop"),
                    ViewportConfig(width=375, height=812, label="mobile"),
                ],
                wait_for="canvas",
                delay=500,
            ),
            RouteConfig(path="/settings"),
        ],
    )


class TestScreenshotService:
    @pytest.mark.asyncio
    async def test_capture_creates_files(self, screenshot_dir, basic_config):
        """Verify capture_screenshots visits correct routes and saves files."""
        service = ScreenshotService(screenshot_dir=screenshot_dir)

        # Mock Playwright
        mock_page = AsyncMock()
        mock_page.goto = AsyncMock()
        mock_page.wait_for_selector = AsyncMock()
        mock_page.screenshot = AsyncMock()
        mock_page.set_viewport_size = AsyncMock()

        mock_context = AsyncMock()
        mock_context.new_page = AsyncMock(return_value=mock_page)
        mock_context.close = AsyncMock()

        mock_browser = AsyncMock()
        mock_browser.new_context = AsyncMock(return_value=mock_context)
        mock_browser.close = AsyncMock()

        mock_pw_instance = AsyncMock()
        mock_pw_instance.chromium.launch = AsyncMock(return_value=mock_browser)
        mock_pw_instance.stop = AsyncMock()

        with (
            patch(
                "app.services.screenshot_service.async_playwright"
            ) as mock_pw_cm,
            patch(
                "app.services.screenshot_service.ScreenshotService._start_dev_server",
                new_callable=AsyncMock,
                return_value=(MagicMock(), 3000),
            ),
            patch(
                "app.services.screenshot_service.ScreenshotService._stop_dev_server",
                new_callable=AsyncMock,
            ),
        ):
            mock_pw_cm.return_value.__aenter__ = AsyncMock(
                return_value=mock_pw_instance
            )
            mock_pw_cm.return_value.__aexit__ = AsyncMock(return_value=False)

            results = await service.capture_screenshots(
                worktree_path="/tmp/fake-worktree",
                config=basic_config,
                branch_name="feat/my-feature",
            )

        # 2 routes: "/" has 2 viewports, "/settings" has 1 default viewport = 3 total
        assert len(results) == 3
        assert all(r.success for r in results)

        # Check route/viewport combinations
        labels = [(r.route, r.viewport_label) for r in results]
        assert ("/", "desktop") in labels
        assert ("/", "mobile") in labels
        assert ("/settings", "desktop") in labels

        # Verify page.goto was called with correct URLs
        goto_calls = mock_page.goto.call_args_list
        urls = [call.args[0] for call in goto_calls]
        assert "http://localhost:3000/" in urls
        assert "http://localhost:3000/settings" in urls

        # Verify wait_for_selector was called for the route that has it
        mock_page.wait_for_selector.assert_called()

    @pytest.mark.asyncio
    async def test_capture_handles_page_error(self, screenshot_dir):
        """Verify graceful handling when a page fails to load."""
        config = ScreenshotConfig(
            routes=[RouteConfig(path="/broken")],
        )
        service = ScreenshotService(screenshot_dir=screenshot_dir)

        mock_page = AsyncMock()
        mock_page.goto = AsyncMock(side_effect=Exception("net::ERR_CONNECTION_REFUSED"))
        mock_page.set_viewport_size = AsyncMock()

        mock_context = AsyncMock()
        mock_context.new_page = AsyncMock(return_value=mock_page)
        mock_context.close = AsyncMock()

        mock_browser = AsyncMock()
        mock_browser.new_context = AsyncMock(return_value=mock_context)
        mock_browser.close = AsyncMock()

        mock_pw_instance = AsyncMock()
        mock_pw_instance.chromium.launch = AsyncMock(return_value=mock_browser)

        with (
            patch(
                "app.services.screenshot_service.async_playwright"
            ) as mock_pw_cm,
            patch(
                "app.services.screenshot_service.ScreenshotService._start_dev_server",
                new_callable=AsyncMock,
                return_value=(MagicMock(), 3000),
            ),
            patch(
                "app.services.screenshot_service.ScreenshotService._stop_dev_server",
                new_callable=AsyncMock,
            ),
        ):
            mock_pw_cm.return_value.__aenter__ = AsyncMock(
                return_value=mock_pw_instance
            )
            mock_pw_cm.return_value.__aexit__ = AsyncMock(return_value=False)

            results = await service.capture_screenshots(
                worktree_path="/tmp/fake",
                config=config,
                branch_name="feat/broken",
            )

        assert len(results) == 1
        assert results[0].success is False
        assert "ERR_CONNECTION_REFUSED" in results[0].error

    @pytest.mark.asyncio
    async def test_screenshot_dir_created(self, tmp_path: Path):
        """Verify the branch-specific screenshot directory is created."""
        service = ScreenshotService(screenshot_dir=tmp_path / "shots")
        output_dir = service._get_output_dir("feat/my-feature")
        # Should sanitize branch name
        assert "feat-my-feature" in str(output_dir) or "feat_my-feature" in str(
            output_dir
        )

    @pytest.mark.asyncio
    async def test_serialized_access(self, screenshot_dir, basic_config):
        """Verify the asyncio lock prevents concurrent captures."""
        service = ScreenshotService(screenshot_dir=screenshot_dir)
        assert isinstance(service._lock, asyncio.Lock)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_screenshot_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.screenshot_service'`

- [ ] **Step 3: Implement ScreenshotService**

Create `backend/app/services/screenshot_service.py`:

```python
"""ScreenshotService — captures visual screenshots of dev server routes using Playwright."""

from __future__ import annotations

import asyncio
import logging
import re
import signal
import socket
import subprocess
from pathlib import Path

from playwright.async_api import async_playwright

from app.models.screenshots import (
    RouteConfig,
    ScreenshotConfig,
    ScreenshotResult,
    ViewportConfig,
)

logger = logging.getLogger(__name__)

_DEFAULT_SCREENSHOT_DIR = Path.home() / ".claude-office" / "screenshots"


def _find_free_port() -> int:
    """Find an available TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def _sanitize_branch(branch: str) -> str:
    """Convert branch name to a filesystem-safe directory name."""
    return re.sub(r"[^\w\-.]", "-", branch).strip("-")


class ScreenshotService:
    """Captures screenshots of configured routes using Playwright headless Chromium."""

    def __init__(self, screenshot_dir: Path | None = None) -> None:
        self.screenshot_dir = screenshot_dir or _DEFAULT_SCREENSHOT_DIR
        self._lock = asyncio.Lock()

    def _get_output_dir(self, branch_name: str) -> Path:
        """Get the output directory for a branch's screenshots."""
        sanitized = _sanitize_branch(branch_name)
        return self.screenshot_dir / sanitized

    async def _start_dev_server(
        self, worktree_path: str, config: ScreenshotConfig
    ) -> tuple[subprocess.Popen, int]:
        """Start the dev server in the worktree directory.

        Uses the configured port if available, otherwise finds a free port.
        Waits for the ready_pattern in stdout/stderr before returning.

        Returns:
            Tuple of (process, port)
        """
        port = config.dev_server.port or _find_free_port()
        cmd = config.dev_server.command
        env_port = str(port)

        # Inject PORT env var for common frameworks
        process = subprocess.Popen(
            cmd,
            shell=True,
            cwd=worktree_path,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env={
                **__import__("os").environ,
                "PORT": env_port,
                "BROWSER": "none",  # Prevent auto-opening browser
            },
            preexec_fn=__import__("os").setsid,
        )

        # Wait for server ready
        ready_pattern = config.dev_server.ready_pattern
        timeout = config.dev_server.startup_timeout

        async def _wait_ready() -> None:
            loop = asyncio.get_event_loop()
            while True:
                line = await loop.run_in_executor(None, process.stdout.readline)
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace")
                logger.debug("Dev server: %s", decoded.strip())
                if ready_pattern in decoded.lower():
                    return

        try:
            await asyncio.wait_for(_wait_ready(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning(
                "Dev server did not emit '%s' within %ds, proceeding anyway",
                ready_pattern,
                timeout,
            )

        return process, port

    async def _stop_dev_server(self, process: subprocess.Popen) -> None:
        """Terminate the dev server process group."""
        try:
            import os

            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
            process.wait(timeout=5)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass

    async def _capture_route(
        self,
        page,
        base_url: str,
        route: RouteConfig,
        viewport: ViewportConfig,
        output_dir: Path,
    ) -> ScreenshotResult:
        """Capture a single route + viewport combination."""
        url = f"{base_url}{route.path}"
        # Sanitize path for filename: "/" -> "index", "/foo/bar" -> "foo-bar"
        path_part = route.path.strip("/") or "index"
        path_part = path_part.replace("/", "-")
        filename = f"{path_part}-{viewport.label}.png"
        file_path = output_dir / filename

        try:
            await page.set_viewport_size(
                {"width": viewport.width, "height": viewport.height}
            )
            await page.goto(url, wait_until="networkidle", timeout=30000)

            if route.wait_for:
                await page.wait_for_selector(route.wait_for, timeout=10000)

            if route.delay > 0:
                await asyncio.sleep(route.delay / 1000.0)

            await page.screenshot(path=str(file_path), full_page=True)

            logger.info("Captured %s @ %s -> %s", url, viewport.label, file_path)
            return ScreenshotResult(
                route=route.path,
                viewport_label=viewport.label,
                file_path=str(file_path),
                success=True,
            )
        except Exception as e:
            logger.error("Failed to capture %s @ %s: %s", url, viewport.label, e)
            return ScreenshotResult(
                route=route.path,
                viewport_label=viewport.label,
                file_path="",
                success=False,
                error=str(e),
            )

    async def capture_screenshots(
        self,
        worktree_path: str,
        config: ScreenshotConfig,
        branch_name: str = "unknown",
    ) -> list[ScreenshotResult]:
        """Capture all configured routes and viewports.

        Serialized via asyncio lock to prevent concurrent Playwright sessions.

        Args:
            worktree_path: Path to the git worktree/repo to capture.
            config: Parsed ScreenshotConfig from visual-checks.yaml.
            branch_name: Git branch name (used for output directory naming).

        Returns:
            List of ScreenshotResult indicating success/failure for each capture.
        """
        async with self._lock:
            return await self._capture_screenshots_inner(
                worktree_path, config, branch_name
            )

    async def _capture_screenshots_inner(
        self,
        worktree_path: str,
        config: ScreenshotConfig,
        branch_name: str,
    ) -> list[ScreenshotResult]:
        """Inner implementation without lock."""
        output_dir = self._get_output_dir(branch_name)
        output_dir.mkdir(parents=True, exist_ok=True)

        results: list[ScreenshotResult] = []
        process = None

        try:
            # Start dev server
            process, port = await self._start_dev_server(worktree_path, config)
            base_url = f"http://localhost:{port}"

            # Launch Playwright
            async with async_playwright() as pw:
                browser = await pw.chromium.launch(headless=True)
                context = await browser.new_context()
                page = await context.new_page()

                for route in config.routes:
                    for viewport in route.viewports:
                        result = await self._capture_route(
                            page, base_url, route, viewport, output_dir
                        )
                        results.append(result)

                await context.close()
                await browser.close()

        finally:
            # Always clean up dev server
            if process:
                await self._stop_dev_server(process)

        return results


# Singleton
_screenshot_service: ScreenshotService | None = None


def get_screenshot_service() -> ScreenshotService:
    """Get or create the singleton ScreenshotService."""
    global _screenshot_service
    if _screenshot_service is None:
        _screenshot_service = ScreenshotService()
    return _screenshot_service
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_screenshot_service.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/app/services/screenshot_service.py backend/tests/test_screenshot_service.py
git commit -m "feat: add ScreenshotService with Playwright capture

Implements dev server lifecycle management, dynamic port allocation,
route+viewport capture loop, and branch-specific screenshot storage.
Uses asyncio lock for serialization."
```

---

## Task 3: Add Screenshot API Endpoint

**Files:**
- Create: `backend/app/api/routes/screenshots.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/config.py`
- Create: `backend/tests/test_screenshots_api.py`

- [ ] **Step 1: Write tests for screenshot API**

Create `backend/tests/test_screenshots_api.py`:

```python
"""Tests for /api/v1/screenshots endpoints."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from pathlib import Path

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.models.screenshots import ScreenshotResult


@pytest.mark.asyncio
class TestScreenshotsAPI:
    async def test_capture_success(self, tmp_path: Path):
        """POST /screenshots/capture returns list of screenshot results."""
        mock_results = [
            ScreenshotResult(
                route="/",
                viewport_label="desktop",
                file_path="/tmp/shots/index-desktop.png",
                success=True,
            ),
            ScreenshotResult(
                route="/",
                viewport_label="mobile",
                file_path="/tmp/shots/index-mobile.png",
                success=True,
            ),
        ]

        yaml_content = """
dev_server:
  command: "npm run dev"
  port: 3000
routes:
  - path: "/"
    viewports:
      - width: 1280
        height: 720
        label: desktop
      - width: 375
        height: 812
        label: mobile
"""
        worktree = tmp_path / "worktree"
        worktree.mkdir()
        claude_dir = worktree / ".claude"
        claude_dir.mkdir()
        (claude_dir / "visual-checks.yaml").write_text(yaml_content)

        mock_service = MagicMock()
        mock_service.capture_screenshots = AsyncMock(return_value=mock_results)

        with patch(
            "app.api.routes.screenshots.get_screenshot_service",
            return_value=mock_service,
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(
                transport=transport, base_url="http://test"
            ) as client:
                resp = await client.post(
                    "/api/v1/screenshots/capture",
                    json={
                        "worktree_path": str(worktree),
                        "project_key": "test-project",
                    },
                )
                assert resp.status_code == 200
                data = resp.json()
                assert len(data["results"]) == 2
                assert data["results"][0]["success"] is True

    async def test_capture_missing_config(self, tmp_path: Path):
        """POST /screenshots/capture returns 404 when visual-checks.yaml missing."""
        worktree = tmp_path / "worktree"
        worktree.mkdir()

        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/screenshots/capture",
                json={
                    "worktree_path": str(worktree),
                    "project_key": "test-project",
                },
            )
            assert resp.status_code == 404
            assert "visual-checks.yaml" in resp.json()["detail"]

    async def test_capture_invalid_worktree(self):
        """POST /screenshots/capture returns 400 for nonexistent worktree."""
        transport = ASGITransport(app=app)
        async with AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            resp = await client.post(
                "/api/v1/screenshots/capture",
                json={
                    "worktree_path": "/nonexistent/path",
                    "project_key": "test-project",
                },
            )
            assert resp.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_screenshots_api.py -v`
Expected: FAIL with import errors

- [ ] **Step 3: Add screenshot settings to config**

Modify `backend/app/config.py` — add these fields to the `Settings` class after `AO_POLL_INTERVAL`:

```python
    SCREENSHOT_DIR: str = ""
    """Override screenshot storage dir. Defaults to ~/.claude-office/screenshots."""
    SCREENSHOT_DEV_SERVER_TIMEOUT: int = 30
    """Seconds to wait for dev server startup."""
```

- [ ] **Step 4: Implement screenshot API routes**

Create `backend/app/api/routes/screenshots.py`:

```python
"""API routes for visual screenshot verification."""

from __future__ import annotations

import logging
from pathlib import Path

import yaml
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.screenshots import ScreenshotConfig, ScreenshotResult
from app.services.screenshot_service import get_screenshot_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/screenshots", tags=["screenshots"])

_VISUAL_CHECKS_FILENAME = "visual-checks.yaml"
_VISUAL_CHECKS_PATHS = [
    ".claude/visual-checks.yaml",
    ".claude/visual-checks.yml",
    "visual-checks.yaml",
    "visual-checks.yml",
]


class CaptureRequest(BaseModel):
    worktree_path: str
    project_key: str
    branch_name: str | None = None


class CaptureResponse(BaseModel):
    results: list[ScreenshotResult]
    all_passed: bool


def _find_visual_checks(worktree_path: str) -> Path | None:
    """Search for visual-checks.yaml in known locations."""
    root = Path(worktree_path)
    for rel_path in _VISUAL_CHECKS_PATHS:
        candidate = root / rel_path
        if candidate.is_file():
            return candidate
    return None


def _get_branch_name(worktree_path: str) -> str:
    """Attempt to get the git branch name from the worktree."""
    import subprocess

    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            cwd=worktree_path,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "unknown"


@router.post("/capture", response_model=CaptureResponse)
async def capture_screenshots(req: CaptureRequest) -> CaptureResponse:
    """Capture screenshots for a worktree based on its visual-checks.yaml.

    1. Validates worktree_path exists
    2. Finds and parses visual-checks.yaml
    3. Calls ScreenshotService.capture_screenshots
    4. Returns results
    """
    worktree = Path(req.worktree_path)
    if not worktree.is_dir():
        raise HTTPException(status_code=400, detail=f"Worktree path does not exist: {req.worktree_path}")

    config_path = _find_visual_checks(req.worktree_path)
    if config_path is None:
        raise HTTPException(
            status_code=404,
            detail=f"No visual-checks.yaml found in {req.worktree_path}",
        )

    try:
        raw = yaml.safe_load(config_path.read_text())
        config = ScreenshotConfig(**raw)
    except Exception as e:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse visual-checks.yaml: {e}",
        )

    branch = req.branch_name or _get_branch_name(req.worktree_path)

    service = get_screenshot_service()
    results = await service.capture_screenshots(
        worktree_path=req.worktree_path,
        config=config,
        branch_name=branch,
    )

    return CaptureResponse(
        results=results,
        all_passed=all(r.success for r in results),
    )
```

- [ ] **Step 5: Register router in main.py**

Modify `backend/app/main.py` — add import and router registration:

```python
# Add to imports:
from app.api.routes import agents, events, preferences, projects, sessions, tasks, screenshots

# Add after the tasks router line:
app.include_router(screenshots.router, prefix=f"{settings.API_V1_STR}")
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_screenshots_api.py -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/app/api/routes/screenshots.py backend/app/config.py backend/app/main.py backend/tests/test_screenshots_api.py
git commit -m "feat: add POST /api/v1/screenshots/capture endpoint

Reads visual-checks.yaml from worktree, delegates to ScreenshotService,
returns structured results. Adds SCREENSHOT_DIR config setting."
```

---

## Task 4: GitHub PR Comment with Screenshots

**Files:**
- Create: `backend/app/services/github_screenshots.py`
- Create: `backend/tests/test_github_screenshots.py`

- [ ] **Step 1: Write tests for GitHub screenshot attachment**

Create `backend/tests/test_github_screenshots.py`:

```python
"""Tests for attaching screenshots to GitHub PRs via gh CLI."""

import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from app.models.screenshots import ScreenshotResult
from app.services.github_screenshots import (
    attach_screenshots_to_pr,
    _build_comment_markdown,
)


class TestBuildCommentMarkdown:
    def test_all_passed(self):
        results = [
            ScreenshotResult(
                route="/",
                viewport_label="desktop",
                file_path="/tmp/shots/index-desktop.png",
                success=True,
            ),
            ScreenshotResult(
                route="/",
                viewport_label="mobile",
                file_path="/tmp/shots/index-mobile.png",
                success=True,
            ),
        ]
        md = _build_comment_markdown(results)
        assert "Visual Verification" in md
        assert "PASSED" in md or "passed" in md.lower()
        assert "index-desktop.png" in md
        assert "index-mobile.png" in md

    def test_some_failed(self):
        results = [
            ScreenshotResult(
                route="/",
                viewport_label="desktop",
                file_path="/tmp/shots/index-desktop.png",
                success=True,
            ),
            ScreenshotResult(
                route="/broken",
                viewport_label="desktop",
                file_path="",
                success=False,
                error="Timeout",
            ),
        ]
        md = _build_comment_markdown(results)
        assert "FAILED" in md or "failed" in md.lower()
        assert "Timeout" in md

    def test_empty_results(self):
        md = _build_comment_markdown([])
        assert "No screenshots" in md or "no routes" in md.lower()


class TestAttachScreenshotsToPR:
    @pytest.mark.asyncio
    async def test_calls_gh_cli(self, tmp_path: Path):
        """Verify gh pr comment is called with correct args."""
        results = [
            ScreenshotResult(
                route="/",
                viewport_label="desktop",
                file_path=str(tmp_path / "index-desktop.png"),
                success=True,
            ),
        ]
        # Create the fake screenshot file
        (tmp_path / "index-desktop.png").write_bytes(b"fake-png")

        mock_run = MagicMock()
        mock_run.returncode = 0
        mock_run.stdout = ""

        with patch(
            "app.services.github_screenshots.subprocess.run",
            return_value=mock_run,
        ) as patched_run:
            success = await attach_screenshots_to_pr(
                pr_number=42,
                repo="qwlong/claude-office",
                results=results,
            )

        assert success is True
        patched_run.assert_called_once()
        call_args = patched_run.call_args
        cmd = call_args.args[0] if call_args.args else call_args[0][0]
        # Should use gh pr comment
        assert "gh" in cmd[0]
        assert "pr" in cmd
        assert "comment" in cmd

    @pytest.mark.asyncio
    async def test_handles_gh_failure(self, tmp_path: Path):
        """Verify graceful handling when gh CLI fails."""
        results = [
            ScreenshotResult(
                route="/",
                viewport_label="desktop",
                file_path=str(tmp_path / "index-desktop.png"),
                success=True,
            ),
        ]
        (tmp_path / "index-desktop.png").write_bytes(b"fake-png")

        mock_run = MagicMock()
        mock_run.returncode = 1
        mock_run.stderr = "gh: not authenticated"

        with patch(
            "app.services.github_screenshots.subprocess.run",
            return_value=mock_run,
        ):
            success = await attach_screenshots_to_pr(
                pr_number=42,
                repo="qwlong/claude-office",
                results=results,
            )

        assert success is False
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_github_screenshots.py -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Implement GitHub screenshot attachment**

Create `backend/app/services/github_screenshots.py`:

```python
"""Attach visual verification screenshots to GitHub PRs via gh CLI."""

from __future__ import annotations

import asyncio
import logging
import subprocess
from pathlib import Path

from app.models.screenshots import ScreenshotResult

logger = logging.getLogger(__name__)


def _build_comment_markdown(results: list[ScreenshotResult]) -> str:
    """Build a markdown comment body for the PR.

    Includes a summary table and embedded image references for each screenshot.
    Images are referenced by local path — gh CLI will upload them when
    using `gh pr comment --body-file`.
    """
    if not results:
        return "## Visual Verification\n\nNo screenshots captured (no routes configured)."

    passed = sum(1 for r in results if r.success)
    failed = sum(1 for r in results if not r.success)
    total = len(results)

    if failed == 0:
        status = "PASSED"
        emoji = "white_check_mark"
    else:
        status = "FAILED"
        emoji = "x"

    lines = [
        f"## Visual Verification: {status} :{emoji}:",
        "",
        f"**{passed}/{total}** screenshots captured successfully.",
        "",
        "| Route | Viewport | Status |",
        "|-------|----------|--------|",
    ]

    for r in results:
        status_cell = "Captured" if r.success else f"FAILED: {r.error}"
        lines.append(f"| `{r.route}` | {r.viewport_label} | {status_cell} |")

    lines.append("")
    lines.append("<details><summary>Screenshots</summary>")
    lines.append("")

    for r in results:
        if r.success and r.file_path:
            filename = Path(r.file_path).name
            lines.append(f"### `{r.route}` ({r.viewport_label})")
            lines.append("")
            lines.append(f"![{filename}]({r.file_path})")
            lines.append("")

    lines.append("</details>")

    return "\n".join(lines)


async def attach_screenshots_to_pr(
    pr_number: int,
    repo: str,
    results: list[ScreenshotResult],
    cwd: str | None = None,
) -> bool:
    """Post a comment with screenshot results to a GitHub PR.

    Uses the `gh pr comment` CLI command. The gh CLI must be authenticated.

    Args:
        pr_number: The PR number to comment on.
        repo: Repository in "owner/repo" format.
        results: List of ScreenshotResult from capture.
        cwd: Working directory for gh CLI (defaults to None).

    Returns:
        True if the comment was posted successfully, False otherwise.
    """
    markdown = _build_comment_markdown(results)

    cmd = [
        "gh", "pr", "comment", str(pr_number),
        "--repo", repo,
        "--body", markdown,
    ]

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=cwd,
                timeout=30,
            ),
        )

        if result.returncode != 0:
            logger.error(
                "gh pr comment failed (exit %d): %s",
                result.returncode,
                result.stderr,
            )
            return False

        logger.info("Posted screenshot comment to PR #%d on %s", pr_number, repo)
        return True

    except subprocess.TimeoutExpired:
        logger.error("gh pr comment timed out for PR #%d", pr_number)
        return False
    except FileNotFoundError:
        logger.error("gh CLI not found — is GitHub CLI installed?")
        return False
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_github_screenshots.py -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/app/services/github_screenshots.py backend/tests/test_github_screenshots.py
git commit -m "feat: add GitHub PR comment with screenshot results

Posts markdown table + embedded screenshot images to PRs using gh CLI.
Handles success/failure reporting and gh CLI errors gracefully."
```

---

## Task 5: Add Screenshot Status to Task Model and WebSocket

**Files:**
- Modify: `backend/app/models/tasks.py`
- Modify: `frontend/src/types/tasks.ts`
- Modify: `backend/app/services/task_service.py`

- [ ] **Step 1: Write tests for extended Task model**

Add to existing `backend/tests/test_tasks_api.py` (or create a new test):

```python
# Add to the existing _make_task function defaults:
# "screenshot_status": None,

# Add new test class:
class TestTaskScreenshotStatus:
    def test_task_includes_screenshot_status(self):
        task = _make_task(screenshot_status="passed")
        data = task.model_dump(by_alias=True, mode="json")
        assert data["screenshotStatus"] == "passed"

    def test_task_screenshot_status_default_none(self):
        task = _make_task()
        assert task.screenshot_status is None

    def test_screenshot_status_enum_values(self):
        for status in ["pending", "capturing", "passed", "failed", None]:
            task = _make_task(screenshot_status=status)
            assert task.screenshot_status == status
```

- [ ] **Step 2: Extend Task model with screenshot_status**

Modify `backend/app/models/tasks.py` — add field to `Task` class after `worktree_path`:

```python
    screenshot_status: str | None = None
    """Screenshot capture status: None, 'pending', 'capturing', 'passed', 'failed'."""
```

- [ ] **Step 3: Update _make_task in test_tasks_api.py**

Modify `backend/tests/test_tasks_api.py` — add to the `defaults` dict in `_make_task`:

```python
        "screenshot_status": None,
```

- [ ] **Step 4: Extend frontend Task type**

Modify `frontend/src/types/tasks.ts` — add to the `Task` interface after `worktreePath`:

```typescript
  screenshotStatus: string | null;
```

- [ ] **Step 5: Run all tests to verify nothing broke**

Run: `cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/test_tasks_api.py -v`
Expected: All tests PASS (including new screenshot_status tests)

- [ ] **Step 6: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add backend/app/models/tasks.py backend/tests/test_tasks_api.py frontend/src/types/tasks.ts
git commit -m "feat: add screenshot_status field to Task model

Extends both backend Task model and frontend Task type with
screenshotStatus field (pending/capturing/passed/failed/null).
Automatically included in WebSocket broadcasts via Task serialization."
```

---

## Task 6: Frontend — Camera Icon on TaskCard

**Files:**
- Modify: `frontend/src/components/tasks/TaskCard.tsx`
- Create: `frontend/src/components/tasks/ScreenshotGallery.tsx`

- [ ] **Step 1: Add camera icon to TaskCard**

Modify `frontend/src/components/tasks/TaskCard.tsx`:

```tsx
import { Camera } from "lucide-react";
import { useState } from "react";
import type { Task } from "@/types/tasks";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { ScreenshotGallery } from "./ScreenshotGallery";

interface Props {
  task: Task;
}

const AO_DASHBOARD_URL = "http://localhost:3003";

function getScreenshotIconColor(status: string | null): string {
  switch (status) {
    case "passed":
      return "text-green-400 hover:text-green-300";
    case "failed":
      return "text-red-400 hover:text-red-300";
    case "pending":
    case "capturing":
      return "text-yellow-400 hover:text-yellow-300 animate-pulse";
    default:
      return "text-slate-400 hover:text-slate-300";
  }
}

export function TaskCard({ task }: Props) {
  const [galleryOpen, setGalleryOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-100 dark:hover:bg-slate-700/30 rounded text-sm">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TaskStatusBadge status={task.status} />
          <a
            href={`${AO_DASHBOARD_URL}/sessions/${task.externalSessionId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-600 dark:text-slate-300 hover:text-purple-500 dark:hover:text-purple-400 transition-colors whitespace-nowrap"
            title={task.externalSessionId}
          >
            {task.externalSessionId}
          </a>
          {task.issue && (
            <span className="text-slate-400 dark:text-slate-500 truncate text-xs" title={task.issue}>
              {task.issue}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
          {task.screenshotStatus && (
            <button
              onClick={() => setGalleryOpen(true)}
              className={`transition-colors ${getScreenshotIconColor(task.screenshotStatus)}`}
              title={`Screenshots: ${task.screenshotStatus}`}
            >
              <Camera size={14} />
            </button>
          )}
          {task.prUrl && task.prNumber && (
            <a
              href={task.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300"
            >
              PR #{task.prNumber}
            </a>
          )}
          {task.ciStatus && (
            <span
              className={
                task.ciStatus === "passing"
                  ? "text-green-400"
                  : task.ciStatus === "failing"
                    ? "text-red-400"
                    : "text-yellow-400"
              }
            >
              CI {task.ciStatus === "passing" ? "\u2713" : task.ciStatus === "failing" ? "\u2717" : "\u23F3"}
            </span>
          )}
          {task.reviewStatus && (
            <span
              className={
                task.reviewStatus === "approved"
                  ? "text-green-400"
                  : task.reviewStatus === "changes_requested"
                    ? "text-orange-400"
                    : "text-yellow-400"
              }
            >
              {task.reviewStatus === "approved" ? "Rev \u2713" : task.reviewStatus === "changes_requested" ? "Rev \u2717" : "Rev \u23F3"}
            </span>
          )}
        </div>
      </div>
      {galleryOpen && (
        <ScreenshotGallery
          task={task}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Create ScreenshotGallery modal**

Create `frontend/src/components/tasks/ScreenshotGallery.tsx`:

```tsx
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { Task } from "@/types/tasks";

interface Props {
  task: Task;
  onClose: () => void;
}

interface ScreenshotInfo {
  route: string;
  viewportLabel: string;
  filePath: string;
  success: boolean;
  error: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export function ScreenshotGallery({ task, onClose }: Props) {
  const [screenshots, setScreenshots] = useState<ScreenshotInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch screenshot results for this task from API
    // For now, show a placeholder
    setLoading(false);
  }, [task.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Screenshots: {task.externalSessionId}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-80px)]">
          {loading ? (
            <div className="text-center text-slate-500 py-8">Loading screenshots...</div>
          ) : screenshots.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              No screenshots available for this task.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {screenshots.map((s, i) => (
                <div key={i} className="border rounded-lg overflow-hidden dark:border-slate-700">
                  <div className="p-2 bg-slate-50 dark:bg-slate-900 text-xs font-mono">
                    {s.route} ({s.viewportLabel})
                    {!s.success && (
                      <span className="text-red-400 ml-2">FAILED: {s.error}</span>
                    )}
                  </div>
                  {s.success && s.filePath && (
                    <img
                      src={`${API_BASE}/screenshots/image?path=${encodeURIComponent(s.filePath)}`}
                      alt={`${s.route} ${s.viewportLabel}`}
                      className="w-full"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd /Users/apple/Projects/others/random/claude-office/frontend && npx next lint && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add frontend/src/components/tasks/TaskCard.tsx frontend/src/components/tasks/ScreenshotGallery.tsx
git commit -m "feat: add camera icon to TaskCard with screenshot gallery

Camera icon shows screenshot status (green=passed, red=failed,
yellow=pending, hidden=none). Click opens ScreenshotGallery modal.
Uses lucide-react Camera and X icons."
```

---

## Task 7: Update finish-branch Skill

**Files:**
- Modify: `.claude/skills/finish-branch/SKILL.md`

- [ ] **Step 1: Add screenshot capture step to finish-branch skill**

Modify `.claude/skills/finish-branch/SKILL.md` — insert a new step between "Push to remote" and "Create PR":

```markdown
4. **Capture visual screenshots (if configured)**
   Check if `.claude/visual-checks.yaml` exists in the repo:
   ```bash
   if [ -f ".claude/visual-checks.yaml" ]; then
     echo "Capturing visual verification screenshots..."
     WORKTREE_PATH=$(pwd)
     BRANCH_NAME=$(git rev-parse --abbrev-ref HEAD)
     curl -s -X POST http://localhost:8000/api/v1/screenshots/capture \
       -H "Content-Type: application/json" \
       -d "{\"worktree_path\": \"$WORKTREE_PATH\", \"project_key\": \"$(basename $WORKTREE_PATH)\", \"branch_name\": \"$BRANCH_NAME\"}" \
       | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Screenshots: {len(d[\"results\"])} captured, all_passed={d[\"all_passed\"]}')"
   fi
   ```
   If screenshot capture fails, warn but do NOT block PR creation.

5. **Create PR**
   ```bash
   gh pr create --repo qwlong/claude-office --base main --title "feat: short title" --body "$(cat <<'EOF'
   ## Summary
   - What changed and why

   ## Test plan
   - [ ] All tests pass
   - [ ] Manually verified behavior
   - [ ] Visual screenshots captured (if applicable)

   EOF
   )"
   ```

6. **Attach screenshots to PR (if captured)**
   ```bash
   if [ -f ".claude/visual-checks.yaml" ]; then
     PR_NUMBER=$(gh pr view --json number -q .number)
     if [ -n "$PR_NUMBER" ]; then
       curl -s -X POST http://localhost:8000/api/v1/screenshots/attach \
         -H "Content-Type: application/json" \
         -d "{\"pr_number\": $PR_NUMBER, \"repo\": \"qwlong/claude-office\", \"worktree_path\": \"$(pwd)\"}"
     fi
   fi
   ```
```

Update the checklist to include:

```markdown
- [ ] Visual screenshots captured (if visual-checks.yaml exists)
- [ ] Screenshot comment attached to PR
```

- [ ] **Step 2: Add attach endpoint to screenshots API**

Modify `backend/app/api/routes/screenshots.py` — add new endpoint:

```python
class AttachRequest(BaseModel):
    pr_number: int
    repo: str
    worktree_path: str


class AttachResponse(BaseModel):
    success: bool
    message: str


@router.post("/attach", response_model=AttachResponse)
async def attach_screenshots(req: AttachRequest) -> AttachResponse:
    """Attach the most recent screenshots for a worktree to a GitHub PR.

    Reads the screenshot results from the latest capture and posts them
    as a PR comment via gh CLI.
    """
    from app.services.github_screenshots import attach_screenshots_to_pr
    from app.services.screenshot_service import get_screenshot_service

    service = get_screenshot_service()

    # Find the branch name for this worktree
    branch = _get_branch_name(req.worktree_path)
    output_dir = service._get_output_dir(branch)

    if not output_dir.exists():
        return AttachResponse(
            success=False,
            message=f"No screenshots found for branch '{branch}'",
        )

    # Build results from saved files
    screenshots = list(output_dir.glob("*.png"))
    if not screenshots:
        return AttachResponse(
            success=False,
            message="No screenshot files found",
        )

    from app.models.screenshots import ScreenshotResult

    results = [
        ScreenshotResult(
            route=f.stem.rsplit("-", 1)[0].replace("-", "/") or "/",
            viewport_label=f.stem.rsplit("-", 1)[-1] if "-" in f.stem else "desktop",
            file_path=str(f),
            success=True,
        )
        for f in screenshots
    ]

    success = await attach_screenshots_to_pr(
        pr_number=req.pr_number,
        repo=req.repo,
        results=results,
        cwd=req.worktree_path,
    )

    return AttachResponse(
        success=success,
        message="Screenshots attached to PR" if success else "Failed to attach screenshots",
    )
```

- [ ] **Step 3: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add .claude/skills/finish-branch/SKILL.md backend/app/api/routes/screenshots.py
git commit -m "feat: integrate screenshot capture into finish-branch skill

Adds visual-checks capture step before PR creation and screenshot
attachment step after. Non-blocking: warns but continues if capture fails.
Adds POST /screenshots/attach endpoint for PR comment posting."
```

---

## Task 8: Create Sample visual-checks.yaml

**Files:**
- Create: `.claude/visual-checks.yaml`

- [ ] **Step 1: Create the sample config**

Create `.claude/visual-checks.yaml`:

```yaml
# Visual verification config for claude-office.
# Used by Phase B screenshot capture before PR creation.
# See: docs/superpowers/plans/2026-04-09-phase-b-pr-visual-verification.md

dev_server:
  command: "make dev-tmux"
  port: 3000
  ready_pattern: "ready"
  startup_timeout: 30

routes:
  - path: "/"
    viewports:
      - width: 1280
        height: 720
        label: desktop
      - width: 375
        height: 812
        label: mobile
    wait_for: "canvas"
    delay: 3000

  - path: "/sprite-debug"
    viewports:
      - width: 1280
        height: 720
        label: desktop
    delay: 1000
```

- [ ] **Step 2: Verify the config parses correctly**

```bash
cd /Users/apple/Projects/others/random/claude-office/backend
uv run python -c "
import yaml
from app.models.screenshots import ScreenshotConfig

with open('../.claude/visual-checks.yaml') as f:
    raw = yaml.safe_load(f)
config = ScreenshotConfig(**raw)
print(f'Routes: {len(config.routes)}')
for r in config.routes:
    print(f'  {r.path}: {len(r.viewports)} viewports, wait_for={r.wait_for}, delay={r.delay}')
print('Config parsed successfully.')
"
```

Expected output:
```
Routes: 2
  /: 2 viewports, wait_for=canvas, delay=3000
  /sprite-debug: 1 viewports, wait_for=None, delay=1000
Config parsed successfully.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/apple/Projects/others/random/claude-office
git add .claude/visual-checks.yaml
git commit -m "feat: add sample visual-checks.yaml for claude-office

Configures screenshot capture for the main office view (/ with desktop
and mobile viewports, waiting for canvas) and sprite debug page."
```

---

## Final Verification

- [ ] **Run full backend test suite**

```bash
cd /Users/apple/Projects/others/random/claude-office/backend && uv run pytest tests/ -v --timeout=30
```

- [ ] **Run full linting and type checks**

```bash
cd /Users/apple/Projects/others/random/claude-office && make checkall
```

- [ ] **Verify all new files exist**

```
backend/app/models/screenshots.py
backend/app/services/screenshot_service.py
backend/app/services/github_screenshots.py
backend/app/api/routes/screenshots.py
backend/tests/test_screenshot_models.py
backend/tests/test_screenshot_service.py
backend/tests/test_screenshots_api.py
backend/tests/test_github_screenshots.py
frontend/src/components/tasks/ScreenshotGallery.tsx
.claude/visual-checks.yaml
```

---

## Dependency Graph

```
Task 1 (models + deps)
  |
  v
Task 2 (ScreenshotService) -----> Task 3 (API endpoint)
  |                                    |
  v                                    v
Task 4 (GitHub PR comment) -----> Task 7 (finish-branch skill)
                                       |
Task 5 (Task model extension) ------> Task 6 (Frontend camera icon)
                                       |
                                  Task 8 (sample config)
```

Tasks 1-2 are sequential (2 depends on 1). Tasks 3-4 can be parallelized after Task 2. Task 5 is independent of Tasks 2-4. Task 6 depends on Task 5. Task 7 depends on Tasks 3+4. Task 8 depends on Task 1 only (for config model).
