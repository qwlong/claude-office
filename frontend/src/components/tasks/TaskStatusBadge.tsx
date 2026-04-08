import type { TaskStatus } from "@/types/tasks";

const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; label: string; color: string }
> = {
  spawning: { icon: "\u26AA", label: "Spawning", color: "text-slate-400" },
  working: { icon: "\uD83D\uDFE2", label: "Working", color: "text-emerald-400" },
  pr_open: { icon: "\uD83D\uDFE3", label: "PR Open", color: "text-purple-400" },
  ci_failed: { icon: "\uD83D\uDD34", label: "CI Failed", color: "text-red-400" },
  review_pending: { icon: "\uD83D\uDFE1", label: "Review Pending", color: "text-yellow-400" },
  changes_requested: { icon: "\uD83D\uDFE0", label: "Changes Requested", color: "text-orange-400" },
  approved: { icon: "\u2705", label: "Approved", color: "text-green-400" },
  merged: { icon: "\uD83C\uDF89", label: "Merged", color: "text-blue-400" },
  done: { icon: "\u2714\uFE0F", label: "Done", color: "text-slate-500" },
  error: { icon: "\u274C", label: "Error", color: "text-red-500" },
};

interface Props {
  status: TaskStatus;
}

export function TaskStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.error;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${config.color}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
