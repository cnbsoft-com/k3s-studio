#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var import_mcp = require("@modelcontextprotocol/sdk/server/mcp.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_inMemory = require("@modelcontextprotocol/sdk/inMemory.js");
var import_client7 = require("@modelcontextprotocol/sdk/client/index.js");
var import_express = __toESM(require("express"));

// src/tools/cluster.ts
var import_zod = require("zod");

// src/client.ts
var import_axios = __toESM(require("axios"));
var apiUrl = process.env.K3S_STUDIO_API_URL ?? "http://localhost:8080";
var apiKey = process.env.K3S_STUDIO_API_KEY;
var http = import_axios.default.create({
  baseURL: apiUrl,
  headers: {
    "Content-Type": "application/json",
    ...apiKey ? { "X-Api-Key": apiKey } : {}
  },
  timeout: 1e4
});
var ollamaUrl = process.env.OLLAMA_URL ?? "http://localhost:11434";
var ollamaHttp = import_axios.default.create({
  baseURL: ollamaUrl,
  headers: { "Content-Type": "application/json" },
  timeout: 3e5
});

// src/polling.ts
async function waitForJob(jobId, timeoutMs = 6e5) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await http.get(`/api/jobs/${jobId}`);
    if (data.status === "SUCCESS") return { success: true, log: data.log ?? "" };
    if (data.status === "FAILED") return { success: false, log: data.log ?? "" };
    await sleep(3e3);
  }
  throw new Error(`Job ${jobId} timed out after ${timeoutMs / 1e3}s`);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// src/tools/cluster.ts
