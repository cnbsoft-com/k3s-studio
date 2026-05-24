import { cn } from "@/lib/utils";
import type { NodeState } from "@/lib/api";

const nodeStateConfig: Record<NodeState, { label: string; className: string }> = {
  Running:    { label: "실행 중",  className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  Stopped:    { label: "중지됨",   className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  Starting:   { label: "시작 중",  className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  Restarting: { label: "재시작 중", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  Deleted:    { label: "삭제됨",   className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  Suspended:  { label: "일시정지", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  Unknown:    { label: "알 수 없음", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

export function NodeStatusBadge({ state }: { state: NodeState | string }) {
  const cfg = nodeStateConfig[state as NodeState] ?? { label: state, className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}
