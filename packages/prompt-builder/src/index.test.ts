import { describe, expect, it } from "vitest";

import { buildConceptPrompt } from "./index.js";

describe("buildConceptPrompt", () => {
  it("produces deterministic concept instructions from stored inputs", () => {
    const input = {
      displayName: "Dunkleosteus",
      scientificName: "Dunkleosteus terrelli",
      generationBrief:
        "Heavy armoured fish with a readable side-view silhouette.",
      roundNumber: 1,
      candidateCount: 10,
    };

    const first = buildConceptPrompt(input);
    const second = buildConceptPrompt(input);

    expect(first).toBe(second);
    expect(first).toContain("Creature: Dunkleosteus (Dunkleosteus terrelli)");
    expect(first).toContain("Create 10 visibly different");
    expect(first).toContain("Do not create an animation");
    expect(first).toContain("transparent backgrounds");
  });
});