function registerClusterTools(server2) {
  server2.tool(
    "list_clusters",
    "List all k3s clusters managed by k3s-studio. Shows name, status, spec, and worker count. Call this before creating a cluster to check if it already exists.",
    {
      serverId: import_zod.z.number().optional().describe("Filter by server ID. Omit to list clusters from all servers.")
    },
    async ({ serverId }) => {
      const params = serverId !== void 0 ? { serverId } : {};
      const { data } = await http.get("/api/clusters", { params });
      if (data.length === 0) {
        return { content: [{ type: "text", text: "No clusters found." }] };
      }
      const rows = data.map(
        (c) => `\u2022 ${c.name} [${c.status}] master=${c.masterSpec} workers=${c.workerCount} server=${c.serverLocal ? "local" : c.serverName ?? c.serverId}`
      );
      return {
        content: [{ type: "text", text: rows.join("\n") }]
      };
    }
  );
  server2.tool(
    "get_cluster",
    "Get detailed information about a specific k3s cluster by name.",
    {
      name: import_zod.z.string().describe("Cluster name")
    },
    async ({ name }) => {
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    }
  );
  server2.tool(
    "create_cluster",
    "Create a new k3s cluster using Multipass VMs. This is a long-running operation (5\u201315 minutes). Always call list_clusters first to verify the cluster does not already exist. Returns when the cluster is fully ready or an error is reported.",
    {
      name: import_zod.z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).describe("Cluster name \u2014 lowercase letters, numbers, hyphens only"),
      serverId: import_zod.z.number().optional().describe("Server ID. Omit to use the local machine."),
      masterSpec: import_zod.z.enum(["small", "medium", "large"]).default("small").describe("Master node size: small=1CPU/2GB, medium=2CPU/4GB, large=4CPU/8GB"),
      workerCount: import_zod.z.number().int().min(0).max(20).default(0).describe("Number of worker nodes to add"),
      workerSpec: import_zod.z.enum(["small", "medium", "large"]).default("small").describe("Worker node size (ignored when workerCount=0)"),
      ubuntuImage: import_zod.z.string().default("22.04").describe("Ubuntu LTS version: 22.04 or 24.04")
    },
    async ({ name, serverId, masterSpec, workerCount, workerSpec, ubuntuImage }) => {
      const body = {
        name,
        masterSpec,
        workerCount,
        workerSpec,
        ubuntuImage
      };
      if (serverId !== void 0) body.serverId = serverId;
      const { data } = await http.post("/api/clusters", body);
      const jobId = data.jobId;
      const result = await waitForJob(jobId);
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Cluster '${name}' created successfully.

Build log:
${result.log}`
            }
          ]
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Cluster '${name}' creation FAILED.

Error log:
${result.log}`
          }
        ],
        isError: true
      };
    }
  );
  server2.tool(
    "delete_cluster",
    "\u26A0\uFE0F DESTRUCTIVE: Delete a k3s cluster and all its VMs permanently. This cannot be undone. Confirm the cluster name before proceeding.",
    {
      name: import_zod.z.string().describe("Cluster name to delete")
    },
    async ({ name }) => {
      const { data } = await http.delete(`/api/clusters/${encodeURIComponent(name)}`);
      const jobId = data.jobId;
      const result = await waitForJob(jobId);
      if (result.success) {
        return {
          content: [{ type: "text", text: `Cluster '${name}' deleted successfully.` }]
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Cluster '${name}' deletion FAILED.

${result.log}`
          }
        ],
        isError: true
      };
    }
  );
  server2.tool(
    "start_cluster",
    "Start a stopped k3s cluster (all its VMs).",
    {
      name: import_zod.z.string().describe("Cluster name")
    },
    async ({ name }) => {
      const { data } = await http.post(`/api/clusters/${encodeURIComponent(name)}/start`);
      const jobId = data.jobId;
      const result = await waitForJob(jobId);
      return {
        content: [
          {
            type: "text",
            text: result.success ? `Cluster '${name}' started.` : `Failed to start '${name}'.
${result.log}`
          }
        ],
        isError: !result.success
      };
    }
  );
  server2.tool(
    "stop_cluster",
    "Stop a running k3s cluster (powers off all VMs, data is preserved).",
    {
      name: import_zod.z.string().describe("Cluster name")
    },
    async ({ name }) => {
      const { data } = await http.post(`/api/clusters/${encodeURIComponent(name)}/stop`);
      const jobId = data.jobId;
      const result = await waitForJob(jobId);
      return {
        content: [
          {
            type: "text",
            text: result.success ? `Cluster '${name}' stopped.` : `Failed to stop '${name}'.
${result.log}`
          }
        ],
        isError: !result.success
      };
    }
  );
  server2.tool(
    "restart_cluster",
    "Restart a k3s cluster (all its VMs).",
    {
      name: import_zod.z.string().describe("Cluster name")
    },
    async ({ name }) => {
      await http.post(`/api/clusters/${encodeURIComponent(name)}/restart`);
      return { content: [{ type: "text", text: `Cluster '${name}' restart initiated.` }] };
    }
  );
  server2.tool(
    "suspend_cluster",
    "Suspend a k3s cluster (saves VM state to disk, faster resume than stop).",
    {
      name: import_zod.z.string().describe("Cluster name")
    },
    async ({ name }) => {
      await http.post(`/api/clusters/${encodeURIComponent(name)}/suspend`);
      return { content: [{ type: "text", text: `Cluster '${name}' suspended.` }] };
    }
  );
  server2.tool(
    "get_kubeconfig",
    "Download the kubeconfig file for a cluster so you can run kubectl commands against it.",
    {
      name: import_zod.z.string().describe("Cluster name")
    },
    async ({ name }) => {
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/kubeconfig`, {
        responseType: "text"
      });
      return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }] };
    }
  );
}

