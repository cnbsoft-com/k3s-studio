import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http } from "../client.js";
import { waitForJob } from "../polling.js";

export function registerNodeTools(server: McpServer) {
  server.tool(
    "get_cluster_nodes",
    "List all Multipass VMs (nodes) in a cluster with their IP addresses and running status.",
    {
      name: z.string().describe("Cluster name"),
    },
    async ({ name }) => {
      const { data } = await http.get(`/api/clusters/${encodeURIComponent(name)}/nodes`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: "No nodes found." }] };
      }
      const rows = data.map(
        (n: any) => `• ${n.name} [${n.state}] ip=${n.ipv4 ?? "—"} cpu=${n.cpus} mem=${n.memory}`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );

  server.tool(
    "add_workers",
    "Add worker nodes to an existing k3s cluster. This is a long-running operation.",
    {
      name: z.string().describe("Cluster name"),
      count: z.number().int().min(1).max(10).describe("Number of workers to add"),
      spec: z
        .enum(["small", "medium", "large"])
        .default("small")
        .describe("Worker node size"),
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
            text: result.success
              ? `Added ${count} worker(s) to '${name}'.`
              : `Failed to add workers to '${name}'.\n${result.log}`,
          },
        ],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "delete_worker",
    "⚠️ Remove a specific worker node from a cluster. The VM will be deleted permanently.",
    {
      name: z.string().describe("Cluster name"),
      workerName: z.string().describe("Worker VM name (e.g. mycluster-worker1)"),
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
            text: result.success
              ? `Worker '${workerName}' deleted from '${name}'.`
              : `Failed to delete worker '${workerName}'.\n${result.log}`,
          },
        ],
        isError: !result.success,
      };
    }
  );
}
