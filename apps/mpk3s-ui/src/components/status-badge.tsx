import { cn } from "@/lib/utils";

type Status = "CREATING" | "RUNNING" | "ERROR" | "DELETING";

const statusConfig: Record<Status, { label: string; className: string }> = {
  CREATING: { label: "생성 중", className: "bg-yellow-100 text-yellow-800" },
  RUNNING:  { label: "실행 중", className: "bg-green-100 text-green-800" },
  ERROR:    { label: "오류",    className: "bg-red-100 text-red-800" },
  DELETING: { label: "삭제 중", className: "bg-gray-100 text-gray-800" },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status as Status] ?? { label: status, className: "bg-gray-100 text-gray-800" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", cfg.className)}>
      {cfg.label}
    </span>
  );
}
