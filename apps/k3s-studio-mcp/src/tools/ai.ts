import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http, ollamaHttp } from "../client.js";

export function registerAiTools(server: McpServer) {
  server.tool(
    "list_ollama_models",
    "List models currently available in Ollama on the specified cluster.",
    {
      clusterName: z.string().describe("Cluster name where Ollama is deployed"),
    },
    async ({ clusterName }) => {
      try {
        const { data } = await ollamaHttp.get("/api/tags");
        const models: Array<{ name: string; size: number }> = data.models ?? [];
        if (models.length === 0) {
          return { content: [{ type: "text", text: `No models in Ollama on cluster '${clusterName}'.` }] };
        }
        const rows = models.map(
          (m) => `• ${m.name} (${(m.size / 1024 / 1024 / 1024).toFixed(1)} GB)`
        );
        return { content: [{ type: "text", text: `Ollama models on '${clusterName}':\n${rows.join("\n")}` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to reach Ollama: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "pull_ollama_model",
    "Start pulling a model into Ollama. Returns immediately — pull runs in background. Check completion with list_ollama_models.",
    {
      clusterName: z.string().describe("Cluster name where Ollama is deployed"),
      model: z.string().describe("Model name to pull, e.g. qwen2.5-coder:3b"),
    },
    async ({ clusterName, model }) => {
      try {
        // Fire-and-forget: Ollama /api/pull is long-running. Start it without awaiting.
        ollamaHttp.post("/api/pull", { name: model }).catch(() => {});
        return {
          content: [
            {
              type: "text",
              text: `Pull started for '${model}' on cluster '${clusterName}'.\nCheck progress: list_ollama_models (model appears when pull completes).`,
            },
          ],
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to start pull: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "deploy_ai_stack",
    "Deploy Ollama + Open WebUI to a k3s cluster. Applies the bundled AI stack manifest.",
    {
      clusterName: z.string().describe("Target cluster name"),
      namespace: z.string().default("ai-system").describe("Kubernetes namespace (default: ai-system)"),
      ollamaMemoryLimit: z.string().default("4Gi").describe("Ollama memory limit (e.g. 2Gi, 4Gi)"),
    },
    async ({ clusterName, namespace, ollamaMemoryLimit }) => {
      const manifest = buildAiStackManifest(namespace, ollamaMemoryLimit);
      try {
        const { data } = await http.post(`/api/clusters/${clusterName}/k8s/apply`, { yaml: manifest });
        const jobId: string = data.jobId;
        return {
          content: [
            {
              type: "text",
              text: `AI stack deployment started on '${clusterName}' (namespace: ${namespace}).\nJob ID: ${jobId}\nUse get_job_status to monitor progress.`,
            },
          ],
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Deployment failed: ${err.message}` }] };
      }
    }
  );

  server.tool(
    "get_ai_assistant_url",
    "Get the Open WebUI URL for a cluster where the AI stack has been deployed.",
    {
      clusterName: z.string().describe("Cluster name"),
      namespace: z.string().default("ai-system").describe("Namespace where AI stack is deployed"),
    },
    async ({ clusterName, namespace }) => {
      try {
        const { data } = await http.get(`/api/clusters/${clusterName}/k8s/services?namespace=${namespace}`);
        const svc = (data ?? []).find((s: any) => s.name === "open-webui");
        if (!svc) {
          return { content: [{ type: "text", text: `open-webui Service not found in '${namespace}' on '${clusterName}'. Has deploy_ai_stack been run?` }] };
        }
        const nodePort = svc.ports?.find((p: any) => p.nodePort)?.nodePort;
        if (!nodePort) {
          return { content: [{ type: "text", text: `open-webui Service exists but no NodePort assigned yet.` }] };
        }
        const { data: nodes } = await http.get(`/api/clusters/${clusterName}/nodes`);
        const nodeIp = nodes?.[0]?.ip ?? "<node-ip>";
        return {
          content: [
            {
              type: "text",
              text: `Open WebUI URL: http://${nodeIp}:${nodePort}\nRegister MCP Bridge: http://<bridge-node-ip>:3001`,
            },
          ],
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Failed to get URL: ${err.message}` }] };
      }
    }
  );
}

function buildAiStackManifest(namespace: string, ollamaMemoryLimit: string): string {
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
`.trim();
}
