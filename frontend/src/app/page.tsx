/**
 * Claude Office Visualizer - Main Page
 *
 * Uses the unified Zustand store, XState machines, and OfficeGame component.
 * Layout and logic are delegated to extracted components and custom hooks.
 */

"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useCallback } from "react";
import { useWebSocketEvents } from "@/hooks/useWebSocketEvents";
import { useSessions } from "@/hooks/useSessions";
import { useSessionSwitch } from "@/hooks/useSessionSwitch";
import {
  useGameStore,
  selectIsConnected,
  selectDebugMode,
  selectAgents,
  selectBoss,
} from "@/stores/gameStore";
import { useShallow } from "zustand/react/shallow";
import { Menu, X, ChevronUp, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { SessionSidebar } from "@/components/layout/SessionSidebar";
import { MobileDrawer } from "@/components/layout/MobileDrawer";
import { MobileAgentActivity } from "@/components/layout/MobileAgentActivity";
import { RightSidebar } from "@/components/layout/RightSidebar";
import { HeaderControls } from "@/components/layout/HeaderControls";
import {
  StatusToast,
  type StatusMessage,
} from "@/components/layout/StatusToast";
import Modal from "@/components/overlay/Modal";
import SettingsModal from "@/components/overlay/SettingsModal";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useThemeSync } from "@/hooks/useThemeSync";
import {
  useProjectStore,
  selectViewMode,
  selectPreviousViewMode,
} from "@/stores/projectStore";
import { useProjectWebSocket } from "@/hooks/useProjectWebSocket";

import { useTranslation } from "@/hooks/useTranslation";
import { API_BASE_URL } from "@/config";
import type { Session } from "@/hooks/useSessions";

// ============================================================================
// DYNAMIC IMPORT
// ============================================================================

function LoadingFallback() {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full bg-slate-100 dark:bg-slate-900 animate-pulse flex items-center justify-center text-slate-900 dark:text-white font-mono text-center">
      {t("app.initializingSystems")}
    </div>
  );
}

