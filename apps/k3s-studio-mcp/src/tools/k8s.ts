import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http } from "../client.js";

export function registerK8sTools(server: McpServer) {
  server.tool(
    "list_k8s_pods",
    "List all Kubernetes pods in a cluster. Optionally filter by namespace.",
    {
      name: z.string().describe("Cluster name"),
      namespace: z.string().optional().describe("Namespace (default: all namespaces)"),
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
        (p: any) =>
          `• ${p.namespace}/${p.name} [${p.status}] node=${p.nodeName ?? "—"} ready=${p.ready}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );

  server.tool(
    "list_k8s_deployments",
    "List Kubernetes Deployments in a cluster.",
    {
      name: z.string().describe("Cluster name"),
      namespace: z.string().optional().describe("Namespace (default: all namespaces)"),
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
        (d: any) =>
          `• ${d.namespace}/${d.name} ready=${d.readyReplicas}/${d.replicas}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );

  server.tool(
    "list_k8s_services",
    "List Kubernetes Services in a cluster.",
    {
      name: z.string().describe("Cluster name"),
      namespace: z.string().optional().describe("Namespace (default: all namespaces)"),
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
        (s: any) =>
          `• ${s.namespace}/${s.name} type=${s.type} clusterIP=${s.clusterIP ?? "—"}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );

  server.tool(
    "get_pod_logs",
    "Fetch recent logs from a Kubernetes pod.",
    {
      name: z.string().describe("Cluster name"),
      namespace: z.string().describe("Namespace the pod is in"),
      pod: z.string().describe("Pod name"),
      lines: z.number().int().min(1).max(500).default(100).describe("Number of tail lines"),
    },
    async ({ name, namespace, pod, lines }) => {
      const { data } = await http.get(
        `/api/clusters/${encodeURIComponent(name)}/k8s/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(pod)}/logs`,
        { params: { lines } }
      );
      return {
        content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }],
      };
    }
  );

  server.tool(
    "apply_manifest",
    "Apply a Kubernetes YAML manifest to a cluster (equivalent to kubectl apply -f).",
    {
      name: z.string().describe("Cluster name"),
      yaml: z.string().describe("Full YAML manifest content"),
    },
    async ({ name, yaml }) => {
      const { data } = await http.post(
        `/api/clusters/${encodeURIComponent(name)}/k8s/apply`,
        { yaml }
      );
      return {
        content: [
          { type: "text", text: data.message ?? "Manifest applied successfully." },
        ],
      };
    }
  );

  server.tool(
    "delete_manifest",
    "Delete Kubernetes resources defined in a YAML manifest (equivalent to kubectl delete -f).",
    {
      name: z.string().describe("Cluster name"),
      yaml: z.string().describe("Full YAML manifest content"),
    },
    async ({ name, yaml }) => {
      const { data } = await http.post(
        `/api/clusters/${encodeURIComponent(name)}/k8s/delete`,
        { yaml }
      );
      return {
        content: [
          { type: "text", text: data.message ?? "Resources deleted successfully." },
        ],
      };
    }
  );
}
