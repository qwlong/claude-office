# Light/Dark Mode Design Spec

## Overview

Add light/dark mode theming to the Claude Office Visualizer HTML UI. The PixiJS canvas (pixel art office scene) is unaffected — only the surrounding chrome (sidebars, modals, headers, event log, etc.) switches between light and dark palettes.

## Decisions

- **Scope:** HTML/Tailwind UI only. PixiJS canvas stays as-is.
- **Toggle:** Three-way — Light / Dark / System (follows OS `prefers-color-scheme`).
- **Default:** `light` for first-time visitors.
- **Palette:** Clean White / Slate (Tailwind `slate` color scale on both ends).
- **Approach:** Tailwind `dark:` class variant + `next-themes` library.
- **Accent colors unchanged:** `purple-500`, `orange-500`, `green-500` work well on both light and dark backgrounds.

## Architecture

### Theme Provider

`next-themes` `ThemeProvider` wraps the app in `layout.tsx`:

```tsx
<ThemeProvider attribute="class" defaultTheme="light" storageKey="claude-office-theme">
  {children}
</ThemeProvider>
```

- Manages `dark` class on `<html>`
- Persists to `localStorage` under `claude-office-theme`
- Listens to `prefers-color-scheme` for System mode
- Injects blocking script to prevent flash on load

### State Management

Theme state is managed entirely by `next-themes`, separate from the existing `preferencesStore` / backend API. Theme is a pure frontend concern.

Components access theme via `useTheme()` from `next-themes`:
- `theme` — current resolved theme (`"light"` | `"dark"`)
- `setTheme(value)` — set to `"light"` | `"dark"` | `"system"`
- `resolvedTheme` — actual applied theme when mode is `"system"`

### Data Flow

```
next-themes ThemeProvider
  → reads localStorage + prefers-color-scheme
  → sets/removes "dark" class on <html>
  → Tailwind dark: variants activate automatically
  → components read/write via useTheme()
```

## UI Changes

### Header Quick Toggle (HeaderControls.tsx)

- New icon button next to existing controls
- Cycles: light → dark → system → light
- Icons from `lucide-react` (already a dependency):
  - Light mode: `Sun`
  - Dark mode: `Moon`
  - System mode: `Monitor`

### Settings Modal (SettingsModal.tsx)

- New "Theme" section at the top (above Language)
- Three radio buttons: Light / Dark / System
- Same style as existing Clock Type radio group
- New i18n keys: `settings.theme`, `settings.light`, `settings.dark`, `settings.system`

### Color Mapping

| Dark (current) | Light (new) | Usage |
|---|---|---|
| `bg-slate-950` | `bg-white` | Panel main background |
| `bg-slate-900` | `bg-slate-50` | Secondary background, header |
| `bg-slate-800` | `bg-slate-100` | Card, input backgrounds |
| `border-slate-800` | `border-slate-200` | Primary dividers |
| `border-slate-700` | `border-slate-300` | Secondary borders |
| `text-slate-100` | `text-slate-900` | Primary text |
| `text-slate-300` | `text-slate-700` | Secondary text |
| `text-slate-400` | `text-slate-500` | Label/helper text |
| `text-slate-500` | `text-slate-400` | Weakest text |
| `text-slate-600` | `text-slate-400` | Placeholder text |

Each occurrence becomes: `bg-white dark:bg-slate-950`, `text-slate-900 dark:text-slate-100`, etc.

Light value first (default), dark value with `dark:` prefix (override).

### Scrollbar (globals.css)

Update custom scrollbar colors with light/dark variants using `.dark` selector or `prefers-color-scheme`.

## Files to Modify

| File | Changes |
|---|---|
| `frontend/package.json` | Add `next-themes` dependency |
| `frontend/src/app/layout.tsx` | Wrap in `ThemeProvider` |
| `frontend/src/app/globals.css` | Scrollbar light/dark variants |
| `frontend/src/app/page.tsx` | ~23 color class updates |
| `frontend/src/components/layout/HeaderControls.tsx` | Theme toggle button + ~6 color updates |
| `frontend/src/components/overlay/SettingsModal.tsx` | Theme section + ~13 color updates |
| `frontend/src/components/overlay/Modal.tsx` | ~5 color updates |
| `frontend/src/components/layout/SessionSidebar.tsx` | ~17 color updates |
| `frontend/src/components/layout/ProjectSidebar.tsx` | ~6 color updates |
| `frontend/src/components/layout/RightSidebar.tsx` | ~5 color updates |
| `frontend/src/components/layout/MobileDrawer.tsx` | ~7 color updates |
| `frontend/src/components/layout/MobileAgentActivity.tsx` | ~9 color updates |
| `frontend/src/components/game/EventLog.tsx` | ~8 color updates |
| `frontend/src/components/game/EventDetailModal.tsx` | ~18 color updates |
| `frontend/src/components/game/AgentStatus.tsx` | ~16 color updates |
| `frontend/src/components/game/ConversationHistory.tsx` | ~19 color updates |
| `frontend/src/components/game/GitStatusPanel.tsx` | ~15 color updates |
| `frontend/src/components/game/ZoomControls.tsx` | ~3 color updates |
| `frontend/src/components/game/LoadingScreen.tsx` | Color updates |
| `frontend/src/i18n/index.ts` | New theme-related i18n keys |

## Boundary Conditions

- **SSR flash prevention:** `next-themes` injects a blocking script; `defaultTheme="light"` ensures no-JS fallback is light
- **System mode OS switch:** `next-themes` monitors `prefers-color-scheme` changes in real-time
- **localStorage cleared:** Falls back to `light` default
- **PixiJS overlay elements** (ZoomControls, LoadingScreen): These are HTML elements floating over the canvas — they follow the theme

## Out of Scope

- PixiJS canvas colors (floor, walls, sky, sprites)
- Backend changes
- `preferencesStore` modifications (theme is managed by `next-themes` independently)
- Accent color adjustments
- New unit tests (pure styling change; validated by lint/typecheck + manual review)
