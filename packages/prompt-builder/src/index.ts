export interface ConceptPromptInput {
  displayName: string;
  scientificName?: string | null;
  generationBrief: string;
  roundNumber: number;
  candidateCount?: number;
}

export interface RefinementFeedback {
  preserveTraits: string[];
  anatomyToPreserve: string[];
  paletteToPreserve: string[];
  silhouetteToPreserve: string[];
  defects: string[];
  requestedChanges: string[];
  forbiddenChanges: string[];
  generalNotes: string;
}

export interface RefinementPromptInput {
  displayName: string;
  scientificName?: string | null;
  generationBrief: string;
  roundNumber: number;
  parentCandidateId: string;
  parentCandidateNumber: number;
  feedback: RefinementFeedback;
  constraints: {
    camera: string;
    facing: string;
    canvasWidth: number;
    canvasHeight: number;
    transparency: boolean;
    lighting: string;
    style: string;
  };
}

export interface EvolutionPromptInput {
  displayName: string;
  scientificName?: string | null;
  generationBrief: string;
  evolutionaryGeneration: number;
  parent: {
    id: string;
    displayName: string;
    scientificName?: string | null;
    lockedCandidateId: string;
    lockedCandidateNumber: number;
  };
  inheritedTraits: string[];
  preferredTraits: string[];
  forbiddenTraits: string[];
  mutations: Array<{
    category: string;
    description: string;
    intensity?: number | undefined;
    inherited: boolean;
  }>;
  constraints: {
    camera: string;
    facing: string;
    canvasWidth: number;
    canvasHeight: number;
    transparency: boolean;
    lighting: string;
    style: string;
  };
  candidateCount?: number;
}

export interface ReferencePromptInput {
  displayName: string;
  scientificName?: string | null;
  referenceType: string;
  referenceLabel: string;
  lockedCandidateId: string;
  manifestVersion: number;
  immutableFeatures: string[];
  preferredFeatures: string[];
  forbiddenFeatures: string[];
  anatomyNotes: string;
  paletteNotes: string;
  textureNotes: string;
  constraints: {
    camera: string;
    facing: string;
    canvasWidth: number;
    canvasHeight: number;
    transparency: boolean;
    lighting: string;
    style: string;
  };
}

function identity(input: {
  displayName: string;
  scientificName?: string | null;
}): string {
  return input.scientificName
    ? `${input.displayName} (${input.scientificName})`
    : input.displayName;
}

function feedbackSection(title: string, values: readonly string[]): string[] {
  return [
    `### ${title}`,
    ...(values.length > 0
      ? values.map((value, index) => `${index + 1}. ${value}`)
      : ["- None recorded."]),
    "",
  ];
}

export function buildConceptPrompt(input: ConceptPromptInput): string {
  const candidateCount = input.candidateCount ?? 10;

  return [
    "# Evolution Model Lab — Concept Request",
    "",
    `Creature: ${identity(input)}`,
    `Generation round: ${input.roundNumber}`,
    "Task type: CONCEPT",
    "Workflow state: CONCEPT",
    "",
    "## Generation brief",
    input.generationBrief.trim(),
    "",
    "## Required output",
    `Create ${candidateCount} visibly different but stylistically compatible creature candidates.`,
    "Keep camera, lighting, scale, game-art style, and orientation consistent across candidates.",
    "Use transparent backgrounds and keep each complete creature inside its assigned image or contact-sheet cell.",
    "Do not overlap candidates. Do not create an animation or animation frames.",
    "Return either separate PNG images or one clean, clearly numbered contact sheet.",
    "If using separate images, do not place numbers, text, or decorative borders inside the images.",
    "",
    "After generating, save or copy the PNG files and import them into Evolution Model Lab by drag-and-drop, file picker, or clipboard paste.",
  ].join("\n");
}

export function buildRefinementPrompt(input: RefinementPromptInput): string {
  const transparency = input.constraints.transparency
    ? "transparent background required"
    : "background may be opaque";
  return [
    "# Evolution Model Lab — Refinement Request",
    "",
    `Creature: ${identity(input)}`,
    `Generation round: ${input.roundNumber}`,
    "Task type: REFINEMENT",
    "Workflow state: REFINING",
    `Parent candidate: ${input.parentCandidateNumber} (${input.parentCandidateId})`,
    "",
    "## Original generation brief",
    input.generationBrief.trim(),
    "",
    "## Structured feedback",
    ...feedbackSection("Preserve traits", input.feedback.preserveTraits),
    ...feedbackSection("Anatomy to preserve", input.feedback.anatomyToPreserve),
    ...feedbackSection("Palette to preserve", input.feedback.paletteToPreserve),
    ...feedbackSection(
      "Silhouette to preserve",
      input.feedback.silhouetteToPreserve,
    ),
    ...feedbackSection("Defects to correct", input.feedback.defects),
    ...feedbackSection("Requested changes", input.feedback.requestedChanges),
    ...feedbackSection("Forbidden changes", input.feedback.forbiddenChanges),
    "### General notes",
    input.feedback.generalNotes || "None recorded.",
    "",
    "## Fixed production constraints",
    `Camera: ${input.constraints.camera}`,
    `Facing: ${input.constraints.facing}`,
    `Canvas: ${input.constraints.canvasWidth} × ${input.constraints.canvasHeight} pixels`,
    `Transparency: ${transparency}`,
    `Lighting: ${input.constraints.lighting}`,
    `Style: ${input.constraints.style}`,
    "",
    "## Required output",
    "Use the attached parent image as the exact design parent.",
    "Create ten distinct refinements that apply the feedback while preserving the parent’s identity.",
    "Keep camera, facing direction, canvas, transparency, lighting, and style consistent across all ten.",
    "Do not create an animation or animation frames.",
    "Do not perform unrelated anatomy redesigns or introduce unrequested body structures.",
    "Return separate PNGs or one clearly separated contact sheet with no overlaps.",
  ].join("\n");
}

