"use client";

import { use, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  getCluster, getNodes, deleteCluster, addWorkers, deleteWorker, addTls,
} from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { NodeTable } from "@/components/node-table";
import { JobLogViewer } from "@/components/job-log-viewer";
import { toast } from "sonner";
import { Trash2, Plus, Shield, Download, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ClusterDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [workerSpec, setWorkerSpec] = useState("medium");
  const [workerCount, setWorkerCount] = useState(1);
  const [showTls, setShowTls] = useState(false);
  const [tlsDomain, setTlsDomain] = useState("");

  const { data: cluster, isLoading: clusterLoading } = useQuery({
    queryKey: ["cluster", name],
    queryFn: () => getCluster(name),
  });

  const { data: nodes = [], isLoading: nodesLoading } = useQuery({
    queryKey: ["nodes", name],
    queryFn: () => getNodes(name),
    refetchInterval: activeJobId ? false : 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCluster(name),
    onSuccess: (res) => {
      setShowDeleteDialog(false);
      setActiveJobId(res.jobId);
    },
    onError: () => toast.error("삭제 요청 실패"),
  });

  const addWorkerMutation = useMutation({
    mutationFn: () => addWorkers(name, { workerSpec, workerCount }),
    onSuccess: (res) => {
      setShowAddWorker(false);
      setActiveJobId(res.jobId);
    },
    onError: () => toast.error("워커 추가 요청 실패"),
  });

  const deleteWorkerMutation = useMutation({
    mutationFn: (workerName: string) => deleteWorker(name, workerName),
    onSuccess: (res) => setActiveJobId(res.jobId),
    onError: () => toast.error("워커 삭제 요청 실패"),
  });

  const tlsMutation = useMutation({
    mutationFn: () => addTls(name, tlsDomain),
    onSuccess: (res) => {
      setShowTls(false);
      setActiveJobId(res.jobId);
    },
    onError: () => toast.error("TLS 설정 요청 실패"),
  });

  const handleJobDone = (success: boolean) => {
    setActiveJobId(null);
    queryClient.invalidateQueries({ queryKey: ["clusters"] });
    queryClient.invalidateQueries({ queryKey: ["cluster", name] });
    queryClient.invalidateQueries({ queryKey: ["nodes", name] });
    if (!success) return;
    // 삭제 완료 시 홈으로
    if (!cluster || cluster.status === "DELETING") router.push("/");
  };

  if (clusterLoading) return <div className="animate-pulse h-32 bg-muted rounded-lg" />;
  if (!cluster) return <p className="text-muted-foreground">클러스터를 찾을 수 없습니다.</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">{cluster.name}</h1>
        <StatusBadge status={cluster.status} />
      </div>

      {/* 클러스터 정보 */}
      <div className="rounded-lg border p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <InfoItem label="마스터 스펙" value={cluster.masterSpec} />
        <InfoItem label="워커 수" value={String(cluster.workerCount)} />
        <InfoItem label="이미지" value={cluster.ubuntuImage} />
        <InfoItem label="생성일" value={new Date(cluster.createdAt).toLocaleDateString("ko-KR")} />
      </div>

      {/* 작업 로그 */}
      {activeJobId && (
        <div className="space-y-2">
          <h2 className="font-semibold">진행 중인 작업</h2>
          <JobLogViewer jobId={activeJobId} onDone={handleJobDone} />
        </div>
      )}

      {/* 노드 목록 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">노드</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAddWorker(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
              <Plus className="h-4 w-4" /> 워커 추가
            </button>
          </div>
        </div>
        {nodesLoading ? (
          <div className="animate-pulse h-24 bg-muted rounded-lg" />
        ) : (
          <NodeTable
            nodes={nodes}
            clusterName={name}
            onDeleteWorker={(wn) => deleteWorkerMutation.mutate(wn)}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => setShowTls(true)}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted">
          <Shield className="h-4 w-4" /> TLS SAN 설정
        </button>
        <a href={`/api/clusters/${name}/kubeconfig`} download
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted">
          <Download className="h-4 w-4" /> kubeconfig 다운로드
        </a>
        <button onClick={() => setShowDeleteDialog(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-destructive text-destructive px-4 py-2 text-sm hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" /> 클러스터 삭제
        </button>
      </div>

      {/* 워커 추가 다이얼로그 */}
      {showAddWorker && (
        <Dialog title="워커 노드 추가" onClose={() => setShowAddWorker(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">워커 수</label>
              <input type="number" min={1} max={10} value={workerCount}
                onChange={(e) => setWorkerCount(Number(e.target.value))}
                className="w-24 rounded-md border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">스펙</label>
              <select value={workerSpec} onChange={(e) => setWorkerSpec(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <button onClick={() => addWorkerMutation.mutate()} disabled={addWorkerMutation.isPending}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm hover:bg-primary/90 disabled:opacity-60">
              추가
            </button>
          </div>
        </Dialog>
      )}

      {/* TLS 다이얼로그 */}
      {showTls && (
        <Dialog title="TLS SAN 설정" onClose={() => setShowTls(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">도메인 (선택)</label>
              <input value={tlsDomain} onChange={(e) => setTlsDomain(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" placeholder="k3s.example.com" />
            </div>
            <button onClick={() => tlsMutation.mutate()} disabled={tlsMutation.isPending}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm hover:bg-primary/90 disabled:opacity-60">
              적용
            </button>
          </div>
        </Dialog>
      )}

      {/* 삭제 확인 다이얼로그 */}
      {showDeleteDialog && (
        <Dialog title="클러스터 삭제" onClose={() => setShowDeleteDialog(false)}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              이 작업은 되돌릴 수 없습니다. 확인을 위해 클러스터 이름 <strong>{name}</strong>을 입력하세요.
            </p>
            <input value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm" placeholder={name} />
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteInput !== name || deleteMutation.isPending}
              className="w-full rounded-lg bg-destructive text-destructive-foreground py-2 text-sm hover:bg-destructive/90 disabled:opacity-40">
              삭제
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "-"}</p>
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
