import {
  AppError,
  type AnimationView,
  type CandidateFeedbackView,
  type CandidateView,
  type CreatureDetail,
  type EvolutionModelLabService,
  isAppError,
  type ReferenceImageView,
  type RoundView,
  type ValidationReportView,
} from "@eml/core";
import {
  animationTypes,
  candidateFeedbackInputSchema,
  createCreatureInputSchema,
  evolutionMutationCategories,
  exportFormats,
} from "@eml/shared";
import {
  McpServer,
  type ToolAnnotations,
  type CallToolResult,
} from "@modelcontextprotocol/server";
import { z } from "zod";

export const MCP_SERVER_INSTRUCTIONS = `Evolution Model Lab is a local-first, gated creature-production workspace.
Prefer read tools before write tools. Retrieve get_creature_context before refinement, reference, animation, or export work.
Create a refinement round only after exactly one candidate is selected in the current round. Use select_candidate first when needed.
Never create animation before the active design lock satisfies every mandatory reference approval.
Treat lock_creature_design, unlock_creature_design, approve_reference, approve_animation, and export_creature as consequential actions: pass confirmation=true only after the user explicitly approves that exact action.
Do not replace or reinterpret locked assets without explicit user instruction. Originals and immutable history must remain preserved.
MCP image-file input is not advertised by this server because no interoperable direct ChatGPT-to-tool file parameter is currently documented. Direct the user to the returned local application route for picker, drag-and-drop, or clipboard import.
Never claim success when a database or filesystem operation reports an error. Read the structured error code and correct the workflow or inputs before retrying.`;

const MCP_ACTOR = "MCP_CLIENT";

const localRouteSchema = z
  .string()
  .startsWith("/")
  .describe("User-openable route in the local Evolution Model Lab web app.");

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

function resultSchema<Data extends z.ZodType>(data: Data) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: errorSchema }),
  ]);
}

const feedbackSchema = z.object({
  preserveTraits: z.array(z.string()),
  anatomyToPreserve: z.array(z.string()),
  paletteToPreserve: z.array(z.string()),
  silhouetteToPreserve: z.array(z.string()),
  defects: z.array(z.string()),
  requestedChanges: z.array(z.string()),
  forbiddenChanges: z.array(z.string()),
  generalNotes: z.string(),
});

const candidateSchema = z.object({
  id: z.uuid(),
  roundId: z.uuid(),
  number: z.number().int().positive(),
  originalFilename: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  source: z.string(),
  selected: z.boolean(),
  locked: z.boolean(),
  rejected: z.boolean(),
  imageRoute: localRouteSchema,
  thumbnailRoute: localRouteSchema,
  feedback: feedbackSchema.nullable(),
});

const creatureSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  scientificName: z.string().nullable(),
  status: z.string(),
  parentCreatureId: z.uuid().nullable(),
  currentRoundId: z.uuid().nullable(),
  thumbnailRoute: localRouteSchema.nullable(),
  appRoute: localRouteSchema,
  updatedAt: z.string(),
});

const roundSchema = z.object({
  id: z.uuid(),
  creatureId: z.uuid(),
  number: z.number().int().positive(),
  type: z.string(),
  prompt: z.string(),
  createdAt: z.string(),
  parentCandidateId: z.uuid().nullable(),
  feedbackSnapshot: feedbackSchema.nullable(),
  candidates: z.array(candidateSchema),
  appRoute: localRouteSchema,
});

const manifestContextSchema = z.object({
  version: z.number().int().nonnegative(),
  immutableFeatures: z.array(z.string()),
  preferredFeatures: z.array(z.string()),
  forbiddenFeatures: z.array(z.string()),
  canvas: z.object({ width: z.number().int(), height: z.number().int() }),
  facing: z.string(),
  anchor: z.object({ x: z.number().int(), y: z.number().int() }),
  transparentBackgroundRequired: z.boolean(),
});

const referenceSummarySchema = z.object({
  id: z.uuid(),
  type: z.string(),
  status: z.string(),
  approved: z.boolean(),
  currentDesign: z.boolean(),
  imageRoute: localRouteSchema.nullable(),
});

const animationSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.string(),
  status: z.string(),
  currentDesign: z.boolean(),
  frameCount: z.number().int().nonnegative(),
  expectedFrameCount: z.number().int().positive(),
  appRoute: localRouteSchema,
});

const validationAnimationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  animationType: z.string(),
  status: z.string(),
  currentDesign: z.boolean(),
  expectedFrameCount: z.number().int(),
  activeFrameCount: z.number().int(),
  warningFrameCount: z.number().int(),
  pendingRepairCount: z.number().int(),
  messages: z.array(
    z.object({
      frameId: z.uuid(),
      frameNumber: z.number().int(),
      messages: z.array(z.string()),
    }),
  ),
});

const validationReportSchema = z.object({
  creatureId: z.uuid(),
  creatureName: z.string(),
  generatedAt: z.string(),
  currentDesignLockId: z.uuid().nullable(),
  missingMandatoryReferences: z.array(z.string()),
  referencesApproved: z.number().int(),
  animations: z.array(validationAnimationSchema),
  approvedAnimationCount: z.number().int(),
  warningCount: z.number().int(),
  blockingIssues: z.array(z.string()),
  readyForExport: z.boolean(),
  appRoute: localRouteSchema,
});

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} satisfies ToolAnnotations;

const additiveWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} satisfies ToolAnnotations;

const stateChangeAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} satisfies ToolAnnotations;

function publicError(error: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }
  if (error instanceof z.ZodError) {
    return {
      code: "INVALID_INPUT",
      message: "The tool input did not satisfy the required schema.",
      details: error.issues,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message:
      error instanceof Error
        ? error.message
        : "The operation failed without a usable error message.",
  };
}

function textResult(
  value: Record<string, unknown>,
  isError = false,
): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  };
}

function registerTool<InputShape extends z.ZodRawShape, Data extends z.ZodType>(
  server: McpServer,
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: z.ZodObject<InputShape>;
    dataSchema: Data;
    annotations: ToolAnnotations;
  },
  handler: (
    input: z.output<z.ZodObject<InputShape>>,
  ) => Promise<z.output<Data>> | z.output<Data>,
): void {
  const outputSchema = resultSchema(config.dataSchema);
  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      outputSchema,
      annotations: config.annotations,
    },
    async (input) => {
      try {
        const data = await handler(input);
        const result = outputSchema.parse({ ok: true, data });
        return textResult(result);
      } catch (error) {
        const result = outputSchema.parse({
          ok: false,
          error: publicError(error),
        });
        return textResult(result, true);
      }
    },
  );
}

function projectFeedback(
  feedback: CandidateFeedbackView | RoundView["feedbackSnapshot"],
) {
  if (!feedback) return null;
  return {
    preserveTraits: feedback.preserveTraits,
    anatomyToPreserve: feedback.anatomyToPreserve,
    paletteToPreserve: feedback.paletteToPreserve,
    silhouetteToPreserve: feedback.silhouetteToPreserve,
    defects: feedback.defects,
    requestedChanges: feedback.requestedChanges,
    forbiddenChanges: feedback.forbiddenChanges,
    generalNotes: feedback.generalNotes,
  };
}

function projectCandidate(candidate: CandidateView) {
  return {
    id: candidate.id,
    roundId: candidate.generationRoundId,
    number: candidate.candidateNumber,
    originalFilename: candidate.originalFilename,
    width: candidate.width,
    height: candidate.height,
    source: candidate.source,
    selected: candidate.selected,
    locked: candidate.locked,
    rejected: candidate.rejected,
    imageRoute: candidate.imageUrl,
    thumbnailRoute: candidate.thumbnailUrl,
    feedback: projectFeedback(candidate.feedback),
  };
}

function projectRound(round: RoundView) {
  return {
    id: round.id,
    creatureId: round.creatureProjectId,
    number: round.roundNumber,
    type: round.roundType,
    prompt: round.generatedPrompt,
    createdAt: round.createdAt,
    parentCandidateId: round.parentCandidate?.id ?? null,
    feedbackSnapshot: projectFeedback(round.feedbackSnapshot),
    candidates: round.candidates.map(projectCandidate),
    appRoute: `/rounds/${round.id}`,
  };
}

