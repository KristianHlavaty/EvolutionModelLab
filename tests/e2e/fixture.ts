import { resolve } from "node:path";

import { expect, test as base } from "@playwright/test";
import { createServer as createViteServer } from "vite";

import { createApp } from "../../apps/server/src/server.js";
import { EvolutionModelLabService } from "../../packages/core/dist/index.js";

type WorkerFixtures = {
  e2eServer: void;
};

export const test = base.extend<Record<string, never>, WorkerFixtures>({
  e2eServer: [
    async ({ browserName }, use) => {
      void browserName;
      const repositoryRoot = resolve(import.meta.dirname, "..", "..");
      const host = "127.0.0.1";
      const serverPort = 3011;
      const webPort = 5181;
      const service = new EvolutionModelLabService({
        repositoryRoot,
        databasePath: ".tmp/e2e/data/app.db",
        workspacePath: ".tmp/e2e/workspace",
        exportsPath: ".tmp/e2e/exports",
        maximumUploadBytes: 10_485_760,
        maximumImageWidth: 4096,
        maximumImageHeight: 4096,
        maximumFilesPerImport: 10,
      });
      const apiServer = createApp(service).listen(serverPort, host);
      await new Promise<void>((resolveListen, rejectListen) => {
        apiServer.once("listening", resolveListen);
        apiServer.once("error", rejectListen);
      });
      const vite = await createViteServer({
        configFile: resolve(repositoryRoot, "apps", "web", "vite.config.ts"),
        configLoader: "runner",
        root: resolve(repositoryRoot, "apps", "web"),
        server: {
          host,
          port: webPort,
          strictPort: true,
          proxy: {
            "/api": `http://${host}:${serverPort}`,
          },
        },
      });

      try {
        await vite.listen();
        await use();
      } finally {
        await vite.close();
        apiServer.closeAllConnections();
        await new Promise<void>((resolveClose, rejectClose) => {
          apiServer.close((error) => {
            if (error) rejectClose(error);
            else resolveClose();
          });
        });
        service.close();
      }
    },
    { auto: true, scope: "worker" },
  ],
});

export { expect };