const OfficeGame = dynamic(
  () =>
    import("@/components/game/OfficeGame").then((m) => ({
      default: m.OfficeGame,
    })),
  {
    ssr: false,
    loading: () => <LoadingFallback />,
  },
);

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default function V2TestPage(): React.ReactNode {
  // ------------------------------------------------------------------
  // i18n
  // ------------------------------------------------------------------
  const { t, language } = useTranslation();

  // ------------------------------------------------------------------
  // UI-only state
  // ------------------------------------------------------------------
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(
    null,
  );
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiSummaryEnabled, setAiSummaryEnabled] = useState<boolean | null>(
    null,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Session pending delete drives the delete-confirmation modal
  const [sessionPendingDelete, setSessionPendingDelete] =
    useState<Session | null>(null);

  // ------------------------------------------------------------------
  // Status toast helper (stable reference via useCallback)
  // ------------------------------------------------------------------
  const showStatus = useCallback(
    (text: string, type: "info" | "error" | "success" = "info") => {
      setStatusMessage({ text, type });
      setTimeout(() => setStatusMessage(null), 3000);
    },
    [],
  );

  // ------------------------------------------------------------------
  // Session management hooks
  // ------------------------------------------------------------------
  const { sessions, sessionsLoading, sessionId, setSessionId, fetchSessions } =
    useSessions(showStatus);

  const {
    handleSessionSelect,
    handleDeleteSession,
    handleClearDB,
    handleSimulate,
    handleReset,
  } = useSessionSwitch({ sessionId, setSessionId, fetchSessions, showStatus });

  // ------------------------------------------------------------------
  // Multi-project state
  // ------------------------------------------------------------------
  useProjectWebSocket();
  // Sync sessions list into project store so OfficeGame can derive session rooms
  const setSessions = useProjectStore((s) => s.setSessions);
  useEffect(() => {
    const filtered = sessions
      .filter((s) => s.id !== "__all__")
      .map((s) => ({ id: s.id, projectName: s.projectName }));
    setSessions(filtered);
  }, [sessions, setSessions]);

  const viewMode = useProjectStore(selectViewMode);
  const setViewMode = useProjectStore((s) => s.setViewMode);
  const previousViewMode = useProjectStore(selectPreviousViewMode);
  const goBackToMultiRoom = useProjectStore((s) => s.goBackToMultiRoom);

  // ------------------------------------------------------------------
  // Store subscriptions
  // ------------------------------------------------------------------
  const isConnected = useGameStore(selectIsConnected);
  const debugMode = useGameStore(selectDebugMode);
  const agents = useGameStore(useShallow(selectAgents));
  const boss = useGameStore(selectBoss);
  const loadPersistedDebugSettings = useGameStore(
    (state) => state.loadPersistedDebugSettings,
  );
  const loadPreferences = usePreferencesStore((s) => s.loadPreferences);

  // ------------------------------------------------------------------
  // WebSocket connection — always connected to __all__ for unified data
  // Session/project switching only affects UI filtering, not the connection
  // ------------------------------------------------------------------
  useWebSocketEvents({ sessionId: "__all__" });

  // ------------------------------------------------------------------
  // One-time initialization effects
  // ------------------------------------------------------------------
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/status`)
      .then((res) => res.json())
      .then((data: { aiSummaryEnabled: boolean }) =>
        setAiSummaryEnabled(data.aiSummaryEnabled),
      )
      .catch(() => setAiSummaryEnabled(false));
  }, []);

  useEffect(() => {
    loadPersistedDebugSettings();
  }, [loadPersistedDebugSettings]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Sync preferencesStore theme → next-themes (single source of truth for DOM)
  useThemeSync();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // ------------------------------------------------------------------
  // Mobile breakpoint detection
  // ------------------------------------------------------------------
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ------------------------------------------------------------------
  // Fullscreen mode
  // ------------------------------------------------------------------
  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      if (!prev) {
        // Entering fullscreen — collapse header
        setHeaderCollapsed(true);
      } else {
        // Exiting fullscreen — restore header
        setHeaderCollapsed(false);
      }
      return !prev;
    });
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
        setHeaderCollapsed(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isFullscreen]);

  // ------------------------------------------------------------------
  // Session selection via custom event (from OfficeGame clicks)
  // ------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: Event) => {
      const sessionId = (e as CustomEvent).detail?.sessionId;
      if (sessionId) {
        handleSessionSelect(sessionId);
      }
    };
    window.addEventListener("office:select-session", handler);
    return () => window.removeEventListener("office:select-session", handler);
  }, [handleSessionSelect]);

  // ------------------------------------------------------------------
  // Derived handlers
  // ------------------------------------------------------------------
  const handleToggleDebug = () =>
    useGameStore.getState().setDebugMode(!debugMode);

  const handleCleanupAgents = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/agents/cleanup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      showStatus(`Cleaned up ${data.removed ?? 0} agents`, "success");
    } catch {
      showStatus("Failed to cleanup agents", "error");
    }
  };

  const handleConfirmClearDB = async () => {
    setIsClearModalOpen(false);
    await handleClearDB();
  };

  const handleConfirmDeleteSession = async () => {
    if (!sessionPendingDelete) return;
    const pending = sessionPendingDelete;
    setSessionPendingDelete(null);
    await handleDeleteSession(pending);
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <main className="flex h-screen flex-col bg-slate-100 dark:bg-slate-950 p-2 overflow-hidden relative">
      {/* ----------------------------------------------------------------
          Modals
      ---------------------------------------------------------------- */}
      <Modal
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        title={t("modal.confirmDbWipe")}
        footer={
          <>
            <button
              onClick={() => setIsClearModalOpen(false)}
              className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-bold transition-colors"
            >
              {t("modal.cancel")}
            </button>
            <button
              onClick={handleConfirmClearDB}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-rose-900/20"
            >
              {t("modal.wipeAllData")}
            </button>
          </>
        }
      >
        <p>{t("modal.wipeWarning")}</p>
      </Modal>

      <Modal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
        title={t("modal.keyboardShortcuts")}
        footer={
          <button
            onClick={() => setIsHelpModalOpen(false)}
            className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-white text-sm font-bold rounded-lg transition-colors"
          >
            {t("modal.close")}
          </button>
        }
      >
        <div className="space-y-3 font-mono text-sm">
          <div className="flex justify-between items-center py-2 border-b border-slate-300 dark:border-slate-700">
            <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-900 dark:text-white font-bold">
              D
            </kbd>
            <span className="text-slate-700 dark:text-slate-300">
              {t("modal.toggleDebug")}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-300 dark:border-slate-700">
            <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-900 dark:text-white font-bold">
              P
            </kbd>
            <span className="text-slate-700 dark:text-slate-300">
              {t("modal.showAgentPaths")}
            </span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-slate-300 dark:border-slate-700">
            <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-900 dark:text-white font-bold">
              Q
            </kbd>
            <span className="text-slate-700 dark:text-slate-300">
              {t("modal.showQueueSlots")}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <kbd className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-slate-900 dark:text-white font-bold">
              L
            </kbd>
            <span className="text-slate-700 dark:text-slate-300">
              {t("modal.showPhaseLabels")}
            </span>
          </div>
        </div>
      </Modal>

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      <Modal
        isOpen={sessionPendingDelete !== null}
        onClose={() => setSessionPendingDelete(null)}
        title={t("modal.deleteSession")}
        footer={
          <>
            <button
              onClick={() => setSessionPendingDelete(null)}
              className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-bold transition-colors"
            >
              {t("modal.cancel")}
            </button>
            <button
              onClick={handleConfirmDeleteSession}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-rose-900/20"
            >
              {t("modal.delete")}
            </button>
          </>
        }
      >
        <p>
          {t("modal.deleteSessionConfirm")}{" "}
          <span className="font-mono text-purple-400">
            {sessionPendingDelete?.projectName ||
              sessionPendingDelete?.id.slice(0, 8)}
          </span>
          ?
        </p>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
          {t("modal.deleteSessionWarning")}{" "}
          {sessionPendingDelete?.eventCount ?? 0} {t("modal.events")}.{" "}
          {t("modal.cannotBeUndone")}
        </p>
      </Modal>

      {/* ----------------------------------------------------------------
          Header
      ---------------------------------------------------------------- */}
      {/* Hover trigger zone — visible only when header is collapsed */}
      {headerCollapsed && (
        <div
          className="fixed top-0 left-0 right-0 h-2 z-50 group"
        >
          <button
            onClick={() => setHeaderCollapsed(false)}
            className="absolute top-0 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-1 px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-b-lg shadow-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xs flex items-center gap-1"
          >
            <ChevronDown size={12} /> Show Header
          </button>
        </div>
      )}
      {!headerCollapsed && (
        <header className="flex justify-between items-center mb-2 px-1 relative h-[60px] flex-shrink-0 transition-all duration-300">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? t("modal.close") : t("mobile.menu")}
                aria-expanded={mobileMenuOpen}
                className="p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg text-slate-900 dark:text-white transition-colors"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            )}
            <h1
              className={`font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 ${
                isMobile ? "text-lg" : "text-2xl"
              }`}
            >
              <span className="text-orange-500">Claude</span>{" "}
              {!isMobile && t("app.title")}
              {!isMobile && (
                <span className="text-xs font-mono font-normal px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  v0.13.0
                </span>
              )}
            </h1>
          </div>

          {/* Centered status toast */}
          <div className="absolute left-1/3 -translate-x-1/2 flex items-center pointer-events-none">
            <StatusToast message={statusMessage} />
          </div>

          {!isMobile && (
            <HeaderControls
              isConnected={isConnected}
              debugMode={debugMode}
              aiSummaryEnabled={aiSummaryEnabled}
              isFullscreen={isFullscreen}
              onSimulate={handleSimulate}
              onReset={handleReset}
              onClearDB={() => setIsClearModalOpen(true)}
              onCleanupAgents={handleCleanupAgents}
              onToggleDebug={handleToggleDebug}
              onOpenSettings={() => setIsSettingsModalOpen(true)}
              onOpenHelp={() => setIsHelpModalOpen(true)}
              onToggleFullscreen={handleToggleFullscreen}
            />
          )}

          {isMobile && (
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
                }`}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {agents.size} {t("header.agents")}
              </span>
            </div>
          )}

          {/* Collapse button — bottom center of header */}
          {!isMobile && (
            <button
              onClick={() => setHeaderCollapsed(true)}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 p-0.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors z-10"
              title="Hide header"
            >
              <ChevronUp size={12} />
            </button>
          )}
        </header>
      )}

      {/* ----------------------------------------------------------------
          Mobile Drawer
      ---------------------------------------------------------------- */}
      <MobileDrawer
        isOpen={isMobile && mobileMenuOpen}
        sessions={sessions}
        sessionsLoading={sessionsLoading}
        sessionId={sessionId}
        onClose={() => setMobileMenuOpen(false)}
        onSessionSelect={handleSessionSelect}
        onSimulate={handleSimulate}
        onReset={handleReset}
        onClearDB={() => {
          setIsClearModalOpen(true);
          setMobileMenuOpen(false);
        }}
      />

      {/* ----------------------------------------------------------------
          Main Content
      ---------------------------------------------------------------- */}
      {isMobile ? (
        <div className="flex-grow flex flex-col gap-1.5 overflow-hidden min-h-0">
          <div className="flex-[3] border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl bg-slate-50 dark:bg-slate-900 overflow-hidden relative min-h-0">
            <OfficeGame />
          </div>
          <MobileAgentActivity agents={agents} boss={boss} />
        </div>
      ) : (
        <div className="flex-grow flex gap-2 overflow-hidden min-h-0">
          {/* Left sidebar — hidden in fullscreen, replaced by hover zone */}
          {!isFullscreen && (
            <SessionSidebar
              sessions={sessions}
              sessionsLoading={sessionsLoading}
              sessionId={sessionId}
              isCollapsed={leftSidebarCollapsed}
              onToggleCollapsed={() =>
                setLeftSidebarCollapsed(!leftSidebarCollapsed)
              }
              onSessionSelect={handleSessionSelect}
              onDeleteSession={setSessionPendingDelete}
            />
          )}

          {/* Left edge hover zone — fullscreen only */}
          {isFullscreen && (
            <div className="fixed left-0 top-0 bottom-0 w-2 z-40 group">
              <div className="fixed left-0 top-0 bottom-0 w-72 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 z-50">
                <div className="h-full p-2">
                  <SessionSidebar
                    sessions={sessions}
                    sessionsLoading={sessionsLoading}
                    sessionId={sessionId}
                    isCollapsed={false}
                    onToggleCollapsed={() =>
                      setLeftSidebarCollapsed(!leftSidebarCollapsed)
                    }
                    onSessionSelect={handleSessionSelect}
                    onDeleteSession={setSessionPendingDelete}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 min-w-0 min-h-0 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xl bg-slate-50 dark:bg-slate-900 overflow-hidden relative">
            {/* View Mode Toggle */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-slate-200/80 dark:bg-slate-800/80 rounded-md p-0.5 backdrop-blur-sm">
              {(["office", "projects", "sessions"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    viewMode === mode ||
                    (mode === "projects" && viewMode === "project") ||
                    (mode === "sessions" && viewMode === "session")
                      ? "bg-purple-600 text-white"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {mode === "office"
                    ? t("viewMode.office")
                    : mode === "projects"
                      ? t("viewMode.projects")
                      : t("viewMode.sessions")}
                </button>
              ))}
              {(viewMode === "project" || viewMode === "session") && (
                <button
                  onClick={goBackToMultiRoom}
                  className="ml-1 px-2 py-1 text-xs rounded text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors border-l border-slate-300 dark:border-slate-600"
                >
                  {viewMode === "session"
                    ? t("viewMode.backToSessions")
                    : t("viewMode.backToProjects")}
                </button>
              )}
            </div>

            <OfficeGame />
          </div>

          {/* Right sidebar — hidden in fullscreen, replaced by hover zone */}
          {!isFullscreen && <RightSidebar />}

          {/* Right edge hover zone — fullscreen only */}
          {isFullscreen && (
            <div className="fixed right-0 top-0 bottom-0 w-2 z-40 group">
              <div className="fixed right-0 top-0 bottom-0 w-80 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-200 z-50">
                <div className="h-full p-2">
                  <RightSidebar />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
