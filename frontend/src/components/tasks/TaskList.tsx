import type { Task } from "@/types/tasks";
import { TaskCard } from "./TaskCard";

interface Props {
  tasksByProject: Record<string, Task[]>;
}

export function TaskList({ tasksByProject }: Props) {
  const projectKeys = Object.keys(tasksByProject).sort();

  if (projectKeys.length === 0) {
    return (
      <div className="text-center text-slate-500 text-sm py-4">
        No active tasks
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projectKeys.map((key) => (
        <div key={key}>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide px-2 py-1">
            {key}
          </div>
          {tasksByProject[key].map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ))}
    </div>
  );
}
