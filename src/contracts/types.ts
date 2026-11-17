export type CourseId = 'relaxed' | 'standard' | 'challenge';
export type TopicId = 'daily' | 'food' | 'living' | 'town' | 'nature' | 'people';
export type DifficultyBand = 'easy' | 'medium' | 'hard';
export type WordTag = 'n' | 'sokuon' | 'yoon' | 'long_mark' | 'foreign';

export interface Word {
  id: string;
  display: string;
  reading: string;
  courseId: CourseId;
  topicId: TopicId;
  dictionarySetId: string;
  difficultyBand: DifficultyBand;
  tags: WordTag[];
  canonicalLength: number;
  complexityScore: number;
  reviewed: boolean;
  editorialNote: string;
}

export type DistrictId =
  | 'residential'
  | 'market'
  | 'workshop'
  | 'park'
  | 'station'
  | 'harbor';

export type SessionMode = 'MAIN' | 'PRACTICE' | 'TUTORIAL';

export type SessionState =
  | 'HOME'
  | 'INPUT_CHECK'
  | 'TUTORIAL'
  | 'READY'
  | 'PLAYING'
  | 'PAUSED'
  | 'RESULT'
  | 'PRACTICE';

export type DeliveryReason = 'manual' | 'full' | 'deadline' | 'skip';

export interface ConfirmedFactBase {
  sessionId: string;
  factSequence: number;
  mode: SessionMode;
  ruleVersion: string;
  timestamp: number;
}

export interface WordCompletedFact extends ConfirmedFactBase {
  type: 'WordCompleted';
  wordId: string;
  topicId: TopicId;
  tags: WordTag[];
  canonicalLength: number;
  mistakes: number;
  wordPosition: number;
}

export interface DeliveryCommittedFact extends ConfirmedFactBase {
  type: 'DeliveryCommitted';
  reason: DeliveryReason;
  cargoCount: number;
  bonus: number;
  precedingWordPosition: number;
}

export interface PracticeSessionEndedFact extends ConfirmedFactBase {
  type: 'PracticeSessionEnded';
  maxCleanStreak: number;
  endReason: string;
}

export interface RoundFinishedFact extends ConfirmedFactBase {
  type: 'RoundFinished';
  courseId: CourseId;
  districtId: DistrictId;
  completed: boolean;
  completedWordCount: number;
  correctKeyCount: number;
  mistakeCount: number;
  totalCanonicalLength: number;
  score: number;
  baseScore: number;
  deliveryBonus: number;
  longestCleanStreak: number;
  rescueUsed: boolean;
  skips: number;
  guideUsed: boolean;
  elapsedMs: number;
}

export type ConfirmedFact =
  | WordCompletedFact
  | DeliveryCommittedFact
  | PracticeSessionEndedFact
  | RoundFinishedFact;

export interface EconomySnapshot {
  packagingLevel: number;
  materialsResearchRank: number;
  districtId: DistrictId;
}

export type LandscapeId = 'riverside' | 'seaside' | 'highland';
export type SynergyId = 'joint_delivery' | 'sorting_network' | 'tourism_service';
export type ResearchId = 'materials' | 'logistics' | 'commerce';
