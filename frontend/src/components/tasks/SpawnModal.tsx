"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/overlay/Modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSpawn: (projectId: string, issue: string) => Promise<void>;
}

export function SpawnModal({ isOpen, onClose, onSpawn }: Props) {
  const [projectId, setProjectId] = useState("");
  const [issue, setIssue] = useState("");
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    fetch("http://localhost:8000/api/v1/tasks/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: { id: string; name: string }[]) => {
        setProjects(data);
        if (data.length > 0 && !projectId) {
          setProjectId(data[0].id ?? data[0].name ?? "");
        }
      })
      .catch(() => {});
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSpawn = async () => {
    if (!projectId || !issue || loading) return;
    setLoading(true);
    try {
      await onSpawn(projectId, issue);
      setIssue("");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Spawn New Task"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-400 hover:text-white text-sm font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSpawn}
            disabled={!projectId || !issue || loading}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {loading ? "Spawning..." : "Spawn"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Project</label>
          {projects.length > 0 ? (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            >
              {projects.map((p) => (
                <option key={p.id ?? p.name} value={p.id ?? p.name}>
                  {p.name ?? p.id}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              placeholder="project-name"
              className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          )}
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Issue</label>
          <input
            type="text"
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            placeholder="#123 Fix login bug"
            className="w-full bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            onKeyDown={(e) => e.key === "Enter" && handleSpawn()}
          />
        </div>
      </div>
    </Modal>
  );
}
