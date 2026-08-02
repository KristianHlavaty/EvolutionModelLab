import { z } from "zod";

import { candidateSources } from "./domain.js";

export const createCreatureInputSchema = z.object({
  displayName: z.string().trim().min(1, "Display name is required.").max(120),
  scientificName: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((value) => value || undefined),
  description: z.string().trim().max(4_000).default(""),
  generationBrief: z
    .string()
    .trim()
    .min(1, "Generation brief is required.")
    .max(12_000),
});

export type CreateCreatureInput = z.input<typeof createCreatureInputSchema>;

export const createConceptRoundInputSchema = z.object({
  creatureId: z.uuid(),
});

export const selectCandidateInputSchema = z.object({
  roundId: z.uuid(),
  candidateId: z.uuid(),
});

export const candidateSourceSchema = z.enum(candidateSources);

export const importCandidateMetadataSchema = z.object({
  creatureId: z.uuid(),
  roundId: z.uuid(),
  source: candidateSourceSchema.default("MANUAL"),
});

export const uuidParameterSchema = z.uuid();
