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

  server.tool(
    "start_node",
    "Start a specific VM node in a cluster.",
    {
      name: z.string().describe("Cluster name"),
      nodeName: z.string().describe("Node VM name (e.g. mycluster-master, mycluster-worker1)"),
    },
    async ({ name, nodeName }) => {
      await http.post(`/api/clusters/${encodeURIComponent(name)}/nodes/${encodeURIComponent(nodeName)}/start`);
      return { content: [{ type: "text", text: `Node '${nodeName}' started.` }] };
    }
  );

  server.tool(
    "stop_node",
    "Stop a specific VM node in a cluster (data preserved).",
    {
      name: z.string().describe("Cluster name"),
      nodeName: z.string().describe("Node VM name"),
    },
    async ({ name, nodeName }) => {
      await http.post(`/api/clusters/${encodeURIComponent(name)}/nodes/${encodeURIComponent(nodeName)}/stop`);
      return { content: [{ type: "text", text: `Node '${nodeName}' stopped.` }] };
    }
  );

  server.tool(
    "restart_node",
    "Restart a specific VM node in a cluster.",
    {
      name: z.string().describe("Cluster name"),
      nodeName: z.string().describe("Node VM name"),
    },
    async ({ name, nodeName }) => {
      await http.post(`/api/clusters/${encodeURIComponent(name)}/nodes/${encodeURIComponent(nodeName)}/restart`);
      return { content: [{ type: "text", text: `Node '${nodeName}' restarted.` }] };
    }
  );

  server.tool(
    "suspend_node",
    "Suspend a specific VM node (saves state to disk).",
    {
      name: z.string().describe("Cluster name"),
      nodeName: z.string().describe("Node VM name"),
    },
    async ({ name, nodeName }) => {
      await http.post(`/api/clusters/${encodeURIComponent(name)}/nodes/${encodeURIComponent(nodeName)}/suspend`);
      return { content: [{ type: "text", text: `Node '${nodeName}' suspended.` }] };
    }
  );

  server.tool(
    "update_node_hardware",
    "Change CPU and memory allocation for a VM node. Node must be stopped first.",
    {
      name: z.string().describe("Cluster name"),
      nodeName: z.string().describe("Node VM name"),
      cpus: z.number().int().min(1).max(16).optional().describe("Number of CPUs"),
      memoryGb: z.number().int().min(1).max(64).optional().describe("Memory in GB"),
      diskGb: z.number().int().min(10).max(500).optional().describe("Disk size in GB"),
    },
    async ({ name, nodeName, cpus, memoryGb, diskGb }) => {
      const body: Record<string, unknown> = {};
      if (cpus !== undefined) body.cpus = cpus;
      if (memoryGb !== undefined) body.memory = `${memoryGb}G`;
      if (diskGb !== undefined) body.disk = `${diskGb}G`;
      await http.patch(
        `/api/clusters/${encodeURIComponent(name)}/nodes/${encodeURIComponent(nodeName)}/hardware`,
        body
      );
      return { content: [{ type: "text", text: `Node '${nodeName}' hardware updated.` }] };
    }
  );
}
