"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useTaskStore } from "@/stores/taskStore";
import type { MultiProjectGameState } from "@/types/projects";
import type { TasksUpdate } from "@/types/tasks";

const WS_URL = "ws://localhost:8000";

export function useProjectWebSocket() {
  const updateFromServer = useProjectStore((s) => s.updateFromServer);
  const updateTasks = useTaskStore((s) => s.updateFromServer);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(`${WS_URL}/ws/projects`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "project_state" && msg.data) {
            updateFromServer(msg.data as MultiProjectGameState);
          } else if (msg.type === "tasks_update" && msg.data) {
            updateTasks(msg.data as TasksUpdate);
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        // Reconnect after 3 seconds
        setTimeout(() => {
          if (wsRef.current === ws || wsRef.current === null) {
            connect();
          }
        }, 3000);
      };
    }

    connect();

    return () => {
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) ws.close();
    };
  }, [updateFromServer, updateTasks]);
}
