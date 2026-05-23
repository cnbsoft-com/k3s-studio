"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getClusters, getServers } from "@/lib/api";
import { ClusterCard } from "@/components/cluster-card";
import { ServerCard } from "@/components/server-card";
import { Plus, Server, Activity, AlertTriangle, Layers } from "lucide-react";

export default function DashboardPage() {
  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: getServers,
  });

  const { data: clusters = [], isLoading: clustersLoading } = useQuery({
    queryKey: ["clusters"],
    queryFn: () => getClusters(),
  });

  const running = clusters.filter((c) => c.status === "RUNNING").length;
  const errors  = clusters.filter((c) => c.status === "ERROR").length;
  const connectedServers = servers.filter((s) => s.status === "CONNECTED").length;

  const clusterCountByServer = clusters.reduce<Record<number, number>>((acc, c) => {
    const sid = c.serverId ?? 0;
    acc[sid] = (acc[sid] ?? 0) + 1;
    return acc;
  }, {});

  const isLoading = serversLoading || clustersLoading;

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <Link
          href="/clusters/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          새 클러스터
        </Link>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard icon={<Server className="h-5 w-5" />}    label="전체 서버"   value={servers.length}   color="text-purple-600" />
        <SummaryCard icon={<Layers className="h-5 w-5" />}    label="전체 클러스터" value={clusters.length} color="text-blue-600" />
        <SummaryCard icon={<Activity className="h-5 w-5" />}  label="실행 중"     value={running}           color="text-green-600" />
        <SummaryCard icon={<AlertTriangle className="h-5 w-5" />} label="오류"    value={errors}            color="text-red-600" />
      </div>

      {/* 서버 목록 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">서버</h2>
          <Link href="/servers" className="text-sm text-primary hover:underline">
            전체 보기
          </Link>
        </div>
        {serversLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-5 h-32 animate-pulse bg-muted" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => (
              <ServerCard key={server.id} server={server} clusterCount={clusterCountByServer[server.id] ?? 0} />
            ))}
          </div>
        )}
      </section>

      {/* 클러스터 목록 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">클러스터</h2>
        </div>
        {clustersLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-5 h-32 animate-pulse bg-muted" />
            ))}
          </div>
        ) : clusters.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Server className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>클러스터가 없습니다.</p>
            <Link href="/clusters/new" className="mt-3 inline-block text-primary hover:underline text-sm">
              첫 클러스터 만들기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clusters.map((cluster) => (
              <ClusterCard key={cluster.id} cluster={cluster} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode; label: string; value: number; color: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-5 flex items-center gap-4">
      <div className={`${color} p-2 rounded-lg bg-muted`}>{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}
