# Fullscreen Mode Design

## Goal

一键隐藏 header、左侧 sidebar、右侧 sidebar，只保留 office canvas。鼠标悬停到边缘时浮出对应面板。

## Design

### State

`page.tsx` 新增：
- `isFullscreen: boolean` — 全屏模式开关

不需要额外的 hover state — 用现有的 header collapse 逻辑 + CSS group-hover。

### 触发

HeaderControls 右侧加一个全屏按钮（`Maximize2` 图标）。

### 全屏行为

当 `isFullscreen = true`：

1. **Header** — 完全隐藏，顶部边缘留一个 drag handle 条（跟现在 headerCollapsed 的行为一样），hover 上去浮出 header
2. **Left sidebar** — 完全隐藏，左侧边缘留一个 8px 透明 hover zone，hover 时 sidebar 以 `fixed` 浮出
3. **Right sidebar** — 完全隐藏，右侧边缘留一个 8px 透明 hover zone，hover 时 sidebar 以 `fixed` 浮出
4. **Canvas** — 占满整个区域

### 退出全屏

- 浮出的 header 里全屏按钮变成退出按钮（`Minimize2` 图标）
- 快捷键 `Escape` 退出

### 实现细节

- `isFullscreen` 时设 `headerCollapsed = true`
- Left sidebar: `isFullscreen` 时 wrapper div 加 `hidden`，左侧加 hover zone `<div className="fixed left-0 top-0 bottom-0 w-2 z-40 group">` 包裹浮出的 sidebar
- Right sidebar: 同理右侧
- 浮出面板用 `opacity-0 group-hover:opacity-100` + `pointer-events-none group-hover:pointer-events-auto` + `transition-opacity`

### 文件影响

| 文件 | 改动 |
|------|------|
| `frontend/src/app/page.tsx` | 加 `isFullscreen` state，条件隐藏 sidebar，加 hover zones |
| `frontend/src/components/layout/HeaderControls.tsx` | 加全屏/退出按钮 |
