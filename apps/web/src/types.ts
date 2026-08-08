export interface CandidateFeedback {
  candidateId: string;
  preserveTraits: string[];
  anatomyToPreserve: string[];
  paletteToPreserve: string[];
  silhouetteToPreserve: string[];
  defects: string[];
  requestedChanges: string[];
  forbiddenChanges: string[];
  generalNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Candidate {
  id: string;
  generationRoundId: string;
  candidateNumber: number;
  originalFilename: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  fileHash: string;
  mimeType: string;
  source: string;
  rejected: boolean;
  selected: boolean;
  locked: boolean;
  thumbnailUrl: string;
  imageUrl: string;
  createdAt: string;
  crop: {
    contactSheetImportId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  feedback: CandidateFeedback | null;
}

export interface Round {
  id: string;
  creatureProjectId: string;
  roundNumber: number;
  roundType: string;
  generatedPrompt: string;
  createdAt: string;
  parentCandidate: Candidate | null;
  feedbackSnapshot: Omit<
    CandidateFeedback,
    "candidateId" | "createdAt" | "updatedAt"
  > | null;
  candidates: Candidate[];
}

export interface PromptHistoryEntry {
  roundId: string;
  roundNumber: number;
  roundType: string;
  createdAt: string;
  parentCandidate: Candidate | null;
  generatedPrompt: string;
  feedbackSnapshot: Round["feedbackSnapshot"];
}

export interface ContactSheetPreview {
  id: string;
  generationRoundId: string;
  originalFilename: string;
  width: number;
  height: number;
  imageUrl: string;
  layout: {
    rows: number;
    columns: number;
    marginTop: number;
    marginRight: number;
    marginBottom: number;
    marginLeft: number;
    horizontalGap: number;
    verticalGap: number;
  };
  rectangles: Array<{
    index: number;
    row: number;
    column: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  status: string;
  createdAt: string;
}

export interface Creature {
  id: string;
  slug: string;
  displayName: string;
  scientificName: string | null;
  description: string;
  generationBrief: string;
  status: string;
  parentCreatureId: string | null;
  evolutionaryGeneration: number;
  currentRoundId: string | null;
  lockedCandidateId: string | null;
  createdAt: string;
  updatedAt: string;
  selectedCandidate: Candidate | null;
  lockedCandidate: Candidate | null;
  roundCount: number;
  rounds?: Array<{
    id: string;
    roundNumber: number;
    roundType: string;
    createdAt: string;
    candidateCount: number;
  }>;
  currentRound?: Round | null;
  manifest?: DesignManifest | null;
  activeLock?: DesignLock | null;
  lockHistory?: DesignLock[];
}

export type DesignManifestField =
  | "immutableFeatures"
  | "preferredFeatures"
  | "forbiddenFeatures"
  | "anatomyNotes"
  | "biologicalNotes"
  | "styleNotes"
  | "paletteNotes"
  | "textureNotes"
  | "cameraNotes"
  | "lightingNotes"
  | "animationNotes"
  | "canvasWidth"
  | "canvasHeight"
  | "facing"
  | "anchorX"
  | "anchorY"
  | "transparentBackgroundRequired";

export interface DesignManifest {
  id: string;
  creatureProjectId: string;
  version: number;
  immutableFeatures: string[];
  preferredFeatures: string[];
  forbiddenFeatures: string[];
  anatomyNotes: string;
  biologicalNotes: string;
  styleNotes: string;
  paletteNotes: string;
  textureNotes: string;
  cameraNotes: string;
  lightingNotes: string;
  animationNotes: string;
  canvasWidth: number;
  canvasHeight: number;
  facing: "left" | "right" | "front" | "back";
  anchorX: number;
  anchorY: number;
  transparentBackgroundRequired: boolean;
  explicitFields: DesignManifestField[];
  createdAt: string;
  updatedAt: string;
  lockedSnapshotVersion: number | null;
  lockedMismatchWarningRequired: boolean;
}

export interface DesignLock {
  id: string;
  creatureProjectId: string;
  lockNumber: number;
  candidateId: string;
  candidateNumber: number;
  candidateImageUrl: string;
  generationRoundId: string;
  roundNumber: number;
  manifestVersion: number;
  status: string;
  activeReferencePath: string;
  archivedReferencePath: string | null;
  lockedAt: string;
  unlockedAt: string | null;
  actor: string | null;
}

export interface DesignHistoryEvent {
  id: string;
  timestamp: string;
  action: string;
  creature: { id: string; displayName: string };
  candidate: { id: string; candidateNumber: number } | null;
  round: { id: string; roundNumber: number } | null;
  manifestVersion: number | null;
  actor: string | null;
  details: Record<string, unknown>;
}

export interface DashboardData {
  totals: { creatures: number; inConcept: number; selected: number };
  recentCreatures: Creature[];
  recentActivity: Array<{
    id: string;
    action: string;
    createdAt: string;
    entityId: string;
  }>;
}

export interface EvolutionMutation {
  id: string;
  childCreatureId: string;
  parentCreatureId: string;
  category: string;
  description: string;
  sortOrder: number;
  intensity: number | null;
  inherited: boolean;
  createdAt: string;
}

export interface EvolutionNode {
  id: string;
  slug: string;
  displayName: string;
  scientificName: string | null;
  parentCreatureId: string | null;
  parentDisplayName: string | null;
  evolutionaryGeneration: number;
  status: string;
  locked: boolean;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  candidateNumber: number | null;
  childCount: number;
  updatedAt: string;
}

export interface EvolutionTree {
  roots: string[];
  nodes: EvolutionNode[];
}

export interface EvolutionContext {
  creature: EvolutionNode;
  parent: EvolutionNode | null;
  children: EvolutionNode[];
  mutations: EvolutionMutation[];
  inheritedTraits: string[];
  preferredTraits: string[];
  forbiddenTraits: string[];
  canCreateDescendant: boolean;
  comparison: { parent: EvolutionNode; child: EvolutionNode } | null;
}

export type ReferenceType =
  | "LOCKED_DESIGN"
  | "SIDE_PROFILE"
  | "OPPOSITE_SIDE"
  | "FRONT"
  | "THREE_QUARTER"
  | "TOP"
  | "SILHOUETTE"
  | "COLOUR_MATERIAL"
  | "ANATOMY_DIAGRAM";

export interface ReferenceValidation {
  valid: boolean;
  warnings: string[];
  checks: {
    decodedPng: boolean;
    withinUploadLimits: boolean;
    transparentBackground: boolean;
    canvasMatchesManifest: boolean;
    currentDesignLock: boolean;
  };
}

export interface CanonicalReference {
  id: string;
  creatureProjectId: string;
  designLockId: string;
  referenceType: ReferenceType;
  referenceLabel: string;
  status: string;
  generatedPrompt: string;
  originalFilename: string | null;
  notes: string;
  validation: ReferenceValidation;
  width: number | null;
  height: number | null;
  hasAlpha: boolean | null;
  fileHash: string | null;
  approved: boolean;
  currentDesign: boolean;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  actor: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export interface ReferenceContext {
  creature: {
    id: string;
    displayName: string;
    scientificName: string | null;
    status: string;
  };
  activeLock: {
    id: string;
    candidateId: string;
    manifestVersion: number;
    imageUrl: string;
  } | null;
  requiredReferenceTypes: ReferenceType[];
  satisfiedReferenceTypes: ReferenceType[];
  missingMandatoryReferenceTypes: ReferenceType[];
  availableReferenceTypes: Array<{
    type: Exclude<ReferenceType, "LOCKED_DESIGN">;
    label: string;
    mandatory: boolean;
    approved: boolean;
    latestStatus: string | null;
  }>;
  references: CanonicalReference[];
  canRequest: boolean;
  animationGateSatisfied: boolean;
}

export interface ReferenceSettings {
  requiredReferenceTypes: ReferenceType[];
  availableReferenceTypes: Array<{
    type: ReferenceType;
    label: string;
  }>;
  updatedAt: string;
}

export type FrameRole = "KEY_POSE" | "INTERMEDIATE" | "REPAIR" | "HOLD";

export interface AnimationFrame {
  id: string;
  animationId: string;
  frameNumber: number;
  frameRole: FrameRole;
  originalFilename: string;
  source: string;
  durationMs: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  fileHash: string;
  perceptualHash: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  opaquePixelCount: number;
  touchesCanvasEdge: boolean;
  validationStatus: string;
  validationMessages: string[];
  markedForRepair: boolean;
  notes: string;
  replacesFrameId: string | null;
  imageUrl: string;
  thumbnailUrl: string;
  createdAt: string;
}

export interface AnimationPrompt {
  id: string;
  promptType: string;
  relatedFrameId: string | null;
  generatedPrompt: string;
  createdAt: string;
}

export interface Animation {
  id: string;
  creatureProjectId: string;
  designLockId: string;
  name: string;
  animationType: string;
  status: string;
  fps: number;
  looping: boolean;
  canvasWidth: number;
  canvasHeight: number;
  expectedFrameCount: number;
  currentDesign: boolean;
  lockedDesignUrl: string;
  anchor: { x: number; y: number };
  frames: AnimationFrame[];
  prompts: AnimationPrompt[];
  createdAt: string;
  updatedAt: string;
}

export interface ValidationAnimation {
  id: string;
  name: string;
  animationType: string;
  status: string;
  currentDesign: boolean;
  expectedFrameCount: number;
  activeFrameCount: number;
  warningFrameCount: number;
  pendingRepairCount: number;
  messages: Array<{
    frameId: string;
    frameNumber: number;
    messages: string[];
  }>;
}

export interface ValidationReport {
  creatureId: string;
  creatureName: string;
  generatedAt: string;
  currentDesignLockId: string | null;
  missingMandatoryReferences: string[];
  referencesApproved: number;
  animations: ValidationAnimation[];
  approvedAnimationCount: number;
  warningCount: number;
  blockingIssues: string[];
  readyForExport: boolean;
}

export interface ExportSummary {
  exportId: string;
  version: number;
  format: string;
  creatureId: string;
  creatureName: string;
  createdAt: string;
  packagePath: string;
  animationCount: number;
  referenceCount: number;
  frameCount: number;
  warningCount: number;
  includePromptHistory: boolean;
  files: string[];
}

export interface ExportRun {
  id: string;
  creatureProjectId: string;
  designLockId: string;
  version: number;
  exportFormat: string;
  status: string;
  packagePath: string;
  includePromptHistory: boolean;
  actor: string | null;
  createdAt: string;
  summary: ExportSummary;
}
