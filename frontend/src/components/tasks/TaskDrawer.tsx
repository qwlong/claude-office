"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useTaskStore, selectTasksByProject, selectActiveTaskCount } from "@/stores/taskStore";
import { TaskList } from "./TaskList";
import { SpawnModal } from "./SpawnModal";

const MIN_HEIGHT = 150;
const MAX_HEIGHT_RATIO = 0.5;

export function TaskDrawer() {
  const connected = useTaskStore((s) => s.connected);
  const tasks = useTaskStore((s) => s.tasks);
  const drawerOpen = useTaskStore((s) => s.drawerOpen);
  const drawerHeight = useTaskStore((s) => s.drawerHeight);
  const toggleDrawer = useTaskStore((s) => s.toggleDrawer);
  const setDrawerHeight = useTaskStore((s) => s.setDrawerHeight);
  const activeCount = useTaskStore(selectActiveTaskCount);
  const tasksByProject = useTaskStore(selectTasksByProject);

  const [spawnOpen, setSpawnOpen] = useState(false);

  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Don't render if not connected and no tasks
  if (!connected && tasks.length === 0) return null;

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = drawerHeight;
  };

  const handleSpawn = async (projectId: string, issue: string) => {
    const res = await fetch("http://localhost:8000/api/v1/tasks/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, issue }),
    });
    if (!res.ok) throw new Error("Spawn failed");
  };

  // Drag handlers
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
      const delta = startYRef.current - e.clientY;
      const newHeight = Math.max(
        MIN_HEIGHT,
        Math.min(maxH, startHeightRef.current + delta),
      );
      setDrawerHeight(newHeight);
    };
    const handleMouseUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [setDrawerHeight]);

  return (
    <>
      <div
        className="absolute bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 z-20 flex flex-col"
        style={{ height: drawerOpen ? drawerHeight : 36 }}
      >
        {/* Drag handle */}
        {drawerOpen && (
          <div
            className="h-1.5 cursor-ns-resize bg-slate-700 hover:bg-slate-600 transition-colors flex-shrink-0"
            onMouseDown={handleDragStart}
          />
        )}

        {/* Title bar */}
        <div className="flex items-center justify-between px-3 py-1.5 flex-shrink-0 bg-slate-800/80">
          <button
            onClick={toggleDrawer}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors"
          >
            {drawerOpen ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronUp size={14} />
            )}
            <span className="font-bold">Tasks</span>
            {activeCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-purple-600 text-white rounded-full">
                {activeCount}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2">
            {connected && (
              <button
                onClick={() => setSpawnOpen(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
              >
                <Plus size={12} />
                Spawn
              </button>
            )}
            {!connected && (
              <span className="text-xs text-slate-500">Not connected</span>
            )}
            {connected && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Connected
              </span>
            )}
          </div>
        </div>

        {/* Content */}
        {drawerOpen && (
          <div className="flex-1 overflow-y-auto px-2 py-1">
            <TaskList tasksByProject={tasksByProject} />
          </div>
        )}
      </div>

      <SpawnModal
        isOpen={spawnOpen}
        onClose={() => setSpawnOpen(false)}
        onSpawn={handleSpawn}
      />
    </>
  );
}
