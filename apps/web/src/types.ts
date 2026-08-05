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
