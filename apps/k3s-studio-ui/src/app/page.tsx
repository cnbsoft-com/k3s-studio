"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getClusters, getServers } from "@/lib/api";
import { ClusterCard } from "@/components/cluster-card";
import { ServerCard } from "@/components/server-card";
import { EmptyState } from "@/components/empty-state";
import { Plus, Server, Activity, AlertTriangle, Layers } from "lucide-react";

export default function DashboardPage() {
  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ["servers"],
    queryFn: getServers,
  });

  const { data: clusters = [], isLoading: clustersLoading } = useQuery({
    queryKey: ["clusters"],
    queryFn: () => getClusters(),
    refetchInterval: (query) =>
      query.state.data?.some((c) => ["CREATING", "DELETING"].includes(c.status))
        ? 3000
        : false,
  });

  const running = clusters.filter((c) => c.status === "RUNNING").length;
  const errors  = clusters.filter((c) => c.status === "ERROR").length;
  const hasServers = servers.length > 0;

  const clusterCountByServer = clusters.reduce<Record<number, number>>((acc, c) => {
    const sid = c.serverId ?? 0;
    acc[sid] = (acc[sid] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <Link
          href={hasServers ? "/clusters/new" : "#"}
          aria-disabled={!hasServers}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            hasServers
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed pointer-events-none"
          }`}
          title={!hasServers ? "서버를 먼저 추가해야 합니다" : undefined}
        >
          <Plus className="h-4 w-4" />
          새 클러스터
        </Link>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard icon={<Server className="h-5 w-5" />}       label="전체 서버"    value={servers.length}   href="/servers"      color="text-purple-600" />
        <SummaryCard icon={<Layers className="h-5 w-5" />}       label="전체 클러스터" value={clusters.length} href="#clusters"     color="text-blue-600" />
        <SummaryCard icon={<Activity className="h-5 w-5" />}     label="실행 중"      value={running}          href="#clusters"     color="text-green-600" />
        <SummaryCard icon={<AlertTriangle className="h-5 w-5" />} label="오류"        value={errors}           href="#clusters"     color="text-red-600" />
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
        ) : servers.length === 0 ? (
          <EmptyState
            icon={Server}
            title="서버가 없습니다."
            description="서버를 추가하면 클러스터를 생성할 수 있습니다."
            action={
              <Link href="/servers/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" /> 서버 추가
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => (
              <ServerCard key={server.id} server={server} clusterCount={clusterCountByServer[server.id] ?? 0} />
            ))}
          </div>
        )}
      </section>

      {/* 클러스터 목록 */}
      <section id="clusters" className="space-y-4">
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
          <EmptyState
            icon={Layers}
            title="클러스터가 없습니다."
            action={
              hasServers ? (
                <Link href="/clusters/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> 첫 클러스터 만들기
                </Link>
              ) : undefined
            }
          />
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
  icon, label, value, href, color,
}: {
  icon: React.ReactNode; label: string; value: number; href: string; color: string;
}) {
  return (
    <Link href={href} className="rounded-lg border bg-card p-5 flex items-center gap-4 hover:bg-accent/50 transition-colors">
      <div className={`${color} p-2 rounded-lg bg-muted`}>{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </Link>
  );
}
