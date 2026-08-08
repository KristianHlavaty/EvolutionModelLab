import type { Express } from "express";

import type { EvolutionModelLabService } from "@eml/core";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  createMcpHandler,
  type McpHttpHandler,
} from "@modelcontextprotocol/server";

import { createEvolutionMcpServer } from "./tools.js";

export interface EvolutionMcpApplication {
  app: Express;
  handler: McpHttpHandler;
  close(): Promise<void>;
}

export function createEvolutionMcpHandler(
  service: EvolutionModelLabService,
): McpHttpHandler {
  return createMcpHandler(() => createEvolutionMcpServer(service), {
    legacy: "stateless",
    responseMode: "auto",
  });
}

export function createEvolutionMcpApplication(
  service: EvolutionModelLabService,
  host = "127.0.0.1",
): EvolutionMcpApplication {
  const app = createMcpExpressApp({ host, jsonLimit: "1mb" });
  const handler = createEvolutionMcpHandler(service);
  const nodeHandler = toNodeHandler(handler);

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "Evolution Model Lab MCP",
      milestone: 8,
      endpoint: "/mcp",
    });
  });
  app.all("/mcp", (request, response) => {
    void nodeHandler(request, response, request.body);
  });

  return {
    app,
    handler,
    close: () => handler.close(),
  };
}
