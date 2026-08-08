import { resolve } from "node:path";

import { EvolutionModelLabService } from "@eml/core";

import { createEvolutionMcpApplication } from "./server.js";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const host = process.env.MCP_HOST ?? "127.0.0.1";
const port = Number(process.env.MCP_PORT ?? 3002);

const service = new EvolutionModelLabService({
  repositoryRoot,
  databasePath: process.env.DATABASE_PATH ?? "data/evolution-model-lab.db",
  workspacePath: process.env.WORKSPACE_PATH ?? "workspace",
  exportsPath: process.env.EXPORTS_PATH ?? "exports",
  maximumUploadBytes: Number(process.env.MAXIMUM_UPLOAD_BYTES ?? 10_485_760),
  maximumImageWidth: Number(process.env.MAXIMUM_IMAGE_WIDTH ?? 4096),
  maximumImageHeight: Number(process.env.MAXIMUM_IMAGE_HEIGHT ?? 4096),
  maximumFilesPerImport: Number(process.env.MAXIMUM_FILES_PER_IMPORT ?? 10),
});

const mcp = createEvolutionMcpApplication(service, host);
const httpServer = mcp.app.listen(port, host, () => {
  console.log(`Evolution Model Lab MCP ready at http://${host}:${port}/mcp`);
});

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  await mcp.close();
  httpServer.closeAllConnections();
  await new Promise<void>((resolveClose, rejectClose) => {
    httpServer.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
  service.close();
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

export {
  createEvolutionMcpApplication,
  createEvolutionMcpHandler,
} from "./server.js";
export { createEvolutionMcpServer, MCP_SERVER_INSTRUCTIONS } from "./tools.js";
