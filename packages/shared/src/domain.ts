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
