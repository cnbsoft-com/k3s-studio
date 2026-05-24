import axios from "axios";

export const api = axios.create({ baseURL: "/api" });
axios.defaults.withCredentials = true;

// ── Server ─────────────────────────────────────────────────────────────────

export type ServerStatus = "CONNECTED" | "UNREACHABLE" | "UNKNOWN" | "INSTALLING_MULTIPASS";

export interface ServerResponse {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string;
  local: boolean;
  status: ServerStatus;
  multipassVersion?: string;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface CreateServerRequest {
  name: string;
  host: string;
  port?: number;
  username: string;
  privateKey?: string;
}

export interface MultipassCheckResponse {
  installed: boolean;
  version?: string;
  message?: string;
}

export interface ConnectionTestResponse {
  success: boolean;
  message: string;
}

export interface DiscoveredCluster {
  name: string;
  workerCount: number;
  masterIp: string;
}

// ── Cluster ────────────────────────────────────────────────────────────────

export interface ClusterResponse {
  id: number;
  serverId: number | null;
  serverName: string | null;
  serverLocal: boolean;
  name: string;
  status: "CREATING" | "RUNNING" | "ERROR" | "DELETING";
  masterSpec: string;
  masterCpus: number;
  masterMemory: string;
  masterDisk: string;
  workerCount: number;
  ubuntuImage: string;
  options: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export type NodeState = "Running" | "Stopped" | "Starting" | "Restarting" | "Deleted" | "Suspended" | "Unknown";

export interface NodeResponse {
  name: string;
  state: NodeState;
  ipv4: string;
  image: string;
  cpus: string;
  memory: string;
  disk: string;
}

export interface JobResponse {
  id: string;
  clusterName: string;
  type: string;
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
  log: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface CreateClusterRequest {
  serverId?: number | null;
  name: string;
  masterSpec: string;
  masterCpus?: number;
  masterMemory?: string;
  masterDisk?: string;
  workerCount: number;
  workerSpec: string;
  workerCpus?: number;
  workerMemory?: string;
  workerDisk?: string;
  ubuntuImage: string;
  options: Record<string, boolean>;
}

// Servers
export const getServers = () =>
  api.get<ServerResponse[]>("/servers").then((r) => r.data);

export const getServer = (id: number) =>
  api.get<ServerResponse>(`/servers/${id}`).then((r) => r.data);

export const createServer = (data: CreateServerRequest) =>
  api.post<ServerResponse>("/servers", data).then((r) => r.data);

export const updateServer = (id: number, data: CreateServerRequest) =>
  api.put<ServerResponse>(`/servers/${id}`, data).then((r) => r.data);

export const deleteServer = (id: number) =>
  api.delete(`/servers/${id}`);

export const testServerConnection = (id: number) =>
  api.post<ConnectionTestResponse>(`/servers/${id}/test`).then((r) => r.data);

export const checkMultipass = (id: number) =>
  api.get<MultipassCheckResponse>(`/servers/${id}/multipass`).then((r) => r.data);

export const installMultipass = (id: number) =>
  api.post<{ jobId: string }>(`/servers/${id}/multipass/install`).then((r) => r.data);

export const discoverClusters = (id: number) =>
  api.get<DiscoveredCluster[]>(`/servers/${id}/discover-clusters`).then((r) => r.data);

export const importClusters = (serverId: number, clusters: DiscoveredCluster[]) =>
  api.post<ClusterResponse[]>("/clusters/import", { serverId, clusters }).then((r) => r.data);

// Clusters
export const getClusters = (serverId?: number) =>
  api.get<ClusterResponse[]>("/clusters", { params: serverId ? { serverId } : {} }).then((r) => r.data);

export const getCluster = (name: string) =>
  api.get<ClusterResponse>(`/clusters/${name}`).then((r) => r.data);

export const createCluster = (data: CreateClusterRequest) =>
  api.post<{ jobId: string }>("/clusters", data).then((r) => r.data);

export const deleteCluster = (name: string) =>
  api.delete<{ jobId: string }>(`/clusters/${name}`).then((r) => r.data);

export const getNodes = (name: string) =>
  api.get<NodeResponse[]>(`/clusters/${name}/nodes`).then((r) => r.data);

export const addWorkers = (
  name: string,
  data: { workerSpec: string; workerCount: number; workerCpus?: number; workerMemory?: string; workerDisk?: string }
) =>
  api.post<{ jobId: string }>(`/clusters/${name}/workers`, data).then((r) => r.data);

export const deleteWorker = (name: string, workerName: string) =>
  api.delete<{ jobId: string }>(`/clusters/${name}/workers/${workerName}`).then((r) => r.data);

export const addTls = (name: string, domain: string) =>
  api.post<{ jobId: string }>(`/clusters/${name}/tls`, { domain }).then((r) => r.data);

// Node control
export const startNode = (cluster: string, node: string) =>
  api.post(`/clusters/${cluster}/nodes/${node}/start`);
export const stopNode = (cluster: string, node: string) =>
  api.post(`/clusters/${cluster}/nodes/${node}/stop`);
export const restartNode = (cluster: string, node: string) =>
  api.post(`/clusters/${cluster}/nodes/${node}/restart`);
export const suspendNode = (cluster: string, node: string) =>
  api.post(`/clusters/${cluster}/nodes/${node}/suspend`);

// Cluster control
export const startCluster = (name: string) =>
  api.post(`/clusters/${name}/start`, null, { timeout: 120_000 });
export const stopCluster = (name: string) =>
  api.post(`/clusters/${name}/stop`, null, { timeout: 120_000 });
export const restartCluster = (name: string) =>
  api.post(`/clusters/${name}/restart`, null, { timeout: 240_000 });
export const suspendCluster = (name: string) =>
  api.post(`/clusters/${name}/suspend`);

// K8s types
export interface K8sPodResponse {
  name: string;
  namespace: string;
  status: string;
  ready: string;
  age: string;
  hostIp: string;
}

export interface K8sServiceResponse {
  name: string;
  namespace: string;
  type: string;
  clusterIp: string;
  ports: string;
  age: string;
}

export interface K8sDeploymentResponse {
  name: string;
  namespace: string;
  ready: string;
  upToDate: number;
  available: number;
  age: string;
}

export interface K8sConfigMapResponse {
  name: string;
  namespace: string;
  data: number;
  age: string;
}

// K8s API
export const getK8sNamespaces = (name: string) =>
  api.get<string[]>(`/clusters/${name}/k8s/namespaces`).then((r) => r.data);

export const getK8sPods = (name: string, namespace: string) =>
  api.get<K8sPodResponse[]>(`/clusters/${name}/k8s/pods`, { params: { namespace } }).then((r) => r.data);

export const getK8sServices = (name: string, namespace: string) =>
  api.get<K8sServiceResponse[]>(`/clusters/${name}/k8s/services`, { params: { namespace } }).then((r) => r.data);

export const getK8sDeployments = (name: string, namespace: string) =>
  api.get<K8sDeploymentResponse[]>(`/clusters/${name}/k8s/deployments`, { params: { namespace } }).then((r) => r.data);

export const getK8sConfigMaps = (name: string, namespace: string) =>
  api.get<K8sConfigMapResponse[]>(`/clusters/${name}/k8s/configmaps`, { params: { namespace } }).then((r) => r.data);

export const applyManifest = (name: string, yaml: string) =>
  api.post(`/clusters/${name}/k8s/apply`, { yaml });

export const deleteManifest = (name: string, yaml: string) =>
  api.post(`/clusters/${name}/k8s/delete`, { yaml });

export const getK8sResourceManifest = (
  clusterName: string, type: string, namespace: string, resourceName: string
) =>
  api.get<{ yaml: string }>(
    `/clusters/${clusterName}/k8s/${type}/${namespace}/${resourceName}/manifest`
  ).then((r) => r.data.yaml);

export const getPodLogs = (
  clusterName: string, namespace: string, podName: string, tail = 100
) =>
  api.get<{ logs: string }>(
    `/clusters/${clusterName}/k8s/pods/${namespace}/${podName}/logs`,
    { params: { tail } }
  ).then((r) => r.data.logs);

// Manifest Templates
export interface ManifestTemplateResponse {
  id: number;
  clusterName: string;
  name: string;
  description: string | null;
  yamlContent: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateManifestTemplateRequest {
  clusterName: string;
  name: string;
  description?: string;
  yamlContent: string;
}

export interface UpdateManifestTemplateRequest {
  name: string;
  description?: string;
  yamlContent: string;
}

export const getManifestTemplates = (clusterName: string) =>
  api.get<ManifestTemplateResponse[]>("/manifests", { params: { clusterName } }).then((r) => r.data);

export const createManifestTemplate = (data: CreateManifestTemplateRequest) =>
  api.post<ManifestTemplateResponse>("/manifests", data).then((r) => r.data);

export const updateManifestTemplate = (id: number, data: UpdateManifestTemplateRequest) =>
  api.put<ManifestTemplateResponse>(`/manifests/${id}`, data).then((r) => r.data);

export const deleteManifestTemplate = (id: number) =>
  api.delete(`/manifests/${id}`);

export interface ApplyHistoryResponse {
  id: number;
  action: "apply" | "delete";
  result: "success" | "failed";
  errorMessage: string | null;
  yamlContent: string;
  executedAt: string;
}

export const getApplyHistory = (clusterName: string) =>
  api.get<ApplyHistoryResponse[]>(`/clusters/${clusterName}/k8s/apply-history`).then((r) => r.data);

// Jobs
export const getJob = (jobId: string) =>
  api.get<JobResponse>(`/jobs/${jobId}`).then((r) => r.data);

// Images
export const getImages = () =>
  api.get<string[]>("/images").then((r) => r.data);
