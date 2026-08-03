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

const feedbackListSchema = z.array(z.string().trim().min(1).max(1_000)).max(50);

export const candidateFeedbackInputSchema = z.object({
  preserveTraits: feedbackListSchema.default([]),
  anatomyToPreserve: feedbackListSchema.default([]),
  paletteToPreserve: feedbackListSchema.default([]),
  silhouetteToPreserve: feedbackListSchema.default([]),
  defects: feedbackListSchema.default([]),
  requestedChanges: feedbackListSchema.default([]),
  forbiddenChanges: feedbackListSchema.default([]),
  generalNotes: z.string().trim().max(8_000).default(""),
});

export type CandidateFeedbackInput = z.infer<
  typeof candidateFeedbackInputSchema
>;

export const contactSheetLayoutSchema = z.object({
  rows: z.coerce.number().int().min(1).max(10),
  columns: z.coerce.number().int().min(1).max(10),
  marginTop: z.coerce.number().int().min(0).max(2_000).default(0),
  marginRight: z.coerce.number().int().min(0).max(2_000).default(0),
  marginBottom: z.coerce.number().int().min(0).max(2_000).default(0),
  marginLeft: z.coerce.number().int().min(0).max(2_000).default(0),
  horizontalGap: z.coerce.number().int().min(0).max(2_000).default(0),
  verticalGap: z.coerce.number().int().min(0).max(2_000).default(0),
});

export type ContactSheetLayoutInput = z.infer<typeof contactSheetLayoutSchema>;

export const confirmContactSheetInputSchema = z.object({
  selectedCropIndexes: z
    .array(z.number().int().min(0).max(99))
    .min(1)
    .max(10)
    .refine((values) => new Set(values).size === values.length, {
      message: "Each crop can only be selected once.",
    }),
});

export const candidateSourceSchema = z.enum(candidateSources);

export const importCandidateMetadataSchema = z.object({
  creatureId: z.uuid(),
  roundId: z.uuid(),
  source: candidateSourceSchema.default("MANUAL"),
});

export const uuidParameterSchema = z.uuid();
