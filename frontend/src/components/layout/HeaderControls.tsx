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
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useTheme } from "next-themes";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useTaskStore } from "@/stores/taskStore";
import { SpawnModal } from "@/components/tasks/SpawnModal";
import { API_BASE_URL } from "@/config";

// ============================================================================
// TYPES
// ============================================================================

interface HeaderControlsProps {
  isConnected: boolean;
  debugMode: boolean;
  aiSummaryEnabled: boolean | null;
  isFullscreen?: boolean;
  onSimulate: () => Promise<void>;
  onReset: () => void;
  onClearDB: () => void;
  onCleanupAgents: () => void;
  onToggleDebug: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onToggleFullscreen?: () => void;
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
  isFullscreen,
  onSimulate,
  onReset,
  onClearDB,
  onCleanupAgents,
  onToggleDebug,
  onOpenSettings,
  onOpenHelp,
  onToggleFullscreen,
}: HeaderControlsProps): React.ReactNode {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
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
    const res = await fetch(`${API_BASE_URL}/api/v1/tasks/spawn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, issue }),
    });
    if (!res.ok) throw new Error("Spawn failed");
  };

  return (
    <div className="flex gap-2 items-center flex-nowrap flex-shrink min-w-0">
      {aoConnected && (
        <button
          onClick={() => setSpawnOpen(true)}
          className="group relative flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-500 border border-purple-500/30 rounded text-xs font-bold transition-colors"
        >
          <Rocket size={14} />
          <span className="xl:static xl:opacity-100 xl:bg-transparent xl:text-inherit xl:shadow-none xl:px-0 xl:py-0 xl:rounded-none xl:translate-x-0 xl:translate-y-0 xl:mt-0 absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-slate-900 text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-[10px] whitespace-nowrap z-50">
            {t("header.spawn")}
          </span>
        </button>
      )}

      <SpawnModal
        isOpen={spawnOpen}
        onClose={() => setSpawnOpen(false)}
        onSpawn={handleSpawn}
      />

      <button
        onClick={onSimulate}
        className="group relative flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
        title={t("header.simulate")}
      >
        <Play size={14} fill="currentColor" />
        <span className="xl:static xl:opacity-100 xl:bg-transparent xl:text-inherit xl:shadow-none xl:px-0 xl:py-0 xl:rounded-none xl:translate-x-0 xl:translate-y-0 xl:mt-0 absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-slate-900 text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-[10px] whitespace-nowrap z-50">
          {t("header.simulate")}
        </span>
      </button>

      <button
        onClick={onReset}
        className="group relative flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
        title={t("header.reset")}
      >
        <RefreshCw size={14} />
        <span className="xl:static xl:opacity-100 xl:bg-transparent xl:text-inherit xl:shadow-none xl:px-0 xl:py-0 xl:rounded-none xl:translate-x-0 xl:translate-y-0 xl:mt-0 absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-slate-900 text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-[10px] whitespace-nowrap z-50">
          {t("header.reset")}
        </span>
      </button>

      <button
        onClick={onClearDB}
        className="group relative flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
        title={t("header.clearDb")}
      >
        <Trash2 size={14} />
        <span className="xl:static xl:opacity-100 xl:bg-transparent xl:text-inherit xl:shadow-none xl:px-0 xl:py-0 xl:rounded-none xl:translate-x-0 xl:translate-y-0 xl:mt-0 absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-slate-900 text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-[10px] whitespace-nowrap z-50">
          {t("header.clearDb")}
        </span>
      </button>

      <button
        onClick={onCleanupAgents}
        className="group relative flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
        title={t("header.cleanupAgents")}
      >
        <UserX size={14} />
        <span className="xl:static xl:opacity-100 xl:bg-transparent xl:text-inherit xl:shadow-none xl:px-0 xl:py-0 xl:rounded-none xl:translate-x-0 xl:translate-y-0 xl:mt-0 absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-slate-900 text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-[10px] whitespace-nowrap z-50">
          {t("header.cleanupAgents")}
        </span>
      </button>

      <button
        onClick={onToggleDebug}
        className={`group relative flex items-center gap-2 px-3 py-1.5 border rounded text-xs font-bold transition-colors whitespace-nowrap ${
          debugMode
            ? "bg-green-500/20 text-green-400 border-green-500/30"
            : "bg-slate-500/10 text-slate-400 border-slate-500/30 hover:bg-slate-500/20"
        }`}
        title={debugMode ? t("header.debugOn") : t("header.debugOff")}
      >
        <Bug size={14} />
        <span className="xl:static xl:opacity-100 xl:bg-transparent xl:text-inherit xl:shadow-none xl:px-0 xl:py-0 xl:rounded-none xl:translate-x-0 xl:translate-y-0 xl:mt-0 absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-slate-900 text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-[10px] whitespace-nowrap z-50">
          {debugMode ? t("header.debugOn") : t("header.debugOff")}
        </span>
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
              onClick={() => setThemeMode(value)}
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
        className="group relative flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
        title={t("header.settings")}
      >
        <Settings size={14} />
        <span className="xl:static xl:opacity-100 xl:bg-transparent xl:text-inherit xl:shadow-none xl:px-0 xl:py-0 xl:rounded-none xl:translate-x-0 xl:translate-y-0 xl:mt-0 absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-slate-900 text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-[10px] whitespace-nowrap z-50">
          {t("header.settings")}
        </span>
      </button>

      <button
        onClick={onOpenHelp}
        className="group relative flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
        title={t("header.help")}
      >
        <HelpCircle size={14} />
        <span className="xl:static xl:opacity-100 xl:bg-transparent xl:text-inherit xl:shadow-none xl:px-0 xl:py-0 xl:rounded-none xl:translate-x-0 xl:translate-y-0 xl:mt-0 absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-slate-900 text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-[10px] whitespace-nowrap z-50">
          {t("header.help")}
        </span>
      </button>

      {onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          className="group relative flex items-center gap-2 px-3 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 border border-slate-500/30 rounded text-xs font-bold transition-colors whitespace-nowrap"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          <span className="xl:static xl:opacity-100 xl:bg-transparent xl:text-inherit xl:shadow-none xl:px-0 xl:py-0 xl:rounded-none xl:translate-x-0 xl:translate-y-0 xl:mt-0 absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 bg-slate-900 text-white rounded shadow-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity text-[10px] whitespace-nowrap z-50">
            {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          </span>
        </button>
      )}

      {/* Connection and AI status */}
      <div className="flex items-center gap-3 border-l border-slate-200 dark:border-slate-800 pl-4 flex-shrink-0">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider leading-none">
            {t("header.serverLabel")}
          </span>
          <div
            className={`flex items-center gap-1 font-mono text-xs ${
              isConnected ? "text-emerald-400" : "text-rose-500"
            }`}
          >
            <Activity
              size={11}
              className={isConnected ? "animate-pulse" : ""}
            />
            {isConnected ? t("header.connected") : t("header.disconnected")}
          </div>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider leading-none">
            {t("header.aiSummaryLabel")}
          </span>
          <div
            className={`font-mono text-xs ${
              aiSummaryEnabled ? "text-violet-400" : "text-slate-500"
            }`}
          >
            {aiSummaryEnabled ? t("header.aiOn") : t("header.aiOff")}
          </div>
        </div>
      </div>
    </div>
  );
}
