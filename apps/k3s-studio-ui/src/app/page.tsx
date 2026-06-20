"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getClusters, getServers } from "@/lib/api";
import { ClusterCard } from "@/components/cluster-card";
import { ServerCard } from "@/components/server-card";
import { EmptyState } from "@/components/empty-state";
import { Plus, Server, Activity, AlertTriangle, Layers } from "lucide-react";
import { useTranslation } from "@/contexts/I18nContext";

export default function DashboardPage() {
  const { t } = useTranslation();
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
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <Link
          href={hasServers ? "/clusters/new" : "#"}
          aria-disabled={!hasServers}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            hasServers
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed pointer-events-none"
          }`}
          title={!hasServers ? t("dashboard.need_server") : undefined}
        >
          <Plus className="h-4 w-4" />
          {t("dashboard.new_cluster")}
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard icon={<Server className="h-5 w-5" />}        label={t("dashboard.all_servers")}   value={servers.length}  href="/servers"   color="text-purple-600" />
        <SummaryCard icon={<Layers className="h-5 w-5" />}        label={t("dashboard.all_clusters")}  value={clusters.length} href="#clusters"  color="text-blue-600" />
        <SummaryCard icon={<Activity className="h-5 w-5" />}      label={t("dashboard.running")}       value={running}         href="#clusters"  color="text-green-600" />
        <SummaryCard icon={<AlertTriangle className="h-5 w-5" />} label={t("dashboard.errors")}        value={errors}          href="#clusters"  color="text-red-600" />
      </div>

      {/* Server list */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("dashboard.servers")}</h2>
          <Link href="/servers" className="text-sm text-primary hover:underline">
            {t("dashboard.view_all")}
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
            title={t("dashboard.no_servers.title")}
            description={t("dashboard.no_servers.description")}
            action={
              <Link href="/servers/new" className="inline-flex items-center gap-1.5 rounded-pill active:scale-95 transition-transform bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" /> {t("dashboard.no_servers.action")}
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

      {/* Cluster list */}
      <section id="clusters" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("dashboard.clusters")}</h2>
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
            title={t("dashboard.no_clusters.title")}
            action={
              hasServers ? (
                <Link href="/clusters/new" className="inline-flex items-center gap-1.5 rounded-pill active:scale-95 transition-transform bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> {t("dashboard.no_clusters.action")}
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
