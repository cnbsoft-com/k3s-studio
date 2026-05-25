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
async function main() {
  const transport = new import_stdio.StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `k3s-studio MCP server started (API: ${process.env.K3S_STUDIO_API_URL ?? "http://localhost:8080"})
`
  );
}
main().catch((err) => {
  process.stderr.write(`Fatal: ${err}
`);
  process.exit(1);
});
