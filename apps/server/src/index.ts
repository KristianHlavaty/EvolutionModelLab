import { resolve } from "node:path";

import { EvolutionModelLabService } from "@eml/core";

import { createApp } from "./server.js";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.SERVER_PORT ?? 3001);

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

const app = createApp(service);
const server = app.listen(port, host, () => {
  console.log(`Evolution Model Lab server ready at http://${host}:${port}`);
});

function shutdown(): void {
  server.close(() => {
    service.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
