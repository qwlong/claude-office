"use client";

import { Layers, Trash2 } from "lucide-react";
import {
  useProjectStore,
  selectProjects,
  selectViewMode,
  selectActiveRoomKey,
} from "@/stores/projectStore";
import { useTranslation } from "@/hooks/useTranslation";
import type { ProjectGroup } from "@/types/projects";

interface ProjectSidebarProps {
  onDeleteProject?: (project: ProjectGroup) => void;
}

export function ProjectSidebar({ onDeleteProject }: ProjectSidebarProps) {
  const { t } = useTranslation();
  const projects = useProjectStore(selectProjects);
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const zoomToProjects = useProjectStore((s) => s.zoomToProjects);
  const zoomToProject = useProjectStore((s) => s.zoomToProject);

  if (projects.length === 0) return null;

  const isAllProjectsActive = viewMode === "projects";

  return (
    <div>
      <div className="bg-slate-100 dark:bg-slate-900 px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 flex-shrink-0">
        <span className="text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-xs">
          PROJECTS
        </span>
        <span className="text-slate-400 dark:text-slate-600 text-xs">
          ({projects.length})
        </span>
      </div>

      {/* All Projects item */}
      <div
        role="button"
        tabIndex={0}
        className={`mx-2 mt-2 flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer transition-colors ${
          isAllProjectsActive
            ? "bg-purple-500/20 border-l-2 border-purple-500"
            : "hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
        }`}
        onClick={zoomToProjects}
        onKeyDown={(e) => e.key === "Enter" && zoomToProjects()}
      >
        <Layers size={10} className={isAllProjectsActive ? "text-purple-400" : "text-slate-400 dark:text-slate-500"} />
        <span className={`text-xs font-bold ${isAllProjectsActive ? "text-purple-300" : "text-slate-500 dark:text-slate-400"}`}>
          {t("sidebar.allProjects")}
        </span>
      </div>

      <div className="overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {projects.map((project) => {
            const isActive = viewMode === "project" && activeRoomKey === project.key;
            return (
              <div
                role="button"
                tabIndex={0}
                key={project.key}
                className={`group relative w-full px-3 py-2.5 text-left transition-colors cursor-pointer rounded-md ${
                  isActive
                    ? "bg-purple-500/20 border-l-2 border-purple-500"
                    : "hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                }`}
                onClick={() => zoomToProject(project.key)}
                onKeyDown={(e) => e.key === "Enter" && zoomToProject(project.key)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: project.color }}
                  />
                  <span
                    className={`text-xs font-bold truncate flex-1 ${
                      isActive
                        ? "text-purple-300"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {project.name}
                  </span>
                  {onDeleteProject && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteProject(project);
                      }}
                      className="p-1 text-slate-400 dark:text-slate-500 hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors opacity-0 group-hover:opacity-100"
                      aria-label={`Delete project ${project.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
                  <span>
                    {project.sessionCount} {project.sessionCount === 1 ? "session" : "sessions"}
                  </span>
                  <span>
                    {project.agents.length} {project.agents.length === 1 ? "agent" : "agents"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
