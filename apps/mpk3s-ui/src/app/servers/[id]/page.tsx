"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getServer, getClusters, checkMultipass, installMultipass, testServerConnection, deleteServer,
  discoverClusters, importClusters,
} from "@/lib/api";
import { ServerStatusBadge } from "@/components/server-status-badge";
import { ClusterCard } from "@/components/cluster-card";
import { JobLogViewer } from "@/components/job-log-viewer";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2, Loader2, CheckCircle, XCircle, RotateCcw } from "lucide-react";
import { useState } from "react";

export default function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const serverId = parseInt(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [installJobId, setInstallJobId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: server, isLoading } = useQuery({
    queryKey: ["server", serverId],
    queryFn: () => getServer(serverId),
  });

  const { data: clusters = [] } = useQuery({
    queryKey: ["clusters", serverId],
    queryFn: () => getClusters(serverId),
    enabled: !!server,
  });

  const { data: mpCheck, refetch: recheckMp } = useQuery({
    queryKey: ["multipass-check", serverId],
    queryFn: () => checkMultipass(serverId),
    enabled: !!server && !server.local,
    retry: false,
  });

  const testMutation = useMutation({
    mutationFn: () => testServerConnection(serverId),
    onSuccess: (res) => {
      setTestResult(res);
      queryClient.invalidateQueries({ queryKey: ["server", serverId] });
    },
  });

  const installMutation = useMutation({
    mutationFn: () => installMultipass(serverId),
    onSuccess: (res) => setInstallJobId(res.jobId),
    onError: () => toast.error("설치 시작 실패"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteServer(serverId),
    onSuccess: () => {
      toast.success("서버가 삭제되었습니다.");
      router.push("/servers");
    },
    onError: () => toast.error("삭제 실패"),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const found = await discoverClusters(serverId);
      if (found.length === 0) return 0;
      await importClusters(serverId, found);
      return found.length;
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.info("새로 감지된 클러스터가 없습니다.");
      } else {
        toast.success(`${count}개 클러스터가 동기화되었습니다.`);
      }
      queryClient.invalidateQueries({ queryKey: ["clusters", serverId] });
    },
    onError: () => toast.error("동기화 실패"),
  });

  if (installJobId) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">Multipass 설치 중</h1>
        <JobLogViewer
          jobId={installJobId}
          redirectOnSuccess={`/servers/${serverId}`}
        />
      </div>
    );
  }

  if (isLoading || !server) {
    return <div className="text-center py-20 text-muted-foreground">로딩 중...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{server.name}</h1>
            <ServerStatusBadge status={server.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {server.local ? "localhost (로컬 서버)" : `${server.username}@${server.host}:${server.port}`}
          </p>
        </div>
        <div className="flex gap-2">
          {!server.local && (
            <>
              <button
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
              >
                {testMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                연결 테스트
              </button>
              <button
                onClick={() => {
                  if (confirm(`서버 "${server.name}"을 삭제하시겠습니까?`)) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                삭제
              </button>
            </>
          )}
        </div>
      </div>

      {/* 연결 테스트 결과 */}
      {testResult && (
        <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
          testResult.success
            ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
            : "border-red-200 bg-red-50 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
        }`}>
          {testResult.success ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {testResult.message}
        </div>
      )}

      {/* Multipass 상태 (원격 서버만) */}
      {!server.local && mpCheck && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h2 className="text-sm font-semibold">Multipass</h2>
          {mpCheck.installed ? (
            <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
              <CheckCircle className="h-4 w-4" />
              설치됨 {mpCheck.version && <span className="text-muted-foreground">({mpCheck.version})</span>}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-400">
                <XCircle className="h-4 w-4" />
                미설치
              </div>
              <button
                onClick={() => installMutation.mutate()}
                disabled={installMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90 disabled:opacity-50"
              >
                {installMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Multipass 설치
              </button>
            </div>
          )}
        </div>
      )}

      {/* 클러스터 목록 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">클러스터</h2>
          <div className="flex gap-2">
            <button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              {syncMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RotateCcw className="h-4 w-4" />}
              Sync
            </button>
            <Link
              href={`/clusters/new?serverId=${serverId}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              새 클러스터
            </Link>
          </div>
        </div>
        {clusters.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            이 서버에 클러스터가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clusters.map((cluster) => (
              <ClusterCard key={cluster.id} cluster={cluster} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
