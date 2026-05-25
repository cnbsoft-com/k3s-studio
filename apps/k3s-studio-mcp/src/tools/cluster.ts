import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http } from "../client.js";
import { waitForJob } from "../polling.js";

export function registerClusterTools(server: McpServer) {
  server.tool(
    "list_clusters",
    "List all k3s clusters managed by k3s-studio. Shows name, status, spec, and worker count. Call this before creating a cluster to check if it already exists.",
    {
      serverId: z
        .number()
        .optional()
        .describe("Filter by server ID. Omit to list clusters from all servers."),
    },
    async ({ serverId }) => {
      const params = serverId !== undefined ? { serverId } : {};
      const { data } = await http.get("/api/clusters", { params });
      if (data.length === 0) {
        return { content: [{ type: "text", text: "No clusters found." }] };
      }
      const rows = data.map(
        (c: any) =>
          `• ${c.name} [${c.status}] master=${c.masterSpec} workers=${c.workerCount} server=${c.serverLocal ? "local" : (c.serverName ?? c.serverId)}`
      );
      return {
        content: [{ type: "text", text: rows.join("\n") }],
      };
    }
  );

  server.tool(
    "get_cluster",
    "Get detailed information about a specific k3s cluster by name.",
    {
      name: z.string().describe("Cluster name"),
    },
    async ({ name }) => {
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "create_cluster",
    "Create a new k3s cluster using Multipass VMs. " +
      "This is a long-running operation (5–15 minutes). " +
      "Always call list_clusters first to verify the cluster does not already exist. " +
      "Returns when the cluster is fully ready or an error is reported.",
    {
      name: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/)
        .describe("Cluster name — lowercase letters, numbers, hyphens only"),
      serverId: z
        .number()
        .optional()
        .describe("Server ID. Omit to use the local machine."),
      masterSpec: z
        .enum(["small", "medium", "large"])
        .default("small")
        .describe("Master node size: small=1CPU/2GB, medium=2CPU/4GB, large=4CPU/8GB"),
      workerCount: z
        .number()
        .int()
        .min(0)
        .max(20)
        .default(0)
        .describe("Number of worker nodes to add"),
      workerSpec: z
        .enum(["small", "medium", "large"])
        .default("small")
        .describe("Worker node size (ignored when workerCount=0)"),
      ubuntuImage: z
        .string()
        .default("22.04")
        .describe("Ubuntu LTS version: 22.04 or 24.04"),
    },
    async ({ name, serverId, masterSpec, workerCount, workerSpec, ubuntuImage }) => {
      const body: Record<string, unknown> = {
        name,
        masterSpec,
        workerCount,
        workerSpec,
        ubuntuImage,
      };
      if (serverId !== undefined) body.serverId = serverId;

      const { data } = await http.post("/api/clusters", body);
      const jobId: string = data.jobId;

      const result = await waitForJob(jobId);
      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: `Cluster '${name}' created successfully.\n\nBuild log:\n${result.log}`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Cluster '${name}' creation FAILED.\n\nError log:\n${result.log}`,
          },
        ],
        isError: true,
      };
    }
  );

  server.tool(
    "delete_cluster",
    "⚠️ DESTRUCTIVE: Delete a k3s cluster and all its VMs permanently. " +
      "This cannot be undone. Confirm the cluster name before proceeding.",
    {
      name: z.string().describe("Cluster name to delete"),
    },
    async ({ name }) => {
      const { data } = await http.delete(`/api/clusters/${encodeURIComponent(name)}`);
      const jobId: string = data.jobId;

      const result = await waitForJob(jobId);
      if (result.success) {
        return {
          content: [{ type: "text", text: `Cluster '${name}' deleted successfully.` }],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `Cluster '${name}' deletion FAILED.\n\n${result.log}`,
          },
        ],
        isError: true,
      };
    }
  );

  server.tool(
    "start_cluster",
    "Start a stopped k3s cluster (all its VMs).",
    {
      name: z.string().describe("Cluster name"),
    },
    async ({ name }) => {
      const { data } = await http.post(`/api/clusters/${encodeURIComponent(name)}/start`);
      const jobId: string = data.jobId;
      const result = await waitForJob(jobId);
      return {
        content: [
          {
            type: "text",
            text: result.success
              ? `Cluster '${name}' started.`
              : `Failed to start '${name}'.\n${result.log}`,
          },
        ],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "stop_cluster",
    "Stop a running k3s cluster (powers off all VMs, data is preserved).",
    {
      name: z.string().describe("Cluster name"),
    },
    async ({ name }) => {
      const { data } = await http.post(`/api/clusters/${encodeURIComponent(name)}/stop`);
      const jobId: string = data.jobId;
      const result = await waitForJob(jobId);
      return {
        content: [
          {
            type: "text",
            text: result.success
              ? `Cluster '${name}' stopped.`
              : `Failed to stop '${name}'.\n${result.log}`,
          },
        ],
        isError: !result.success,
      };
    }
  );
}
