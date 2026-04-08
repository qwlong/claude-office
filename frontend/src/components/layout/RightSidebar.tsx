"use client";

import { useState, useMemo } from "react";
import { AgentStatus } from "@/components/game/AgentStatus";
import { EventLog } from "@/components/game/EventLog";
import { ConversationHistory } from "@/components/game/ConversationHistory";
import { TaskList } from "@/components/tasks/TaskList";
import { SpawnModal } from "@/components/tasks/SpawnModal";
import { useDragResize } from "@/hooks/useDragResize";
import { useTranslation } from "@/hooks/useTranslation";
import { useTaskStore, selectActiveTaskCount } from "@/stores/taskStore";
import type { Task } from "@/types/tasks";

// ============================================================================
// CONSTANTS
// ============================================================================

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 320; // equivalent to w-80
const AGENT_PANEL_MIN_HEIGHT = 60;
const AGENT_PANEL_DEFAULT_HEIGHT = 240;

/** Max height is 70% of viewport to prevent overflow on smaller screens */
const getMaxPanelHeight = () => Math.floor(window.innerHeight * 0.7);

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Desktop right sidebar containing the AgentStatus panel and a tabbed
 * Events / Conversation panel below it. Supports drag-to-resize both the
 * sidebar width (left edge) and the split between the two panels (divider).
 */
export function RightSidebar(): React.ReactNode {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"events" | "conversation" | "tasks">(
    "events",
  );
  const aoConnected = useTaskStore((s) => s.connected);
  const tasks = useTaskStore((s) => s.tasks);
  const activeTaskCount = useTaskStore(selectActiveTaskCount);
  const tasksByProject = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const task of tasks) {
      if (!grouped[task.projectKey]) grouped[task.projectKey] = [];
      grouped[task.projectKey].push(task);
    }
    return grouped;
  }, [tasks]);
  const [spawnOpen, setSpawnOpen] = useState(false);

  const handleSpawn = async (projectId: string, issue: string) => {
    const res = await fetch("http://localhost:8000/api/v1/tasks/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, issue }),
    });
    if (!res.ok) throw new Error("Spawn failed");
  };

  const {
    size: sidebarWidth,
    isDragging: isWidthDragging,
    handleDragStart: handleWidthDragStart,
  } = useDragResize({
    initialSize: SIDEBAR_DEFAULT_WIDTH,
    minSize: SIDEBAR_MIN_WIDTH,
    maxSize: SIDEBAR_MAX_WIDTH,
    direction: "horizontal",
    edge: "left", // Left edge: dragging left increases width
  });

  const {
    size: agentPanelHeight,
    isDragging: isHeightDragging,
    handleDragStart: handleHeightDragStart,
  } = useDragResize({
    initialSize: AGENT_PANEL_DEFAULT_HEIGHT,
    minSize: AGENT_PANEL_MIN_HEIGHT,
    maxSize: getMaxPanelHeight,
    direction: "vertical",
    edge: "down",
  });

  const isDragging = isWidthDragging || isHeightDragging;

  return (
    <>
    <aside
      className={`relative flex flex-col gap-2 flex-shrink-0 overflow-hidden ${
        isDragging ? "select-none" : ""
      }`}
      style={{ width: sidebarWidth }}
    >
      {/* Horizontal Resize Handle (left edge) */}
      <div
        className="absolute left-0 top-0 w-1.5 h-full cursor-ew-resize z-10 hover:bg-purple-500/40 active:bg-purple-500/60 transition-colors"
        onMouseDown={handleWidthDragStart}
        title={t("sessions.dragToResize")}
      />

      {/* Agent Status */}
      <div
        className="min-h-0 flex-shrink-0"
        style={{ height: agentPanelHeight }}
      >
        <AgentStatus />
      </div>

      {/* Vertical Resize Handle (agent status ↕ events) */}
      <div
        className="flex-shrink-0 h-3 cursor-ns-resize flex items-center justify-center group -my-1"
        onMouseDown={handleHeightDragStart}
        title={t("sessions.dragToResize")}
      >
        <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700 group-hover:bg-purple-500 group-active:bg-purple-400 transition-colors" />
      </div>

      {/* Events / Conversation tab panel */}
      <div className="min-h-0 flex flex-col flex-grow">
        {/* Tab header */}
        <div className="flex border-b border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-t-lg flex-shrink-0">
          <button
            onClick={() => setActiveTab("events")}
            className={`flex-1 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors rounded-tl-lg ${
              activeTab === "events"
                ? "text-orange-400 border-b-2 border-orange-500 bg-white/50 dark:bg-slate-950/50"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t("sidebar.events")}
          </button>
          <button
            onClick={() => setActiveTab("conversation")}
            className={`flex-1 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              activeTab === "conversation"
                ? "text-cyan-400 border-b-2 border-cyan-500 bg-white/50 dark:bg-slate-950/50"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t("sidebar.conversation")}
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex-1 px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors rounded-tr-lg ${
              activeTab === "tasks"
                ? "text-purple-400 border-b-2 border-purple-500 bg-white/50 dark:bg-slate-950/50"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Tasks
            {activeTaskCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[9px] bg-purple-600 text-white rounded-full">
                {activeTaskCount}
              </span>
            )}
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-grow min-h-0">
          {activeTab === "events" && <EventLog />}
          {activeTab === "conversation" && <ConversationHistory />}
          {activeTab === "tasks" && (
            <div className="h-full flex flex-col bg-white dark:bg-slate-900 rounded-b-lg">
              {/* Spawn button + status */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-500">
                  {aoConnected ? (
                    <span className="text-emerald-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      AO Connected
                    </span>
                  ) : (
                    "AO Not Connected"
                  )}
                </span>
                {aoConnected && (
                  <button
                    onClick={() => setSpawnOpen(true)}
                    className="px-2 py-1 text-[10px] font-bold bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
                  >
                    + SPAWN
                  </button>
                )}
              </div>
              {/* Task list */}
              <div className="flex-1 overflow-y-auto px-1 py-1">
                <TaskList tasksByProject={tasksByProject} />
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>

    <SpawnModal
      isOpen={spawnOpen}
      onClose={() => setSpawnOpen(false)}
      onSpawn={handleSpawn}
    />
    </>
  );
}
