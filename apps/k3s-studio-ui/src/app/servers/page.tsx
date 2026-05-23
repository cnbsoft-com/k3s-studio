"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { getServers, getClusters, deleteServer } from "@/lib/api";
import { ServerCard } from "@/components/server-card";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export default function ServersPage() {
  const queryClient = useQueryClient();
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: getServers,
  });
  const { data: clusters = [] } = useQuery({
    queryKey: ["clusters"],
    queryFn: () => getClusters(),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      toast.success("서버가 삭제되었습니다.");
    },
    onError: () => toast.error("삭제 실패"),
  });

  const clusterCountByServer = clusters.reduce<Record<number, number>>((acc, c) => {
    const sid = c.serverId ?? 0;
    acc[sid] = (acc[sid] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">서버 관리</h1>
        <Link
          href="/servers/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          서버 추가
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5 h-36 animate-pulse bg-muted" />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <p>등록된 서버가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              clusterCount={clusterCountByServer[server.id] ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
