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

// ── Cluster ────────────────────────────────────────────────────────────────

export interface ClusterResponse {
  id: number;
  serverId: number | null;
  serverName: string | null;
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

export interface NodeResponse {
  name: string;
  state: string;
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

// Jobs
export const getJob = (jobId: string) =>
  api.get<JobResponse>(`/jobs/${jobId}`).then((r) => r.data);

// Images
export const getImages = () =>
  api.get<string[]>("/images").then((r) => r.data);
