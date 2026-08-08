export const creatureStatuses = [
  "DRAFT",
  "CONCEPT",
  "CANDIDATE_SELECTED",
  "REFINING",
  "DESIGN_LOCKED",
  "REFERENCE_BUILDING",
  "REFERENCE_APPROVED",
  "ANIMATING",
  "ANIMATION_REVIEW",
  "GAME_READY",
  "ARCHIVED",
] as const;

export type CreatureStatus = (typeof creatureStatuses)[number];

export const roundTypes = [
  "CONCEPT",
  "REFINEMENT",
  "EVOLUTION",
  "REFERENCE",
  "ANIMATION_KEY_POSES",
  "ANIMATION_INTERMEDIATES",
  "REPAIR",
] as const;

export type RoundType = (typeof roundTypes)[number];

export const candidateSources = [
  "CHATGPT",
  "MANUAL",
  "MCP_IMPORT",
  "CONTACT_SHEET",
  "CLIPBOARD",
  "UNKNOWN",
] as const;

export type CandidateSource = (typeof candidateSources)[number];

export const evolutionMutationCategories = [
  "ANATOMY",
  "ARMOUR",
  "LOCOMOTION",
  "FEEDING",
  "SENSORY",
  "SIZE",
  "COLOUR",
  "HABITAT",
  "BEHAVIOUR",
  "OTHER",
] as const;

export type EvolutionMutationCategory =
  (typeof evolutionMutationCategories)[number];

export const referenceTypes = [
  "LOCKED_DESIGN",
  "SIDE_PROFILE",
  "OPPOSITE_SIDE",
  "FRONT",
  "THREE_QUARTER",
  "TOP",
  "SILHOUETTE",
  "COLOUR_MATERIAL",
  "ANATOMY_DIAGRAM",
] as const;

export type ReferenceType = (typeof referenceTypes)[number];

export const requestableReferenceTypes = [
  "SIDE_PROFILE",
  "OPPOSITE_SIDE",
  "FRONT",
  "THREE_QUARTER",
  "TOP",
  "SILHOUETTE",
  "COLOUR_MATERIAL",
  "ANATOMY_DIAGRAM",
] as const satisfies readonly Exclude<ReferenceType, "LOCKED_DESIGN">[];

export const animationTypes = [
  "IDLE",
  "SWIM",
  "WALK",
  "RUN",
  "ATTACK",
  "HURT",
  "DEATH",
  "EAT",
  "LEVEL_UP",
  "CUSTOM",
] as const;

export type AnimationType = (typeof animationTypes)[number];

export const animationStatuses = [
  "DRAFT",
  "KEY_POSES",
  "INTERMEDIATES",
  "REVIEW",
  "APPROVED",
  "EXPORTED",
] as const;

export type AnimationStatus = (typeof animationStatuses)[number];

export const frameRoles = [
  "KEY_POSE",
  "INTERMEDIATE",
  "REPAIR",
  "HOLD",
] as const;

export type FrameRole = (typeof frameRoles)[number];

export const animationPromptTypes = [
  "KEY_POSES",
  "INTERMEDIATES",
  "REPAIR",
] as const;

export type AnimationPromptType = (typeof animationPromptTypes)[number];

export const exportFormats = ["GENERIC"] as const;
export type ExportFormat = (typeof exportFormats)[number];
