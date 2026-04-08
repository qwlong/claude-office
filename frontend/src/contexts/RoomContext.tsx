"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ProjectGroup } from "@/types/projects";
import type { Agent, Boss, TodoItem } from "@/types";

interface RoomContextValue {
  project: ProjectGroup;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({
  project,
  children,
}: {
  project: ProjectGroup;
  children: ReactNode;
}) {
  return (
    <RoomContext.Provider value={{ project }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoomContext(): RoomContextValue | null {
  return useContext(RoomContext);
}

/** Returns room agents if inside RoomProvider, null otherwise. */
export function useRoomAgents(): Agent[] | null {
  const ctx = useContext(RoomContext);
  return ctx ? ctx.project.agents : null;
}

/** Returns room boss if inside RoomProvider, null otherwise. */
export function useRoomBoss(): Boss | null {
  const ctx = useContext(RoomContext);
  return ctx ? ctx.project.boss : null;
}

/** Returns room todos if inside RoomProvider, null otherwise. */
export function useRoomTodos(): TodoItem[] | null {
  const ctx = useContext(RoomContext);
  return ctx ? ctx.project.todos : null;
}

/** Returns whether we're inside a RoomProvider (overview mode). */
export function useIsInRoom(): boolean {
  return useContext(RoomContext) !== null;
}
