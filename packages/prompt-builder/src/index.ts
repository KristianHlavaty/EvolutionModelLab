export interface ConceptPromptInput {
  displayName: string;
  scientificName?: string | null;
  generationBrief: string;
  roundNumber: number;
  candidateCount?: number;
}

export function buildConceptPrompt(input: ConceptPromptInput): string {
  const candidateCount = input.candidateCount ?? 10;
  const identity = input.scientificName
    ? `${input.displayName} (${input.scientificName})`
    : input.displayName;

  return [
    "# Evolution Model Lab — Concept Request",
    "",
    `Creature: ${identity}`,
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