function projectCreature(creature: CreatureDetail) {
  return {
    id: creature.id,
    name: creature.displayName,
    scientificName: creature.scientificName,
    status: creature.status,
    parentCreatureId: creature.parentCreatureId,
    currentRoundId: creature.currentRoundId,
    thumbnailRoute:
      creature.lockedCandidate?.thumbnailUrl ??
      creature.selectedCandidate?.thumbnailUrl ??
      null,
    appRoute: `/creatures/${creature.id}`,
    updatedAt: creature.updatedAt,
  };
}

function projectReference(reference: ReferenceImageView) {
  return {
    id: reference.id,
    type: reference.referenceType,
    status: reference.status,
    approved: reference.approved,
    currentDesign: reference.currentDesign,
    imageRoute: reference.imageUrl,
  };
}

function projectAnimation(animation: AnimationView) {
  return {
    id: animation.id,
    name: animation.name,
    type: animation.animationType,
    status: animation.status,
    currentDesign: animation.currentDesign,
    frameCount: animation.frames.length,
    expectedFrameCount: animation.expectedFrameCount,
    appRoute: `/creatures/${animation.creatureProjectId}/animations/${animation.id}`,
  };
}

function projectValidation(report: ValidationReportView) {
  return {
    ...report,
    appRoute: `/creatures/${report.creatureId}/export`,
  };
}

function nextAction(
  creature: CreatureDetail,
  missingReferences: string[],
): { code: string; description: string; appRoute: string } {
  const creatureRoute = `/creatures/${creature.id}`;
  switch (creature.status) {
    case "DRAFT":
      return {
        code: "CREATE_CONCEPT_ROUND",
        description: "Create the first immutable concept round.",
        appRoute: creatureRoute,
      };
    case "CONCEPT":
    case "REFINING":
      return {
        code: "IMPORT_OR_SELECT_CANDIDATE",
        description:
          "Use the local round page to import real PNGs, then select exactly one candidate.",
        appRoute: creature.currentRoundId
          ? `/rounds/${creature.currentRoundId}`
          : creatureRoute,
      };
    case "CANDIDATE_SELECTED":
      return {
        code: "REFINE_OR_LOCK",
        description:
          "Record feedback and create a refinement round, or explicitly lock the selected design.",
        appRoute: creatureRoute,
      };
    case "DESIGN_LOCKED":
    case "REFERENCE_BUILDING":
      return {
        code: "COMPLETE_REFERENCES",
        description: `Request, import, review, and approve the missing references: ${missingReferences.join(", ") || "project-configured references"}.`,
        appRoute: `/creatures/${creature.id}/references`,
      };
    case "REFERENCE_APPROVED":
      return {
        code: "CREATE_ANIMATION",
        description: "Create a reference-gated animation sequence.",
        appRoute: `/creatures/${creature.id}/animations`,
      };
    case "ANIMATING":
    case "ANIMATION_REVIEW":
      return {
        code: "REVIEW_ANIMATION",
        description:
          "Import or repair real frames in the local Animation Lab, then explicitly approve the sequence.",
        appRoute: `/creatures/${creature.id}/animations`,
      };
    case "GAME_READY":
      return {
        code: "REVIEW_EXPORTS",
        description:
          "Review the immutable game-package history or create a new version.",
        appRoute: `/creatures/${creature.id}/export`,
      };
    default:
      return {
        code: "REVIEW_CREATURE",
        description:
          "Review the creature's current workflow state in the local app.",
        appRoute: creatureRoute,
      };
  }
}

