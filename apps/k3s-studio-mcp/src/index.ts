#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerClusterTools } from "./tools/cluster.js";
import { registerNodeTools } from "./tools/node.js";
import { registerK8sTools } from "./tools/k8s.js";
import { registerServerTools } from "./tools/server.js";

const server = new McpServer({
  name: "k3s-studio",
  version: "0.1.0",
});

registerServerTools(server);
registerClusterTools(server);
registerNodeTools(server);
registerK8sTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `k3s-studio MCP server started (API: ${process.env.K3S_STUDIO_API_URL ?? "http://localhost:9090"})\n`
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
