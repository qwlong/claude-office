"use client";

import { useEffect, useRef } from "react";
import { useProjectStore } from "@/stores/projectStore";
import { useTaskStore } from "@/stores/taskStore";
import { API_BASE_URL, WS_BASE_URL } from "@/config";
import type { MultiProjectGameState } from "@/types/projects";
import type { TasksUpdate } from "@/types/tasks";

const WS_URL = WS_BASE_URL;

export function useProjectWebSocket() {
  const updateFromServer = useProjectStore((s) => s.updateFromServer);
  const updateTasks = useTaskStore((s) => s.updateFromServer);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;
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
        // Reconnect after 3 seconds — but not if unmounted
        setTimeout(() => {
          if (!unmounted && (wsRef.current === ws || wsRef.current === null)) {
            connect();
          }
        }, 3000);
      };
    }

    connect();

    // Fetch initial task state so TaskDrawer renders immediately
    const abortController = new AbortController();
    fetch(`${API_BASE_URL}/api/v1/tasks/status`, { signal: abortController.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((status) => {
        if (!status || unmounted) return;
        fetch(`${API_BASE_URL}/api/v1/tasks`, { signal: abortController.signal })
          .then((r) => (r.ok ? r.json() : []))
          .then((tasks) => {
            if (!unmounted) {
              updateTasks({
                connected: status.connected,
                adapterType: status.adapterType,
                tasks,
              });
            }
          });
      })
      .catch(() => {});

    return () => {
      unmounted = true;
      abortController.abort();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) ws.close();
    };
  }, [updateFromServer, updateTasks]);
}
