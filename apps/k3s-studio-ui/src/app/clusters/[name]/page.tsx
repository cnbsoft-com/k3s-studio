"use client";

import { use, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  getCluster, getNodes, deleteCluster, addWorkers, deleteWorker, addTls,
  startNode, stopNode, restartNode, suspendNode,
  startCluster, stopCluster, restartCluster, suspendCluster,
  getK8sNamespaces, getK8sPods, getK8sServices, getK8sDeployments, getK8sConfigMaps,
  getK8sStatefulSets, getK8sIngresses, getK8sSecrets,
  applyManifest, deleteManifest,
  getK8sResourceManifest,
  getManifestTemplates, createManifestTemplate,
  getApplyHistory,
  getPodLogs,
} from "@/lib/api";
import { StatusBadge } from "@/components/status-badge";
import { NodeTable } from "@/components/node-table";
import { JobLogViewer } from "@/components/job-log-viewer";
import { Breadcrumb } from "@/components/breadcrumb";
import { NamespaceSelector } from "@/components/namespace-selector";
import { K8sResourceTable } from "@/components/k8s-resource-table";
import { ManifestEditor } from "@/components/manifest-editor";
import { toast } from "sonner";
import { Trash2, Plus, Shield, Download, Play, Square, RotateCcw, PauseCircle } from "lucide-react";

type ResourceType = "pods" | "services" | "deployments" | "configmaps" | "statefulsets" | "ingresses" | "secrets";
interface SelectedResource { type: ResourceType; namespace: string; name: string }

