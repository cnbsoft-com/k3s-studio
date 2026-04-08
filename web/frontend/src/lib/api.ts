import axios from "axios";

export const api = axios.create(
  {
    baseURL: "/api",

  }
);

axios.defaults.withCredentials = true;

export interface ClusterResponse {
  id: number;
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

// Clusters
export const getClusters = () =>
  api.get<ClusterResponse[]>("/clusters").then((r) => r.data);

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
