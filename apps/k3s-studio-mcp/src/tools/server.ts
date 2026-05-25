import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http } from "../client.js";
import { waitForJob } from "../polling.js";

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

  server.tool(
    "register_server",
    "Register a new remote server so k3s-studio can manage K3s clusters on it via SSH.",
    {
      name: z.string().describe("Display name for this server"),
      host: z.string().describe("Hostname or IP address"),
      port: z.number().int().min(1).max(65535).default(22).describe("SSH port"),
      username: z.string().describe("SSH username"),
      password: z.string().optional().describe("SSH password (leave empty if using key auth)"),
      privateKey: z.string().optional().describe("SSH private key content (PEM format)"),
    },
    async ({ name, host, port, username, password, privateKey }) => {
      const body: Record<string, unknown> = { name, host, port, username };
      if (password) body.password = password;
      if (privateKey) body.privateKey = privateKey;
      const { data } = await http.post("/api/servers", body);
      return { content: [{ type: "text", text: `Server '${name}' registered with ID ${data.id}.` }] };
    }
  );

  server.tool(
    "get_server",
    "Get details of a registered remote server.",
    {
      id: z.number().int().describe("Server ID"),
    },
    async ({ id }) => {
      const { data } = await http.get(`/api/servers/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "update_server",
    "Update connection settings for a registered remote server.",
    {
      id: z.number().int().describe("Server ID"),
      name: z.string().optional().describe("New display name"),
      host: z.string().optional().describe("New hostname or IP"),
      port: z.number().int().min(1).max(65535).optional().describe("New SSH port"),
      username: z.string().optional().describe("New SSH username"),
      password: z.string().optional().describe("New SSH password"),
      privateKey: z.string().optional().describe("New SSH private key (PEM format)"),
    },
    async ({ id, ...fields }) => {
      const body = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
      const { data } = await http.put(`/api/servers/${id}`, body);
      return { content: [{ type: "text", text: `Server ${id} updated.` }] };
    }
  );

  server.tool(
    "delete_server",
    "⚠️ Remove a remote server from k3s-studio. Clusters on this server are NOT deleted.",
    {
      id: z.number().int().describe("Server ID to remove"),
    },
    async ({ id }) => {
      await http.delete(`/api/servers/${id}`);
      return { content: [{ type: "text", text: `Server ${id} removed.` }] };
    }
  );

  server.tool(
    "test_server_connection",
    "Test SSH connectivity to a registered remote server.",
    {
      id: z.number().int().describe("Server ID"),
    },
    async ({ id }) => {
      const { data } = await http.post(`/api/servers/${id}/test`);
      const ok = data.success ?? data.connected ?? true;
      return {
        content: [
          {
            type: "text",
            text: ok
              ? `Server ${id}: SSH connection OK.`
              : `Server ${id}: SSH connection FAILED. ${data.message ?? ""}`,
          },
        ],
      };
    }
  );

  server.tool(
    "check_server_multipass",
    "Check if Multipass is installed and running on a remote server.",
    {
      id: z.number().int().describe("Server ID"),
    },
    async ({ id }) => {
      const { data } = await http.get(`/api/servers/${id}/multipass`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "install_multipass_on_server",
    "Install Multipass on a remote server. The server must be reachable via SSH.",
    {
      id: z.number().int().describe("Server ID"),
    },
    async ({ id }) => {
      const { data } = await http.post(`/api/servers/${id}/multipass/install`);
      const jobId: string = data.jobId;
      const result = await waitForJob(jobId);
      return {
        content: [
          {
            type: "text",
            text: result.success
              ? `Multipass installed on server ${id}.`
              : `Multipass installation failed on server ${id}.\n${result.log}`,
          },
        ],
        isError: !result.success,
      };
    }
  );

  server.tool(
    "discover_server_clusters",
    "Scan a remote server for existing K3s clusters not yet registered in k3s-studio.",
    {
      id: z.number().int().describe("Server ID"),
    },
    async ({ id }) => {
      const { data } = await http.get(`/api/servers/${id}/discover-clusters`);
      if (!data || data.length === 0) {
        return { content: [{ type: "text", text: `No unregistered clusters found on server ${id}.` }] };
      }
      const rows = data.map((c: any) => `• ${c.name} [${c.status ?? "unknown"}]`);
      return { content: [{ type: "text", text: `Discovered clusters on server ${id}:\n${rows.join("\n")}` }] };
    }
  );
}
