import Link from "next/link";
import { ClusterResponse } from "@/lib/api";
import { StatusBadge } from "./status-badge";
import { Server, HardDrive, Calendar } from "lucide-react";

export function ClusterCard({ cluster }: { cluster: ClusterResponse }) {
  return (
    <Link href={`/clusters/${cluster.name}`}>
      <div className="rounded-lg border bg-card p-5 hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-lg">{cluster.name}</h3>
            {cluster.serverName && (
              <p className="text-xs text-muted-foreground mt-0.5">{cluster.serverName}</p>
            )}
          </div>
          <StatusBadge status={cluster.status} />
        </div>

        <div className="space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            <span>
              마스터: {cluster.masterSpec}
              {cluster.masterSpec === "custom" &&
                ` (${cluster.masterCpus}c / ${cluster.masterMemory} / ${cluster.masterDisk})`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4" />
            <span>워커: {cluster.workerCount}개</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{new Date(cluster.createdAt).toLocaleDateString("ko-KR")}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
