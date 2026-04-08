import type { TaskStatus } from "@/types/tasks";
import type { TranslationKey } from "@/hooks/useTranslation";
import { useTranslation } from "@/hooks/useTranslation";

const STATUS_CONFIG: Record<
  TaskStatus,
  { icon: string; labelKey: TranslationKey; color: string }
> = {
  spawning: { icon: "\u26AA", labelKey: "taskStatus.spawning", color: "text-slate-400" },
  working: { icon: "\uD83D\uDFE2", labelKey: "taskStatus.working", color: "text-emerald-400" },
  pr_open: { icon: "\uD83D\uDFE3", labelKey: "taskStatus.prOpen", color: "text-purple-400" },
  ci_failed: { icon: "\uD83D\uDD34", labelKey: "taskStatus.ciFailed", color: "text-red-400" },
  review_pending: { icon: "\uD83D\uDFE1", labelKey: "taskStatus.reviewPending", color: "text-yellow-400" },
  changes_requested: { icon: "\uD83D\uDFE0", labelKey: "taskStatus.changesRequested", color: "text-orange-400" },
  approved: { icon: "\u2705", labelKey: "taskStatus.approved", color: "text-green-400" },
  merged: { icon: "\uD83C\uDF89", labelKey: "taskStatus.merged", color: "text-blue-400" },
  done: { icon: "\u2714\uFE0F", labelKey: "taskStatus.done", color: "text-slate-500" },
  error: { icon: "\u274C", labelKey: "taskStatus.error", color: "text-red-500" },
};

interface Props {
  status: TaskStatus;
}

export function TaskStatusBadge({ status }: Props) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.error;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${config.color}`}>
      <span>{config.icon}</span>
      <span>{t(config.labelKey)}</span>
    </span>
  );
}
