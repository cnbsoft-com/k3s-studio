#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import express from "express";
import { registerClusterTools } from "./tools/cluster.js";
import { registerNodeTools } from "./tools/node.js";
import { registerK8sTools } from "./tools/k8s.js";
import { registerServerTools } from "./tools/server.js";
import { registerAiTools } from "./tools/ai.js";

const server = new McpServer({
  name: "k3s-studio",
  version: "0.1.0",
});

registerServerTools(server);
registerClusterTools(server);
registerNodeTools(server);
registerK8sTools(server);
registerAiTools(server);

const mode = process.env.MCP_MODE ?? "stdio";

async function main() {
  if (mode === "http") {
    await startHttpMode();
  } else {
    await startStdioMode();
  }
}

async function startStdioMode() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `k3s-studio MCP server started in stdio mode (API: ${process.env.K3S_STUDIO_API_URL ?? "http://localhost:9090"})\n`
  );
}

async function startHttpMode() {
  // Wire the MCP server to an in-memory transport so tools/list and tools/call work.
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const mcpClient = new Client({ name: "http-bridge", version: "0.1.0" }, {});
  await mcpClient.connect(clientTransport);

  const app = express();
  app.use(express.json());

  // GET /tools → OpenAI function schema list
  app.get("/tools", async (_req, res) => {
    try {
      const result = await mcpClient.listTools();
      const functions = result.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }));
      res.json(functions);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /tools/:name → execute tool
  app.post("/tools/:name", async (req, res) => {
    try {
      const result = await mcpClient.callTool({
        name: req.params.name,
        arguments: req.body ?? {},
      });
      const text = (result.content as Array<{ type: string; text: string }>)
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      res.json({ result: text });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const port = parseInt(process.env.MCP_HTTP_PORT ?? "3001");
  app.listen(port, "0.0.0.0", () => {
    process.stderr.write(
      `k3s-studio MCP HTTP bridge started on :${port} (API: ${process.env.K3S_STUDIO_API_URL ?? "http://localhost:9090"})\n`
    );
  });
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
