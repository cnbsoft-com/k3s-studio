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
  setNodeHardware,
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
import { useTranslation } from "@/contexts/I18nContext";

type ResourceType = "pods" | "services" | "deployments" | "configmaps" | "statefulsets" | "ingresses" | "secrets";
interface SelectedResource { type: ResourceType; namespace: string; name: string }

export default function ClusterDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

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
  const [hardwareNode, setHardwareNode] = useState<string | null>(null);
  const [hwCpus, setHwCpus] = useState("");
  const [hwMemory, setHwMemory] = useState("");
  const [hwDisk, setHwDisk] = useState("");
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
    onError: () => toast.error(t("cluster.delete_started")),
  });

  const addWorkerMutation = useMutation({
    mutationFn: () => addWorkers(name, { workerSpec, workerCount }),
    onSuccess: (res) => { setShowAddWorker(false); setActiveJobId(res.jobId); toast.success(t("cluster.worker_add_started")); },
    onError: () => toast.error(t("cluster.worker_add_failed")),
  });

  const deleteWorkerMutation = useMutation({
    mutationFn: (workerName: string) => deleteWorker(name, workerName),
    onSuccess: (res) => { setActiveJobId(res.jobId); toast.success(t("cluster.worker_delete_started")); },
    onError: () => toast.error(t("cluster.worker_delete_failed")),
  });

  const tlsMutation = useMutation({
    mutationFn: () => addTls(name, tlsDomain),
    onSuccess: (res) => { setShowTls(false); setActiveJobId(res.jobId); toast.success(t("cluster.tls_started")); },
    onError: () => toast.error(t("cluster.tls_failed")),
  });

  const addPending = (node: string) => setPendingNodes((s) => new Set(s).add(node));
  const rmPending  = (node: string) => setPendingNodes((s) => { const n = new Set(s); n.delete(node); return n; });
  const invalidateNodes = () => queryClient.invalidateQueries({ queryKey: ["nodes", name] });

  const startNodeMutation = useMutation({
    mutationFn: (nodeName: string) => { addPending(nodeName); return startNode(name, nodeName); },
    onSuccess: (_d, n) => { rmPending(n); invalidateNodes(); toast.success(t("node.start_done")); },
    onError: (_e, n) => { rmPending(n); toast.error(t("node.start_failed")); },
  });
  const stopNodeMutation = useMutation({
    mutationFn: (nodeName: string) => { addPending(nodeName); return stopNode(name, nodeName); },
    onSuccess: (_d, n) => { rmPending(n); invalidateNodes(); toast.success(t("node.stop_done")); },
    onError: (_e, n) => { rmPending(n); toast.error(t("node.stop_failed")); },
  });
  const restartNodeMutation = useMutation({
    mutationFn: (nodeName: string) => { addPending(nodeName); return restartNode(name, nodeName); },
    onSuccess: (_d, n) => { rmPending(n); invalidateNodes(); toast.success(t("node.restart_done")); },
    onError: (_e, n) => { rmPending(n); toast.error(t("node.restart_failed")); },
  });
  const suspendNodeMutation = useMutation({
    mutationFn: (nodeName: string) => { addPending(nodeName); return suspendNode(name, nodeName); },
    onSuccess: (_d, n) => { rmPending(n); invalidateNodes(); toast.success(t("node.suspend_done")); },
    onError: (_e, n) => { rmPending(n); toast.error(t("node.suspend_failed")); },
  });

  const startClusterMutation = useMutation({
    mutationFn: () => startCluster(name),
    onSuccess: () => { invalidateNodes(); toast.success(t("cluster.start_done")); },
    onError: () => toast.error(t("cluster.start_failed")),
  });
  const stopClusterMutation = useMutation({
    mutationFn: () => stopCluster(name),
    onSuccess: () => { invalidateNodes(); toast.success(t("cluster.stop_done")); },
    onError: () => toast.error(t("cluster.stop_failed")),
  });
  const restartClusterMutation = useMutation({
    mutationFn: () => restartCluster(name),
    onSuccess: () => { invalidateNodes(); toast.success(t("cluster.restart_done")); },
    onError: () => toast.error(t("cluster.restart_failed")),
  });
  const suspendClusterMutation = useMutation({
    mutationFn: () => suspendCluster(name),
    onSuccess: () => { invalidateNodes(); toast.success(t("cluster.suspend_done")); },
    onError: () => toast.error(t("cluster.suspend_failed")),
  });

  const setHardwareMutation = useMutation({
    mutationFn: () => setNodeHardware(name, hardwareNode!, {
      cpus: hwCpus ? Number(hwCpus) : undefined,
      memory: hwMemory || undefined,
      disk: hwDisk || undefined,
    }),
    onSuccess: () => {
      setHardwareNode(null);
      toast.success(t("node.hardware_done"));
    },
    onError: (e: Error) => toast.error(t("node.hardware_failed") + ": " + e.message),
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
    onSuccess: () => { toast.success(t("k8s.apply_done")); refetchHistory(); },
    onError: (e: Error) => { toast.error(t("k8s.apply_failed") + ": " + e.message); refetchHistory(); },
  });

  const deleteManiMutation = useMutation({
    mutationFn: (yaml: string) => deleteManifest(name, yaml),
    onSuccess: () => { toast.success(t("k8s.delete_done")); refetchHistory(); },
    onError: (e: Error) => { toast.error(t("k8s.delete_failed") + ": " + e.message); refetchHistory(); },
  });

  const saveTemplateMutation = useMutation({
    mutationFn: () => createManifestTemplate({ clusterName: name, name: saveName, description: saveDesc || undefined, yamlContent: yamlToSave }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manifest-templates", name] });
      setShowSaveDialog(false);
      setSaveName("");
      setSaveDesc("");
      toast.success(t("k8s.template_save_done"));
    },
    onError: (e: { response?: { status: number } } & Error) => {
      if (e.response?.status === 409) {
        toast.error(t("k8s.template_save_conflict"));
      } else {
        toast.error(t("k8s.template_save_failed") + ": " + e.message);
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
  if (!cluster) return <p className="text-muted-foreground">{t("cluster.not_found")}</p>;

  return (
    <div className={`space-y-6 ${activeTab === "k8s" ? "max-w-6xl" : "max-w-4xl"}`}>
      <div className="space-y-2">
        <Breadcrumb items={[{ label: t("dashboard.title"), href: "/" }, { label: cluster.name }]} />
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{cluster.name}</h1>
          <StatusBadge status={cluster.status} />
        </div>
      </div>

      {/* Cluster info */}
      <div className="rounded-lg border p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <InfoItem label={t("cluster.info.master_spec")} value={cluster.masterSpec} />
        <InfoItem label={t("cluster.info.worker_count")} value={String(cluster.workerCount)} />
        <InfoItem label={t("cluster.info.image")} value={cluster.ubuntuImage} />
        <InfoItem label={t("cluster.info.created_at")} value={new Date(cluster.createdAt).toLocaleDateString("ko-KR")} />
      </div>

      {/* Job log */}
      {activeJobId && (
        <div className="space-y-2">
          <JobLogViewer jobId={activeJobId} onDone={handleJobDone} />
        </div>
      )}

      {/* Tabs */}
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
            {tab === "nodes" ? t("node.tab") : t("k8s.tab")}
          </button>
        ))}
      </div>

      {/* Nodes tab */}
      {activeTab === "nodes" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{t("node.tab")}</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAddWorker(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
                <Plus className="h-4 w-4" /> {t("cluster.add_worker")}
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
              onEditHardware={(n) => { setHardwareNode(n); setHwCpus(""); setHwMemory(""); setHwDisk(""); }}
              pendingNodes={pendingNodes}
              isClusterPending={isClusterPending}
            />
          )}
        </div>
      )}

      {/* K8s tab */}
      {activeTab === "k8s" && (
        <div className="space-y-4">
          {/* NS selector + resource type toggle */}
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
                  {t(`k8s.resource.${r}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Split-pane: table | readonly YAML panel */}
          <div className="grid grid-cols-2 gap-4 items-start">
            {/* Left: resource table */}
            <div className="min-w-0">
              <K8sResourceTable
                resourceType={k8sResource}
                data={k8sData}
                loading={k8sLoading}
                selectedKey={selectedKey}
                onSelect={handleResourceSelect}
              />
            </div>

            {/* Right: readonly panel */}
            <div className="rounded-lg border min-h-[160px] flex flex-col">
              {!selectedResource && (
                <p className="text-sm text-muted-foreground text-center mt-8 p-3">
                  {t("k8s.click_hint")}
                </p>
              )}
              {selectedResource && (
                <>
                  {/* Panel tabs */}
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
                        {t("k8s.logs_tab")}
                      </button>
                    )}
                  </div>

                  <div className="p-3 flex-1">
                    {/* YAML tab */}
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
                            <p className="text-sm text-destructive">{t("k8s.manifest_failed")}</p>
                            <button onClick={() => refetchManifest()} className="text-xs rounded border px-2 py-1 hover:bg-muted">{t("k8s.manifest_retry")}</button>
                          </div>
                        )}
                        {!manifestLoading && !manifestError && readonlyYaml && (
                          <div className="space-y-2">
                            <pre className="text-xs font-mono overflow-auto max-h-96 whitespace-pre bg-muted/30 rounded p-2">
                              {readonlyYaml}
                            </pre>
                            <div className="flex gap-2">
                              <button onClick={() => openSaveDialog(readonlyYaml)} className="rounded border px-3 py-1 text-xs hover:bg-muted">{t("k8s.save_template")}</button>
                              <button onClick={() => setManifestYaml(readonlyYaml)} className="rounded border px-3 py-1 text-xs hover:bg-muted">{t("k8s.to_editor")}</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Logs tab */}
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
                            <p className="text-sm text-destructive">{t("k8s.logs_failed")}</p>
                            <button onClick={() => refetchLogs()} className="text-xs rounded border px-2 py-1 hover:bg-muted">{t("common.retry")}</button>
                          </div>
                        )}
                        {!logsLoading && !logsError && (
                          <div className="space-y-2">
                            <pre className="text-xs font-mono overflow-auto max-h-96 whitespace-pre bg-muted/30 rounded p-2">
                              {podLogs || t("k8s.logs_empty")}
                            </pre>
                            <button onClick={() => refetchLogs()} className="rounded border px-3 py-1 text-xs hover:bg-muted">{t("k8s.logs_refresh")}</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Manifest editor */}
          <div className="space-y-2 pt-2">
            <h3 className="text-sm font-medium">{t("k8s.manifest_editor")}</h3>
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

          {/* Apply history */}
          {applyHistory.length > 0 && (
            <div className="space-y-2 pt-1">
              <h3 className="text-sm font-medium text-muted-foreground">{t("k8s.history_title")}</h3>
              <div className="rounded-md border divide-y text-xs max-h-48 overflow-y-auto">
                {applyHistory.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setManifestYaml(h.yamlContent)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 text-left"
                  >
                    <span className={`shrink-0 font-medium ${h.action === "apply" ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`}>
                      {h.action === "apply" ? "Apply" : "Delete"}
                    </span>
                    <span className={`shrink-0 ${h.result === "success" ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                      {h.result === "success" ? t("k8s.history_success") : t("k8s.history_failed")}
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
            <Play className="h-4 w-4" /> {t("cluster.actions.start")}
          </button>
          <button onClick={() => stopClusterMutation.mutate()} disabled={isClusterPending}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            <Square className="h-4 w-4" /> {t("cluster.actions.stop")}
          </button>
          <button onClick={() => restartClusterMutation.mutate()} disabled={isClusterPending}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            <RotateCcw className="h-4 w-4" /> {t("cluster.actions.restart")}
          </button>
          {cluster.serverLocal && (
            <button onClick={() => suspendClusterMutation.mutate()} disabled={isClusterPending}
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
              <PauseCircle className="h-4 w-4" /> {t("cluster.actions.suspend")}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowTls(true)}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted">
            <Shield className="h-4 w-4" /> {t("cluster.tls")}
          </button>
          <a href={`/api/clusters/${name}/kubeconfig`} download
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-muted">
            <Download className="h-4 w-4" /> {t("cluster.kubeconfig")}
          </a>
          <button onClick={() => setShowDeleteDialog(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive text-destructive px-4 py-2 text-sm hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" /> {t("cluster.actions.delete")}
          </button>
        </div>
      </div>

      {/* Template save dialog */}
      {showSaveDialog && (
        <Dialog title={t("k8s.template_save_title")} onClose={() => setShowSaveDialog(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                {t("k8s.template_name")} <span className="text-destructive">*</span>
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
              <label className="block text-sm font-medium mb-1">{t("k8s.template_desc")}</label>
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
              {saveTemplateMutation.isPending ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </Dialog>
      )}

      {/* Hardware edit dialog */}
      {hardwareNode && (
        <Dialog title={`${hardwareNode} ${t("node.hardware_edit")}`} onClose={() => setHardwareNode(null)}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{t("node.hardware_hint")}</p>
            <div>
              <label className="block text-sm font-medium mb-1">{t("node.hardware_cpu")}</label>
              <input type="number" min={1} max={32} value={hwCpus}
                onChange={(e) => setHwCpus(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" placeholder={t("node.hardware_cpu_hint")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("node.hardware_memory")}</label>
              <input value={hwMemory} onChange={(e) => setHwMemory(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" placeholder={t("node.hardware_memory_hint")} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("node.hardware_disk")}</label>
              <input value={hwDisk} onChange={(e) => setHwDisk(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" placeholder={t("node.hardware_disk_hint")} />
            </div>
            <button
              onClick={() => setHardwareMutation.mutate()}
              disabled={(!hwCpus && !hwMemory && !hwDisk) || setHardwareMutation.isPending}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm hover:bg-primary/90 disabled:opacity-60"
            >
              {setHardwareMutation.isPending ? t("common.applying") : t("common.apply")}
            </button>
          </div>
        </Dialog>
      )}

      {/* Add worker dialog */}
      {showAddWorker && (
        <Dialog title={t("cluster.add_worker")} onClose={() => setShowAddWorker(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("cluster.worker_count")}</label>
              <input type="number" min={1} max={10} value={workerCount}
                onChange={(e) => setWorkerCount(Number(e.target.value))}
                className="w-24 rounded-md border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("cluster.worker_spec")}</label>
              <select value={workerSpec} onChange={(e) => setWorkerSpec(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm">
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            <button onClick={() => addWorkerMutation.mutate()} disabled={addWorkerMutation.isPending}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm hover:bg-primary/90 disabled:opacity-60">
              {t("common.add")}
            </button>
          </div>
        </Dialog>
      )}

      {/* TLS dialog */}
      {showTls && (
        <Dialog title={t("cluster.tls")} onClose={() => setShowTls(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t("cluster.tls_domain")}</label>
              <input value={tlsDomain} onChange={(e) => setTlsDomain(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm" placeholder="k3s.example.com" />
            </div>
            <button onClick={() => tlsMutation.mutate()} disabled={tlsMutation.isPending}
              className="w-full rounded-lg bg-primary text-primary-foreground py-2 text-sm hover:bg-primary/90 disabled:opacity-60">
              {tlsMutation.isPending ? t("common.applying") : t("common.apply")}
            </button>
          </div>
        </Dialog>
      )}

      {/* Delete confirm dialog */}
      {showDeleteDialog && (
        <Dialog title={t("cluster.actions.delete")} onClose={() => setShowDeleteDialog(false)}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("cluster.delete_irreversible")} <strong>{name}</strong>{t("cluster.delete_type_name")}
            </p>
            <input value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm" placeholder={name} />
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteInput !== name || deleteMutation.isPending}
              className="w-full rounded-lg bg-destructive text-destructive-foreground py-2 text-sm hover:bg-destructive/90 disabled:opacity-40">
              {t("common.delete")}
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
