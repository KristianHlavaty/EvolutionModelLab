import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const toolNames = [
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
] as const;

const evalSuiteSchema = z.object({
  version: z.literal(1),
  description: z.string().min(1),
  cases: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        category: z.enum([
          "direct",
          "indirect",
          "identifier-reuse",
          "write",
          "workflow-gate",
          "confirmation",
          "unsupported",
          "error",
        ]),
        prompt: z.string().min(1),
        preconditions: z.array(z.string().min(1)),
        expectedTools: z.array(z.enum(toolNames)),
        forbiddenTools: z.array(z.string().min(1)),
        assertions: z.array(z.string().min(1)).min(2),
      }),
    )
    .min(10),
});

describe("ChatGPT MCP evaluation fixture", () => {
  it("is valid, uniquely identified, and only expects registered tools", async () => {
    const path = resolve(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "plugin",
      "evals",
      "mcp-tool-evals.json",
    );
    const suite = evalSuiteSchema.parse(
      JSON.parse(await readFile(path, "utf8")) as unknown,
    );
    const ids = suite.cases.map((testCase) => testCase.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(
      suite.cases.some((testCase) => testCase.category === "confirmation"),
    ).toBe(true);
    expect(
      suite.cases.some((testCase) => testCase.category === "unsupported"),
    ).toBe(true);
    for (const testCase of suite.cases) {
      expect(
        testCase.expectedTools.every(
          (toolName) => !testCase.forbiddenTools.includes(toolName),
        ),
      ).toBe(true);
    }
  });
});
