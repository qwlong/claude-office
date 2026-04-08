import type { Task } from "@/types/tasks";
import { TaskStatusBadge } from "./TaskStatusBadge";

interface Props {
  task: Task;
}

const AO_DASHBOARD_URL = "http://localhost:3003";

export function TaskCard({ task }: Props) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 hover:bg-slate-100 dark:hover:bg-slate-700/30 rounded text-sm">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <TaskStatusBadge status={task.status} />
        <a
          href={`${AO_DASHBOARD_URL}/sessions/${task.externalSessionId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-600 dark:text-slate-300 hover:text-purple-500 dark:hover:text-purple-400 transition-colors whitespace-nowrap"
          title={task.externalSessionId}
        >
          {task.externalSessionId}
        </a>
        {task.issue && (
          <span className="text-slate-400 dark:text-slate-500 truncate text-xs" title={task.issue}>
            {task.issue}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
        {task.prUrl && task.prNumber && (
          <a
            href={task.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300"
          >
            PR #{task.prNumber}
          </a>
        )}
        {task.ciStatus && (
          <span
            className={
              task.ciStatus === "passing"
                ? "text-green-400"
                : task.ciStatus === "failing"
                  ? "text-red-400"
                  : "text-yellow-400"
            }
          >
            CI {task.ciStatus === "passing" ? "\u2713" : task.ciStatus === "failing" ? "\u2717" : "\u23F3"}
          </span>
        )}
        {task.reviewStatus && (
          <span
            className={
              task.reviewStatus === "approved"
                ? "text-green-400"
                : task.reviewStatus === "changes_requested"
                  ? "text-orange-400"
                  : "text-yellow-400"
            }
          >
            {task.reviewStatus === "approved" ? "Rev \u2713" : task.reviewStatus === "changes_requested" ? "Rev \u2717" : "Rev \u23F3"}
          </span>
        )}
      </div>
    </div>
  );
}
