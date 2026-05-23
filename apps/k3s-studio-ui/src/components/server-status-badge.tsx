import { ServerStatus } from "@/lib/api";

const CONFIG: Record<ServerStatus, { label: string; className: string }> = {
  CONNECTED:            { label: "연결됨",        className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
  UNREACHABLE:          { label: "연결 불가",      className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
  UNKNOWN:              { label: "확인 중",        className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  INSTALLING_MULTIPASS: { label: "Multipass 설치 중", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
};

export function ServerStatusBadge({ status }: { status: ServerStatus }) {
  const { label, className } = CONFIG[status] ?? CONFIG.UNKNOWN;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