export default function ClusterDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [pendingNodes, setPendingNodes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"nodes" | "k8s">("nodes");
  const [k8sNamespace, setK8sNamespace] = useState("all");
  const [k8sResource, setK8sResource] = useState<ResourceType>("pods");
  const [selectedResource, setSelectedResource] = useState<SelectedResource | null>(null);
  const [panelTab, setPanelTab] = useState<"yaml" | "logs">("yaml");
  const [manifestYaml, setManifestYaml] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [yamlToSave, setYamlToSave] = useState("");
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
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

  const { data: nodes = [], isLoading: nodesLoading, isError: nodesError, refetch: refetchNodes } = useQuery({
    queryKey: ["nodes", name],
    queryFn: () => getNodes(name),
    refetchInterval: activeJobId ? false : 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCluster(name),
    onSuccess: (res) => { setShowDeleteDialog(false); setActiveJobId(res.jobId); },
    onError: () => toast.error("삭제 요청 실패"),
  });

  const addWorkerMutation = useMutation({
    mutationFn: () => addWorkers(name, { workerSpec, workerCount }),
    onSuccess: (res) => { setShowAddWorker(false); setActiveJobId(res.jobId); toast.success("워커 추가가 시작되었습니다."); },
    onError: () => toast.error("워커 추가 요청 실패"),
  });

  const deleteWorkerMutation = useMutation({
    mutationFn: (workerName: string) => deleteWorker(name, workerName),
    onSuccess: (res) => { setActiveJobId(res.jobId); toast.success("워커 삭제가 시작되었습니다."); },
    onError: () => toast.error("워커 삭제 요청 실패"),
  });

  const tlsMutation = useMutation({
    mutationFn: () => addTls(name, tlsDomain),
    onSuccess: (res) => { setShowTls(false); setActiveJobId(res.jobId); toast.success("TLS 설정이 시작되었습니다."); },
    onError: () => toast.error("TLS 설정 요청 실패"),
  });

  const addPending = (node: string) => setPendingNodes((s) => new Set(s).add(node));
  const rmPending  = (node: string) => setPendingNodes((s) => { const n = new Set(s); n.delete(node); return n; });
  const invalidateNodes = () => queryClient.invalidateQueries({ queryKey: ["nodes", name] });

  const startNodeMutation = useMutation({
    mutationFn: (nodeName: string) => { addPending(nodeName); return startNode(name, nodeName); },
    onSuccess: (_d, n) => { rmPending(n); invalidateNodes(); toast.success("노드 시작 완료"); },
    onError: (_e, n) => { rmPending(n); toast.error("노드 시작 실패"); },
  });
  const stopNodeMutation = useMutation({
    mutationFn: (nodeName: string) => { addPending(nodeName); return stopNode(name, nodeName); },
    onSuccess: (_d, n) => { rmPending(n); invalidateNodes(); toast.success("노드 중지 완료"); },
    onError: (_e, n) => { rmPending(n); toast.error("노드 중지 실패"); },
  });
  const restartNodeMutation = useMutation({
    mutationFn: (nodeName: string) => { addPending(nodeName); return restartNode(name, nodeName); },
    onSuccess: (_d, n) => { rmPending(n); invalidateNodes(); toast.success("노드 재시작 완료"); },
    onError: (_e, n) => { rmPending(n); toast.error("노드 재시작 실패"); },
  });
  const suspendNodeMutation = useMutation({
    mutationFn: (nodeName: string) => { addPending(nodeName); return suspendNode(name, nodeName); },
    onSuccess: (_d, n) => { rmPending(n); invalidateNodes(); toast.success("노드 일시정지 완료"); },
    onError: (_e, n) => { rmPending(n); toast.error("노드 일시정지 실패"); },
  });

  const startClusterMutation = useMutation({
    mutationFn: () => startCluster(name),
    onSuccess: () => { invalidateNodes(); toast.success("클러스터 시작 완료"); },
    onError: () => toast.error("클러스터 시작 실패"),
  });
  const stopClusterMutation = useMutation({
    mutationFn: () => stopCluster(name),
    onSuccess: () => { invalidateNodes(); toast.success("클러스터 중지 완료"); },
    onError: () => toast.error("클러스터 중지 실패"),
  });
  const restartClusterMutation = useMutation({
    mutationFn: () => restartCluster(name),
    onSuccess: () => { invalidateNodes(); toast.success("클러스터 재시작 완료"); },
    onError: () => toast.error("클러스터 재시작 실패"),
  });
  const suspendClusterMutation = useMutation({
    mutationFn: () => suspendCluster(name),
    onSuccess: () => { invalidateNodes(); toast.success("클러스터 일시정지 완료"); },
    onError: () => toast.error("클러스터 일시정지 실패"),
  });

  const isClusterPending =
    startClusterMutation.isPending || stopClusterMutation.isPending ||
    restartClusterMutation.isPending || suspendClusterMutation.isPending;

  const { data: k8sNamespaces = [] } = useQuery({
    queryKey: ["k8s-namespaces", name],
    queryFn: () => getK8sNamespaces(name),
    enabled: activeTab === "k8s",
    staleTime: 30_000,
  });

  const { data: k8sPods = [], isLoading: podsLoading } = useQuery({
    queryKey: ["k8s-pods", name, k8sNamespace],
    queryFn: () => getK8sPods(name, k8sNamespace),
    enabled: activeTab === "k8s" && k8sResource === "pods",
    staleTime: 15_000,
  });

  const { data: k8sServices = [], isLoading: servicesLoading } = useQuery({
    queryKey: ["k8s-services", name, k8sNamespace],
    queryFn: () => getK8sServices(name, k8sNamespace),
    enabled: activeTab === "k8s" && k8sResource === "services",
    staleTime: 15_000,
  });

  const { data: k8sDeployments = [], isLoading: deploymentsLoading } = useQuery({
    queryKey: ["k8s-deployments", name, k8sNamespace],
    queryFn: () => getK8sDeployments(name, k8sNamespace),
    enabled: activeTab === "k8s" && k8sResource === "deployments",
    staleTime: 15_000,
  });

  const { data: k8sConfigMaps = [], isLoading: configMapsLoading } = useQuery({
    queryKey: ["k8s-configmaps", name, k8sNamespace],
    queryFn: () => getK8sConfigMaps(name, k8sNamespace),
    enabled: activeTab === "k8s" && k8sResource === "configmaps",
    staleTime: 15_000,
  });

  const { data: k8sStatefulSets = [], isLoading: statefulSetsLoading } = useQuery({
    queryKey: ["k8s-statefulsets", name, k8sNamespace],
    queryFn: () => getK8sStatefulSets(name, k8sNamespace),
    enabled: activeTab === "k8s" && k8sResource === "statefulsets",
    staleTime: 15_000,
  });

  const { data: k8sIngresses = [], isLoading: ingressesLoading } = useQuery({
    queryKey: ["k8s-ingresses", name, k8sNamespace],
    queryFn: () => getK8sIngresses(name, k8sNamespace),
    enabled: activeTab === "k8s" && k8sResource === "ingresses",
    staleTime: 15_000,
  });

  const { data: k8sSecrets = [], isLoading: secretsLoading } = useQuery({
    queryKey: ["k8s-secrets", name, k8sNamespace],
    queryFn: () => getK8sSecrets(name, k8sNamespace),
    enabled: activeTab === "k8s" && k8sResource === "secrets",
    staleTime: 15_000,
  });

  const {
    data: readonlyYaml,
    isLoading: manifestLoading,
    isError: manifestError,
    refetch: refetchManifest,
  } = useQuery({
    queryKey: ["k8s-manifest", name, selectedResource?.type, selectedResource?.namespace, selectedResource?.name],
    queryFn: () => getK8sResourceManifest(
      name,
      selectedResource!.type,
      selectedResource!.namespace,
      selectedResource!.name
    ),
    enabled: selectedResource !== null,
    staleTime: 0,
  });

  const {
    data: podLogs,
    isLoading: logsLoading,
    isError: logsError,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["pod-logs", name, selectedResource?.namespace, selectedResource?.name],
    queryFn: () => getPodLogs(name, selectedResource!.namespace, selectedResource!.name),
    enabled: selectedResource !== null && selectedResource.type === "pods" && panelTab === "logs",
    staleTime: 0,
  });

  const { data: applyHistory = [], refetch: refetchHistory } = useQuery({
    queryKey: ["apply-history", name],
    queryFn: () => getApplyHistory(name),
    enabled: activeTab === "k8s",
    staleTime: 0,
  });

  const applyMutation = useMutation({
    mutationFn: (yaml: string) => applyManifest(name, yaml),
    onSuccess: () => { toast.success("Manifest 적용 완료"); refetchHistory(); },
    onError: (e: Error) => { toast.error("적용 실패: " + e.message); refetchHistory(); },
  });

  const deleteManiMutation = useMutation({
    mutationFn: (yaml: string) => deleteManifest(name, yaml),
    onSuccess: () => { toast.success("Manifest 삭제 완료"); refetchHistory(); },
    onError: (e: Error) => { toast.error("삭제 실패: " + e.message); refetchHistory(); },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: () => createManifestTemplate({ clusterName: name, name: saveName, description: saveDesc || undefined, yamlContent: yamlToSave }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manifest-templates", name] });
      setShowSaveDialog(false);
      setSaveName("");
      setSaveDesc("");
      toast.success("Template 저장 완료");
    },
    onError: (e: { response?: { status: number } } & Error) => {
      if (e.response?.status === 409) {
        toast.error("이미 존재하는 이름입니다");
      } else {
        toast.error("저장 실패: " + e.message);
      }
    },
  });

  const k8sData =
    k8sResource === "pods" ? k8sPods :
    k8sResource === "services" ? k8sServices :
    k8sResource === "deployments" ? k8sDeployments :
    k8sResource === "statefulsets" ? k8sStatefulSets :
    k8sResource === "ingresses" ? k8sIngresses :
    k8sResource === "secrets" ? k8sSecrets :
    k8sConfigMaps;

  const k8sLoading =
    k8sResource === "pods" ? podsLoading :
    k8sResource === "services" ? servicesLoading :
    k8sResource === "deployments" ? deploymentsLoading :
    k8sResource === "statefulsets" ? statefulSetsLoading :
    k8sResource === "ingresses" ? ingressesLoading :
    k8sResource === "secrets" ? secretsLoading :
    configMapsLoading;

  const selectedKey = selectedResource
    ? `${selectedResource.namespace}/${selectedResource.name}`
    : null;

  const handleResourceSelect = (namespace: string, resourceName: string) => {
    setSelectedResource({ type: k8sResource, namespace, name: resourceName });
    setPanelTab("yaml");
  };

  const handleTypeOrNsChange = () => {
    setSelectedResource(null);
  };

  const openSaveDialog = (yaml: string) => {
    setYamlToSave(yaml);
    setSaveName("");
    setSaveDesc("");
    setShowSaveDialog(true);
  };

  const handleJobDone = (success: boolean) => {
    setActiveJobId(null);
    queryClient.invalidateQueries({ queryKey: ["clusters"] });
    queryClient.invalidateQueries({ queryKey: ["cluster", name] });
    queryClient.invalidateQueries({ queryKey: ["nodes", name] });
    if (!success) return;
    if (!cluster || cluster.status === "DELETING") router.push("/");
  };

  if (clusterLoading) return <div className="animate-pulse h-32 bg-muted rounded-lg" />;
  if (!cluster) return <p className="text-muted-foreground">클러스터를 찾을 수 없습니다.</p>;

  return (
    <div className={`space-y-6 ${activeTab === "k8s" ? "max-w-6xl" : "max-w-4xl"}`}>
      <div className="space-y-2">
        <Breadcrumb items={[{ label: "대시보드", href: "/" }, { label: cluster.name }]} />
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{cluster.name}</h1>
          <StatusBadge status={cluster.status} />
        </div>
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

      {/* 탭 */}
      <div className="border-b flex gap-1">
        {(["nodes", "k8s"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "nodes" ? "노드" : "K8s"}
          </button>
        ))}
      </div>

      {/* 노드 탭 */}
      {activeTab === "nodes" && (
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
              isLocal={cluster.serverLocal}
              isError={nodesError}
              onRetry={() => refetchNodes()}
              onDeleteWorker={(wn) => deleteWorkerMutation.mutate(wn)}
              onStart={(n) => startNodeMutation.mutate(n)}
              onStop={(n) => stopNodeMutation.mutate(n)}
              onRestart={(n) => restartNodeMutation.mutate(n)}
              onSuspend={(n) => suspendNodeMutation.mutate(n)}
              pendingNodes={pendingNodes}
              isClusterPending={isClusterPending}
            />
          )}
        </div>
      )}

      {/* K8s 탭 */}
      {activeTab === "k8s" && (
        <div className="space-y-4">
          {/* NS 셀렉터 + 리소스 타입 토글 */}
          <div className="flex flex-wrap items-center gap-3">
            <NamespaceSelector
              namespaces={k8sNamespaces}
              value={k8sNamespace}
              onChange={(ns) => { setK8sNamespace(ns); handleTypeOrNsChange(); }}
            />
            <div className="flex rounded-lg border overflow-hidden flex-wrap">
              {(["pods", "services", "deployments", "statefulsets", "ingresses", "secrets", "configmaps"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => { setK8sResource(r); handleTypeOrNsChange(); }}
                  className={`px-3 py-1.5 text-sm ${
                    k8sResource === r ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {{ pods: "Pods", services: "Services", deployments: "Deployments", statefulsets: "StatefulSets", ingresses: "Ingresses", secrets: "Secrets", configmaps: "ConfigMaps" }[r]}
                </button>
              ))}
            </div>
          </div>

          {/* Split-pane: 테이블 | 읽기전용 YAML 패널 */}
          <div className="grid grid-cols-2 gap-4 items-start">
            {/* 왼쪽: 리소스 테이블 */}
            <div className="min-w-0">
              <K8sResourceTable
                resourceType={k8sResource}
                data={k8sData}
                loading={k8sLoading}
                selectedKey={selectedKey}
                onSelect={handleResourceSelect}
              />
            </div>

            {/* 오른쪽: 읽기전용 패널 */}
            <div className="rounded-lg border min-h-[160px] flex flex-col">
              {!selectedResource && (
                <p className="text-sm text-muted-foreground text-center mt-8 p-3">
                  테이블에서 리소스를 클릭하세요
                </p>
              )}
              {selectedResource && (
                <>
                  {/* 패널 탭 */}
                  <div className="flex border-b px-3">
                    <button
                      onClick={() => setPanelTab("yaml")}
                      className={`py-2 px-3 text-xs font-medium border-b-2 -mb-px transition-colors ${panelTab === "yaml" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                      YAML
                    </button>
                    {selectedResource.type === "pods" && (
                      <button
                        onClick={() => setPanelTab("logs")}
                        className={`py-2 px-3 text-xs font-medium border-b-2 -mb-px transition-colors ${panelTab === "logs" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                      >
                        로그
                      </button>
                    )}
                  </div>

                  <div className="p-3 flex-1">
                    {/* YAML 탭 */}
                    {panelTab === "yaml" && (
                      <>
                        {manifestLoading && (
                          <div className="space-y-2">
                            <div className="animate-pulse h-4 bg-muted rounded w-3/4" />
                            <div className="animate-pulse h-4 bg-muted rounded w-1/2" />
                            <div className="animate-pulse h-4 bg-muted rounded w-5/6" />
                            <div className="animate-pulse h-4 bg-muted rounded w-2/3" />
                          </div>
                        )}
                        {!manifestLoading && manifestError && (
                          <div className="space-y-2">
                            <p className="text-sm text-destructive">manifest 조회 실패</p>
                            <button onClick={() => refetchManifest()} className="text-xs rounded border px-2 py-1 hover:bg-muted">재시도</button>
                          </div>
                        )}
                        {!manifestLoading && !manifestError && readonlyYaml && (
                          <div className="space-y-2">
                            <pre className="text-xs font-mono overflow-auto max-h-96 whitespace-pre bg-muted/30 rounded p-2">
                              {readonlyYaml}
                            </pre>
                            <div className="flex gap-2">
                              <button onClick={() => openSaveDialog(readonlyYaml)} className="rounded border px-3 py-1 text-xs hover:bg-muted">Template으로 저장</button>
                              <button onClick={() => setManifestYaml(readonlyYaml)} className="rounded border px-3 py-1 text-xs hover:bg-muted">편집기로 ↓</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* 로그 탭 */}
                    {panelTab === "logs" && (
                      <>
                        {logsLoading && (
                          <div className="space-y-2">
                            <div className="animate-pulse h-4 bg-muted rounded w-full" />
                            <div className="animate-pulse h-4 bg-muted rounded w-5/6" />
                            <div className="animate-pulse h-4 bg-muted rounded w-3/4" />
                          </div>
                        )}
                        {!logsLoading && logsError && (
                          <div className="space-y-2">
                            <p className="text-sm text-destructive">로그 조회 실패</p>
                            <button onClick={() => refetchLogs()} className="text-xs rounded border px-2 py-1 hover:bg-muted">재시도</button>
                          </div>
                        )}
                        {!logsLoading && !logsError && (
                          <div className="space-y-2">
                            <pre className="text-xs font-mono overflow-auto max-h-96 whitespace-pre bg-muted/30 rounded p-2">
                              {podLogs || "(로그 없음)"}
                            </pre>
                            <button onClick={() => refetchLogs()} className="rounded border px-3 py-1 text-xs hover:bg-muted">새로고침</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Manifest 편집기 */}
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-medium">Manifest 편집기</h3>
            <ManifestEditor
              value={manifestYaml}
              onChange={setManifestYaml}
              clusterName={name}
              onApply={(yaml) => applyMutation.mutate(yaml)}
              onDelete={(yaml) => deleteManiMutation.mutate(yaml)}
              onSaveTemplate={() => openSaveDialog(manifestYaml)}
              applyPending={applyMutation.isPending}
              deletePending={deleteManiMutation.isPending}
            />
          </div>

          {/* Apply 히스토리 */}
          {applyHistory.length > 0 && (
            <div className="space-y-2 pt-1">
              <h3 className="text-sm font-medium text-muted-foreground">Apply 히스토리</h3>
              <div className="rounded-md border divide-y text-xs max-h-48 overflow-y-auto">
                {applyHistory.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setManifestYaml(h.yamlContent)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 text-left"
                    title="편집기로 불러오기"
                  >
                    <span className={`shrink-0 font-medium ${h.action === "apply" ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`}>
                      {h.action === "apply" ? "Apply" : "Delete"}
                    </span>
                    <span className={`shrink-0 ${h.result === "success" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                      {h.result === "success" ? "성공" : "실패"}
                    </span>
                    <span className="truncate text-muted-foreground flex-1">{h.yamlContent.slice(0, 60)}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {new Date(h.executedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => startClusterMutation.mutate()} disabled={isClusterPending}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            <Play className="h-4 w-4" /> 클러스터 시작
          </button>
          <button onClick={() => stopClusterMutation.mutate()} disabled={isClusterPending}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            <Square className="h-4 w-4" /> 클러스터 중지
          </button>
          <button onClick={() => restartClusterMutation.mutate()} disabled={isClusterPending}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            <RotateCcw className="h-4 w-4" /> 클러스터 재시작
          </button>
          {cluster.serverLocal && (
            <button onClick={() => suspendClusterMutation.mutate()} disabled={isClusterPending}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
              <PauseCircle className="h-4 w-4" /> 클러스터 일시정지
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
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
      </div>

      {/* Template 저장 다이얼로그 */}
      {showSaveDialog && (
        <Dialog title="Template 저장" onClose={() => setShowSaveDialog(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                이름 <span className="text-destructive">*</span>
              </label>
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                maxLength={100}
                placeholder="nginx-deployment"
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">설명 (선택)</label>
              <textarea
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                maxLength={200}
                rows={2}
                className="w-full rounded-md border px-3 py-2 text-sm resize-none"
              />
            </div>
            <button
              onClick={() => saveTemplateMutation.mutate()}
              disabled={!saveName.trim() || saveTemplateMutation.isPending}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm hover:bg-primary/90 disabled:opacity-60"
            >
              {saveTemplateMutation.isPending ? "저장 중..." : "저장"}
            </button>
          </div>
        </Dialog>
      )}

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
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

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
