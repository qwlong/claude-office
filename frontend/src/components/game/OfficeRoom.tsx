/**
 * OfficeRoom - Reusable office rendering for both single-room and multi-room modes.
 *
 * When wrapped in a RoomProvider (overview mode), renders using per-room data.
 * When not wrapped (all-merged mode), renders using the global gameStore.
 */

"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import type { OfficeTextures } from "@/hooks/useOfficeTextures";
import type { TodoItem } from "@/types";
import {
  useGameStore,
  selectAgents,
  selectBoss,
  selectBosses,
  selectTodos,
  selectDebugMode,
  selectShowPaths,
  selectShowQueueSlots,
  selectShowPhaseLabels,
  selectShowObstacles,
  selectElevatorState,
  selectContextUtilization,
  selectIsCompacting,
  selectContextUtilizationForSession,
  selectIsCompactingForSession,
  selectPrintReport,
} from "@/stores/gameStore";
import { useCompactionAnimation } from "@/systems/compactionAnimation";
import { useRoomContext } from "@/contexts/RoomContext";
import { useFilteredData } from "@/hooks/useFilteredData";
import { useProjectStore, selectViewMode } from "@/stores/projectStore";
import { getCanvasHeight, CANVAS_WIDTH } from "@/constants/canvas";
import {
  EMPLOYEE_OF_MONTH_POSITION,
  CITY_WINDOW_POSITION,
  SAFETY_SIGN_POSITION,
  WALL_CLOCK_POSITION,
  WALL_OUTLET_POSITION,
  WHITEBOARD_POSITION,
  WATER_COOLER_POSITION,
  COFFEE_MACHINE_POSITION,
  PRINTER_STATION_POSITION,
  PLANT_POSITION,
  BOSS_RUG_POSITION,
  TRASH_CAN_OFFSET,
  getBossPositions,
  BOSS_RUG_OFFSET_Y,
} from "@/constants/positions";

import { OfficeBackground } from "./OfficeBackground";
import { EmployeeOfTheMonth } from "./EmployeeOfTheMonth";
import { CityWindow } from "./CityWindow";
import { SafetySign } from "./SafetySign";
import { WallClock } from "./WallClock";
import { Whiteboard } from "./Whiteboard";
import { PrinterStation } from "./PrinterStation";
import { Elevator, isAgentInElevator } from "./Elevator";
import {
  DeskSurfacesBase,
  DeskSurfacesTop,
  useDeskPositions,
} from "./DeskGrid";
import {
  AgentSprite,
  AgentArms,
  AgentHeadset,
  AgentLabel,
  Bubble as AgentBubble,
} from "./AgentSprite";
import { BossSprite, BossBubble, MobileBoss } from "./BossSprite";
import { TrashCanSprite } from "./TrashCanSprite";
import { DebugOverlays } from "./DebugOverlays";
import { isInElevatorZone } from "@/systems/queuePositions";

import type { BossState } from "@/types";
import { getProjectDisplayName } from "@/types/projects";

/** Map agent state to BossState. Main agents use boss states at runtime but are typed as AgentState. */
const BOSS_STATE_SET = new Set<string>(["idle", "phone_ringing", "on_phone", "receiving", "working", "delegating", "waiting_permission", "reviewing", "completing"]);
function toBossState(state: string): BossState {
  return BOSS_STATE_SET.has(state) ? (state as BossState) : "idle";
}

interface OfficeRoomProps {
  textures: OfficeTextures;
}

