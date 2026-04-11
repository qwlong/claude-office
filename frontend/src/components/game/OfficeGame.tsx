/**
 * OfficeGame - Main Game Canvas
 *
 * Main visualization component using:
 * - Centralized Zustand store
 * - XState state machines
 * - Single animation tick loop
 *
 * The component is purely for rendering - all state logic is in the store/machines.
 */

"use client";

import { Application, extend } from "@pixi/react";
import {
  Container,
  Text,
  Graphics,
  Sprite,
  Application as PixiApplication,
} from "pixi.js";
import { useMemo, useEffect, useRef, useCallback, type ReactNode } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";
import { performFullCleanup, getHmrVersion } from "@/systems/hmrCleanup";

import { useGameStore, selectDebugMode, selectAgents } from "@/stores/gameStore";
import { useShallow } from "zustand/react/shallow";
import type { Agent } from "@/types/generated";
import { animationStateToAgent } from "@/utils/agentConvert";
import { useAnimationSystem } from "@/systems/animationSystem";
import { useOfficeTextures } from "@/hooks/useOfficeTextures";
import {
  useProjectStore,
  selectViewMode,
  selectActiveRoomKey,
  selectProjects,
  selectSessions,
} from "@/stores/projectStore";

import { getMultiRoomCanvasSize } from "@/constants/rooms";
import { MultiRoomCanvas } from "./MultiRoomCanvas";
import { OfficeRoom } from "./OfficeRoom";
import {
  CANVAS_WIDTH,
  BACKGROUND_COLOR,
  getCanvasHeight,
} from "@/constants/canvas";
import { ZoomControls } from "./ZoomControls";
import { LoadingScreen } from "./LoadingScreen";

