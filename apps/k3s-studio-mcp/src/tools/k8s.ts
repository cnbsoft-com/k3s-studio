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

  server.tool(
    "list_k8s_namespaces",
    "List all Kubernetes namespaces in a cluster.",
    {
      name: z.string().describe("Cluster name"),
    },
    async ({ name }) => {
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/namespaces`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No namespaces found." }] };
      }
      return { content: [{ type: "text", text: (data as string[]).map((ns) => `• ${ns}`).join("\n") }] };
    }
  );

  server.tool(
    "list_k8s_statefulsets",
    "List Kubernetes StatefulSets in a cluster.",
    {
      name: z.string().describe("Cluster name"),
      namespace: z.string().optional().describe("Namespace (default: all namespaces)"),
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/statefulsets`, { params });
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No StatefulSets found." }] };
      }
      const rows = data.map(
        (s: any) => `• ${s.namespace}/${s.name} ready=${s.readyReplicas}/${s.replicas}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );

  server.tool(
    "list_k8s_ingresses",
    "List Kubernetes Ingresses in a cluster.",
    {
      name: z.string().describe("Cluster name"),
      namespace: z.string().optional().describe("Namespace (default: all namespaces)"),
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/ingresses`, { params });
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No Ingresses found." }] };
      }
      const rows = data.map(
        (i: any) => `• ${i.namespace}/${i.name} host=${i.host ?? "—"} paths=${(i.paths ?? []).join(", ")}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );

  server.tool(
    "list_k8s_secrets",
    "List Kubernetes Secrets in a cluster (names and types only — values are not returned).",
    {
      name: z.string().describe("Cluster name"),
      namespace: z.string().optional().describe("Namespace (default: all namespaces)"),
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/secrets`, { params });
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No Secrets found." }] };
      }
      const rows = data.map((s: any) => `• ${s.namespace}/${s.name} type=${s.type}`);
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );

  server.tool(
    "list_k8s_configmaps",
    "List Kubernetes ConfigMaps in a cluster.",
    {
      name: z.string().describe("Cluster name"),
      namespace: z.string().optional().describe("Namespace (default: all namespaces)"),
    },
    async ({ name, namespace }) => {
      const params = namespace ? { namespace } : {};
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/configmaps`, { params });
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No ConfigMaps found." }] };
      }
      const rows = data.map((c: any) => `• ${c.namespace}/${c.name} keys=${(c.keys ?? []).join(", ")}`);
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );

  server.tool(
    "get_resource_manifest",
    "Get the raw YAML manifest of any Kubernetes resource (equivalent to kubectl get -o yaml).",
    {
      name: z.string().describe("Cluster name"),
      type: z.string().describe("Resource type: pod, deployment, service, statefulset, ingress, secret, configmap"),
      namespace: z.string().describe("Namespace the resource is in"),
      resourceName: z.string().describe("Resource name"),
    },
    async ({ name, type, namespace, resourceName }) => {
      const { data } = await http.get(
        `/api/clusters/${encodeURIComponent(name)}/k8s/${encodeURIComponent(type)}/${encodeURIComponent(namespace)}/${encodeURIComponent(resourceName)}/manifest`
      );
      return { content: [{ type: "text", text: data.yaml ?? JSON.stringify(data) }] };
    }
  );

  server.tool(
    "list_apply_history",
    "List the history of kubectl apply operations performed on a cluster via k3s-studio.",
    {
      name: z.string().describe("Cluster name"),
    },
    async ({ name }) => {
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/k8s/apply-history`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No apply history found." }] };
      }
      const rows = data.map(
        (h: any) => `• [${h.appliedAt}] ${h.action ?? "apply"} — ${h.summary ?? h.yaml?.slice(0, 80)}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );
}
