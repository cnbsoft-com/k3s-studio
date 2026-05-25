import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http } from "../client.js";

export function registerServerTools(server: McpServer) {
  server.tool(
    "list_servers",
    "List all remote servers registered in k3s-studio. Each server can host multiple k3s clusters.",
    {},
    async () => {
      const { data } = await http.get("/api/servers");
      if (data.length === 0) {
        return { content: [{ type: "text", text: "No servers registered." }] };
      }
      const rows = data.map(
        (s: any) => `• [${s.id}] ${s.name} — ${s.host}:${s.port} (${s.username})`
      );
      return { content: [{ type: "text", text: rows.join("\n") }] };
    }
  );

  server.tool(
    "get_job_status",
    "Check the current status of a background job. Use this to monitor long-running operations.",
    {
      jobId: z.string().uuid().describe("Job ID returned by create_cluster, delete_cluster, etc."),
    },
    async ({ jobId }) => {
      const { data } = await http.get(`/api/jobs/${jobId}`);
      return {
        content: [
          {
            type: "text",
            text: `Job ${jobId}\nStatus: ${data.status}\nCluster: ${data.clusterName ?? "—"}\nLog:\n${data.log ?? "(no log yet)"}`,
          },
        ],
      };
    }
  );
}
