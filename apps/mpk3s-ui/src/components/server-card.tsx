import Link from "next/link";
import { ServerResponse } from "@/lib/api";
import { ServerStatusBadge } from "@/components/server-status-badge";
import { Server, ArrowRight } from "lucide-react";

interface Props {
  server: ServerResponse;
  clusterCount?: number;
}

export function ServerCard({ server, clusterCount }: Props) {
  return (
    <div className="rounded-lg border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">{server.name}</span>
          {server.local && (
            <span className="rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground">local</span>
          )}
        </div>
        <ServerStatusBadge status={server.status} />
      </div>

      <div className="text-sm text-muted-foreground space-y-0.5">
        <p>{server.local ? "localhost" : `${server.host}:${server.port}`}</p>
        {clusterCount !== undefined && (
          <p>클러스터 {clusterCount}개</p>
        )}
      </div>

      <Link
        href={`/servers/${server.id}`}
        className="mt-auto inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        바로가기 <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