export function OfficeRoom({ textures }: OfficeRoomProps): ReactNode {
  const roomCtx = useRoomContext();
  const isRoom = roomCtx !== null;

  // Global store values (always called — React hook rules)
  const storeAgents = useGameStore(useShallow(selectAgents));
  const storeBoss = useGameStore(selectBoss);
  const storeBosses = useGameStore(selectBosses);
  const storeSessionId = useGameStore((s) => s.sessionId);
  const storeTodos = useGameStore(selectTodos);
  const elevatorState = useGameStore(selectElevatorState);
  const roomKey = isRoom ? roomCtx.project.key : null;
  const contextUtilization = useGameStore(
    roomKey !== null
      ? selectContextUtilizationForSession(roomKey)
      : selectContextUtilization,
  );
  const isCompacting = useGameStore(
    roomKey !== null
      ? selectIsCompactingForSession(roomKey)
      : selectIsCompacting,
  );
  const printReport = useGameStore(selectPrintReport);
  const debugMode = useGameStore(selectDebugMode);
  const showPaths = useGameStore(selectShowPaths);
  const showQueueSlots = useGameStore(selectShowQueueSlots);
  const showPhaseLabels = useGameStore(selectShowPhaseLabels);
  const showObstacles = useGameStore(selectShowObstacles);

  // View mode and filtered sessionIds for project-level filtering
  const viewMode = useProjectStore(selectViewMode);
  const { sessionIds } = useFilteredData();

  // Compaction animation — in room mode, use the room's key as sessionId
  // (In sessions view, project.key IS the session ID; in projects view, no match = no animation)
  const compactionSessionId = isRoom ? roomCtx.project.key : undefined;
  const compactionAnimation = useCompactionAnimation(compactionSessionId);

  // Multi-boss: merged view (whole office) or room with multiple main agents (project view)
  const isMergedView = !isRoom && storeSessionId === "__all__";
  // Project view: single OfficeRoom filtered to one project's agents
  const isProjectView = !isRoom && viewMode === "project";

  // Room bosses: extract main agents from room data for multi-boss display (top 3)
  const roomAgents = isRoom ? roomCtx.project.agents : [];
  const roomBossAgents = useMemo(() => {
    const mains = roomAgents.filter(
      (a: { agentType?: string }) => a.agentType === "main",
    );
    // Sort by activity (non-idle first) and limit to 3, matching Whole Office behavior
    mains.sort((a, b) => {
      const aActive = a.state === "working" ? 1 : 0;
      const bActive = b.state === "working" ? 1 : 0;
      return bActive - aActive;
    });
    return mains.slice(0, 3);
  }, [roomAgents]);
  const isMultiBossRoom = isRoom && roomBossAgents.length > 1;

  // Boss count for positioning: merged view uses storeBosses, room uses roomBossAgents
  const multiBossCount = isMergedView
    ? storeBosses.size
    : isMultiBossRoom
      ? roomBossAgents.length
      : 0;

  const bossPositions = useMemo(() => {
    if (!multiBossCount) return [];
    return getBossPositions(multiBossCount, CANVAS_WIDTH);
  }, [multiBossCount]);

  const sortedBosses = useMemo(() => {
    if (!isMergedView) return [];
    return Array.from(storeBosses.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [isMergedView, storeBosses]);

  // Filter agents for desk rendering based on view mode
  const deskAgents = useMemo(() => {
    let agents = storeAgents;

    // In project view, filter to only this project's agents by sessionIds
    if (isProjectView && sessionIds) {
      const filtered = new Map<string, typeof agents extends Map<string, infer V> ? V : never>();
      for (const [id, agent] of agents) {
        if (agent.sessionId && sessionIds.has(agent.sessionId)) {
          filtered.set(id, agent);
        }
      }
      agents = filtered;
    }

    // In merged/project view, filter out main agents (bosses use BossSprite)
    if (isMergedView || isProjectView) {
      const filtered = new Map(agents);
      for (const [id, agent] of agents) {
        if (agent.agentType === "main") filtered.delete(id);
      }
      return filtered;
    }

    return agents;
  }, [isMergedView, isProjectView, storeAgents, sessionIds]);

  // Pick data source
  const todos: TodoItem[] = isRoom ? roomCtx.project.todos : storeTodos;
  const isElevatorOpen = isRoom ? false : elevatorState === "open";

  // Filter out main agents (boss) from desk rendering — boss uses BossSprite
  const roomSubagents = useMemo(
    () =>
      isRoom
        ? roomCtx.project.agents.filter(
            (a: { agentType?: string }) => a.agentType !== "main",
          )
        : [],
    [isRoom, roomAgents],
  );
  const agentCount = isRoom ? roomSubagents.length : deskAgents.size;
  // In overview mode, use fixed 8 desks for consistent room sizing
  const deskCount = isRoom ? 8 : Math.max(8, Math.ceil(agentCount / 4) * 4);
  const canvasHeight = getCanvasHeight(deskCount);

  const occupiedDesks = useMemo(() => {
    const desks = new Set<number>();
    if (isRoom) {
      roomSubagents.forEach((a, i) => desks.add(a.desk ?? i + 1));
    } else {
      for (const agent of deskAgents.values()) {
        if (agent.desk && agent.phase === "idle") desks.add(agent.desk);
      }
    }
    return desks;
  }, [isRoom, roomSubagents, deskAgents]);

  const deskTasks = useMemo(() => {
    const tasks = new Map<number, string>();
    if (isRoom) {
      roomSubagents.forEach((a, i) => {
        const desk = a.desk ?? i + 1;
        const label = a.currentTask ?? a.name ?? "";
        if (label) tasks.set(desk, label);
      });
    } else {
      for (const agent of deskAgents.values()) {
        if (agent.desk && agent.phase === "idle") {
          const label = agent.currentTask ?? agent.name ?? "";
          if (label) tasks.set(agent.desk, label);
        }
      }
    }
    return tasks;
  }, [isRoom, roomSubagents, deskAgents]);

  const deskPositions = useDeskPositions(deskCount, occupiedDesks);

  // Boss data
  const rawBossPos = isRoom ? roomCtx.project.boss.position : null;
  const bossPosition =
    rawBossPos && "x" in rawBossPos && "y" in rawBossPos
      ? { x: rawBossPos.x, y: rawBossPos.y }
      : isRoom
        ? { x: 640, y: 830 }
        : storeBoss.position;
  const bossState = isRoom
    ? roomCtx.project.boss.state
    : storeBoss.backendState;
  const bossBubble = isRoom
    ? (roomCtx.project.boss.bubble ?? null)
    : storeBoss.bubble.content;
  const bossCurrentTask = isRoom
    ? (roomCtx.project.boss.currentTask ?? null)
    : storeBoss.currentTask;

  return (
    <>
      {/* Floor and walls */}
      <OfficeBackground
        floorTileTexture={textures.floorTile}
        canvasHeight={canvasHeight}
      />

      {/* Boss area rug(s) */}
      {(isMergedView && sortedBosses.length > 0) || isMultiBossRoom
        ? bossPositions.map((pos, i) =>
            textures.bossRug ? (
              <pixiSprite
                key={`rug-${i}`}
                texture={textures.bossRug}
                anchor={0.5}
                x={pos.x}
                y={pos.y + BOSS_RUG_OFFSET_Y}
                scale={0.3}
              />
            ) : null,
          )
        : textures.bossRug && (
            <pixiSprite
              texture={textures.bossRug}
              anchor={0.5}
              x={BOSS_RUG_POSITION.x}
              y={BOSS_RUG_POSITION.y}
              scale={0.3}
            />
          )}

      {/* Wall decorations */}
      <pixiContainer
        x={EMPLOYEE_OF_MONTH_POSITION.x}
        y={EMPLOYEE_OF_MONTH_POSITION.y}
      >
        <EmployeeOfTheMonth />
      </pixiContainer>
      <pixiContainer x={CITY_WINDOW_POSITION.x} y={CITY_WINDOW_POSITION.y}>
        <CityWindow />
      </pixiContainer>
      <pixiContainer x={SAFETY_SIGN_POSITION.x} y={SAFETY_SIGN_POSITION.y}>
        <SafetySign />
      </pixiContainer>
      <pixiContainer x={WALL_CLOCK_POSITION.x} y={WALL_CLOCK_POSITION.y}>
        <WallClock />
      </pixiContainer>
      {textures.wallOutlet && (
        <pixiSprite
          texture={textures.wallOutlet}
          anchor={0.5}
          x={WALL_OUTLET_POSITION.x}
          y={WALL_OUTLET_POSITION.y}
          scale={0.04}
        />
      )}
      <pixiContainer x={WHITEBOARD_POSITION.x} y={WHITEBOARD_POSITION.y}>
        <Whiteboard todos={todos} />
      </pixiContainer>
      {textures.waterCooler && (
        <pixiSprite
          texture={textures.waterCooler}
          anchor={0.5}
          x={WATER_COOLER_POSITION.x}
          y={WATER_COOLER_POSITION.y}
          scale={0.198}
        />
      )}
      {textures.coffeeMachine && (
        <pixiSprite
          texture={textures.coffeeMachine}
          anchor={0.5}
          x={COFFEE_MACHINE_POSITION.x}
          y={COFFEE_MACHINE_POSITION.y}
          scale={0.1}
        />
      )}

      {/* Printer station */}
      <PrinterStation
        x={PRINTER_STATION_POSITION.x}
        y={PRINTER_STATION_POSITION.y}
        isPrinting={!isRoom && printReport && !isCompacting && !!bossBubble}
        deskTexture={textures.desk}
        printerTexture={textures.printer}
      />

      {/* Plant */}
      {textures.plant && (
        <pixiSprite
          texture={textures.plant}
          anchor={0.5}
          x={PLANT_POSITION.x}
          y={PLANT_POSITION.y}
          scale={0.1}
        />
      )}

      {/* Elevator */}
      <Elevator
        isOpen={isElevatorOpen}
        agents={isRoom ? new Map() : storeAgents}
        frameTexture={textures.elevatorFrame}
        doorTexture={textures.elevatorDoor}
        headsetTexture={textures.headset}
        sunglassesTexture={textures.sunglasses}
      />

      {/* Y-sorted layer: chairs and agents */}
      <pixiContainer sortableChildren={true}>
        {/* Chairs */}
        {deskPositions.map((desk, i) => (
          <pixiContainer
            key={`chair-${i}`}
            x={desk.x}
            y={desk.y}
            zIndex={desk.y + 20}
          >
            {textures.chair && (
              <pixiSprite
                texture={textures.chair}
                anchor={0.5}
                x={0}
                y={30}
                scale={0.1386}
              />
            )}
          </pixiContainer>
        ))}

        {/* Overview mode: agents at desk positions, static poses */}
        {isRoom &&
          roomSubagents.map((agent, i) => {
            const deskIdx = (agent.desk ?? i + 1) - 1;
            const desk = deskPositions[deskIdx];
            if (!desk) return null;
            return (
              <pixiContainer key={agent.id} zIndex={desk.y}>
                <AgentSprite
                  id={agent.id}
                  name={agent.name ?? null}
                  color={agent.color}
                  number={agent.number}
                  position={{ x: desk.x, y: desk.y }}
                  phase="idle"
                  bubble={agent.bubble ?? null}
                  headsetTexture={textures.headset}
                  sunglassesTexture={textures.sunglasses}
                  renderBubble={false}
                  renderLabel={false}
                  isTyping={agent.state === "working"}
                />
              </pixiContainer>
            );
          })}

        {/* All-merged mode: animated agents */}
        {!isRoom &&
          Array.from(storeAgents.values())
            .filter(
              (agent) =>
                !isAgentInElevator(
                  agent.currentPosition.x,
                  agent.currentPosition.y,
                ),
            )
            .map((agent) => (
              <pixiContainer key={agent.id} zIndex={agent.currentPosition.y}>
                <AgentSprite
                  id={agent.id}
                  name={agent.name}
                  color={agent.color}
                  number={agent.number}
                  position={agent.currentPosition}
                  phase={agent.phase}
                  bubble={agent.bubble.content}
                  headsetTexture={textures.headset}
                  sunglassesTexture={textures.sunglasses}
                  renderBubble={false}
                  renderLabel={false}
                  isTyping={agent.isTyping}
                />
              </pixiContainer>
            ))}
      </pixiContainer>

      {/* Desk surfaces (behind agent arms) */}
      <DeskSurfacesBase
        deskCount={deskCount}
        occupiedDesks={occupiedDesks}
        deskTexture={textures.desk}
        keyboardTexture={textures.keyboard}
      />

      {/* Agent arms */}
      {isRoom
        ? roomSubagents.map((agent, i) => {
            const deskIdx = (agent.desk ?? i + 1) - 1;
            const desk = deskPositions[deskIdx];
            if (!desk) return null;
            return (
              <AgentArms
                key={`arms-${agent.id}`}
                position={{ x: desk.x, y: desk.y }}
                isTyping={agent.state === "working"}
              />
            );
          })
        : Array.from(storeAgents.values())
            .filter((agent) => agent.phase === "idle")
            .map((agent) => (
              <AgentArms
                key={`arms-${agent.id}`}
                position={agent.currentPosition}
                isTyping={agent.isTyping}
              />
            ))}

      {/* Headsets */}
      {textures.headset &&
        (isRoom
          ? roomSubagents.map((agent, i) => {
              const deskIdx = (agent.desk ?? i + 1) - 1;
              const desk = deskPositions[deskIdx];
              if (!desk) return null;
              return (
                <AgentHeadset
                  key={`headset-${agent.id}`}
                  position={{ x: desk.x, y: desk.y }}
                  headsetTexture={textures.headset!}
                />
              );
            })
          : Array.from(storeAgents.values())
              .filter((agent) => agent.phase === "idle")
              .map((agent) => (
                <AgentHeadset
                  key={`headset-${agent.id}`}
                  position={agent.currentPosition}
                  headsetTexture={textures.headset!}
                />
              )))}

      {/* Monitors and desk accessories */}
      <DeskSurfacesTop
        deskCount={deskCount}
        occupiedDesks={occupiedDesks}
        deskTasks={deskTasks}
        monitorTexture={textures.monitor}
        coffeeMugTexture={textures.coffeeMug}
        staplerTexture={textures.stapler}
        deskLampTexture={textures.deskLamp}
        penHolderTexture={textures.penHolder}
        magic8BallTexture={textures.magic8Ball}
        rubiksCubeTexture={textures.rubiksCube}
        rubberDuckTexture={textures.rubberDuck}
        thermosTexture={textures.thermos}
      />

      {/* Boss(es) */}
      {isMergedView && sortedBosses.length > 0 ? (
        sortedBosses.map(([sid, boss], i) =>
          bossPositions[i] ? (
            <BossSprite
              key={`boss-${sid}`}
              position={bossPositions[i]}
              state={boss.backendState}
              bubble={boss.bubble.content}
              inUseBy={boss.inUseBy}
              currentTask={boss.currentTask}
              chairTexture={textures.chair}
              deskTexture={textures.desk}
              keyboardTexture={textures.keyboard}
              monitorTexture={textures.monitor}
              phoneTexture={textures.phone}
              headsetTexture={textures.headset}
              sunglassesTexture={textures.sunglasses}
              renderBubble={false}
              isTyping={boss.isTyping}
              isAway={false}
              label={boss.projectKey ? getProjectDisplayName({ name: boss.projectKey, root: null }) : sid.slice(0, 8)}
            />
          ) : null,
        )
      ) : isMultiBossRoom ? (
        roomBossAgents.map((agent, i) =>
          bossPositions[i] ? (
            <BossSprite
              key={`boss-${agent.id}`}
              position={bossPositions[i]}
              state={toBossState(agent.state)}
              bubble={agent.bubble ?? null}
              inUseBy={null}
              currentTask={agent.currentTask ?? null}
              chairTexture={textures.chair}
              deskTexture={textures.desk}
              keyboardTexture={textures.keyboard}
              monitorTexture={textures.monitor}
              phoneTexture={textures.phone}
              headsetTexture={textures.headset}
              sunglassesTexture={textures.sunglasses}
              renderBubble={false}
              isTyping={agent.state === "working"}
              isAway={false}
              label={agent.sessionId?.slice(0, 8) ?? agent.name ?? ""}
            />
          ) : null,
        )
      ) : (
        <BossSprite
          position={bossPosition}
          state={bossState}
          bubble={bossBubble}
          inUseBy={isRoom ? null : storeBoss.inUseBy}
          currentTask={bossCurrentTask}
          chairTexture={textures.chair}
          deskTexture={textures.desk}
          keyboardTexture={textures.keyboard}
          monitorTexture={textures.monitor}
          phoneTexture={textures.phone}
          headsetTexture={textures.headset}
          sunglassesTexture={textures.sunglasses}
          renderBubble={false}
          isTyping={isRoom ? bossState === "working" : storeBoss.isTyping}
          isAway={!isRoom && compactionAnimation.phase !== "idle"}
        />
      )}

      {/* Mobile Boss — walks to/from trash can during compaction (single-office only) */}
      {!isRoom && compactionAnimation.bossPosition && (
        <MobileBoss
          position={compactionAnimation.bossPosition}
          jumpOffset={compactionAnimation.jumpOffset}
          scale={compactionAnimation.bossScale}
          sunglassesTexture={textures.sunglasses}
          headsetTexture={textures.headset}
        />
      )}

      {/* Trash Can(s) */}
      {(isMergedView && sortedBosses.length > 0) || isMultiBossRoom ? (
        bossPositions.map((pos, i) => (
          <TrashCanSprite
            key={`trash-${i}`}
            x={pos.x + TRASH_CAN_OFFSET.x}
            y={pos.y + TRASH_CAN_OFFSET.y}
            contextUtilization={0}
            isCompacting={false}
            isStomping={false}
          />
        ))
      ) : !isRoom ? (
        <TrashCanSprite
          x={bossPosition.x + TRASH_CAN_OFFSET.x}
          y={bossPosition.y + TRASH_CAN_OFFSET.y}
          contextUtilization={
            compactionAnimation.phase !== "idle"
              ? compactionAnimation.animatedContextUtilization
              : contextUtilization
          }
          isCompacting={isCompacting}
          isStomping={compactionAnimation.isStomping}
        />
      ) : (
        <TrashCanSprite
          x={bossPosition.x + TRASH_CAN_OFFSET.x}
          y={bossPosition.y + TRASH_CAN_OFFSET.y}
          contextUtilization={contextUtilization}
          isCompacting={false}
          isStomping={false}
        />
      )}

      {/* Debug overlays (single-office only) */}
      {!isRoom && debugMode && (
        <DebugOverlays
          showPaths={showPaths}
          showQueueSlots={showQueueSlots}
          showPhaseLabels={showPhaseLabels}
          showObstacles={showObstacles}
        />
      )}
      {!isRoom && debugMode && (
        <pixiText
          text="DEBUG MODE (D=toggle, P=paths, Q=queue, L=labels, O=obstacles, T=time)"
          x={10}
          y={10}
          style={{
            fontSize: 12,
            fill: 0x00ff00,
            fontFamily: "monospace",
          }}
        />
      )}

      {/* Labels */}
      {isRoom
        ? roomSubagents.map((agent, i) => {
            const deskIdx = (agent.desk ?? i + 1) - 1;
            const desk = deskPositions[deskIdx];
            if (!desk || !agent.name) return null;
            return (
              <AgentLabel
                key={`label-${agent.id}`}
                name={agent.name}
                position={{ x: desk.x, y: desk.y }}
              />
            );
          })
        : Array.from(storeAgents.values())
            .filter(
              (agent) => agent.name && !isInElevatorZone(agent.currentPosition),
            )
            .map((agent) => (
              <AgentLabel
                key={`label-${agent.id}`}
                name={agent.name!}
                position={agent.currentPosition}
              />
            ))}

      {/* Bubbles */}
      {isRoom
        ? roomSubagents
            .filter((a) => a.bubble)
            .map((agent, i) => {
              const deskIdx = (agent.desk ?? i + 1) - 1;
              const desk = deskPositions[deskIdx];
              if (!desk) return null;
              return (
                <pixiContainer key={`bubble-${agent.id}`} x={desk.x} y={desk.y}>
                  <AgentBubble content={agent.bubble!} yOffset={-80} />
                </pixiContainer>
              );
            })
        : Array.from(storeAgents.values())
            .filter(
              (agent) =>
                agent.bubble.content &&
                !isInElevatorZone(agent.currentPosition),
            )
            .map((agent) => (
              <pixiContainer
                key={`bubble-${agent.id}`}
                x={agent.currentPosition.x}
                y={agent.currentPosition.y}
              >
                <AgentBubble content={agent.bubble.content!} yOffset={-80} />
              </pixiContainer>
            ))}
      {isMergedView && sortedBosses.length > 0
        ? sortedBosses.map(([sid, boss], i) =>
            boss.bubble.content && bossPositions[i] ? (
              <pixiContainer
                key={`boss-bubble-${sid}`}
                x={bossPositions[i].x}
                y={bossPositions[i].y}
              >
                <BossBubble content={boss.bubble.content} yOffset={-80} />
              </pixiContainer>
            ) : null,
          )
        : isMultiBossRoom
          ? roomBossAgents.map((agent, i) =>
              agent.bubble && bossPositions[i] ? (
                <pixiContainer
                  key={`boss-bubble-${agent.id}`}
                  x={bossPositions[i].x}
                  y={bossPositions[i].y}
                >
                  <BossBubble content={agent.bubble} yOffset={-80} />
                </pixiContainer>
              ) : null,
            )
          : bossBubble && (
              <pixiContainer x={bossPosition.x} y={bossPosition.y}>
                <BossBubble content={bossBubble} yOffset={-80} />
              </pixiContainer>
            )}
    </>
  );
}
