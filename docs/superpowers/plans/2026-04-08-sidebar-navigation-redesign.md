# Sidebar Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the left sidebar as the primary navigation hub with a "Whole Office" button, "All Projects" / "All Sessions" entries, and single-item selection that filters the canvas view. Rename ViewMode values for clarity.

**Architecture:** Rename ViewMode from `"all-merged"|"overview"|"room-detail"|"sessions"` to `"office"|"projects"|"project"|"sessions"|"session"`. The sidebar drives navigation: "Whole Office" → `office`, "All Projects" → `projects`, click a project → `project` (filters to that project's room, tab shows "Projects"), "All Sessions" → `sessions`, click a session → `session` (filters to that session's room, tab shows "Sessions"). `activeRoomKey` stores the selected project key or session ID for singular modes. Git Status only renders when data exists.

**Tech Stack:** React, Zustand (projectStore + gameStore), Tailwind CSS, lucide-react icons

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/types/projects.ts:8` | Modify | Change ViewMode type |
| `frontend/src/stores/projectStore.ts` | Modify | Update default values, actions, rename references |
| `frontend/src/components/game/OfficeGame.tsx` | Modify | Handle new `"project"` and `"session"` modes — filter rooms to show only the selected one |
| `frontend/src/app/page.tsx:457-484` | Modify | Update tab labels and tab-to-mode mapping, group singular under plural tab |
| `frontend/src/components/layout/ProjectSidebar.tsx` | Modify | Add "All Projects" entry, project click → `"project"` mode, active highlighting |
| `frontend/src/components/layout/SessionSidebar.tsx` | Modify | Add "Whole Office" button, "All Sessions" entry, session click → `"session"` mode, conditional Git Status |
| `frontend/src/i18n/en.ts` | Modify | Add sidebar i18n keys |
| `frontend/src/i18n/es.ts` | Modify | Add sidebar i18n keys (Spanish) |
| `frontend/src/i18n/pt-BR.ts` | Modify | Add sidebar i18n keys (Portuguese) |

---

### Task 1: Rename ViewMode values

**Files:**
- Modify: `frontend/src/types/projects.ts:8`
- Modify: `frontend/src/stores/projectStore.ts`
- Modify: `frontend/src/components/game/OfficeGame.tsx`
- Modify: `frontend/src/app/page.tsx`

This is a pure rename with no behavior change. Every reference to the old values must be updated.

- [ ] **Step 1: Update the ViewMode type**

In `frontend/src/types/projects.ts` line 8, change:

```typescript
// FROM:
export type ViewMode = "overview" | "room-detail" | "all-merged" | "sessions";
// TO:
export type ViewMode = "office" | "projects" | "project" | "sessions" | "session";
```

- [ ] **Step 2: Update projectStore.ts**

Replace all old ViewMode string literals:

| Old | New | Lines |
|-----|-----|-------|
| `"all-merged"` | `"office"` | 36 |
| `"room-detail"` | `"project"` | 51 |
| `"overview"` | `"projects"` | 53, 57 |

- [ ] **Step 3: Update OfficeGame.tsx**

Replace all old ViewMode string literals:

| Old | New | Lines |
|-----|-----|-------|
| `"all-merged"` | `"office"` | 158, 284, 298 |
| `"overview"` | `"projects"` | 231 |
| `"sessions"` | `"sessions"` | 231, 232, 343 (no change needed) |

- [ ] **Step 4: Update page.tsx tab mapping**

In `frontend/src/app/page.tsx` lines 459-483:

Replace the mode array and label mapping:

```typescript
// FROM:
{(["all-merged", "overview", "sessions"] as const).map((mode) => (
// TO:
{(["office", "projects", "sessions"] as const).map((mode) => (
```

Update the label logic:

```typescript
// FROM:
{mode === "all-merged"
  ? "Office"
  : mode === "overview"
    ? "Projects"
    : "Sessions"}
// TO:
{mode === "office"
  ? "Office"
  : mode === "projects"
    ? "Projects"
    : "Sessions"}
```

Update the back button condition:

```typescript
// FROM:
{viewMode === "all-merged" && previousViewMode && (previousViewMode === "sessions" || previousViewMode === "overview") && (
// TO:
{viewMode === "office" && previousViewMode && (previousViewMode === "sessions" || previousViewMode === "projects") && (
```

And the back button label:

```typescript
// FROM:
{previousViewMode === "sessions" ? "\u2190 Sessions" : "\u2190 Projects"}
// TO (no change needed, already correct)
```

- [ ] **Step 5: Verify dev server compiles**

Run: `curl -s http://localhost:3000 | head -1`
Expected: HTML output, no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/projects.ts frontend/src/stores/projectStore.ts frontend/src/components/game/OfficeGame.tsx frontend/src/app/page.tsx
git commit -m "refactor(viewmode): rename all-merged→office, overview→projects, room-detail→project"
```

---

### Task 2: Handle `"project"` and `"session"` singular modes in OfficeGame

**Files:**
- Modify: `frontend/src/components/game/OfficeGame.tsx`
- Modify: `frontend/src/stores/projectStore.ts`

The singular modes (`"project"`, `"session"`) should render multi-room canvas but filtered to show only the selected room. The tab bar should highlight "Projects" or "Sessions" respectively.

- [ ] **Step 1: Update isMultiRoom logic in OfficeGame**

In `OfficeGame.tsx`, change the multi-room detection (around line 231):

```typescript
// FROM:
const isMultiRoom = viewMode === "projects" || viewMode === "sessions";
// TO:
const isMultiRoom = viewMode === "projects" || viewMode === "project" || viewMode === "sessions" || viewMode === "session";
```

- [ ] **Step 2: Filter rooms for singular modes**

After `isMultiRoom` derivation, update the room selection logic:

```typescript
// FROM:
const multiRoomRooms = viewMode === "sessions" ? sessionRooms : projects;
// TO:
const multiRoomRooms = useMemo(() => {
  if (viewMode === "sessions") return sessionRooms;
  if (viewMode === "session") {
    const activeKey = useProjectStore.getState().activeRoomKey;
    return sessionRooms.filter((r) => r.key === activeKey);
  }
  if (viewMode === "project") {
    const activeKey = useProjectStore.getState().activeRoomKey;
    return projects.filter((p) => p.key === activeKey);
  }
  return projects; // "projects" mode
}, [viewMode, sessionRooms, projects]);
```

Note: Since `activeRoomKey` is already in the store, we read it directly. Import `selectActiveRoomKey` if not already imported and use via hook instead of `getState()`:

```typescript
const activeRoomKey = useProjectStore(selectActiveRoomKey);
```

Then:

```typescript
const multiRoomRooms = useMemo(() => {
  if (viewMode === "sessions") return sessionRooms;
  if (viewMode === "session") return sessionRooms.filter((r) => r.key === activeRoomKey);
  if (viewMode === "project") return projects.filter((p) => p.key === activeRoomKey);
  return projects;
}, [viewMode, sessionRooms, projects, activeRoomKey]);
```

- [ ] **Step 3: Update animation system condition**

```typescript
// FROM:
useAnimationSystem({ enabled: viewMode === "office" });
// TO:
useAnimationSystem({ enabled: viewMode === "office" || viewMode === "project" || viewMode === "session" });
```

Wait — singular modes use multi-room canvas, not the full single-room rendering. Animation should stay disabled for multi-room. Keep it as `viewMode === "office"` only.

- [ ] **Step 4: Update onRoomClick handler for singular modes**

The click handler on `MultiRoomCanvas` should handle all multi-room variants:

```typescript
// FROM:
onRoomClick={viewMode === "sessions" ? handleSessionRoomClick : handleProjectRoomClick}
// TO:
onRoomClick={
  viewMode === "sessions" || viewMode === "session"
    ? handleSessionRoomClick
    : handleProjectRoomClick
}
```

- [ ] **Step 5: Add `zoomToSession` action in projectStore**

In `frontend/src/stores/projectStore.ts`, add a new action for session zoom (mirror of `zoomToRoom`):

In the interface:

```typescript
zoomToSession: (key: string) => void;
```

In the store:

```typescript
zoomToSession: (key) => set({ viewMode: "session", activeRoomKey: key }),
```

Also rename `zoomToRoom` to `zoomToProject` for clarity:

```typescript
zoomToProject: (key) => set({ viewMode: "project", activeRoomKey: key }),
```

And `zoomToOverview` to `zoomToProjects`:

```typescript
zoomToProjects: () => set({ viewMode: "projects", activeRoomKey: null }),
```

Update `goBackToMultiRoom`:

```typescript
goBackToMultiRoom: () =>
  set((state) => ({
    viewMode: state.previousViewMode ?? "projects",
    previousViewMode: null,
    activeRoomKey: null,
  })),
```

- [ ] **Step 6: Update page.tsx tab highlighting for singular modes**

In `frontend/src/app/page.tsx`, the tab highlight needs to treat `"project"` the same as `"projects"`, and `"session"` the same as `"sessions"`:

```typescript
// Change the active check from:
viewMode === mode
// To:
viewMode === mode
  || (mode === "projects" && viewMode === "project")
  || (mode === "sessions" && viewMode === "session")
```

Also update the back button to show when in singular modes:

```typescript
// FROM:
{viewMode === "office" && previousViewMode && ...
// TO:
{(viewMode === "project" || viewMode === "session") && (
  <button
    onClick={goBackToMultiRoom}
    className="ml-1 px-2 py-1 text-xs rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors border-l border-slate-600"
  >
    {viewMode === "session" ? "\u2190 Sessions" : "\u2190 Projects"}
  </button>
)}
```

- [ ] **Step 7: Verify in browser**

Open `http://localhost:3000`. Click the Projects tab → should show all project rooms. Click the Sessions tab → should show all session rooms. The Office tab should show the merged single office.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/stores/projectStore.ts frontend/src/components/game/OfficeGame.tsx frontend/src/app/page.tsx
git commit -m "feat(viewmode): add project/session singular modes with filtered room display"
```

---

### Task 3: Add i18n keys

**Files:**
- Modify: `frontend/src/i18n/en.ts`
- Modify: `frontend/src/i18n/es.ts`
- Modify: `frontend/src/i18n/pt-BR.ts`

- [ ] **Step 1: Add keys to all three files**

After the `sessions.dragToResize` line, add a new section:

**en.ts:**
```typescript
// Sidebar Navigation
"sidebar.wholeOffice": "Whole Office",
"sidebar.allProjects": "All Projects",
"sidebar.allSessions": "All Sessions",
```

**es.ts:**
```typescript
// Sidebar Navigation
"sidebar.wholeOffice": "Toda la Oficina",
"sidebar.allProjects": "Todos los Proyectos",
"sidebar.allSessions": "Todas las Sesiones",
```

**pt-BR.ts:**
```typescript
// Sidebar Navigation
"sidebar.wholeOffice": "Escritório Completo",
"sidebar.allProjects": "Todos os Projetos",
"sidebar.allSessions": "Todas as Sessões",
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/i18n/en.ts frontend/src/i18n/es.ts frontend/src/i18n/pt-BR.ts
git commit -m "feat(i18n): add sidebar navigation labels"
```

---

### Task 4: Redesign ProjectSidebar

**Files:**
- Modify: `frontend/src/components/layout/ProjectSidebar.tsx`

**Context:** Currently has a "PROJECTS (N)" header with an "Overview" button, and project entries that call `zoomToRoom(project.key)`. We need: "All Projects" entry at top, project click → `zoomToProject(key)`, active highlighting synced with viewMode.

- [ ] **Step 1: Update imports**

```typescript
import { useState } from "react";
import { Layers } from "lucide-react";
import {
  useProjectStore,
  selectProjects,
  selectViewMode,
  selectActiveRoomKey,
} from "@/stores/projectStore";
import { useTranslation } from "@/hooks/useTranslation";
import type { ProjectGroup } from "@/types/projects";
```

- [ ] **Step 2: Update component body**

```typescript
export function ProjectSidebar() {
  const { t } = useTranslation();
  const projects = useProjectStore(selectProjects);
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const zoomToProjects = useProjectStore((s) => s.zoomToProjects);
  const zoomToProject = useProjectStore((s) => s.zoomToProject);

  if (projects.length === 0) return null;

  const isAllProjectsActive = viewMode === "projects";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-semibold text-slate-400">
          PROJECTS ({projects.length})
        </span>
      </div>
      {/* All Projects item */}
      <div
        role="button"
        tabIndex={0}
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded cursor-pointer transition-colors ${
          isAllProjectsActive
            ? "bg-purple-500/20 border-l-2 border-purple-500"
            : "hover:bg-slate-700"
        }`}
        onClick={zoomToProjects}
        onKeyDown={(e) => e.key === "Enter" && zoomToProjects()}
      >
        <Layers size={12} className={isAllProjectsActive ? "text-purple-400" : "text-slate-500"} />
        <span className={`truncate ${isAllProjectsActive ? "text-purple-300 font-bold" : "text-slate-300"}`}>
          {t("sidebar.allProjects")}
        </span>
      </div>
      {projects.map((project) => (
        <ProjectEntry
          key={project.key}
          project={project}
          isActive={viewMode === "project" && activeRoomKey === project.key}
          onClickProject={() => zoomToProject(project.key)}
        />
      ))}
    </div>
  );
}
```

Key changes:
- Removed "Overview" button
- Added "All Projects" entry with Layers icon, calls `zoomToProjects()`
- `ProjectEntry` click now calls `zoomToProject(key)` instead of `zoomToRoom(key)`
- Active state: `viewMode === "project" && activeRoomKey === project.key`

- [ ] **Step 3: Add `isActive` prop to ProjectEntry**

```typescript
function ProjectEntry({
  project,
  isActive,
  onClickProject,
}: {
  project: ProjectGroup;
  isActive: boolean;
  onClickProject: () => void;
}) {
```

Change className to use `isActive`:

```typescript
className={`w-full flex items-center gap-2 px-2 py-1 text-sm rounded cursor-pointer transition-colors ${
  isActive
    ? "bg-purple-500/20 border-l-2 border-purple-500"
    : "hover:bg-slate-700"
}`}
```

- [ ] **Step 4: Remove trailing border separator**

Delete `<div className="border-t border-slate-700 my-2" />` at the bottom of the return.

- [ ] **Step 5: Verify in browser**

Click "All Projects" → should switch to `projects` multi-room view. Click a specific project → should switch to `project` view showing only that project's room. The tab bar should highlight "Projects" in both cases.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/ProjectSidebar.tsx
git commit -m "feat(sidebar): add All Projects entry with project zoom and active highlighting"
```

---

### Task 5: Redesign SessionSidebar

**Files:**
- Modify: `frontend/src/components/layout/SessionSidebar.tsx`

**Three changes:**
1. Replace collapse button with "Whole Office" button (collapse stays as nested icon)
2. Add "All Sessions" entry, individual session click → `zoomToSession(id)`, filter out `__all__`
3. Git Status only renders when `gitStatus !== null`

- [ ] **Step 1: Add new imports**

Add `Building2` to lucide-react imports. Add:

```typescript
import { useProjectStore, selectViewMode, selectActiveRoomKey } from "@/stores/projectStore";
import { useGameStore, selectGitStatus } from "@/stores/gameStore";
```

- [ ] **Step 2: Add store subscriptions**

After the `useTranslation` block:

```typescript
const viewMode = useProjectStore(selectViewMode);
const activeRoomKey = useProjectStore(selectActiveRoomKey);
const setViewMode = useProjectStore((s) => s.setViewMode);
const zoomToSession = useProjectStore((s) => s.zoomToSession);
const gitStatus = useGameStore(selectGitStatus);
const isWholeOfficeActive = viewMode === "office";
```

- [ ] **Step 3: Replace collapse toggle with Whole Office button**

When collapsed: keep original expand button. When expanded:

```tsx
<button
  onClick={() => setViewMode("office")}
  className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors ${
    isWholeOfficeActive
      ? "bg-purple-600 border-purple-500 text-white"
      : "bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
  }`}
>
  <Building2 size={14} />
  <span className="text-xs font-bold flex-1 text-left">{t("sidebar.wholeOffice")}</span>
  <span
    role="button"
    tabIndex={0}
    className="p-0.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
    title={t("sessions.collapseSidebar")}
    onClick={(e) => { e.stopPropagation(); onToggleCollapsed(); }}
    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onToggleCollapsed(); } }}
  >
    <PanelLeftClose size={14} />
  </span>
</button>
```

- [ ] **Step 4: Add "All Sessions" entry after sessions header**

```tsx
<div
  role="button"
  tabIndex={0}
  className={`mx-2 mt-2 flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
    viewMode === "sessions"
      ? "bg-amber-500/20 border-l-2 border-amber-500"
      : "hover:bg-slate-800/50"
  }`}
  onClick={() => setViewMode("sessions")}
  onKeyDown={(e) => e.key === "Enter" && setViewMode("sessions")}
>
  <Users size={10} className={viewMode === "sessions" ? "text-amber-400" : "text-slate-500"} />
  <span className={`text-xs font-bold ${viewMode === "sessions" ? "text-amber-300" : "text-slate-400"}`}>
    {t("sidebar.allSessions")}
  </span>
</div>
```

- [ ] **Step 5: Filter out `__all__` and update session click**

Change `sessions.map(...)` to `sessions.filter((s) => s.id !== "__all__").map(...)`.

Change session click from `onSessionSelect(session.id)` to:

```typescript
onClick={() => {
  onSessionSelect(session.id);
  zoomToSession(session.id);
}}
```

This both loads the session data (via existing onSessionSelect) AND sets the view mode to `"session"` with activeRoomKey.

- [ ] **Step 6: Update session item highlighting**

A session is active when it's the selected one in `"session"` view mode:

```typescript
const isActive = viewMode === "session" && activeRoomKey === session.id;
```

Remove all `isAllSessions` conditional branches since `__all__` is filtered out. Simplify to only purple active / default hover styles.

- [ ] **Step 7: Make Git Status conditional**

Wrap drag handle + GitStatusPanel in `{gitStatus && (<>...</>)}`.

Make sessions panel use `flex-grow` when no git status:

```tsx
className={`... ${gitStatus ? "flex-shrink-0" : "flex-grow"}`}
style={gitStatus ? { height: sessionsHeight } : undefined}
```

- [ ] **Step 8: Verify in browser**

- "Whole Office" button: purple when active, click → office view
- Collapse icon: collapses sidebar without switching view
- "All Sessions": amber when active, click → sessions multi-room view
- Individual session: click → loads session data AND shows only that session room, tab highlights "Sessions"
- Git Status: hidden when no data, sessions panel fills space

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/layout/SessionSidebar.tsx
git commit -m "feat(sidebar): add Whole Office button, All Sessions entry, session zoom, conditional Git Status"
```

---

### Task 6: Final QA verification

- [ ] **Step 1: Test full navigation flow**

1. Whole Office → single merged office (Office tab highlighted)
2. All Projects → all project rooms (Projects tab highlighted)
3. Click project → single project room (Projects tab still highlighted, back button appears)
4. Back button → returns to all projects
5. All Sessions → all session rooms (Sessions tab highlighted)
6. Click session → single session room (Sessions tab still highlighted, session data loads)
7. Canvas tabs and sidebar highlighting stay in sync at all times

- [ ] **Step 2: Test sidebar collapse/expand**

Collapse icon inside Whole Office button → sidebar collapses. Expand → restores. View mode unchanged.

- [ ] **Step 3: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix(sidebar): address QA issues from navigation redesign"
```