// Register PixiJS components
extend({ Container, Text, Graphics, Sprite });

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OfficeGame(): ReactNode {
  // Track PixiJS app for cleanup
  const appRef = useRef<PixiApplication | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);

  // HMR version for forcing remount
  const hmrVersion = getHmrVersion();

  // Multi-project view state
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const projects = useProjectStore(selectProjects);
  const storeSessions = useProjectStore(selectSessions);

  // Unified agent data from gameStore (__all__ WebSocket)
  const gameAgents = useGameStore(useShallow(selectAgents));

  // Derive one room per session using gameStore agents (unified data source).
  // Sessions list is the source of truth for room count — even zero-agent sessions get a room.
  const sessionRooms = useMemo(() => {
    const projectByKey = new Map(projects.map((p) => [p.key, p]));

    // Group gameStore agents by sessionId
    const agentsBySession = new Map<string, Agent[]>();
    for (const agent of gameAgents.values()) {
      const sid = agent.sessionId;
      if (!sid) continue;
      if (!agentsBySession.has(sid)) agentsBySession.set(sid, []);
      agentsBySession.get(sid)!.push(animationStateToAgent(agent));
    }

    return storeSessions.map((session) => {
      const project =
        projectByKey.get(session.projectKey ?? "") ?? projects[0];
      const agents = agentsBySession.get(session.id) ?? [];
      const mainAgent = agents.find((a) => a.agentType === "main");
      const sessionBoss = mainAgent
        ? {
            state: (mainAgent.state === "working" ? "working" : "idle") as "working" | "idle",
            currentTask: mainAgent.currentTask ?? null,
            bubble: mainAgent.bubble ?? null,
            position: { x: 640, y: 830 },
          }
        : {
            state: "idle" as const,
            currentTask: null,
            bubble: null,
            position: { x: 640, y: 830 },
          };
      return {
        key: session.id,
        name: `${session.projectName ?? "Unknown"} · ${session.id.slice(0, 8)}`,
        color: project?.color ?? "#888888",
        root: project?.root ?? null,
        agents,
        boss: sessionBoss,
        sessionCount: 1,
        todos: [],
      };
    });
  }, [projects, storeSessions, gameAgents]);

  // Multi-room vs single-office rendering
  // "office" and "project" render a single animated OfficeRoom.
  // "projects", "sessions", "session" use MultiRoomCanvas grid.
  // "office", "project", and "session" render a single animated OfficeRoom.
  // "projects" and "sessions" use MultiRoomCanvas grid.
  const isMultiRoom = viewMode !== "office" && viewMode !== "project" && viewMode !== "session";

  // Load all office textures
  const { textures, loaded: spritesLoaded } = useOfficeTextures();

  // Start animation system (disabled in multi-room mode — agents use static poses)
  useAnimationSystem({ enabled: !isMultiRoom });

  // Cleanup on unmount (HMR or navigation)
  // NOTE: Don't call app.destroy() here — @pixi/react's <Application> handles that
  // on unmount. Calling it manually causes double-destroy which crashes ResizePlugin.
  useEffect(() => {
    return () => {
      appRef.current = null;
      performFullCleanup();
    };
  }, []);

  // Only subscribe to what OfficeGame needs for layout and keyboard shortcuts
  const debugMode = useGameStore(selectDebugMode);

  // Enrich project rooms with live agent data from gameStore (__all__ WebSocket)
  const enrichedProjects = useMemo(() => {
    // Build sessionId → projectKey lookup
    const sessionToProject = new Map<string, string>();
    for (const s of storeSessions) {
      if (s.projectKey) sessionToProject.set(s.id, s.projectKey);
    }

    // Group gameStore agents by project
    const agentsByProject = new Map<string, Agent[]>();
    for (const agent of gameAgents.values()) {
      if (!agent.sessionId) continue;
      const projKey = sessionToProject.get(agent.sessionId);
      if (!projKey) continue;
      if (!agentsByProject.has(projKey)) agentsByProject.set(projKey, []);
      agentsByProject.get(projKey)!.push(animationStateToAgent(agent));
    }

    return projects.map((p) => ({
      ...p,
      agents: agentsByProject.get(p.key) ?? p.agents,
    }));
  }, [projects, gameAgents, storeSessions]);

  // Agent count drives canvas height for single-office mode
  const agentCount = useGameStore((s) => s.agents.size);
  const canvasHeight = useMemo(() => {
    const deskCount = Math.max(8, Math.ceil(agentCount / 4) * 4);
    return getCanvasHeight(deskCount);
  }, [agentCount]);

  // Canvas dimensions for multi-room view
  // "project" mode now uses single OfficeRoom, not MultiRoomCanvas
  const multiRoomRooms = useMemo(() => {
    if (viewMode === "sessions") return sessionRooms;
    if (viewMode === "session")
      return sessionRooms.filter((r) => r.key === activeRoomKey);
    return enrichedProjects; // "projects" mode — with live agent data
  }, [viewMode, sessionRooms, enrichedProjects, activeRoomKey]);
  const multiRoomSize = useMemo(
    () => getMultiRoomCanvasSize(Math.max(1, multiRoomRooms.length)),
    [multiRoomRooms.length],
  );
  const appWidth = isMultiRoom ? multiRoomSize.width : CANVAS_WIDTH;
  const appHeight = isMultiRoom ? multiRoomSize.height : canvasHeight;

  // Keyboard shortcuts for debug
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "d" || e.key === "D") {
        useGameStore.getState().setDebugMode(!debugMode);
      }
      if (debugMode) {
        if (e.key === "p" || e.key === "P") {
          useGameStore.getState().toggleDebugOverlay("paths");
        }
        if (e.key === "q" || e.key === "Q") {
          useGameStore.getState().toggleDebugOverlay("queueSlots");
        }
        if (e.key === "l" || e.key === "L") {
          useGameStore.getState().toggleDebugOverlay("phaseLabels");
        }
        if (e.key === "o" || e.key === "O") {
          useGameStore.getState().toggleDebugOverlay("obstacles");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [debugMode]);

  // ---- Fit-to-view scaling ----
  // Automatically fit the canvas inside the container on mount, view switch,
  // and resize — but stop auto-fitting once the user manually zooms.
  const userHasZoomed = useRef(false);
  const lastAppliedScale = useRef(0);

  // Reset userHasZoomed when viewMode changes
  useEffect(() => {
    userHasZoomed.current = false;
    lastAppliedScale.current = 0;
  }, [viewMode]);

  // Compute fitScale and apply via centerView
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const applyFitScale = () => {
      if (userHasZoomed.current) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      if (cw === 0 || ch === 0) return;

      // Use actual canvas CSS size (autoDensity makes it larger than appWidth/appHeight)
      const canvasEl = container.querySelector("canvas");
      const canvasW = canvasEl?.clientWidth || appWidth;
      const canvasH = canvasEl?.clientHeight || appHeight;
      const scale = Math.min(cw / canvasW, ch / canvasH, 1);
      if (Math.abs(scale - lastAppliedScale.current) < 0.01) return;
      lastAppliedScale.current = scale;
      transformRef.current?.centerView(scale, 0);
      setTimeout(() => {
        transformRef.current?.centerView(scale, 0);
      }, 200);
    };

    // Wait for PixiJS canvas to be ready (check periodically)
    let attempts = 0;
    const waitForCanvas = setInterval(() => {
      attempts++;
      const canvas = container.querySelector("canvas");
      if ((canvas && canvas.width > 150) || attempts > 20) {
        clearInterval(waitForCanvas);
        applyFitScale();
      }
    }, 100);

    const observer = new ResizeObserver(() => applyFitScale());
    observer.observe(container);

    return () => {
      clearInterval(waitForCanvas);
      observer.disconnect();
    };
  }, [appWidth, appHeight, viewMode]);

  const handleSessionRoomClick = useCallback((sessionId: string) => {
    window.dispatchEvent(
      new CustomEvent("office:select-session", { detail: { sessionId } }),
    );
    useProjectStore.getState().zoomToSession(sessionId);
  }, []);

  const handleProjectRoomClick = useCallback((projectKey: string) => {
    useProjectStore.getState().zoomToProject(projectKey);
  }, []);

  // Double-click resets to fit scale
  const handleDoubleClick = useCallback(() => {
    userHasZoomed.current = false;
    lastAppliedScale.current = 0;
    const container = containerRef.current;
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw === 0 || ch === 0) return;
    const canvasEl = container.querySelector("canvas");
    const canvasW = canvasEl?.clientWidth || appWidth;
    const canvasH = canvasEl?.clientHeight || appHeight;
    const scale = Math.min(cw / canvasW, ch / canvasH, 1);
    lastAppliedScale.current = scale;
    transformRef.current?.centerView(scale, 200);
  }, [appWidth, appHeight]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden relative"
      onDoubleClick={handleDoubleClick}
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={1}
        minScale={0.1}
        maxScale={3}
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: true }}
        centerZoomedOut={false}
        limitToBounds={false}
        onWheel={() => {
          userHasZoomed.current = true;
        }}
        onPinching={() => {
          userHasZoomed.current = true;
        }}
        onPanning={() => {
          userHasZoomed.current = true;
        }}
      >
        <ZoomControls />
        <TransformComponent wrapperClass="w-full h-full" contentClass="">
          <div className="pixi-canvas-container">
            <Application
              key={`pixi-app-${hmrVersion}-${viewMode}`}
              width={appWidth}
              height={appHeight}
              backgroundColor={isMultiRoom ? 0x0e1726 : BACKGROUND_COLOR}
              backgroundAlpha={isMultiRoom ? 0 : 1}
              autoDensity={true}
              resolution={
                typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
              }
              onInit={(app) => {
                appRef.current = app;
                // Patch: PixiJS v8 ResizePlugin.destroy() crashes if _cancelResize
                // was never initialized (no resizeTo configured). Ensure it's callable.
                const appAny = app as unknown as Record<string, unknown>;
                if (!appAny._cancelResize) {
                  appAny._cancelResize = () => {};
                }
              }}
            >
              {/* Loading screen - shown while sprites are loading */}
              {!spritesLoaded && <LoadingScreen />}

              {/* Office content - hidden while loading */}
              {spritesLoaded && isMultiRoom && (
                <MultiRoomCanvas
                  textures={textures}
                  rooms={multiRoomRooms}
                  onRoomClick={
                    viewMode === "sessions"
                      ? handleSessionRoomClick
                      : handleProjectRoomClick
                  }
                />
              )}

              {spritesLoaded && !isMultiRoom && (
                <OfficeRoom textures={textures} />
              )}
            </Application>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
