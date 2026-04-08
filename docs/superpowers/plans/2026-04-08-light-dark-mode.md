# Light/Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three-way (light/dark/system) theme switching to the Claude Office HTML UI, with Clean White/Slate palette for light mode.

**Architecture:** `next-themes` ThemeProvider manages the `dark` class on `<html>`. Tailwind v4's `dark:` variant handles all color switching. Theme state lives in localStorage only (no backend). PixiJS canvas is unaffected.

**Tech Stack:** next-themes, Tailwind CSS v4 (`@custom-variant`), lucide-react icons

**Spec:** `docs/superpowers/specs/2026-04-08-light-dark-mode-design.md`

---

### Task 1: Install next-themes and configure ThemeProvider

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Install next-themes**

```bash
cd frontend && npm install next-themes
```

- [ ] **Step 2: Add class-based dark mode variant to globals.css**

In `frontend/src/app/globals.css`, add at the top after `@import "tailwindcss";`:

```css
@custom-variant dark (&:where(.dark, .dark *));
```

- [ ] **Step 3: Wrap app in ThemeProvider in layout.tsx**

Since `layout.tsx` is a server component, the `ThemeProvider` (which needs `"use client"`) must live in a separate client component.

Create file `frontend/src/components/Providers.tsx`:

```tsx
"use client";

import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" storageKey="claude-office-theme">
      {children}
    </ThemeProvider>
  );
}
```

Then in `layout.tsx`, import and use it:

```tsx
import { Providers } from "@/components/Providers";

// In the body:
<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
  <Providers>{children}</Providers>
</body>
```

- [ ] **Step 4: Verify dev server starts without errors**

```bash
cd frontend && npm run dev
```

Open browser, check console for errors. The app should look the same (default is light, but all classes are still dark-only — this is expected at this stage).

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/app/layout.tsx frontend/src/app/globals.css frontend/src/components/Providers.tsx
git commit -m "feat: add next-themes ThemeProvider and Tailwind dark variant config"
```

---

### Task 2: Add i18n keys for theme settings

**Files:**
- Modify: `frontend/src/i18n/en.ts`
- Modify: `frontend/src/i18n/pt-BR.ts`
- Modify: `frontend/src/i18n/es.ts`

- [ ] **Step 1: Add English keys**

Add these entries to the settings section of `frontend/src/i18n/en.ts` (after the existing `"settings.language"` entry):

```ts
"settings.theme": "Theme",
"settings.light": "Light",
"settings.dark": "Dark",
"settings.system": "System",
```

- [ ] **Step 2: Add Portuguese translations**

Add to `frontend/src/i18n/pt-BR.ts`:

```ts
"settings.theme": "Tema",
"settings.light": "Claro",
"settings.dark": "Escuro",
"settings.system": "Sistema",
```

- [ ] **Step 3: Add Spanish translations**

Add to `frontend/src/i18n/es.ts`:

```ts
"settings.theme": "Tema",
"settings.light": "Claro",
"settings.dark": "Oscuro",
"settings.system": "Sistema",
```

- [ ] **Step 4: Run typecheck to verify keys are consistent**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/i18n/
git commit -m "feat: add i18n keys for theme settings"
```

---

### Task 3: Add theme toggle to HeaderControls

**Files:**
- Modify: `frontend/src/components/layout/HeaderControls.tsx`

- [ ] **Step 1: Add theme cycle button**

Import `useTheme` and icons at the top of `HeaderControls.tsx`:

```tsx
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
```

Inside the component, before the return:

```tsx
const { theme, setTheme } = useTheme();

const cycleTheme = () => {
  if (theme === "light") setTheme("dark");
  else if (theme === "dark") setTheme("system");
  else setTheme("light");
};

const ThemeIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
const themeLabel = theme === "dark" ? "Dark" : theme === "light" ? "Light" : "System";
```

Add the button before the Settings button (around line 101):

```tsx
<button
  onClick={cycleTheme}
  className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors"
  title={`Theme: ${themeLabel}`}
>
  <ThemeIcon size={14} />
</button>
```

- [ ] **Step 2: Verify button renders and cycles themes**

