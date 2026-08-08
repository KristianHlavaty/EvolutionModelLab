import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

import { EvolutionModelLabService } from "@eml/core";
import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
} from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  createEvolutionMcpApplication,
  createEvolutionMcpHandler,
} from "./server.js";
import { MCP_SERVER_INSTRUCTIONS } from "./tools.js";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const cleanupRoots: string[] = [];

function testService(): EvolutionModelLabService {
  const testRoot = resolve(repositoryRoot, ".tmp", "tests", randomUUID());
  const relativeRoot = testRoot
    .slice(repositoryRoot.length + 1)
    .replaceAll("\\", "/");
  cleanupRoots.push(testRoot);
  return new EvolutionModelLabService({
    repositoryRoot,
    databasePath: `${relativeRoot}/data/app.db`,
    workspacePath: `${relativeRoot}/workspace`,
    exportsPath: `${relativeRoot}/exports`,
  });
}

function structured(result: CallToolResult): Record<string, unknown> {
  expect(result.structuredContent).toBeTypeOf("object");
  return result.structuredContent as Record<string, unknown>;
}

async function connectInProcess(service: EvolutionModelLabService) {
  const handler = createEvolutionMcpHandler(service);
  const client = new Client(
    { name: "evolution-model-lab-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL("http://test.local/mcp"),
    {
      fetch: (input, init) => handler.fetch(new Request(input, init)),
    },
  );
  await client.connect(transport);
  return { client, handler };
}

afterEach(async () => {
  await Promise.all(
    cleanupRoots.splice(0).map((path) =>
      rm(path, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      }),
    ),
  );
});

describe("Evolution Model Lab Streamable HTTP MCP server", () => {
  it("advertises the complete gated tool contract without unsupported file tools", async () => {
    const service = testService();
    const { client, handler } = await connectInProcess(service);
    try {
      expect(client.getInstructions()).toBe(MCP_SERVER_INSTRUCTIONS);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        "list_creatures",
        "get_creature_context",
        "get_generation_prompt",
        "get_current_round",
        "get_candidate_gallery",
        "get_validation_report",
        "create_creature",
        "create_generation_round",
        "select_candidate",
        "record_candidate_feedback",
        "lock_creature_design",
        "unlock_creature_design",
        "create_descendant",
        "create_animation",
        "approve_reference",
        "approve_animation",
        "export_creature",
      ]);
      expect(tools.every((tool) => tool.title && tool.description)).toBe(true);
      expect(tools.every((tool) => tool.outputSchema)).toBe(true);
      expect(tools.some((tool) => tool.name.includes("import"))).toBe(false);

      const listTool = tools.find((tool) => tool.name === "list_creatures");
      expect(listTool?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      const selectTool = tools.find((tool) => tool.name === "select_candidate");
      expect(selectTool?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      });
      const lockTool = tools.find(
        (tool) => tool.name === "lock_creature_design",
      );
      expect(lockTool?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      });
    } finally {
      await client.close();
      await handler.close();
      service.close();
    }
  });

  it("executes core workflows and returns stable structured success and error envelopes", async () => {
    const service = testService();
    const { client, handler } = await connectInProcess(service);
    try {
      const created = structured(
        await client.callTool({
          name: "create_creature",
          arguments: {
            displayName: "MCP trilobite",
            scientificName: "Testudunkleus protocolii",
            description: "A deterministic MCP test creature.",
            generationBrief:
              "Create a readable armoured creature in strict side view.",
          },
        }),
      );
      expect(created.ok).toBe(true);
      const creature = (created.data ?? {}) as Record<string, unknown>;
      const creatureId = creature.id as string;
      expect(creature.appRoute).toBe(`/creatures/${creatureId}`);

      const initial = structured(
        await client.callTool({
          name: "get_current_round",
          arguments: { creatureId },
        }),
      );
      expect(initial).toMatchObject({ ok: true, data: { round: null } });

      const concept = structured(
        await client.callTool({
          name: "create_generation_round",
          arguments: { creatureId, roundType: "CONCEPT" },
        }),
      );
      expect(concept.ok).toBe(true);
      const round = (concept.data ?? {}) as Record<string, unknown>;
      expect(round.type).toBe("CONCEPT");
      expect(round.appRoute).toBe(`/rounds/${String(round.id)}`);

      const prompt = structured(
        await client.callTool({
          name: "get_generation_prompt",
          arguments: {
            creatureId,
            roundId: round.id,
            taskType: "GENERATION",
          },
        }),
      );
      expect(prompt).toMatchObject({
        ok: true,
        data: {
          taskType: "GENERATION",
          sourceEntityId: round.id,
          expectedImageCount: 10,
          requiredReferenceRoutes: [],
        },
      });

      const failedRefinement = await client.callTool({
        name: "create_generation_round",
        arguments: { creatureId, roundType: "REFINEMENT" },
      });
      expect(failedRefinement.isError).toBe(true);
      expect(structured(failedRefinement)).toMatchObject({
        ok: false,
        error: { code: "REFINEMENT_PARENT_REQUIRED" },
      });

      const listed = structured(
        await client.callTool({ name: "list_creatures", arguments: {} }),
      );
      expect(listed).toMatchObject({
        ok: true,
        data: { creatures: [{ id: creatureId }] },
      });
      expect(JSON.stringify(listed)).not.toContain(repositoryRoot);
    } finally {
      await client.close();
      await handler.close();
      service.close();
    }
  });

  it("serves localhost health and MCP endpoints through the hardened Express adapter", async () => {
    const service = testService();
    const mcp = createEvolutionMcpApplication(service);
    const httpServer = mcp.app.listen(0, "127.0.0.1");
    await new Promise<void>((resolveListening, rejectListening) => {
      httpServer.once("listening", resolveListening);
      httpServer.once("error", rejectListening);
    });
    try {
      const address = httpServer.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const health = await fetch(`${baseUrl}/health`);
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toMatchObject({
        ok: true,
        milestone: 8,
        endpoint: "/mcp",
      });
      const rejectedOrigin = await fetch(`${baseUrl}/health`, {
        headers: { origin: "https://attacker.example" },
      });
      expect(rejectedOrigin.status).toBe(403);

      const client = new Client(
        { name: "evolution-model-lab-http-test", version: "1.0.0" },
        { versionNegotiation: { mode: "auto" } },
      );
      await client.connect(
        new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)),
      );
      try {
        const result = structured(
          await client.callTool({ name: "list_creatures", arguments: {} }),
        );
        expect(result).toEqual({ ok: true, data: { creatures: [] } });
      } finally {
        await client.close();
      }
    } finally {
      httpServer.closeAllConnections();
      await new Promise<void>((resolveClose, rejectClose) => {
        httpServer.close((error) => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      });
      await mcp.close();
      service.close();
    }
  });
});