export function buildEvolutionPrompt(input: EvolutionPromptInput): string {
  const candidateCount = input.candidateCount ?? 10;
  const mutationLines = input.mutations.flatMap((mutation, index) => [
    `${index + 1}. [${mutation.category}] ${mutation.description}`,
    `   Intensity: ${mutation.intensity ?? "not specified"}/5; ${
      mutation.inherited ? "inherited adaptation" : "new descendant mutation"
    }`,
  ]);
  return [
    "# Evolution Model Lab — Evolution Descendant Request",
    "",
    `Descendant: ${identity(input)}`,
    `Evolutionary generation: ${input.evolutionaryGeneration}`,
    "Generation round: 1",
    "Task type: EVOLUTION",
    "Workflow state: CONCEPT",
    `Approved ancestor: ${identity(input.parent)} (${input.parent.id})`,
    `Ancestor locked candidate: ${input.parent.lockedCandidateNumber} (${input.parent.lockedCandidateId})`,
    "",
    "## Descendant generation brief",
    input.generationBrief.trim(),
    "",
    ...feedbackSection("Inherited immutable traits", input.inheritedTraits),
    ...feedbackSection("Preferred inherited traits", input.preferredTraits),
    ...feedbackSection("Forbidden traits", input.forbiddenTraits),
    "## Stored evolutionary mutations",
    ...(mutationLines.length > 0
      ? mutationLines
      : ["- No evolutionary mutations recorded."]),
    "",
    "## Fixed production constraints",
    `Camera: ${input.constraints.camera}`,
    `Facing: ${input.constraints.facing}`,
    `Canvas: ${input.constraints.canvasWidth} × ${input.constraints.canvasHeight} pixels`,
    `Transparency: ${
      input.constraints.transparency
        ? "transparent background required"
        : "background may be opaque"
    }`,
    `Lighting: ${input.constraints.lighting}`,
    `Style: ${input.constraints.style}`,
    "",
    "## Required output",
    "Use the attached locked ancestor design as the exact evolutionary identity reference.",
    `Create ${candidateCount} visibly distinct candidate descendants that remain recognizably related to the approved ancestor.`,
    "Preserve every inherited immutable trait and introduce only the stored evolutionary mutations.",
    "Do not turn the candidates into unrelated species or redesign unrelated anatomy.",
    "Keep camera, facing, canvas, scale, transparency, palette logic, material treatment, and lighting consistent.",
    "Do not create an animation or animation frames.",
    "Return separate PNGs or one clean, clearly numbered contact sheet with no overlaps.",
  ].join("\n");
}

export function buildReferencePrompt(input: ReferencePromptInput): string {
  const anatomyDiagram = input.referenceType === "ANATOMY_DIAGRAM";
  return [
    "# Evolution Model Lab — Canonical Reference Request",
    "",
    `Creature: ${identity(input)}`,
    `Reference type: ${input.referenceType}`,
    `Requested view: ${input.referenceLabel}`,
    "Task type: REFERENCE",
    "Workflow state: REFERENCE_BUILDING",
    `Locked candidate: ${input.lockedCandidateId}`,
    `Frozen manifest version: ${input.manifestVersion}`,
    "",
    ...feedbackSection("Immutable identity features", input.immutableFeatures),
    ...feedbackSection("Preferred identity features", input.preferredFeatures),
    ...feedbackSection("Forbidden changes", input.forbiddenFeatures),
    "## Approved design notes",
    `Anatomy: ${input.anatomyNotes || "No additional anatomy notes recorded."}`,
    `Palette: ${input.paletteNotes || "Match the attached locked design exactly."}`,
    `Texture/material: ${input.textureNotes || "Match the attached locked design exactly."}`,
    "",
    "## Fixed production constraints",
    `Camera: ${input.constraints.camera}`,
    `Facing baseline: ${input.constraints.facing}`,
    `Canvas: ${input.constraints.canvasWidth} × ${input.constraints.canvasHeight} pixels`,
    `Transparency: ${
      input.constraints.transparency
        ? "transparent background required"
        : "background may be opaque"
    }`,
    `Lighting: ${input.constraints.lighting}`,
    `Style: ${input.constraints.style}`,
    "",
    "## Required output",
    "Use the attached locked-design PNG as the exact and only creature identity authority.",
    `Create exactly one ${input.referenceLabel.toLowerCase()} reference image.`,
    "Use a neutral, non-animated pose. Preserve anatomy, silhouette logic, scale, materials, palette, texture, style, and lighting exactly.",
    "Do not redesign, evolve, stylize away from, embellish, or add unapproved structures to the creature.",
    anatomyDiagram
      ? "Labels and restrained diagram callouts are allowed only where they clarify anatomy already approved in the manifest."
      : "Do not add labels, text, arrows, diagram marks, borders, or extra views.",
    "Return one standalone PNG, not a contact sheet and not an animation frame sequence.",
  ].join("\n");
}