export function createEvolutionMcpServer(
  service: EvolutionModelLabService,
): McpServer {
  const server = new McpServer(
    { name: "evolution-model-lab", version: "0.8.0" },
    { instructions: MCP_SERVER_INSTRUCTIONS },
  );

  registerTool(
    server,
    "list_creatures",
    {
      title: "List creatures",
      description:
        "List persisted creature projects with stable IDs, workflow status, parent/current-round relationships, local thumbnail routes, and modification times. Read this before choosing a project.",
      inputSchema: z.object({}),
      dataSchema: z.object({ creatures: z.array(creatureSummarySchema) }),
      annotations: readAnnotations,
    },
    () => ({
      creatures: service
        .listCreatures()
        .map((creature) => projectCreature(service.getCreature(creature.id))),
    }),
  );

  registerTool(
    server,
    "get_creature_context",
    {
      title: "Get creature context",
      description:
        "Read the authoritative workflow context for one creature before refinement, reference, animation, approval, or export work.",
      inputSchema: z.object({
        creatureId: z.uuid().describe("Stable creature project ID."),
      }),
      dataSchema: z.object({
        creature: creatureSummarySchema.extend({
          generation: z.number().int().nonnegative(),
        }),
        currentRound: roundSchema.nullable(),
        selectedCandidate: candidateSchema.nullable(),
        lockedCandidate: candidateSchema.nullable(),
        designManifest: manifestContextSchema.nullable(),
        evolutionaryParent: z
          .object({
            id: z.uuid(),
            name: z.string(),
            appRoute: localRouteSchema,
          })
          .nullable(),
        mutations: z.array(
          z.object({
            id: z.uuid(),
            category: z.string(),
            description: z.string(),
            priority: z.number().int(),
            intensity: z.number().int().nullable(),
            inherited: z.boolean(),
          }),
        ),
        approvedReferences: z.array(referenceSummarySchema),
        missingMandatoryReferences: z.array(z.string()),
        animationGateSatisfied: z.boolean(),
        animations: z.array(animationSummarySchema),
        recommendedNextAction: z.object({
          code: z.string(),
          description: z.string(),
          appRoute: localRouteSchema,
        }),
      }),
      annotations: readAnnotations,
    },
    async ({ creatureId }) => {
      const creature = service.getCreature(creatureId);
      const manifest = await service.getDesignManifest(creatureId);
      const evolution = service.getEvolutionContext(creatureId);
      const references = service.getReferenceContext(creatureId);
      const animations = service.listAnimations(creatureId);
      return {
        creature: {
          ...projectCreature(creature),
          generation: creature.evolutionaryGeneration,
        },
        currentRound: creature.currentRound
          ? projectRound(creature.currentRound)
          : null,
        selectedCandidate: creature.selectedCandidate
          ? projectCandidate(creature.selectedCandidate)
          : null,
        lockedCandidate: creature.lockedCandidate
          ? projectCandidate(creature.lockedCandidate)
          : null,
        designManifest: manifest
          ? {
              version: manifest.version,
              immutableFeatures: manifest.immutableFeatures,
              preferredFeatures: manifest.preferredFeatures,
              forbiddenFeatures: manifest.forbiddenFeatures,
              canvas: {
                width: manifest.canvasWidth,
                height: manifest.canvasHeight,
              },
              facing: manifest.facing,
              anchor: { x: manifest.anchorX, y: manifest.anchorY },
              transparentBackgroundRequired:
                manifest.transparentBackgroundRequired,
            }
          : null,
        evolutionaryParent: evolution.parent
          ? {
              id: evolution.parent.id,
              name: evolution.parent.displayName,
              appRoute: `/creatures/${evolution.parent.id}`,
            }
          : null,
        mutations: evolution.mutations.map((mutation) => ({
          id: mutation.id,
          category: mutation.category,
          description: mutation.description,
          priority: mutation.sortOrder,
          intensity: mutation.intensity,
          inherited: mutation.inherited,
        })),
        approvedReferences: references.references
          .filter((reference) => reference.approved && reference.currentDesign)
          .map(projectReference),
        missingMandatoryReferences: references.missingMandatoryReferenceTypes,
        animationGateSatisfied: references.animationGateSatisfied,
        animations: animations.map(projectAnimation),
        recommendedNextAction: nextAction(
          creature,
          references.missingMandatoryReferenceTypes,
        ),
      };
    },
  );

  registerTool(
    server,
    "get_generation_prompt",
    {
      title: "Get generation prompt",
      description:
        "Return a persisted generation, canonical-reference, or animation prompt plus the local reference routes and workflow warnings needed for a manual ChatGPT handoff.",
      inputSchema: z.object({
        creatureId: z.uuid().describe("Stable creature project ID."),
        roundId: z
          .uuid()
          .optional()
          .describe(
            "Optional generation round ID; must belong to the creature.",
          ),
        taskType: z
          .enum(["GENERATION", "REFERENCE", "ANIMATION"])
          .default("GENERATION")
          .describe("Which persisted prompt family to retrieve."),
      }),
      dataSchema: z.object({
        taskType: z.string(),
        sourceEntityId: z.uuid(),
        prompt: z.string(),
        expectedImageCount: z.number().int().positive(),
        requiredReferenceRoutes: z.array(localRouteSchema),
        workflowWarnings: z.array(z.string()),
        appRoute: localRouteSchema,
      }),
      annotations: readAnnotations,
    },
    ({ creatureId, roundId, taskType }) => {
      const creature = service.getCreature(creatureId);
      const references = service.getReferenceContext(creatureId);
      const referenceRoutes = [
        ...(references.activeLock
          ? [`/api/creatures/${creatureId}/locked-design`]
          : []),
        ...references.references
          .filter(
            (reference) =>
              reference.approved &&
              reference.currentDesign &&
              reference.imageUrl !== null,
          )
          .map((reference) => reference.imageUrl!),
      ];
      if (taskType === "GENERATION") {
        const round = roundId
          ? service.getRound(roundId)
          : creature.currentRound;
        if (!round || round.creatureProjectId !== creatureId) {
          throw new AppError(
            "ROUND_NOT_FOUND",
            "The requested generation round does not belong to this creature.",
            404,
          );
        }
        return {
          taskType,
          sourceEntityId: round.id,
          prompt: round.generatedPrompt,
          expectedImageCount: 10,
          requiredReferenceRoutes: round.parentCandidate
            ? [round.parentCandidate.imageUrl]
            : [],
          workflowWarnings: references.missingMandatoryReferenceTypes.map(
            (type) => `Mandatory reference still missing: ${type}`,
          ),
          appRoute: `/rounds/${round.id}`,
        };
      }
      if (taskType === "REFERENCE") {
        const reference = references.references.find(
          (item) => item.currentDesign && item.generatedPrompt.length > 0,
        );
        if (!reference) {
          throw new AppError(
            "PROMPT_NOT_FOUND",
            "No current canonical-reference request exists for this creature.",
            404,
          );
        }
        return {
          taskType,
          sourceEntityId: reference.id,
          prompt: reference.generatedPrompt,
          expectedImageCount: 1,
          requiredReferenceRoutes: referenceRoutes.slice(0, 1),
          workflowWarnings: references.missingMandatoryReferenceTypes.map(
            (type) => `Mandatory reference still missing: ${type}`,
          ),
          appRoute: `/creatures/${creatureId}/references`,
        };
      }
      const animations = service.listAnimations(creatureId);
      const animation = animations.find(
        (item) => item.currentDesign && item.prompts.length > 0,
      );
      const prompt = animation?.prompts.at(-1);
      if (!animation || !prompt) {
        throw new AppError(
          "PROMPT_NOT_FOUND",
          "No current animation prompt exists for this creature.",
          404,
        );
      }
      return {
        taskType,
        sourceEntityId: prompt.id,
        prompt: prompt.generatedPrompt,
        expectedImageCount: animation.expectedFrameCount,
        requiredReferenceRoutes: referenceRoutes,
        workflowWarnings: references.animationGateSatisfied
          ? []
          : ["Mandatory canonical-reference approvals are incomplete."],
        appRoute: `/creatures/${creatureId}/animations/${animation.id}`,
      };
    },
  );

  registerTool(
    server,
    "get_current_round",
    {
      title: "Get current round",
      description:
        "Return the creature's current immutable generation round, prompt, selected parent, feedback snapshot, and numbered candidate metadata.",
      inputSchema: z.object({ creatureId: z.uuid() }),
      dataSchema: z.object({ round: roundSchema.nullable() }),
      annotations: readAnnotations,
    },
    ({ creatureId }) => {
      const creature = service.getCreature(creatureId);
      return {
        round: creature.currentRound
          ? projectRound(creature.currentRound)
          : null,
      };
    },
  );

  registerTool(
    server,
    "get_candidate_gallery",
    {
      title: "Get candidate gallery",
      description:
        "Return the numbered candidates for one round, including selection, lock, rejection, feedback, and user-openable image routes.",
      inputSchema: z.object({ roundId: z.uuid() }),
      dataSchema: z.object({
        roundId: z.uuid(),
        creatureId: z.uuid(),
        candidates: z.array(candidateSchema),
        appRoute: localRouteSchema,
      }),
      annotations: readAnnotations,
    },
    ({ roundId }) => {
      const round = service.getRound(roundId);
      return {
        roundId: round.id,
        creatureId: round.creatureProjectId,
        candidates: round.candidates.map(projectCandidate),
        appRoute: `/rounds/${round.id}`,
      };
    },
  );

  registerTool(
    server,
    "get_validation_report",
    {
      title: "Get validation report",
      description:
        "Read persisted export readiness, blockers, reference approvals, animation counts, repairs, and frame-warning evidence for a creature or one animation.",
      inputSchema: z.object({
        creatureId: z.uuid(),
        animationId: z.uuid().optional(),
      }),
      dataSchema: validationReportSchema,
      annotations: readAnnotations,
    },
    ({ creatureId, animationId }) =>
      projectValidation(service.getValidationReport(creatureId, animationId)),
  );

  registerTool(
    server,
    "create_creature",
    {
      title: "Create creature",
      description:
        "Create a new local creature project and initial manifest. Use create_descendant instead when a parent creature is intended.",
      inputSchema: createCreatureInputSchema
        .extend({
          parentCreatureId: z
            .uuid()
            .optional()
            .describe("Unsupported here; use create_descendant for lineage."),
        })
        .strict(),
      dataSchema: creatureSummarySchema,
      annotations: additiveWriteAnnotations,
    },
    async ({ parentCreatureId, ...input }) => {
      if (parentCreatureId) {
        throw new AppError(
          "PARENT_REQUIRES_DESCENDANT_TOOL",
          "Use create_descendant when creating a creature with an evolutionary parent.",
          409,
        );
      }
      return projectCreature(await service.createCreature(input));
    },
  );

  registerTool(
    server,
    "create_generation_round",
    {
      title: "Create generation round",
      description:
        "Create a gated immutable concept or refinement round. A refinement requires exactly one selected candidate; parentCandidateId can select it first, and feedback is saved before the round is frozen.",
      inputSchema: z.object({
        creatureId: z.uuid(),
        roundType: z.enum(["CONCEPT", "REFINEMENT"]),
        parentCandidateId: z.uuid().optional(),
        feedback: candidateFeedbackInputSchema.optional(),
      }),
      dataSchema: roundSchema,
      annotations: additiveWriteAnnotations,
    },
    async ({ creatureId, roundType, parentCandidateId, feedback }) => {
      if (roundType === "CONCEPT") {
        if (parentCandidateId || feedback) {
          throw new AppError(
            "INVALID_CONCEPT_INPUT",
            "A concept round cannot have a parent candidate or refinement feedback.",
            400,
          );
        }
        return projectRound(await service.createConceptRound(creatureId));
      }
      const creature = service.getCreature(creatureId);
      if (parentCandidateId) {
        if (!creature.currentRoundId) {
          throw new AppError(
            "REFINEMENT_PARENT_REQUIRED",
            "The creature has no current round in which to select a parent.",
            409,
          );
        }
        service.selectCandidate(creature.currentRoundId, parentCandidateId);
      }
      const selected = service.getCreature(creatureId).selectedCandidate;
      if (feedback) {
        if (!selected) {
          throw new AppError(
            "REFINEMENT_PARENT_REQUIRED",
            "Select exactly one parent candidate before saving refinement feedback.",
            409,
          );
        }
        service.saveCandidateFeedback(selected.id, feedback);
      }
      return projectRound(await service.createRefinementRound(creatureId));
    },
  );

  registerTool(
    server,
    "select_candidate",
    {
      title: "Select candidate",
      description:
        "Select exactly one candidate as the active parent for its current round. Core verifies round ownership and preserves selection history.",
      inputSchema: z.object({ roundId: z.uuid(), candidateId: z.uuid() }),
      dataSchema: candidateSchema,
      annotations: stateChangeAnnotations,
    },
    ({ roundId, candidateId }) =>
      projectCandidate(service.selectCandidate(roundId, candidateId)),
  );

  registerTool(
    server,
    "record_candidate_feedback",
    {
      title: "Record candidate feedback",
      description:
        "Persist structured refinement guidance for the selected candidate. Existing current feedback is updated and the action is recorded in history.",
      inputSchema: z.object({
        candidateId: z.uuid(),
        feedback: candidateFeedbackInputSchema,
      }),
      dataSchema: z.object({
        candidateId: z.uuid(),
        feedback: feedbackSchema,
        updatedAt: z.string(),
      }),
      annotations: stateChangeAnnotations,
    },
    ({ candidateId, feedback }) => {
      const saved = service.saveCandidateFeedback(candidateId, feedback);
      return {
        candidateId: saved.candidateId,
        feedback: projectFeedback(saved)!,
        updatedAt: saved.updatedAt,
      };
    },
  );

  const lockDataSchema = z.object({
    creatureId: z.uuid(),
    locked: z.boolean(),
    lockId: z.uuid().nullable(),
    candidateId: z.uuid().nullable(),
    manifestVersion: z.number().int().nullable(),
    lockedImageRoute: localRouteSchema.nullable(),
    appRoute: localRouteSchema,
  });

  registerTool(
    server,
    "lock_creature_design",
    {
      title: "Lock creature design",
      description:
        "Consequential: verify and establish one selected candidate as the canonical design authority. Requires confirmation=true after explicit user approval.",
      inputSchema: z.object({
        creatureId: z.uuid(),
        candidateId: z.uuid(),
        confirmation: z.boolean().default(false),
      }),
      dataSchema: lockDataSchema,
      annotations: stateChangeAnnotations,
    },
    async ({ creatureId, candidateId, confirmation }) => {
      const overview = await service.lockDesign(creatureId, {
        candidateId,
        confirmed: confirmation,
        actor: MCP_ACTOR,
      });
      return {
        creatureId,
        locked: overview.activeLock !== null,
        lockId: overview.activeLock?.id ?? null,
        candidateId: overview.activeLock?.candidateId ?? null,
        manifestVersion: overview.activeLock?.manifestVersion ?? null,
        lockedImageRoute: overview.activeLock
          ? `/api/creatures/${creatureId}/locked-design`
          : null,
        appRoute: `/creatures/${creatureId}`,
      };
    },
  );

  registerTool(
    server,
    "unlock_creature_design",
    {
      title: "Unlock creature design",
      description:
        "Consequential: reopen a locked creature for refinement while preserving all immutable lock assets and history. Requires confirmation=true after explicit user approval.",
      inputSchema: z.object({
        creatureId: z.uuid(),
        confirmation: z.boolean().default(false),
      }),
      dataSchema: lockDataSchema,
      annotations: stateChangeAnnotations,
    },
    ({ creatureId, confirmation }) => {
      const overview = service.unlockDesign(creatureId, {
        confirmed: confirmation,
        actor: MCP_ACTOR,
      });
      return {
        creatureId,
        locked: overview.activeLock !== null,
        lockId: overview.activeLock?.id ?? null,
        candidateId: overview.activeLock?.candidateId ?? null,
        manifestVersion: overview.activeLock?.manifestVersion ?? null,
        lockedImageRoute: overview.activeLock
          ? `/api/creatures/${creatureId}/locked-design`
          : null,
        appRoute: `/creatures/${creatureId}`,
      };
    },
  );

  registerTool(
    server,
    "create_descendant",
    {
      title: "Create descendant",
      description:
        "Create an immutable first evolution round from an approved, locked parent and ordered mutations. The parent design bytes and history remain unchanged.",
      inputSchema: z.object({
        parentCreatureId: z.uuid(),
        displayName: z.string().trim().min(1).max(120),
        scientificName: z.string().trim().max(160).optional(),
        description: z.string().trim().max(4_000).default(""),
        generationBrief: z.string().trim().min(1).max(12_000),
        mutations: z
          .array(
            z.object({
              category: z.enum(evolutionMutationCategories),
              description: z.string().trim().min(1).max(2_000),
              intensity: z.number().int().min(1).max(5).optional(),
              inherited: z.boolean().default(false),
            }),
          )
          .min(1)
          .max(30),
      }),
      dataSchema: creatureSummarySchema,
      annotations: additiveWriteAnnotations,
    },
    async ({ parentCreatureId, ...input }) =>
      projectCreature(
        await service.createDescendant(parentCreatureId, {
          ...input,
          actor: MCP_ACTOR,
        }),
      ),
  );

  registerTool(
    server,
    "create_animation",
    {
      title: "Create animation",
      description:
        "Create a reference-gated animation sequence tied to the exact current design lock and manifest. Core rejects incomplete mandatory references.",
      inputSchema: z.object({
        creatureId: z.uuid(),
        name: z.string().trim().min(1).max(160).optional(),
        animationType: z.enum(animationTypes),
        fps: z.number().int().min(1).max(60).default(12),
        looping: z.boolean().default(true),
        canvasWidth: z.number().int().min(1).max(8192),
        canvasHeight: z.number().int().min(1).max(8192),
        expectedFrameCount: z.number().int().min(1).max(120).default(8),
      }),
      dataSchema: animationSummarySchema,
      annotations: additiveWriteAnnotations,
    },
    async ({ creatureId, name, ...input }) =>
      projectAnimation(
        await service.createAnimation(creatureId, {
          ...input,
          name:
            name ??
            `${input.expectedFrameCount}-frame ${input.animationType.toLowerCase()}`,
          actor: MCP_ACTOR,
        }),
      ),
  );

  registerTool(
    server,
    "approve_reference",
    {
      title: "Approve canonical reference",
      description:
        "Consequential: explicitly approve one imported, byte-verified canonical reference for its exact active design lock. Requires confirmation=true.",
      inputSchema: z.object({
        referenceId: z.uuid(),
        confirmation: z.boolean().default(false),
        notes: z.string().trim().max(8_000).optional(),
      }),
      dataSchema: referenceSummarySchema,
      annotations: stateChangeAnnotations,
    },
    async ({ referenceId, confirmation, notes }) =>
      projectReference(
        await service.approveReference(referenceId, {
          confirmed: confirmation,
          notes,
          actor: MCP_ACTOR,
        }),
      ),
  );

  registerTool(
    server,
    "approve_animation",
    {
      title: "Approve animation",
      description:
        "Consequential: approve a reviewed animation only when the exact current design/reference gates, frame count, and repair rules pass. Requires confirmation=true.",
      inputSchema: z.object({
        animationId: z.uuid(),
        confirmation: z.boolean().default(false),
      }),
      dataSchema: animationSummarySchema,
      annotations: stateChangeAnnotations,
    },
    ({ animationId, confirmation }) =>
      projectAnimation(
        service.approveAnimation(animationId, {
          confirmed: confirmation,
          actor: MCP_ACTOR,
        }),
      ),
  );

  registerTool(
    server,
    "export_creature",
    {
      title: "Export creature",
      description:
        "Consequential: create the next immutable, non-overwriting game-package version after all readiness gates pass. Requires confirmation=true.",
      inputSchema: z.object({
        creatureId: z.uuid(),
        exportFormat: z.enum(exportFormats).default("GENERIC"),
        includePromptHistory: z.boolean().default(true),
        confirmation: z.boolean().default(false),
      }),
      dataSchema: z.object({
        exportId: z.uuid(),
        version: z.number().int().positive(),
        format: z.string(),
        creatureId: z.uuid(),
        packagePath: z.string(),
        animationCount: z.number().int(),
        referenceCount: z.number().int(),
        frameCount: z.number().int(),
        warningCount: z.number().int(),
        includePromptHistory: z.boolean(),
        files: z.array(z.string()),
        appRoute: localRouteSchema,
      }),
      annotations: stateChangeAnnotations,
    },
    async ({
      creatureId,
      exportFormat,
      includePromptHistory,
      confirmation,
    }) => {
      const run = await service.exportCreature(creatureId, {
        exportFormat,
        includePromptHistory,
        confirmed: confirmation,
        actor: MCP_ACTOR,
      });
      return {
        exportId: run.id,
        version: run.version,
        format: run.exportFormat,
        creatureId,
        packagePath: run.packagePath,
        animationCount: run.summary.animationCount,
        referenceCount: run.summary.referenceCount,
        frameCount: run.summary.frameCount,
        warningCount: run.summary.warningCount,
        includePromptHistory: run.includePromptHistory,
        files: run.summary.files,
        appRoute: `/creatures/${creatureId}/export`,
      };
    },
  );

  return server;
}