Run dev server, click the button, verify `<html>` class toggles between having/not having `dark`. Check browser DevTools → Elements tab → `<html>` element.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/layout/HeaderControls.tsx
git commit -m "feat: add theme cycle button to header controls"
```

---

### Task 4: Add theme section to SettingsModal

**Files:**
- Modify: `frontend/src/components/overlay/SettingsModal.tsx`

- [ ] **Step 1: Add theme radio group to SettingsModal**

Import `useTheme` at the top:

```tsx
import { useTheme } from "next-themes";
```

Inside the component, add:

```tsx
const { theme, setTheme } = useTheme();
```

Add a new Theme section as the first item inside `<div className="space-y-6">`, before the Language section:

```tsx
{/* Theme */}
<div>
  <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-3">
    {t("settings.theme")}
  </label>
  <div
    className="flex gap-3"
    role="radiogroup"
    aria-label={t("settings.theme")}
  >
    {(["light", "dark", "system"] as const).map((value) => (
      <button
        key={value}
        type="button"
        role="radio"
        aria-checked={theme === value}
        tabIndex={theme === value ? 0 : -1}
        onClick={() => setTheme(value)}
        onKeyDown={(e) => {
          const values = ["light", "dark", "system"] as const;
          const parent = e.currentTarget.parentElement;
          if (!parent) return;
          const buttons = Array.from(parent.children) as HTMLElement[];
          const idx = buttons.indexOf(e.currentTarget);
          let nextIdx: number | null = null;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            nextIdx = (idx + 1) % values.length;
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            nextIdx = (idx - 1 + values.length) % values.length;
          }
          if (nextIdx !== null) {
            setTheme(values[nextIdx]);
            buttons[nextIdx].focus();
          }
        }}
        className={`flex-1 px-4 py-3 rounded-lg border text-sm font-bold transition-colors focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 outline-none ${
          theme === value
            ? "bg-purple-500/20 border-purple-500 text-purple-300"
            : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
        }`}
      >
        {t(`settings.${value}` as const)}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 2: Verify settings modal shows theme selector and it works**

Open Settings modal, verify Theme radio group appears at top. Click each option, verify `<html>` class changes accordingly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/overlay/SettingsModal.tsx
git commit -m "feat: add theme selector to settings modal"
```

---

### Task 5: Update globals.css scrollbar colors

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Add light-mode scrollbar styles**

Replace the current scrollbar styles in `globals.css` with light/dark variants:

```css
@layer utilities {
  /* PixiJS Canvas Scaling */
  .pixi-canvas-container canvas {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain;
  }

  /* Custom Scrollbar Theme - Light */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: #cbd5e1; /* slate-300 */
    border-radius: 10px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #f97316; /* orange-500 */
    border: 2px solid transparent;
    background-clip: padding-box;
  }

  /* Custom Scrollbar Theme - Dark */
  .dark ::-webkit-scrollbar-thumb {
    background: #1e293b; /* slate-800 */
  }

  .dark ::-webkit-scrollbar-thumb:hover {
    background: #f97316; /* orange-500 */
  }

  /* Firefox - Light */
  * {
    scrollbar-width: thin;
    scrollbar-color: #cbd5e1 transparent;
  }

  /* Firefox - Dark */
  .dark * {
    scrollbar-color: #1e293b transparent;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat: add light/dark scrollbar theme variants"
```

---

### Task 6: Migrate Modal.tsx colors

**Files:**
- Modify: `frontend/src/components/overlay/Modal.tsx`

- [ ] **Step 1: Update Modal color classes**

Apply the color mapping to `Modal.tsx`. Each dark class gets a light counterpart:

| Current | Updated |
|---------|---------|
| `bg-slate-900` | `bg-white dark:bg-slate-900` |
| `border-slate-800` | `border-slate-200 dark:border-slate-800` |
| `bg-slate-900/50` | `bg-slate-50/50 dark:bg-slate-900/50` |
| `text-white` (title) | `text-slate-900 dark:text-white` |
| `hover:bg-slate-800` | `hover:bg-slate-100 dark:hover:bg-slate-800` |
| `text-slate-400` (close btn) | `text-slate-500 dark:text-slate-400` |
| `hover:text-white` | `hover:text-slate-900 dark:hover:text-white` |
| `text-slate-300` (content) | `text-slate-700 dark:text-slate-300` |

The full updated JSX for the dialog div (line 47):

```tsx
className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200"
```

Header div (line 51):

```tsx
className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"
```

Title h2 (line 54):

```tsx
className="text-lg font-bold text-slate-900 dark:text-white tracking-tight"
```

Close button (line 61):

```tsx
className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
```

Content div (line 68):

```tsx
className="px-6 py-6 text-slate-700 dark:text-slate-300 text-sm leading-relaxed"
```

Footer div (line 74):

```tsx
className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50"
```

- [ ] **Step 2: Run typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/overlay/Modal.tsx
git commit -m "feat: add light/dark theme colors to Modal component"
```

---

### Task 7: Migrate page.tsx colors

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Update all hardcoded dark colors in page.tsx**

Key mappings for this file:

| Current | Updated |
|---------|---------|
| `bg-neutral-950` | `bg-slate-50 dark:bg-neutral-950` |
| `bg-slate-900` | `bg-slate-50 dark:bg-slate-900` |
| `bg-slate-800` | `bg-slate-100 dark:bg-slate-800` |
| `border-slate-800` | `border-slate-200 dark:border-slate-800` |
| `border-slate-700` | `border-slate-300 dark:border-slate-700` |
| `text-white` | `text-slate-900 dark:text-white` |
| `text-slate-400` | `text-slate-500 dark:text-slate-400` |
| `text-slate-300` | `text-slate-700 dark:text-slate-300` |
| `text-slate-500` | `text-slate-400 dark:text-slate-500` |

Read the full file, find every instance of `bg-slate-`, `text-slate-`, `border-slate-`, `bg-neutral-`, and apply the mapping table. Also update the modal button classes (`bg-slate-700 hover:bg-slate-600` → `bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600`).

The `LoadingFallback` component:

```tsx
className="w-full h-full bg-slate-100 dark:bg-slate-900 animate-pulse flex items-center justify-center text-slate-900 dark:text-white font-mono text-center"
```

Main container (line 240):

```tsx
className="flex h-screen flex-col bg-slate-100 dark:bg-neutral-950 p-2 overflow-hidden relative"
```

- [ ] **Step 2: Run typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: add light/dark theme colors to main page"
```

---

### Task 8: Migrate SettingsModal.tsx colors

**Files:**
- Modify: `frontend/src/components/overlay/SettingsModal.tsx`

- [ ] **Step 1: Update all color classes in SettingsModal**

Apply the mapping table. Key patterns:

| Current | Updated |
|---------|---------|
| `bg-slate-700 hover:bg-slate-600` (close btn) | `bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600` |
| `text-slate-400` (labels) | `text-slate-500 dark:text-slate-400` |
| `bg-purple-500/20 border-purple-500 text-purple-300` (active) | keep as-is (accent colors work in both) |
| `bg-slate-800 border-slate-700 text-slate-400` (inactive) | `bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400` |
| `hover:border-slate-600` | `hover:border-slate-400 dark:hover:border-slate-600` |
| `bg-slate-800 border-slate-700` (switch bg) | `bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700` |
| `text-slate-300` | `text-slate-700 dark:text-slate-300` |
| `text-slate-500` (desc) | `text-slate-400 dark:text-slate-500` |
| `border-slate-800` (dividers) | `border-slate-200 dark:border-slate-800` |
| `focus-visible:ring-offset-slate-900` | `focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900` |

Close button in footer:

```tsx
className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-sm font-bold rounded-lg transition-colors"
```

- [ ] **Step 2: Run typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/overlay/SettingsModal.tsx
git commit -m "feat: add light/dark theme colors to SettingsModal"
```

---

### Task 9: Migrate sidebar components

**Files:**
- Modify: `frontend/src/components/layout/SessionSidebar.tsx`
- Modify: `frontend/src/components/layout/ProjectSidebar.tsx`
- Modify: `frontend/src/components/layout/RightSidebar.tsx`

- [ ] **Step 1: Update SessionSidebar.tsx colors**

Read `SessionSidebar.tsx` fully. Apply the standard mapping table to all ~17 occurrences. Key patterns:

- Panel backgrounds: `bg-slate-900` → `bg-slate-50 dark:bg-slate-900`
- Borders: `border-slate-800` → `border-slate-200 dark:border-slate-800`
- Text: `text-slate-300` → `text-slate-700 dark:text-slate-300`
- Hover states: `hover:bg-slate-800` → `hover:bg-slate-100 dark:hover:bg-slate-800`
- Active items retain their accent colors (purple, etc.)

- [ ] **Step 2: Update ProjectSidebar.tsx colors**

Read `ProjectSidebar.tsx` fully. Apply same mapping to ~6 occurrences.

- [ ] **Step 3: Update RightSidebar.tsx colors**

Read `RightSidebar.tsx` fully. Apply same mapping to ~5 occurrences. The drag handle/divider colors also need updating.

- [ ] **Step 4: Run typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout/SessionSidebar.tsx frontend/src/components/layout/ProjectSidebar.tsx frontend/src/components/layout/RightSidebar.tsx
git commit -m "feat: add light/dark theme colors to sidebar components"
```

---

### Task 10: Migrate mobile layout components

**Files:**
- Modify: `frontend/src/components/layout/MobileDrawer.tsx`
- Modify: `frontend/src/components/layout/MobileAgentActivity.tsx`

- [ ] **Step 1: Update MobileDrawer.tsx colors**

Read `MobileDrawer.tsx` fully. Apply standard mapping to ~7 occurrences. Same patterns as sidebars.

- [ ] **Step 2: Update MobileAgentActivity.tsx colors**

Read `MobileAgentActivity.tsx` fully. Apply standard mapping to ~9 occurrences.

- [ ] **Step 3: Run typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/MobileDrawer.tsx frontend/src/components/layout/MobileAgentActivity.tsx
git commit -m "feat: add light/dark theme colors to mobile components"
```

---

### Task 11: Migrate game UI components (EventLog, AgentStatus, etc.)

**Files:**
- Modify: `frontend/src/components/game/EventLog.tsx`
- Modify: `frontend/src/components/game/EventDetailModal.tsx`
- Modify: `frontend/src/components/game/AgentStatus.tsx`
- Modify: `frontend/src/components/game/ConversationHistory.tsx`
- Modify: `frontend/src/components/game/GitStatusPanel.tsx`

- [ ] **Step 1: Update EventLog.tsx colors (~8 occurrences)**

Read fully. Apply standard mapping. Key: the `bg-slate-950` main bg → `bg-white dark:bg-slate-950`, header `bg-slate-900` → `bg-slate-50 dark:bg-slate-900`.

- [ ] **Step 2: Update EventDetailModal.tsx colors (~18 occurrences)**

Read fully. Apply standard mapping. This is a detail modal, uses same patterns as Modal.

- [ ] **Step 3: Update AgentStatus.tsx colors (~16 occurrences)**

Read fully. Apply standard mapping. Agent status badges and state indicators — accent colors (green, amber, etc.) stay the same.

- [ ] **Step 4: Update ConversationHistory.tsx colors (~19 occurrences)**

Read fully. Apply standard mapping. Message bubbles and conversation UI.

- [ ] **Step 5: Update GitStatusPanel.tsx colors (~15 occurrences)**

Read fully. Apply standard mapping. Git diff colors (green/red for additions/deletions) stay as-is.

- [ ] **Step 6: Run typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/game/EventLog.tsx frontend/src/components/game/EventDetailModal.tsx frontend/src/components/game/AgentStatus.tsx frontend/src/components/game/ConversationHistory.tsx frontend/src/components/game/GitStatusPanel.tsx
git commit -m "feat: add light/dark theme colors to game UI components"
```

---

### Task 12: Migrate remaining components

**Files:**
- Modify: `frontend/src/components/game/ZoomControls.tsx`
- Modify: `frontend/src/components/game/LoadingScreen.tsx`
- Modify: `frontend/src/components/layout/HeaderControls.tsx` (border color in status section)
- Modify: `frontend/src/components/layout/StatusToast.tsx`

- [ ] **Step 1: Update ZoomControls.tsx colors (~3 occurrences)**

Read fully. Apply standard mapping. These are floating controls over the canvas.

- [ ] **Step 2: Update LoadingScreen.tsx colors**

Read fully. Apply standard mapping. Loading state should match the current theme.

- [ ] **Step 3: Update HeaderControls.tsx remaining colors**

The status section divider: `border-slate-800` → `border-slate-200 dark:border-slate-800`. The `text-slate-500` label → `text-slate-400 dark:text-slate-500`.

- [ ] **Step 4: Update StatusToast.tsx if it has hardcoded dark colors**

Read fully. Apply standard mapping if needed.

- [ ] **Step 5: Run full checkall**

```bash
cd frontend && npm run lint && npm run typecheck
```

Expected: all lint, typecheck, and tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/game/ZoomControls.tsx frontend/src/components/game/LoadingScreen.tsx frontend/src/components/layout/HeaderControls.tsx frontend/src/components/layout/StatusToast.tsx
git commit -m "feat: add light/dark theme colors to remaining components"
```

---

### Task 13: Visual QA and final polish

- [ ] **Step 1: Test light mode**

Open the app, set theme to Light. Check every panel:
- Left sidebar (sessions list, project list)
- Main header
- Right sidebar (event log, agent status, conversation history)
- Settings modal
- Help modal
- Clear DB confirmation modal
- Mobile layout (resize browser to < 768px)

Verify: no unreadable text, no invisible borders, no jarring contrast issues.

- [ ] **Step 2: Test dark mode**

Switch to Dark. Verify everything looks identical to the current app (regression check).

- [ ] **Step 3: Test system mode**

Switch to System. Change OS appearance. Verify it follows.

- [ ] **Step 4: Test persistence**

Set theme to Dark, refresh page. Verify it stays Dark (no flash to light).

- [ ] **Step 5: Fix any visual issues found**

If any component looks wrong, fix it and commit individually.

- [ ] **Step 6: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: polish light/dark theme visual issues"
```
