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

export const designManifestFieldNames = [
  "immutableFeatures",
  "preferredFeatures",
  "forbiddenFeatures",
  "anatomyNotes",
  "biologicalNotes",
  "styleNotes",
  "paletteNotes",
  "textureNotes",
  "cameraNotes",
  "lightingNotes",
  "animationNotes",
  "canvasWidth",
  "canvasHeight",
  "facing",
  "anchorX",
  "anchorY",
  "transparentBackgroundRequired",
] as const;

const manifestFeatureListSchema = z
  .array(z.string().trim().min(1).max(1_000))
  .max(100)
  .refine((items) => new Set(items).size === items.length, {
    message: "Feature entries must be unique within each list.",
  });

const manifestNotesSchema = z.string().trim().max(12_000).default("");

export const designManifestInputSchema = z
  .object({
    immutableFeatures: manifestFeatureListSchema.default([]),
    preferredFeatures: manifestFeatureListSchema.default([]),
    forbiddenFeatures: manifestFeatureListSchema.default([]),
    anatomyNotes: manifestNotesSchema,
    biologicalNotes: manifestNotesSchema,
    styleNotes: manifestNotesSchema,
    paletteNotes: manifestNotesSchema,
    textureNotes: manifestNotesSchema,
    cameraNotes: manifestNotesSchema,
    lightingNotes: manifestNotesSchema,
    animationNotes: manifestNotesSchema,
    canvasWidth: z.coerce.number().int().min(1).max(8192),
    canvasHeight: z.coerce.number().int().min(1).max(8192),
    facing: z.enum(["left", "right", "front", "back"]),
    anchorX: z.coerce.number().int().min(0),
    anchorY: z.coerce.number().int().min(0),
    transparentBackgroundRequired: z.boolean(),
    explicitFields: z
      .array(z.enum(designManifestFieldNames))
      .default([])
      .transform((fields) => [...new Set(fields)]),
    confirmedLockedMismatch: z.boolean().default(false),
    actor: z.string().trim().min(1).max(120).default("LOCAL_USER"),
  })
  .superRefine((value, context) => {
    if (value.anchorX >= value.canvasWidth) {
      context.addIssue({
        code: "custom",
        path: ["anchorX"],
        message: "Anchor X must be inside the canvas width.",
      });
    }
    if (value.anchorY >= value.canvasHeight) {
      context.addIssue({
        code: "custom",
        path: ["anchorY"],
        message: "Anchor Y must be inside the canvas height.",
      });
    }
  });

export type DesignManifestInput = z.infer<typeof designManifestInputSchema>;

export const lockDesignInputSchema = z.object({
  candidateId: z.uuid(),
  confirmed: z.boolean().default(false),
  actor: z.string().trim().min(1).max(120).default("LOCAL_USER"),
});

export const unlockDesignInputSchema = z.object({
  confirmed: z.boolean().default(false),
  actor: z.string().trim().min(1).max(120).default("LOCAL_USER"),
});

export const candidateRejectionInputSchema = z.object({
  rejected: z.boolean(),
});

export const destructiveActionInputSchema = z.object({
  confirmed: z.boolean().default(false),
});
