"use client";

import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Layers,
  Trash2,
} from "lucide-react";
import {
  useProjectStore,
  selectProjects,
  selectViewMode,
  selectActiveRoomKey,
} from "@/stores/projectStore";
import { useTranslation } from "@/hooks/useTranslation";
import { type ProjectGroup, getProjectDisplayName } from "@/types/projects";

interface ProjectSidebarProps {
  onDeleteProject?: (project: ProjectGroup) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function ProjectSidebar({
  onDeleteProject,
  collapsed,
  onToggleCollapsed,
}: ProjectSidebarProps) {
  const { t } = useTranslation();
  const projects = useProjectStore(selectProjects);
  const viewMode = useProjectStore(selectViewMode);
  const activeRoomKey = useProjectStore(selectActiveRoomKey);
  const zoomToProjects = useProjectStore((s) => s.zoomToProjects);
  const zoomToProject = useProjectStore((s) => s.zoomToProject);

  if (projects.length === 0) return null;

  const isAllProjectsActive = viewMode === "projects";

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={onToggleCollapsed}
        className="w-full bg-slate-100 dark:bg-slate-900 px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 flex-shrink-0 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
      >
        <span className="text-slate-700 dark:text-slate-300 font-bold uppercase tracking-wider text-xs">
          {t("sidebar.projects")}
        </span>
        <span className="text-slate-400 dark:text-slate-600 text-xs">
          ({projects.length})
        </span>
        <span className="ml-auto text-slate-400">
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>

      {!collapsed && (
        <div className="overflow-y-auto flex-grow min-h-0 p-2">
          <div className="flex flex-col gap-2">
            {/* All Projects item */}
            <div
              role="button"
              tabIndex={0}
              className={`px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                isAllProjectsActive
                  ? "bg-purple-500/15 border-l-2 border-purple-500"
                  : "hover:bg-purple-50 dark:hover:bg-purple-900/20"
              }`}
              onClick={zoomToProjects}
              onKeyDown={(e) => e.key === "Enter" && zoomToProjects()}
            >
              <div className="flex items-center gap-2 mb-1">
                <Layers
                  size={10}
                  className={
                    isAllProjectsActive
                      ? "text-purple-600 dark:text-purple-400"
                      : "text-slate-400 dark:text-slate-500"
                  }
                />
                <span
                  className={`text-xs font-bold ${isAllProjectsActive ? "text-purple-700 dark:text-purple-300" : "text-slate-500 dark:text-slate-400"}`}
                >
                  {t("sidebar.allProjects")}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
                <span>
                  {t("project.sessions", {
                    count: projects.reduce((sum, p) => sum + p.sessionCount, 0),
                  })}
                </span>
                <span>
                  {t("project.agents", {
                    count: projects.reduce(
                      (sum, p) => sum + p.agents.length,
                      0,
                    ),
                  })}
                </span>
              </div>
            </div>
            {projects.map((project) => {
              const isActive =
                viewMode === "project" && activeRoomKey === project.key;
              return (
                <div
                  role="button"
                  tabIndex={0}
                  key={project.key}
                  className={`group relative w-full px-3 py-2.5 text-left transition-colors cursor-pointer rounded-md ${
                    isActive
                      ? "bg-purple-500/15 border-l-2 border-purple-500"
                      : "hover:bg-purple-50 dark:hover:bg-purple-900/20"
                  }`}
                  onClick={() => zoomToProject(project.key)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && zoomToProject(project.key)
                  }
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FolderOpen
                      size={12}
                      className="flex-shrink-0"
                      style={{ color: project.color }}
                    />
                    <span
                      className={`text-xs font-bold truncate flex-1 ${
                        isActive
                          ? "text-purple-700 dark:text-purple-300"
                          : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {getProjectDisplayName(project)}
                    </span>
                    {onDeleteProject && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteProject(project);
                        }}
                        className="relative z-10 p-1.5 text-slate-400 dark:text-slate-500 hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors opacity-0 group-hover:opacity-100"
                        aria-label={`Delete project ${project.name}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500">
                    <span>
                      {t("project.sessions", { count: project.sessionCount })}
                    </span>
                    <span>
                      {t("project.agents", { count: project.agents.length })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
