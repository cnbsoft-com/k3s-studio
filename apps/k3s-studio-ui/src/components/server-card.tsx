import Link from "next/link";
import { ServerResponse } from "@/lib/api";
import { ServerStatusBadge } from "@/components/server-status-badge";
import { Server, Trash2 } from "lucide-react";

interface Props {
  server: ServerResponse;
  clusterCount?: number;
  onDelete?: (id: number) => void;
}

export function ServerCard({ server, clusterCount, onDelete }: Props) {
  return (
    <Link
      href={`/servers/${server.id}`}
      className="rounded-lg border bg-card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow group"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{server.name}</span>
          {server.local && (
            <span className="rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground">local</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ServerStatusBadge status={server.status} />
          {onDelete && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(server.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 p-1 rounded transition-opacity"
              title="서버 삭제"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="text-sm text-muted-foreground space-y-0.5">
        <p>{server.local ? "localhost" : `${server.host}:${server.port}`}</p>
        {clusterCount !== undefined && (
          <p>클러스터 {clusterCount}개</p>
        )}
      </div>
    </Link>
  );
}
