"use client";

import {
  Activity,
  Play,
  RefreshCw,
  Bug,
  Trash2,
  HelpCircle,
  Settings,
  UserX,
  Sun,
  Moon,
  Monitor,
  Rocket,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "next-themes";
import { useTaskStore } from "@/stores/taskStore";
import { SpawnModal } from "@/components/tasks/SpawnModal";

// ============================================================================
// TYPES
// ============================================================================

interface HeaderControlsProps {
  isConnected: boolean;
  debugMode: boolean;
  aiSummaryEnabled: boolean | null;
  onSimulate: () => Promise<void>;
  onReset: () => void;
  onClearDB: () => void;
  onCleanupAgents: () => void;
  onToggleDebug: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Desktop-only header controls: action buttons (Simulate, Reset, Clear DB,
 * Debug, Settings, Help) and the connection/AI status display.
 *
 * Hidden on mobile — the MobileDrawer handles those actions instead.
 */
export function HeaderControls({
  isConnected,
  debugMode,
  aiSummaryEnabled,
  onSimulate,
  onReset,
  onClearDB,
  onCleanupAgents,
  onToggleDebug,
  onOpenSettings,
  onOpenHelp,
}: HeaderControlsProps): React.ReactNode {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [spawnOpen, setSpawnOpen] = useState(false);
  const aoConnected = useTaskStore((s) => s.connected);

  useEffect(() => setMounted(true), []);

  const themeOptions = [
    { value: "light" as const, icon: Sun, label: t("settings.light") },
    { value: "dark" as const, icon: Moon, label: t("settings.dark") },
    { value: "system" as const, icon: Monitor, label: t("settings.system") },
  ];

  const handleSpawn = async (projectId: string, issue: string) => {
    const res = await fetch("http://localhost:8000/api/v1/tasks/spawn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, issue }),
    });
    if (!res.ok) throw new Error("Spawn failed");
  };

  return (
    <div className="flex gap-4 items-center">
      {aoConnected && (
        <button
          onClick={() => setSpawnOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 border border-purple-500/30 rounded text-xs font-bold transition-colors"
        >
          <Rocket size={14} />
          SPAWN
        </button>
      )}

      <SpawnModal
        isOpen={spawnOpen}
        onClose={() => setSpawnOpen(false)}
        onSpawn={handleSpawn}
      />

      <button
        onClick={onSimulate}
        className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded text-xs font-bold transition-colors"
      >
        <Play size={14} fill="currentColor" />
        {t("header.simulate")}
      </button>

      <button
        onClick={onReset}
        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-xs font-bold transition-colors"
      >
        <RefreshCw size={14} />
        {t("header.reset")}
      </button>

      <button
        onClick={onClearDB}
        className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded text-xs font-bold transition-colors"
      >
        <Trash2 size={14} />
        {t("header.clearDb")}
      </button>

      <button
        onClick={onCleanupAgents}
        className="flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded text-xs font-bold transition-colors"
      >
        <UserX size={14} />
        {t("header.cleanupAgents")}
      </button>

      <button
        onClick={onToggleDebug}
        className={`flex items-center gap-2 px-3 py-1.5 border rounded text-xs font-bold transition-colors ${
          debugMode
            ? "bg-green-500/20 text-green-400 border-green-500/30"
            : "bg-slate-500/10 text-slate-400 border-slate-500/30 hover:bg-slate-500/20"
        }`}
      >
        <Bug size={14} />
        {debugMode ? t("header.debugOn") : t("header.debugOff")}
      </button>

      <div className="relative flex items-center bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 rounded-lg p-0.5">
        {/* Sliding pill indicator */}
        {mounted && (
          <div
            className="absolute top-0.5 bottom-0.5 rounded-md bg-white dark:bg-slate-600 shadow-sm transition-transform duration-200 ease-out"
            style={{
              width: `calc(${100 / themeOptions.length}% - 2px)`,
              transform: `translateX(calc(${themeOptions.findIndex((o) => o.value === theme)} * (100% + ${4 / (themeOptions.length - 0.5)}px)))`,
              marginLeft: 1,
            }}
          />
        )}
        {themeOptions.map(({ value, icon: Icon, label }) => {
          const isActive = mounted && theme === value;
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`relative z-10 flex items-center justify-center w-8 h-7 rounded-md text-xs transition-colors duration-200 ${
                isActive
                  ? "text-slate-900 dark:text-slate-100"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
              title={`${label} theme`}
              aria-label={`${label} theme`}
            >
              <Icon size={14} />
            </button>
          );
        })}
      </div>

      <button
        onClick={onOpenSettings}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors"
      >
        <Settings size={14} />
        {t("header.settings")}
      </button>

      <button
        onClick={onOpenHelp}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors"
      >
        <HelpCircle size={14} />
        {t("header.help")}
      </button>

      {/* Connection and AI status */}
      <div className="flex flex-col items-end border-l border-slate-200 dark:border-slate-800 pl-4">
        <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-widest leading-none mb-1">
          {t("header.status")}
        </span>
        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-1.5 font-mono text-xs ${
              isConnected ? "text-emerald-400" : "text-rose-500"
            }`}
          >
            <Activity
              size={12}
              className={isConnected ? "animate-pulse" : ""}
            />
            {isConnected ? t("header.connected") : t("header.disconnected")}
          </div>
          <div
            className={`flex items-center gap-1.5 font-mono text-xs ${
              aiSummaryEnabled ? "text-violet-400" : "text-slate-500"
            }`}
          >
            <span className="text-[10px]">AI</span>
            {aiSummaryEnabled ? t("header.aiOn") : t("header.aiOff")}
          </div>
        </div>
      </div>
    </div>
  );
}
