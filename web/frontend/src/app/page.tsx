"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getClusters } from "@/lib/api";
import { ClusterCard } from "@/components/cluster-card";
import { Plus, Server, Activity, AlertTriangle } from "lucide-react";

export default function DashboardPage() {
  const { data: clusters = [], isLoading } = useQuery({
    queryKey: ["clusters"],
    queryFn: getClusters,
  });

  const running = clusters.filter((c) => c.status === "RUNNING").length;
  const errors  = clusters.filter((c) => c.status === "ERROR").length;

  return (
    <div className="space-y-8">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={<Server className="h-5 w-5" />}   label="전체 클러스터" value={clusters.length} color="text-blue-600" />
        <SummaryCard icon={<Activity className="h-5 w-5" />}  label="실행 중"       value={running}          color="text-green-600" />
        <SummaryCard icon={<AlertTriangle className="h-5 w-5" />} label="오류" value={errors} color="text-red-600" />
      </div>

      {/* 클러스터 목록 */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-5 h-32 animate-pulse bg-muted" />
          ))}
        </div>
      ) : clusters.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
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
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
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
