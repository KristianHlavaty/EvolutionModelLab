import { describe, expect, it } from "vitest";

import {
  buildConceptPrompt,
  buildEvolutionPrompt,
  buildRefinementPrompt,
} from "./index.js";

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

describe("buildRefinementPrompt", () => {
  it("includes every ordered feedback category and fixed constraint deterministically", () => {
    const input = {
      displayName: "Dunkleosteus",
      scientificName: "Dunkleosteus terrelli",
      generationBrief: "Armoured Devonian predator.",
      roundNumber: 2,
      parentCandidateId: "parent-uuid",
      parentCandidateNumber: 7,
      feedback: {
        preserveTraits: ["Broad skull", "Heavy armour"],
        anatomyToPreserve: ["Jaw proportions"],
        paletteToPreserve: ["Ochre plates"],
        silhouetteToPreserve: ["Tapered tail"],
        defects: ["Uneven fins"],
        requestedChanges: ["Clarify the eye"],
        forbiddenChanges: ["No horns"],
        generalNotes: "Keep it grounded.",
      },
      constraints: {
        camera: "orthographic side view",
        facing: "right",
        canvasWidth: 1024,
        canvasHeight: 1024,
        transparency: true,
        lighting: "neutral studio lighting",
        style: "production-ready game concept art",
      },
    };
    const first = buildRefinementPrompt(input);

    expect(first).toBe(buildRefinementPrompt(input));
    expect(first.indexOf("Broad skull")).toBeLessThan(
      first.indexOf("Heavy armour"),
    );
    expect(first).toContain("Parent candidate: 7 (parent-uuid)");
    expect(first).toContain("Ochre plates");
    expect(first).toContain("Create ten distinct refinements");
    expect(first).toContain("Do not create an animation");
    expect(first).toContain("Do not perform unrelated anatomy redesigns");
    expect(first).toContain("Canvas: 1024 × 1024 pixels");
  });
});

describe("buildEvolutionPrompt", () => {
  it("preserves ancestor identity and ordered mutations deterministically", () => {
    const input = {
      displayName: "Reef Dunkleosteus",
      generationBrief: "A shallow-water descendant adapted to reef pursuit.",
      evolutionaryGeneration: 2,
      parent: {
        id: "ancestor-id",
        displayName: "Dunkleosteus",
        scientificName: "Dunkleosteus terrelli",
        lockedCandidateId: "locked-id",
        lockedCandidateNumber: 4,
      },
      inheritedTraits: ["Armoured skull", "Blade-like jaw plates"],
      preferredTraits: ["Ochre plate edges"],
      forbiddenTraits: ["No horns"],
      mutations: [
        {
          category: "LOCOMOTION",
          description: "Shorter turning radius",
          intensity: 3,
          inherited: false,
        },
        {
          category: "COLOUR",
          description: "Reef-breaking mottled palette",
          inherited: false,
        },
      ],
      constraints: {
        camera: "orthographic side view",
        facing: "right",
        canvasWidth: 1024,
        canvasHeight: 1024,
        transparency: true,
        lighting: "neutral studio lighting",
        style: "match the locked ancestor",
      },
      candidateCount: 10,
    };
    const prompt = buildEvolutionPrompt(input);

    expect(prompt).toBe(buildEvolutionPrompt(input));
    expect(prompt).toContain("Approved ancestor: Dunkleosteus");
    expect(prompt).toContain("Ancestor locked candidate: 4 (locked-id)");
    expect(prompt.indexOf("Shorter turning radius")).toBeLessThan(
      prompt.indexOf("Reef-breaking mottled palette"),
    );
    expect(prompt).toContain("Preserve every inherited immutable trait");
    expect(prompt).toContain("Do not create an animation");
    expect(prompt).toContain("10 visibly distinct candidate descendants");
  });
});
