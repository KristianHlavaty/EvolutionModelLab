import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const registeredToolNames = [
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

const skills = [
  {
    path: resolve(repositoryRoot, ".agents", "skills", "evolution-model-lab"),
    references: ["architecture-and-paths.md", "development.md"],
  },
  {
    path: resolve(repositoryRoot, "plugin", "skills", "creature-generation"),
    references: [
      "concept-workflow.md",
      "refinement-workflow.md",
      "evolution-workflow.md",
      "reference-workflow.md",
      "animation-workflow.md",
      "repair-workflow.md",
      "quality-rules.md",
    ],
  },
] as const;

function parseFrontmatter(content: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  expect(match, "valid YAML frontmatter markers").not.toBeNull();
  const entries = (match?.[1] ?? "")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      expect(separator).toBeGreaterThan(0);
      return [line.slice(0, separator), line.slice(separator + 1).trim()];
    });
  return Object.fromEntries(entries) as Record<string, string>;
}

describe("Milestone 10 skill package", () => {
  it.each(skills)("validates $path", async ({ path, references }) => {
    const content = await readFile(resolve(path, "SKILL.md"), "utf8");
    const frontmatter = parseFrontmatter(content);
    const name = frontmatter.name ?? "";

    expect(Object.keys(frontmatter).sort()).toEqual(["description", "name"]);
    expect(name).toBe(basename(path));
    expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(frontmatter.description?.length).toBeGreaterThan(0);
    expect(frontmatter.description?.length).toBeLessThanOrEqual(1024);
    expect(frontmatter.description).not.toMatch(/[<>]/u);
    expect(content).not.toContain("TODO");
    expect(content.split(/\r?\n/u).length).toBeLessThan(500);

    const metadata = await readFile(
      resolve(path, "agents", "openai.yaml"),
      "utf8",
    );
    const shortDescription = /short_description: "([^"]+)"/u.exec(
      metadata,
    )?.[1];
    expect(shortDescription?.length).toBeGreaterThanOrEqual(25);
    expect(shortDescription?.length).toBeLessThanOrEqual(64);
    expect(metadata).toContain(`default_prompt: "Use $${name}`);

    for (const reference of references) {
      expect(content).toContain(`references/${reference}`);
      expect(
        (await readFile(resolve(path, "references", reference), "utf8")).length,
      ).toBeGreaterThan(80);
    }
  });

  it("validates the creature-generation behavior evals", async () => {
    const schema = z.object({
      version: z.literal(1),
      skill: z.literal("creature-generation"),
      description: z.string().min(1),
      cases: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9-]+$/u),
            workflow: z.enum([
              "concept",
              "refinement",
              "evolution",
              "reference",
              "animation",
              "repair",
              "confirmation",
              "handoff",
            ]),
            prompt: z.string().min(1),
            setup: z.array(z.string().min(1)).min(1),
            expectedTools: z.array(z.enum(registeredToolNames)),
            forbiddenTools: z.array(z.string().min(1)),
            expectedBehaviors: z.array(z.string().min(1)).min(3),
          }),
        )
        .min(10),
    });
    const fixture = schema.parse(
      JSON.parse(
        await readFile(
          resolve(
            repositoryRoot,
            "plugin",
            "evals",
            "creature-generation-skill-evals.json",
          ),
          "utf8",
        ),
      ) as unknown,
    );
    const ids = fixture.cases.map((testCase) => testCase.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(fixture.cases.map((testCase) => testCase.workflow))).toEqual(
      new Set([
        "concept",
        "refinement",
        "evolution",
        "reference",
        "animation",
        "repair",
        "confirmation",
        "handoff",
      ]),
    );
    for (const testCase of fixture.cases) {
      expect(
        testCase.expectedTools.every(
          (toolName) => !testCase.forbiddenTools.includes(toolName),
        ),
      ).toBe(true);
    }
  });
});
