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
  thumbnailUrl: string;
  imageUrl: string;
  createdAt: string;
}

export interface Round {
  id: string;
  creatureProjectId: string;
  roundNumber: number;
  roundType: string;
  generatedPrompt: string;
  createdAt: string;
  candidates: Candidate[];
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
  createdAt: string;
  updatedAt: string;
  selectedCandidate: Candidate | null;
  roundCount: number;
  rounds?: Array<{
    id: string;
    roundNumber: number;
    roundType: string;
    createdAt: string;
    candidateCount: number;
  }>;
  currentRound?: Round | null;
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
