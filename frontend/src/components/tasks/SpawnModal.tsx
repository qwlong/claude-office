"use client";

import { useState, useEffect } from "react";
import Modal from "@/components/overlay/Modal";
import { useTranslation } from "@/hooks/useTranslation";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSpawn: (projectId: string, issue: string) => Promise<void>;
}

export function SpawnModal({ isOpen, onClose, onSpawn }: Props) {
  const { t } = useTranslation();
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
    const taskDesc = issue;
    setIssue("");
    onClose();
    // Fire and forget — don't block UI
    onSpawn(projectId, taskDesc).catch(() => {});
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("tasks.spawnNewTask")}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-sm font-bold transition-colors"
          >
            {t("modal.cancel")}
          </button>
          <button
            onClick={handleSpawn}
            disabled={!projectId || !issue || loading}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold rounded-lg transition-colors"
          >
            {loading ? t("tasks.spawning") : t("tasks.spawn")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">{t("tasks.project")}</label>
          {projects.length > 0 ? (
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:border-purple-500 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[position:right_8px_center] bg-no-repeat"
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
              placeholder={t("tasks.projectPlaceholder")}
              className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          )}
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">{t("tasks.taskDescription")}</label>
          <textarea
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            placeholder={t("tasks.taskPlaceholder")}
            rows={3}
            className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500 resize-y min-h-[80px] max-h-[300px]"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSpawn())}
          />
        </div>
      </div>
    </Modal>
  );
}