// src/tools/node.ts
var import_zod2 = require("zod");
function registerNodeTools(server2) {
  server2.tool(
    "get_cluster_nodes",
    "List all Multipass VMs (nodes) in a cluster with their IP addresses and running status.",
    {
      name: import_zod2.z.string().describe("Cluster name")
    },
    async ({ name }) => {
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/nodes`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No nodes found." }] };
      }
      const rows = data.map(
        (n) => `\u2022 ${n.name} [${n.state}] ip=${n.ipv4 ?? "\u2014"} cpu=${n.cpus} mem=${n.memory}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
  server2.tool(
    "add_workers",
    "Add worker nodes to an existing k3s cluster. This is a long-running operation.",
    {
      name: import_zod2.z.string().describe("Cluster name"),
      count: import_zod2.z.number().int().min(1).max(10).describe("Number of workers to add"),
      spec: import_zod2.z.enum(["small", "medium", "large"]).default("small").describe("Worker node size")
    },
    async ({ name, count, spec }) => {
      const { data } = await http.post(
        `/api/clusters/${encodeURIComponent(name)}/workers`,
        { count, spec }
      );
      const result = await waitForJob(data.jobId);
      return {
        content: [
          {
            type: "text",
            text: result.success ? `Added ${count} worker(s) to '${name}'.` : `Failed to add workers to '${name}'.
${result.log}`
          }
        ],
        isError: !result.success
      };
    }
  );
  server2.tool(
    "delete_worker",
    "\u26A0\uFE0F Remove a specific worker node from a cluster. The VM will be deleted permanently.",
    {
      name: import_zod2.z.string().describe("Cluster name"),
      workerName: import_zod2.z.string().describe("Worker VM name (e.g. mycluster-worker1)")
    },
    async ({ name, workerName }) => {
      const { data } = await http.delete(
        `/api/clusters/${encodeURIComponent(name)}/workers/${encodeURIComponent(workerName)}`
      );
      const result = await waitForJob(data.jobId);
      return {
        content: [
          {
            type: "text",
            text: result.success ? `Worker '${workerName}' deleted from '${name}'.` : `Failed to delete worker '${workerName}'.
${result.log}`
          }
        ],
        isError: !result.success
      };
    }
  );
  server2.tool(
    "start_node",
    "Start a specific VM node in a cluster.",
    {
      name: import_zod2.z.string().describe("Cluster name"),
      nodeName: import_zod2.z.string().describe("Node VM name (e.g. mycluster-master, mycluster-worker1)")
    },
    async ({ name, nodeName }) => {
      await http.post(`/api/clusters/${encodeURIComponent(name)}/nodes/${encodeURIComponent(nodeName)}/start`);
      return { content: [{ type: "text", text: `Node '${nodeName}' started.` }] };
    }
  );
  server2.tool(
    "stop_node",
    "Stop a specific VM node in a cluster (data preserved).",
    {
      name: import_zod2.z.string().describe("Cluster name"),
      nodeName: import_zod2.z.string().describe("Node VM name")
    },
    async ({ name, nodeName }) => {
      await http.post(`/api/clusters/${encodeURIComponent(name)}/nodes/${encodeURIComponent(nodeName)}/stop`);
      return { content: [{ type: "text", text: `Node '${nodeName}' stopped.` }] };
    }
  );
  server2.tool(
    "restart_node",
    "Restart a specific VM node in a cluster.",
    {
      name: import_zod2.z.string().describe("Cluster name"),
      nodeName: import_zod2.z.string().describe("Node VM name")
    },
    async ({ name, nodeName }) => {
      await http.post(`/api/clusters/${encodeURIComponent(name)}/nodes/${encodeURIComponent(nodeName)}/restart`);
      return { content: [{ type: "text", text: `Node '${nodeName}' restarted.` }] };
    }
  );
  server2.tool(
    "suspend_node",
    "Suspend a specific VM node (saves state to disk).",
    {
      name: import_zod2.z.string().describe("Cluster name"),
      nodeName: import_zod2.z.string().describe("Node VM name")
    },
    async ({ name, nodeName }) => {
      await http.post(`/api/clusters/${encodeURIComponent(name)}/nodes/${encodeURIComponent(nodeName)}/suspend`);
      return { content: [{ type: "text", text: `Node '${nodeName}' suspended.` }] };
    }
  );
  server2.tool(
    "update_node_hardware",
    "Change CPU and memory allocation for a VM node. Node must be stopped first.",
    {
      name: import_zod2.z.string().describe("Cluster name"),
      nodeName: import_zod2.z.string().describe("Node VM name"),
      cpus: import_zod2.z.number().int().min(1).max(16).optional().describe("Number of CPUs"),
      memoryGb: import_zod2.z.number().int().min(1).max(64).optional().describe("Memory in GB"),
      diskGb: import_zod2.z.number().int().min(10).max(500).optional().describe("Disk size in GB")
    },
    async ({ name, nodeName, cpus, memoryGb, diskGb }) => {
      const body = {};
      if (cpus !== void 0) body.cpus = cpus;
      if (memoryGb !== void 0) body.memory = `${memoryGb}G`;
      if (diskGb !== void 0) body.disk = `${diskGb}G`;
      await http.patch(
        `/api/clusters/${encodeURIComponent(name)}/nodes/${encodeURIComponent(nodeName)}/hardware`,
        body
      );
      return { content: [{ type: "text", text: `Node '${nodeName}' hardware updated.` }] };
    }
  );
}

// src/tools/k8s.ts
var import_zod3 = require("zod");
function registerK8sTools(server2) {
  server2.tool(
    "list_k8s_pods",
    "List all Kubernetes pods in a cluster. Optionally filter by namespace.",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      namespace: import_zod3.z.string().optional().describe("Namespace (default: all namespaces)")
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(
        `/api/clusters/${encodeURIComponent(name)}/k8s/pods`,
        { params }
      );
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No pods found." }] };
      }
      const rows = data.map(
        (p) => `\u2022 ${p.namespace}/${p.name} [${p.status}] node=${p.nodeName ?? "\u2014"} ready=${p.ready}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
  server2.tool(
    "list_k8s_deployments",
    "List Kubernetes Deployments in a cluster.",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      namespace: import_zod3.z.string().optional().describe("Namespace (default: all namespaces)")
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(
        `/api/clusters/${encodeURIComponent(name)}/k8s/deployments`,
        { params }
      );
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No deployments found." }] };
      }
      const rows = data.map(
        (d) => `\u2022 ${d.namespace}/${d.name} ready=${d.readyReplicas}/${d.replicas}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
  server2.tool(
    "list_k8s_services",
    "List Kubernetes Services in a cluster.",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      namespace: import_zod3.z.string().optional().describe("Namespace (default: all namespaces)")
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(
        `/api/clusters/${encodeURIComponent(name)}/k8s/services`,
        { params }
      );
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No services found." }] };
      }
      const rows = data.map(
        (s) => `\u2022 ${s.namespace}/${s.name} type=${s.type} clusterIP=${s.clusterIP ?? "\u2014"}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
  server2.tool(
    "get_pod_logs",
    "Fetch recent logs from a Kubernetes pod.",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      namespace: import_zod3.z.string().describe("Namespace the pod is in"),
      pod: import_zod3.z.string().describe("Pod name"),
      lines: import_zod3.z.number().int().min(1).max(500).default(100).describe("Number of tail lines")
    },
    async ({ name, namespace, pod, lines }) => {
      const { data } = await http.get(
        `/api/clusters/${encodeURIComponent(name)}/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}/logs`,
        { params: { lines } }
      );
      return {
        content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }]
      };
    }
  );
  server2.tool(
    "apply_manifest",
    "Apply a Kubernetes YAML manifest to a cluster (equivalent to kubectl apply -f).",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      yaml: import_zod3.z.string().describe("Full YAML manifest content")
    },
    async ({ name, yaml }) => {
      const { data } = await http.post(
        `/api/clusters/${encodeURIComponent(name)}/k8s/apply`,
        { yaml }
      );
      return {
        content: [
          { type: "text", text: data.message ?? "Manifest applied successfully." }
        ]
      };
    }
  );
  server2.tool(
    "delete_manifest",
    "Delete Kubernetes resources defined in a YAML manifest (equivalent to kubectl delete -f).",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      yaml: import_zod3.z.string().describe("Full YAML manifest content")
    },
    async ({ name, yaml }) => {
      const { data } = await http.post(
        `/api/clusters/${encodeURIComponent(name)}/k8s/delete`,
        { yaml }
      );
      return {
        content: [
          { type: "text", text: data.message ?? "Resources deleted successfully." }
        ]
      };
    }
  );
  server2.tool(
    "list_k8s_namespaces",
    "List all Kubernetes namespaces in a cluster.",
    {
      name: import_zod3.z.string().describe("Cluster name")
    },
    async ({ name }) => {
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/namespaces`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No namespaces found." }] };
      }
      return { content: [{ type: "text", text: data.map((ns) => `\u2022 ${ns}`).join("\n") }] };
    }
  );
  server2.tool(
    "list_k8s_statefulsets",
    "List Kubernetes StatefulSets in a cluster.",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      namespace: import_zod3.z.string().optional().describe("Namespace (default: all namespaces)")
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/statefulsets`, { params });
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No StatefulSets found." }] };
      }
      const rows = data.map(
        (s) => `\u2022 ${s.namespace}/${s.name} ready=${s.readyReplicas}/${s.replicas}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
  server2.tool(
    "list_k8s_ingresses",
    "List Kubernetes Ingresses in a cluster.",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      namespace: import_zod3.z.string().optional().describe("Namespace (default: all namespaces)")
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/ingresses`, { params });
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No Ingresses found." }] };
      }
      const rows = data.map(
        (i) => `\u2022 ${i.namespace}/${i.name} host=${i.host ?? "\u2014"} paths=${(i.paths ?? []).join(", ")}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
  server2.tool(
    "list_k8s_secrets",
    "List Kubernetes Secrets in a cluster (names and types only \u2014 values are not returned).",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      namespace: import_zod3.z.string().optional().describe("Namespace (default: all namespaces)")
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/secrets`, { params });
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No Secrets found." }] };
      }
      const rows = data.map((s) => `\u2022 ${s.namespace}/${s.name} type=${s.type}`);
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
  server2.tool(
    "list_k8s_configmaps",
    "List Kubernetes ConfigMaps in a cluster.",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      namespace: import_zod3.z.string().optional().describe("Namespace (default: all namespaces)")
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/configmaps`, { params });
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No ConfigMaps found." }] };
      }
      const rows = data.map((c) => `\u2022 ${c.namespace}/${c.name} keys=${(c.keys ?? []).join(", ")}`);
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
  server2.tool(
    "get_resource_manifest",
    "Get the raw YAML manifest of any Kubernetes resource (equivalent to kubectl get -o yaml).",
    {
      name: import_zod3.z.string().describe("Cluster name"),
      type: import_zod3.z.string().describe("Resource type: pod, deployment, service, statefulset, ingress, secret, configmap"),
      namespace: import_zod3.z.string().describe("Namespace the resource is in"),
      resourceName: import_zod3.z.string().describe("Resource name")
    },
    async ({ name, type, namespace, resourceName }) => {
      const { data } = await http.get(
        `/api/clusters/${encodeURIComponent(name)}/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(resourceName)}/manifest`
      );
      return { content: [{ type: "text", text: data.yaml ?? JSON.stringify(data) }] };
    }
  );
  server2.tool(
    "list_apply_history",
    "List the history of kubectl apply operations performed on a cluster via k3s-studio.",
    {
      name: import_zod3.z.string().describe("Cluster name")
    },
    async ({ name }) => {
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/apply-history`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No apply history found." }] };
      }
      const rows = data.map(
        (h) => `\u2022 [${h.appliedAt}] ${h.action ?? "apply"} \u2014 ${h.summary ?? h.yaml?.slice(0, 80)}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
}

// src/tools/server.ts
var import_zod4 = require("zod");
function registerServerTools(server2) {
  server2.tool(
    "list_servers",
    "List all remote servers registered in k3s-studio. Each server can host multiple k3s clusters.",
    {},
    async () => {
      const { data } = await http.get("/api/servers");
      if (data.length === 0) {
        return { content: [{ type: "text", text: "No servers registered." }] };
      }
      const rows = data.map(
        (s) => `\u2022 [${s.id}] ${s.name} \u2014 ${s.host}:${s.port} (${s.username})`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
  server2.tool(
    "get_job_status",
    "Check the current status of a background job. Use this to monitor long-running operations.",
    {
      jobId: import_zod4.z.string().uuid().describe("Job ID returned by create_cluster, delete_cluster, etc.")
    },
    async ({ jobId }) => {
      const { data } = await http.get(`/api/jobs/${jobId}`);
      return {
        content: [
          {
            type: "text",
            text: `Job ${jobId}
Status: ${data.status}
Cluster: ${data.clusterName ?? "\u2014"}
Log:
${data.log ?? "(no log yet)"}`
          }
        ]
      };
    }
  );
  server2.tool(
    "register_server",
    "Register a new remote server so k3s-studio can manage K3s clusters on it via SSH.",
    {
      name: import_zod4.z.string().describe("Display name for this server"),
      host: import_zod4.z.string().describe("Hostname or IP address"),
      port: import_zod4.z.number().int().min(1).max(65535).default(22).describe("SSH port"),
      username: import_zod4.z.string().describe("SSH username"),
      password: import_zod4.z.string().optional().describe("SSH password (leave empty if using key auth)"),
      privateKey: import_zod4.z.string().optional().describe("SSH private key content (PEM format)")
    },
    async ({ name, host, port, username, password, privateKey }) => {
      const body = { name, host, port, username };
      if (password) body.password = password;
      if (privateKey) body.privateKey = privateKey;
      const { data } = await http.post("/api/servers", body);
      return { content: [{ type: "text", text: `Server '${name}' registered with ID ${data.id}.` }] };
    }
  );
  server2.tool(
    "get_server",
    "Get details of a registered remote server.",
    {
      id: import_zod4.z.number().int().describe("Server ID")
    },
    async ({ id }) => {
      const { data } = await http.get(`/api/servers/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
  server2.tool(
    "update_server",
    "Update connection settings for a registered remote server.",
    {
      id: import_zod4.z.number().int().describe("Server ID"),
      name: import_zod4.z.string().optional().describe("New display name"),
      host: import_zod4.z.string().optional().describe("New hostname or IP"),
      port: import_zod4.z.number().int().min(1).max(65535).optional().describe("New SSH port"),
      username: import_zod4.z.string().optional().describe("New SSH username"),
      password: import_zod4.z.string().optional().describe("New SSH password"),
      privateKey: import_zod4.z.string().optional().describe("New SSH private key (PEM format)")
    },
    async ({ id, ...fields }) => {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== void 0));
      const { data } = await http.put(`/api/servers/${id}`, body);
      return { content: [{ type: "text", text: `Server ${id} updated.` }] };
    }
  );
  server2.tool(
    "delete_server",
    "\u26A0\uFE0F Remove a remote server from k3s-studio. Clusters on this server are NOT deleted.",
    {
      id: import_zod4.z.number().int().describe("Server ID to remove")
    },
    async ({ id }) => {
      await http.delete(`/api/servers/${id}`);
      return { content: [{ type: "text", text: `Server ${id} removed.` }] };
    }
  );
  server2.tool(
    "test_server_connection",
    "Test SSH connectivity to a registered remote server.",
    {
      id: import_zod4.z.number().int().describe("Server ID")
    },
    async ({ id }) => {
      const { data } = await http.post(`/api/servers/${id}/test`);
      const ok = data.success ?? data.connected ?? true;
      return {
        content: [
          {
            type: "text",
            text: ok ? `Server ${id}: SSH connection OK.` : `Server ${id}: SSH connection FAILED. ${data.message ?? ""}`
          }
        ]
      };
    }
  );
  server2.tool(
    "check_server_multipass",
    "Check if Multipass is installed and running on a remote server.",
    {
      id: import_zod4.z.number().int().describe("Server ID")
    },
    async ({ id }) => {
      const { data } = await http.get(`/api/servers/${id}/multipass`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
  server2.tool(
    "install_multipass_on_server",
    "Install Multipass on a remote server. The server must be reachable via SSH.",
    {
      id: import_zod4.z.number().int().describe("Server ID")
    },
    async ({ id }) => {
      const { data } = await http.post(`/api/servers/${id}/multipass/install`);
      const jobId = data.jobId;
      const result = await waitForJob(jobId);
      return {
        content: [
          {
            type: "text",
            text: result.success ? `Multipass installed on server ${id}.` : `Multipass installation failed on server ${id}.
${result.log}`
          }
        ],
        isError: !result.success
      };
    }
  );
  server2.tool(
    "discover_server_clusters",
    "Scan a remote server for existing K3s clusters not yet registered in k3s-studio.",
    {
      id: import_zod4.z.number().int().describe("Server ID")
    },
    async ({ id }) => {
      const { data } = await http.get(`/api/servers/${id}/discover-clusters`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: `No unregistered clusters found on server ${id}.` }] };
      }
      const rows = data.map((c) => `\u2022 ${c.name} [${c.status ?? "unknown"}]`);
      return { content: [{ type: "text", text: `Discovered clusters on server ${id}:
${rows.join("\n")}` }] };
    }
  );
}

// src/tools/ai.ts
var import_zod5 = require("zod");
function registerAiTools(server2) {
  server2.tool(
    "list_ollama_models",
    "List models currently available in Ollama on the specified cluster.",
    {
      clusterName: import_zod5.z.string().describe("Cluster name where Ollama is deployed")
    },
    async ({ clusterName }) => {
      try {
        const { data } = await ollamaHttp.get("/api/tags");
        const models = data.models ?? [];
        if (models.length === 0) {
          return { content: [{ type: "text", text: `No models in Ollama on cluster '${clusterName}'.` }] };
        }
        const rows = models.map(
          (m) => `\u2022 ${m.name} (${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB)`
        );
        return { content: [{ type: "text", text: `Ollama models on '${clusterName}':
${rows.join("\n")}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed to reach Ollama: ${err.message}` }] };
      }
    }
  );
  server2.tool(
    "pull_ollama_model",
    "Start pulling a model into Ollama. Returns immediately \u2014 pull runs in background. Check completion with list_ollama_models.",
    {
      clusterName: import_zod5.z.string().describe("Cluster name where Ollama is deployed"),
      model: import_zod5.z.string().describe("Model name to pull, e.g. qwen2.5-coder:3b")
    },
    async ({ clusterName, model }) => {
      try {
        ollamaHttp.post("/api/pull", { name: model }).catch(() => {
        });
        return {
          content: [
            {
              type: "text",
              text: `Pull started for '${model}' on cluster '${clusterName}'.
Check progress: list_ollama_models (model appears when pull completes).`
            }
          ]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed to start pull: ${err.message}` }] };
      }
    }
  );
  server2.tool(
    "deploy_ai_stack",
    "Deploy Ollama + Open WebUI to a k3s cluster. Applies the bundled AI stack manifest.",
    {
      clusterName: import_zod5.z.string().describe("Target cluster name"),
      namespace: import_zod5.z.string().default("ai-system").describe("Kubernetes namespace (default: ai-system)"),
      ollamaMemoryLimit: import_zod5.z.string().default("4Gi").describe("Ollama memory limit (e.g. 2Gi, 4Gi)")
    },
    async ({ clusterName, namespace, ollamaMemoryLimit }) => {
      const manifest = buildAiStackManifest(namespace, ollamaMemoryLimit);
      try {
        const { data } = await http.post(`/api/clusters/${clusterName}/k8s/apply`, { yaml: manifest });
        const jobId = data.jobId;
        return {
          content: [
            {
              type: "text",
              text: `AI stack deployment started on '${clusterName}' (namespace: ${namespace}).
Job ID: ${jobId}
Use get_job_status to monitor progress.`
            }
          ]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Deployment failed: ${err.message}` }] };
      }
    }
  );
  server2.tool(
    "get_ai_assistant_url",
    "Get the Open WebUI URL for a cluster where the AI stack has been deployed.",
    {
      clusterName: import_zod5.z.string().describe("Cluster name"),
      namespace: import_zod5.z.string().default("ai-system").describe("Namespace where AI stack is deployed")
    },
    async ({ clusterName, namespace }) => {
      try {
        const { data } = await http.get(`/api/clusters/${clusterName}/k8s/services?namespace=${namespace}`);
        const svc = (data ?? []).find((s) => s.name === "open-webui");
        if (!svc) {
          return { content: [{ type: "text", text: `open-webui Service not found in '${namespace}' on '${clusterName}'. Has deploy_ai_stack been run?` }] };
        }
        const nodePort = svc.ports?.find((p) => p.nodePort)?.nodePort;
        if (!nodePort) {
          return { content: [{ type: "text", text: `open-webui Service exists but no NodePort assigned yet.` }] };
        }
        const { data: nodes } = await http.get(`/api/clusters/${clusterName}/nodes`);
        const nodeIp = nodes?.[0]?.ip ?? "<node-ip>";
        return {
          content: [
            {
              type: "text",
              text: `Open WebUI URL: http://${nodeIp}:${nodePort}
Register MCP Bridge: http://<bridge-node-ip>:3001`
            }
          ]
        };
      } catch (err) {
        return { content: [{ type: "text", text: `Failed to get URL: ${err.message}` }] };
      }
    }
  );
}
function buildAiStackManifest(namespace, ollamaMemoryLimit) {
  const ollamaMemoryRequest = ollamaMemoryLimit === "4Gi" ? "2Gi" : "1Gi";
  return `
apiVersion: v1
kind: Namespace
metadata:
  name: ${namespace}
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ollama-models
  namespace: ${namespace}
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 20Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: open-webui-data
  namespace: ${namespace}
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ollama
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ollama
  template:
    metadata:
      labels:
        app: ollama
    spec:
      containers:
      - name: ollama
        image: ollama/ollama:latest
        ports:
        - containerPort: 11434
        resources:
          requests:
            memory: ${ollamaMemoryRequest}
          limits:
            memory: ${ollamaMemoryLimit}
        volumeMounts:
        - name: ollama-data
          mountPath: /root/.ollama
      volumes:
      - name: ollama-data
        persistentVolumeClaim:
          claimName: ollama-models
---
apiVersion: v1
kind: Service
metadata:
  name: ollama
  namespace: ${namespace}
spec:
  selector:
    app: ollama
  ports:
  - port: 11434
    targetPort: 11434
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: open-webui
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: open-webui
  template:
    metadata:
      labels:
        app: open-webui
    spec:
      containers:
      - name: open-webui
        image: ghcr.io/open-webui/open-webui:main
        env:
        - name: OLLAMA_BASE_URL
          value: http://ollama:11434
        - name: WEBUI_SECRET_KEY
          value: k3s-studio-secret
        ports:
        - containerPort: 8080
        volumeMounts:
        - name: webui-data
          mountPath: /app/backend/data
      volumes:
      - name: webui-data
        persistentVolumeClaim:
          claimName: open-webui-data
---
apiVersion: v1
kind: Service
metadata:
  name: open-webui
  namespace: ${namespace}
spec:
  type: NodePort
  selector:
    app: open-webui
  ports:
  - port: 8080
    targetPort: 8080
    nodePort: 30080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: k3s-studio-mcp-bridge
  namespace: ${namespace}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: k3s-studio-mcp-bridge
  template:
    metadata:
      labels:
        app: k3s-studio-mcp-bridge
    spec:
      hostNetwork: true
      containers:
      - name: mcp-bridge
        image: cnbsoft/k3s-studio-mcp:latest
        env:
        - name: MCP_MODE
          value: http
        - name: MCP_HTTP_PORT
          value: "3001"
        - name: K3S_STUDIO_API_URL
          value: http://localhost:9090
        - name: OLLAMA_URL
          value: http://ollama.${namespace}.svc.cluster.local:11434
        ports:
        - containerPort: 3001
---
apiVersion: v1
kind: Service
metadata:
  name: k3s-studio-mcp-bridge
  namespace: ${namespace}
spec:
  selector:
    app: k3s-studio-mcp-bridge
  ports:
  - port: 3001
    targetPort: 3001
`.trim();
}

// src/index.ts
var server = new import_mcp.McpServer({
  name: "k3s-studio",
  version: "0.1.0"
});
registerServerTools(server);
registerClusterTools(server);
registerNodeTools(server);
registerK8sTools(server);
registerAiTools(server);
var mode = process.env.MCP_MODE ?? "stdio";
async function main() {
  if (mode === "http") {
    await startHttpMode();
  } else {
    await startStdioMode();
  }
}
async function startStdioMode() {
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `k3s-studio MCP server started in stdio mode (API: ${process.env.K3S_STUDIO_API_URL ?? "http://localhost:9090"})
`
  );
}
async function startHttpMode() {
  const [clientTransport, serverTransport] = import_inMemory.InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcpClient = new import_client7.Client({ name: "http-bridge", version: "0.1.0" }, {});
  await mcpClient.connect(clientTransport);
  const app = (0, import_express.default)();
  app.use(import_express.default.json());
  app.get("/tools", async (_req, res) => {
    try {
      const result = await mcpClient.listTools();
      const functions = result.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema
        }
      }));
      res.json(functions);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post("/tools/:name", async (req, res) => {
    try {
      const result = await mcpClient.callTool({
        name: req.params.name,
        arguments: req.body ?? {}
      });
      const text = result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
      res.json({ result: text });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  const port = parseInt(process.env.MCP_HTTP_PORT ?? "3001");
  app.listen(port, "0.0.0.0", () => {
    process.stderr.write(
      `k3s-studio MCP HTTP bridge started on :${port} (API: ${process.env.K3S_STUDIO_API_URL ?? "http://localhost:9090"})
`
    );
  });
}
main().catch((err) => {
  process.stderr.write(`Fatal: ${err}
`);
  process.exit(1);
});
