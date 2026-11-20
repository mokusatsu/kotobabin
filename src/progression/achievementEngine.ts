import { ACHIEVEMENT_CATALOG, WORDS_DATA } from '@/contracts/data';
import type {
  ConfirmedFact,
  CourseId,
  DeliveryCommittedFact,
  DistrictId,
  PracticeSessionEndedFact,
  ResearchId,
  RoundFinishedFact,
  SessionMode,
  SynergyId,
  TopicId,
  WordCompletedFact,
  WordTag,
} from '@/contracts/types';
import {
  ALL_960_WORD_IDS,
  COURSE_WORD_COUNTS,
  LEGACY_240_WORD_IDS,
} from './dictionaryTracker';
import { SERIES_STAMPS, type SeriesStamp } from './stampSeries';
import { STAMP_COUNT_FRAMES } from './stampFrameCatalog';
import { SeriesProgress, type RecordUpdates, type SeriesProgressState, type WordMastery } from './seriesProgress';

export type AchievementScope = 'all' | 'practice' | 'round' | 'normal' | 'city';
export type AchievementFamilyId =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L';

export interface CatalogAchievementDefinition {
  id: string;
  name: string;
  flavor_text: string;
  condition: string;
  scope: '全' | '練' | '便' | '通常' | '街';
  hidden: boolean;
  hidden_hint: string | null;
  family_id: AchievementFamilyId;
  stamp_asset_id: string;
  title_id: string;
}

export interface CatalogRewardDefinition {
  id: string;
  trigger: string;
  name: string;
  kind: string;
  asset_refs: string[];
}

export const LEGACY_ACHIEVEMENTS: readonly CatalogAchievementDefinition[] =
  ACHIEVEMENT_CATALOG.achievements as unknown as CatalogAchievementDefinition[];

export const CATALOG_ACHIEVEMENTS: readonly (CatalogAchievementDefinition | SeriesStamp)[] = [
  ...LEGACY_ACHIEVEMENTS, ...SERIES_STAMPS,
];
const achievementById = new Map(CATALOG_ACHIEVEMENTS.map((stamp) => [stamp.id, stamp]));

export const CATALOG_REWARDS: readonly CatalogRewardDefinition[] = [
  ...ACHIEVEMENT_CATALOG.rewards as unknown as CatalogRewardDefinition[],
  ...STAMP_COUNT_FRAMES.map((frame) => ({
    id: frame.rewardId,
    name: frame.name,
    kind: 'frame',
    trigger: `切手を${frame.stampCount}枚集める`,
    asset_refs: [frame.rewardId],
  })),
];
const rewardById = new Map(CATALOG_REWARDS.map((reward) => [reward.id, reward]));

export const FIRST_COLLECTION_FAMILIES: readonly AchievementFamilyId[] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
];

const SCOPE_MAP: Record<CatalogAchievementDefinition['scope'], AchievementScope> = {
  全: 'all',
  練: 'practice',
  便: 'round',
  通常: 'normal',
  街: 'city',
};

const WORD_COURSE_BY_ID: ReadonlyMap<string, CourseId> = new Map(
  WORDS_DATA.words.map((w) => [w.id, w.courseId]),
);

const WORD_TOPIC_BY_ID: ReadonlyMap<string, TopicId> = new Map(
  WORDS_DATA.words.map((w) => [w.id, w.topicId]),
);

export const MILESTONE_THRESHOLDS = [8, 16, 24, 36, 48, 60, 72] as const;

export const MILESTONE_PRIMARY_REWARD_KEYS: Record<number, string> = {
  8: 'milestone:8:frame',
  16: 'milestone:16:frame',
  24: 'milestone:24:album',
  36: 'milestone:36:frame',
  48: 'milestone:48:board',
  60: 'milestone:60:album',
  72: 'milestone:72:board',
};

const TOTAL_MILESTONE_CATALOG_REWARDS: Record<number, string[]> = {
  8: ['reward_total_08_frame', 'reward_total_08_ornament'],
  16: ['reward_total_16_frame', 'reward_total_16_ornament'],
  24: ['reward_total_24_album', 'reward_total_24_postcard', 'reward_total_24_thanks'],
  36: ['reward_total_36_background', 'reward_total_36_frame'],
  48: ['reward_total_48_board'],
  60: ['reward_total_60_frame', 'reward_total_60_album'],
  72: ['reward_complete_72_board', 'reward_complete_72_stamp'],
};

export interface UnlockRecord {
  achievementId: string;
  unlockedAt: number;
  conditionRevision: string;
  scope: AchievementScope;
  evidenceSummary: string;
}

export interface RewardRecord {
  rewardId: string;
  unlockedAt: number;
  kind: string;
}

export interface AchievementProgressState {
  series?: SeriesProgressState;
  lifetimeCompletedWords: number;
  manualDeliveryCount: number;
  groupedDeliveryCount: number;
  fullDeliveryCount: number;
  lifetimeDeliveredCargo: number;
  completedRounds: number;
  roundsWith5WordsCompleted: number;
  completedRoundsByOrder: Record<string, number>;
  distinctCompletedWordIds: string[];
  practiceCompletedWords: number;
  practiceCleanCountsByWord: Record<string, number>;
  practiceCleanTags: WordTag[];
  practiceMaxCleanStreak: number;
  normalMaxCleanStreak: number;
  normalCompletedCoursesWith5Words: CourseId[];
  normalMasteredCourses20Words95Acc: CourseId[];
}

export interface CityAchievementSnapshot {
  districts: Record<DistrictId, { stage: number; shops: number; crews?: number }>;
  seriesEligible?: boolean;
  openedRoutesCount: number;
  railRoutesCount: number;
  currentCityArrivedMaterials: number;
  lifetimeArrivedMaterials: number;
  paidEquipmentPurchaseCount: number;
  packagingLevel: number;
  purchasedSynergies: SynergyId[];
  cityRestartCount: number;
  researchRanks: Record<ResearchId, number>;
}

export interface SessionStartContext {
  orderKey?: string;
  comparisonBestScore?: number | null;
  comparisonBestSpeed?: number | null;
  practiceQualifiedWordIds?: string[];
}

export interface ActiveSessionTracker {
  sessionId: string;
  mode: SessionMode;
  orderKey?: string;
  comparisonBestScore: number | null;
  comparisonBestSpeed: number | null;
  practiceQualifiedWordIds: Set<string>;
  completedWordIds: string[];
  completedWordsCount: number;
  currentCleanStreak: number;
  maxCleanStreakInSession: number;
  manualDeliveriesInRound: number;
  smallManualDeliveriesInRound: number;
  largeManualDeliveriesInRound: number;
  fullDeliveriesInRound: number;
  manualTwoCountInRound: number;
  manualFourCountInRound: number;
  manualTwoSeenInRound: boolean;
  fullAfterManualTwoInRound: boolean;
  pendingManualFourWordPosition: number | null;
  immediateNextWordCleanAfterManualFour: boolean;
  qualifiedWordCleanInRound: boolean;
  skipsObserved: number;
  guideUsed: boolean;
  correctKeysSoFar: number;
  mistakesSoFar: number;
  canonicalLengthSoFar: number;
}

export type ProvisionalAchievementStatus =
  | 'confirmed'
  | 'provisional_held'
  | 'provisional_in_range'
  | 'disqualified_this_round'
  | 'locked';

export interface EvaluationResult {
  applied: boolean;
  newlyUnlockedAchievementIds: string[];
  newlyUnlockedRewardIds: string[];
  newMilestoneRewardKeys: string[];
  totalUnlockedCount: number;
  recordUpdates?: RecordUpdates;
}

export interface AchievementEngineSnapshot {
  progress: AchievementProgressState;
  unlocks: Record<string, UnlockRecord>;
  rewards: Record<string, RewardRecord>;
  factCursors: Record<string, number>;
  catalogVersion: string;
}

/**
 * Integer cross-multiplication check for accuracy: 100 * c >= p * (c + m).
 */
export function meetsAccuracyThreshold(
  correctKeyCount: number,
  mistakeCount: number,
  thresholdPercent: number,
): boolean {
  const total = correctKeyCount + mistakeCount;
  if (total <= 0) {
    return false;
  }
  return 100 * correctKeyCount >= thresholdPercent * total;
}

/**
 * Integer cross-multiplication check for 90s canonical KPM: L * 60000 >= kpm * 90000.
 */
export function meetsSpeedThreshold(
  totalCanonicalLength: number,
  kpmThreshold: number,
): boolean {
  return totalCanonicalLength * 60000 >= kpmThreshold * 90000;
}

/**
 * Integer cross-multiplication check for speed improvement over a comparison best KPM.
 */
export function meetsSpeedImprovement(
  totalCanonicalLength: number,
  comparisonBestSpeed: number,
  deltaKpm = 10,
): boolean {
  return totalCanonicalLength * 60000 - comparisonBestSpeed * 90000 >= deltaKpm * 90000;
}

export function createInitialAchievementProgress(): AchievementProgressState {
  return {
    lifetimeCompletedWords: 0,
    manualDeliveryCount: 0,
    groupedDeliveryCount: 0,
    fullDeliveryCount: 0,
    lifetimeDeliveredCargo: 0,
    completedRounds: 0,
    roundsWith5WordsCompleted: 0,
    completedRoundsByOrder: {},
    distinctCompletedWordIds: [],
    practiceCompletedWords: 0,
    practiceCleanCountsByWord: {},
    practiceCleanTags: [],
    practiceMaxCleanStreak: 0,
    normalMaxCleanStreak: 0,
    normalCompletedCoursesWith5Words: [],
    normalMasteredCourses20Words95Acc: [],
  };
}

function createEmptySessionTracker(
  sessionId: string,
  mode: SessionMode,
  practiceQualifiedWordIds: Set<string>,
  context?: SessionStartContext,
): ActiveSessionTracker {
  return {
    sessionId,
    mode,
    orderKey: context?.orderKey,
    comparisonBestScore: context?.comparisonBestScore ?? null,
    comparisonBestSpeed: context?.comparisonBestSpeed ?? null,
    practiceQualifiedWordIds,
    completedWordIds: [],
    completedWordsCount: 0,
    currentCleanStreak: 0,
    maxCleanStreakInSession: 0,
    manualDeliveriesInRound: 0,
    smallManualDeliveriesInRound: 0,
    largeManualDeliveriesInRound: 0,
    fullDeliveriesInRound: 0,
    manualTwoCountInRound: 0,
    manualFourCountInRound: 0,
    manualTwoSeenInRound: false,
    fullAfterManualTwoInRound: false,
    pendingManualFourWordPosition: null,
    immediateNextWordCleanAfterManualFour: false,
    qualifiedWordCleanInRound: false,
    skipsObserved: 0,
    guideUsed: false,
    correctKeysSoFar: 0,
    mistakesSoFar: 0,
    canonicalLengthSoFar: 0,
  };
}

export class AchievementEngine {
  private readonly progress: AchievementProgressState;
  private readonly series: SeriesProgress;
  private readonly distinctWordSet: Set<string>;
  private readonly practiceCleanTagSet: Set<WordTag>;
  private readonly normal5WordCoursesSet: Set<CourseId>;
  private readonly normalMasteredCoursesSet: Set<CourseId>;
  private readonly unlocks: Map<string, UnlockRecord>;
  private readonly rewards: Map<string, RewardRecord>;
  private readonly factCursors: Map<string, number>;
  private readonly activeSessions: Map<string, ActiveSessionTracker>;
  private readonly catalogVersion: string;

  constructor(snapshot?: Partial<AchievementEngineSnapshot>) {
    const base = createInitialAchievementProgress();
    const incoming = snapshot?.progress;
    this.progress = incoming
      ? {
          ...base,
          ...incoming,
          completedRoundsByOrder: { ...incoming.completedRoundsByOrder },
          distinctCompletedWordIds: [...incoming.distinctCompletedWordIds],
          practiceCleanCountsByWord: { ...incoming.practiceCleanCountsByWord },
          practiceCleanTags: [...incoming.practiceCleanTags],
          normalCompletedCoursesWith5Words: [...incoming.normalCompletedCoursesWith5Words],
          normalMasteredCourses20Words95Acc: [...incoming.normalMasteredCourses20Words95Acc],
        }
      : base;

    this.distinctWordSet = new Set(this.progress.distinctCompletedWordIds);
    this.series = new SeriesProgress(incoming?.series);
    this.practiceCleanTagSet = new Set(this.progress.practiceCleanTags);
    this.normal5WordCoursesSet = new Set(this.progress.normalCompletedCoursesWith5Words);
    this.normalMasteredCoursesSet = new Set(this.progress.normalMasteredCourses20Words95Acc);

    this.unlocks = new Map(Object.entries(snapshot?.unlocks ?? {}));
    this.rewards = new Map(Object.entries(snapshot?.rewards ?? {}));
    this.factCursors = new Map(Object.entries(snapshot?.factCursors ?? {}));
    this.activeSessions = new Map();
    this.catalogVersion = snapshot?.catalogVersion ?? ACHIEVEMENT_CATALOG.catalog_version;
  }

  static getScope(achievementId: string): AchievementScope {
    const def = achievementById.get(achievementId);
    if (!def) {
      throw new Error(`Unknown achievement ID: ${achievementId}`);
    }
    return SCOPE_MAP[def.scope];
  }

  getUnlockedIds(): string[] {
    return Array.from(this.unlocks.keys());
  }

  getUnlockedCount(): number {
    return this.unlocks.size;
  }

  getLegacyUnlockedCount(): number {
    return LEGACY_ACHIEVEMENTS.filter((stamp) => this.unlocks.has(stamp.id)).length;
  }

  getSeriesMetric(id: string): number {
    return this.series.metric(id);
  }

  getWordMastery(id: string): Readonly<WordMastery> | undefined {
    return this.series.wordMastery(id);
  }

  getUnlockedRewardIds(): string[] {
    // Unlock counts from older saves are enough to restore already-earned frames.
    const owned = new Set(this.rewards.keys());
    for (const frame of STAMP_COUNT_FRAMES) {
      if (frame.stampCount <= this.unlocks.size) owned.add(frame.rewardId);
    }
    return [...owned];
  }

  isUnlocked(achievementId: string): boolean {
    return this.unlocks.has(achievementId);
  }

  getSnapshot(): AchievementEngineSnapshot {
    this.progress.distinctCompletedWordIds = Array.from(this.distinctWordSet);
    this.progress.practiceCleanTags = Array.from(this.practiceCleanTagSet);
    this.progress.normalCompletedCoursesWith5Words = Array.from(this.normal5WordCoursesSet);
    this.progress.normalMasteredCourses20Words95Acc = Array.from(
      this.normalMasteredCoursesSet,
    );

    return {
      progress: {
        ...this.progress,
        series: this.series.snapshot(),
        completedRoundsByOrder: { ...this.progress.completedRoundsByOrder },
        distinctCompletedWordIds: [...this.progress.distinctCompletedWordIds],
        practiceCleanCountsByWord: { ...this.progress.practiceCleanCountsByWord },
        practiceCleanTags: [...this.progress.practiceCleanTags],
        normalCompletedCoursesWith5Words: [
          ...this.progress.normalCompletedCoursesWith5Words,
        ],
        normalMasteredCourses20Words95Acc: [
          ...this.progress.normalMasteredCourses20Words95Acc,
        ],
      },
      unlocks: Object.fromEntries(this.unlocks.entries()),
      rewards: Object.fromEntries(this.rewards.entries()),
      factCursors: Object.fromEntries(this.factCursors.entries()),
      catalogVersion: this.catalogVersion,
    };
  }

  startSession(
    sessionId: string,
    mode: SessionMode,
    context?: SessionStartContext,
  ): void {
    const qualifiedSet = new Set<string>(
      context?.practiceQualifiedWordIds ??
        Object.entries(this.progress.practiceCleanCountsByWord)
          .filter(([, count]) => count >= 3)
          .map(([wordId]) => wordId),
    );
    this.activeSessions.set(
      sessionId,
      createEmptySessionTracker(sessionId, mode, qualifiedSet, context),
    );
  }

  markSessionSkip(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }
    session.skipsObserved += 1;
    session.currentCleanStreak = 0;
    session.pendingManualFourWordPosition = null;
  }

  markSessionGuideShown(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }
    session.guideUsed = true;
  }

  recordMidWordMistake(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }
    session.currentCleanStreak = 0;
  }

  applyFact(fact: ConfirmedFact, wallClockTimestamp?: number): EvaluationResult {
    const prevSeq = this.factCursors.get(fact.sessionId);
    if (prevSeq !== undefined && fact.factSequence <= prevSeq) {
      return {
        applied: false,
        newlyUnlockedAchievementIds: [],
        newlyUnlockedRewardIds: [],
        newMilestoneRewardKeys: [],
        totalUnlockedCount: this.unlocks.size,
      };
    }

    this.factCursors.set(fact.sessionId, fact.factSequence);
    const previousUnlockedCount = this.unlocks.size;

    const unlockTs =
      wallClockTimestamp ?? (fact.timestamp >= 1_000_000_000_000 ? fact.timestamp : Date.now());
    const session = this.ensureSession(fact.sessionId, fact.mode);
    const newlyUnlocked: string[] = [];
    const firstCompletion = fact.type === 'WordCompleted' && !this.distinctWordSet.has(fact.wordId);

    switch (fact.type) {
      case 'WordCompleted':
        this.handleWordCompleted(fact, session, newlyUnlocked);
        break;
      case 'DeliveryCommitted':
        this.handleDeliveryCommitted(fact, session, newlyUnlocked);
        break;
      case 'PracticeSessionEnded':
        this.handlePracticeSessionEnded(fact, session, newlyUnlocked);
        break;
      case 'RoundFinished':
        this.handleRoundFinished(fact, session, newlyUnlocked);
        break;
    }

    const recordUpdates = this.series.applyFact(fact, firstCompletion, session.orderKey, (stamp, value) => {
      this.unlockAchievement(stamp.id, SCOPE_MAP[stamp.scope], unlockTs, `value=${value}`, newlyUnlocked);
    });
    if (fact.type === 'RoundFinished' || fact.type === 'PracticeSessionEnded') this.activeSessions.delete(fact.sessionId);

    const { newlyUnlockedRewardIds, newMilestoneRewardKeys } = this.grantEligibleRewards(
      unlockTs, previousUnlockedCount,
    );

    return {
      applied: true,
      newlyUnlockedAchievementIds: newlyUnlocked,
      newlyUnlockedRewardIds,
      newMilestoneRewardKeys,
      totalUnlockedCount: this.unlocks.size,
      recordUpdates,
    };
  }

  applyCitySnapshot(
    city: CityAchievementSnapshot,
    timestamp = Date.now(),
  ): EvaluationResult {
    const previousUnlockedCount = this.unlocks.size;
    const newlyUnlocked: string[] = [];
    const unlock = (id: string, evidence: string) => {
      this.unlockAchievement(id, 'city', timestamp, evidence, newlyUnlocked);
    };

    const districtEntries = Object.values(city.districts);
    const highestStage = districtEntries.reduce(
      (max, d) => Math.max(max, d.stage),
      0,
    );
    const stagesAtLeast1 = districtEntries.filter((d) => d.stage >= 1).length;
    const stagesAtLeast3 = districtEntries.filter((d) => d.stage >= 3).length;
    const stagesAtLeast5 = districtEntries.filter((d) => d.stage >= 5).length;
    const maxShopsInDistrict = districtEntries.reduce(
      (max, d) => Math.max(max, d.shops),
      0,
    );

    // Family I: District stages (same city)
    if (highestStage >= 2) unlock('I01', `highest_stage=${highestStage}`);
    if ((city.districts.residential?.stage ?? 0) >= 3) {
      unlock('I02', `residential_stage=${city.districts.residential.stage}`);
    }
    if (stagesAtLeast1 >= 3) unlock('I03', `districts_stage>=1:${stagesAtLeast1}`);
    if (stagesAtLeast1 >= 6) unlock('I04', `districts_stage>=1:${stagesAtLeast1}`);
    if (stagesAtLeast3 >= 6) unlock('I05', `districts_stage>=3:${stagesAtLeast3}`);
    if (stagesAtLeast5 >= 6) unlock('I06', `districts_stage>=5:${stagesAtLeast5}`);

    // Family J: Materials arrival & routes
    if (city.lifetimeArrivedMaterials >= 100) {
      unlock('J01', `arrived=${city.lifetimeArrivedMaterials}`);
    }
    if (city.lifetimeArrivedMaterials >= 1000) {
      unlock('J02', `lifetime_arrived=${city.lifetimeArrivedMaterials}`);
    }
    if (city.openedRoutesCount >= 6) {
      unlock('J03', `opened_routes=${city.openedRoutesCount}`);
    }
    if (city.railRoutesCount >= 1) {
      unlock('J04', `rail_routes=${city.railRoutesCount}`);
    }
    if (city.railRoutesCount >= 6) {
      unlock('J05', `rail_routes=${city.railRoutesCount}`);
    }
    if (city.currentCityArrivedMaterials >= 100000) {
      unlock('J06', `city_arrived=${city.currentCityArrivedMaterials}`);
    }

    // Family K: Equipment, synergies, restart, research
    if (city.paidEquipmentPurchaseCount >= 5) {
      unlock('K01', `paid_equipment=${city.paidEquipmentPurchaseCount}`);
    }
    if (city.packagingLevel >= 10) {
      unlock('K02', `packaging_level=${city.packagingLevel}`);
    }
    if (maxShopsInDistrict >= 10) {
      unlock('K03', `max_shops=${maxShopsInDistrict}`);
    }
    if (new Set(city.purchasedSynergies).size >= 3) {
      unlock('K04', `synergies=${city.purchasedSynergies.length}`);
    }
    if (city.cityRestartCount >= 1) {
      unlock('K05', `restarts=${city.cityRestartCount}`);
    }
    const maxResearchRank = Math.max(
      city.researchRanks.materials ?? 0,
      city.researchRanks.logistics ?? 0,
      city.researchRanks.commerce ?? 0,
    );
    if (maxResearchRank >= 1) {
      unlock('K06', `max_research_rank=${maxResearchRank}`);
    }

    if (city.seriesEligible !== false) {
      this.series.applyCity(city, (stamp, value) => unlock(stamp.id, `value=${value}`));
    }

    const { newlyUnlockedRewardIds, newMilestoneRewardKeys } =
      this.grantEligibleRewards(timestamp, previousUnlockedCount);

    return {
      applied: true,
      newlyUnlockedAchievementIds: newlyUnlocked,
      newlyUnlockedRewardIds,
      newMilestoneRewardKeys,
      totalUnlockedCount: this.unlocks.size,
    };
  }

  getProvisionalStatuses(
    sessionId: string,
  ): Record<string, ProvisionalAchievementStatus> {
    const session = this.activeSessions.get(sessionId);
    const result: Record<string, ProvisionalAchievementStatus> = {};
    const normalDisqualified = session ? session.skipsObserved > 0 : false;

    for (const def of LEGACY_ACHIEVEMENTS) {
      if (this.unlocks.has(def.id)) {
        result[def.id] = 'confirmed';
        continue;
      }

      const scope = SCOPE_MAP[def.scope];
      if (!session || session.mode !== 'MAIN' || scope !== 'normal') {
        result[def.id] = 'locked';
        continue;
      }

      if (normalDisqualified || (def.id === 'H05' && session.guideUsed)) {
        result[def.id] = 'disqualified_this_round';
        continue;
      }

      result[def.id] = this.evaluateNormalProvisional(def.id, session);
    }

    return result;
  }

  private ensureSession(sessionId: string, mode: SessionMode): ActiveSessionTracker {
    let session = this.activeSessions.get(sessionId);
    if (!session) {
      const qualifiedSet = new Set(
        Object.entries(this.progress.practiceCleanCountsByWord)
          .filter(([, count]) => count >= 3)
          .map(([wordId]) => wordId),
      );
      session = createEmptySessionTracker(sessionId, mode, qualifiedSet);
      this.activeSessions.set(sessionId, session);
    }
    return session;
  }

  private handleWordCompleted(
    fact: WordCompletedFact,
    session: ActiveSessionTracker,
    newlyUnlocked: string[],
  ): void {
    const clean = fact.mistakes === 0;
    session.completedWordsCount += 1;
    session.completedWordIds.push(fact.wordId);
    session.canonicalLengthSoFar += fact.canonicalLength;
    session.correctKeysSoFar += fact.canonicalLength;
    session.mistakesSoFar += fact.mistakes;

    // Update in-session streak
    if (clean) {
      session.currentCleanStreak += 1;
      if (session.currentCleanStreak > session.maxCleanStreakInSession) {
        session.maxCleanStreakInSession = session.currentCleanStreak;
      }
    } else {
      session.currentCleanStreak = 0;
    }

    // Check B06 adjacency: manual 4-cargo delivery immediately followed by next clean word
    if (session.pendingManualFourWordPosition !== null) {
      if (clean && fact.wordPosition === session.pendingManualFourWordPosition + 1) {
        session.immediateNextWordCleanAfterManualFour = true;
      }
      session.pendingManualFourWordPosition = null;
    }

    // Check F06 qualification captured at session start
    if (clean && session.practiceQualifiedWordIds.has(fact.wordId)) {
      session.qualifiedWordCleanInRound = true;
    }

    // Scope: 全 (TUTORIAL | PRACTICE | MAIN)
    if (
      fact.mode === 'TUTORIAL' ||
      fact.mode === 'PRACTICE' ||
      fact.mode === 'MAIN'
    ) {
      this.progress.lifetimeCompletedWords += 1;
      this.distinctWordSet.add(fact.wordId);
      this.evaluateAllScopeWordAchievements(fact.timestamp, newlyUnlocked);
    }

    // Scope: 練 (PRACTICE only)
    if (fact.mode === 'PRACTICE') {
      this.progress.practiceCompletedWords += 1;
      if (clean) {
        const nextWordClean =
          (this.progress.practiceCleanCountsByWord[fact.wordId] ?? 0) + 1;
        this.progress.practiceCleanCountsByWord[fact.wordId] = nextWordClean;

        for (const tag of fact.tags) {
          this.practiceCleanTagSet.add(tag);
        }
        if (session.currentCleanStreak > this.progress.practiceMaxCleanStreak) {
          this.progress.practiceMaxCleanStreak = session.currentCleanStreak;
        }
      }
      this.evaluatePracticeAchievements(fact.timestamp, newlyUnlocked);
    }
  }

  private handleDeliveryCommitted(
    fact: DeliveryCommittedFact,
    session: ActiveSessionTracker,
    newlyUnlocked: string[],
  ): void {
    // Only manual and full count toward delivery achievements; deadline and skip do not.
    if (fact.reason !== 'manual' && fact.reason !== 'full') {
      if (fact.reason === 'skip') {
        session.skipsObserved += 1;
        session.currentCleanStreak = 0;
        session.pendingManualFourWordPosition = null;
      }
      return;
    }

    // Scope: 全
    this.progress.lifetimeDeliveredCargo += fact.cargoCount;
    if (fact.reason === 'manual') {
      this.progress.manualDeliveryCount += 1;
      if (fact.cargoCount >= 2) {
        this.progress.groupedDeliveryCount += 1;
      }
    } else if (fact.reason === 'full') {
      this.progress.fullDeliveryCount += 1;
      this.progress.groupedDeliveryCount += 1;
    }

    // Session tracking for B / H families
    if (fact.reason === 'manual') {
      session.manualDeliveriesInRound += 1;
      if (fact.cargoCount >= 1 && fact.cargoCount <= 2) {
        session.smallManualDeliveriesInRound += 1;
      }
      if (fact.cargoCount >= 3 && fact.cargoCount <= 4) {
        session.largeManualDeliveriesInRound += 1;
      }
      if (fact.cargoCount === 2) {
        session.manualTwoCountInRound += 1;
        session.manualTwoSeenInRound = true;
      }
      if (fact.cargoCount === 4) {
        session.manualFourCountInRound += 1;
        session.pendingManualFourWordPosition = fact.precedingWordPosition;
      }
    } else if (fact.reason === 'full') {
      session.fullDeliveriesInRound += 1;
      if (session.manualTwoSeenInRound) {
        session.fullAfterManualTwoInRound = true;
      }
    }

    this.evaluateAllScopeDeliveryAchievements(fact.timestamp, newlyUnlocked);
  }

  private handlePracticeSessionEnded(
    fact: PracticeSessionEndedFact,
    session: ActiveSessionTracker,
    newlyUnlocked: string[],
  ): void {
    if (fact.maxCleanStreak > this.progress.practiceMaxCleanStreak) {
      this.progress.practiceMaxCleanStreak = fact.maxCleanStreak;
    }
    if (session.maxCleanStreakInSession > this.progress.practiceMaxCleanStreak) {
      this.progress.practiceMaxCleanStreak = session.maxCleanStreakInSession;
    }
    session.currentCleanStreak = 0;
    this.evaluatePracticeAchievements(fact.timestamp, newlyUnlocked);
  }

  private handleRoundFinished(
    fact: RoundFinishedFact,
    session: ActiveSessionTracker,
    newlyUnlocked: string[],
  ): void {
    if (fact.guideUsed) {
      session.guideUsed = true;
    }
    if (fact.skips > 0 || fact.rescueUsed) {
      session.skipsObserved = Math.max(session.skipsObserved, fact.skips, 1);
    }

    // Round/Normal achievements only apply to completed MAIN rounds with >= 1 word
    if (fact.mode !== 'MAIN' || !fact.completed || fact.completedWordCount < 1) {
      return;
    }

    // Scope: 便 (round)
    this.progress.completedRounds += 1;
    if (fact.completedWordCount >= 5) {
      this.progress.roundsWith5WordsCompleted += 1;
    }
    const orderKey =
      session.orderKey ?? fact.comparisonKey ?? `${fact.courseId}:${session.completedWordIds.join(',')}`;
    const orderCount = (this.progress.completedRoundsByOrder[orderKey] ?? 0) + 1;
    this.progress.completedRoundsByOrder[orderKey] = orderCount;

    if (this.progress.completedRounds >= 1) {
      this.unlockAchievement(
        'A05',
        'round',
        fact.timestamp,
        `completed_rounds=${this.progress.completedRounds}`,
        newlyUnlocked,
      );
    }
    if (orderCount >= 2) {
      this.unlockAchievement(
        'A06',
        'round',
        fact.timestamp,
        `order=${orderKey},count=${orderCount}`,
        newlyUnlocked,
      );
    }
    if (this.progress.roundsWith5WordsCompleted >= 10) {
      this.unlockAchievement(
        'G06',
        'round',
        fact.timestamp,
        `rounds_5_words=${this.progress.roundsWith5WordsCompleted}`,
        newlyUnlocked,
      );
    }

    // Scope: 通常 (normal): MAIN, completed, skips === 0, !rescueUsed
    if (fact.skips > 0 || fact.rescueUsed) {
      return;
    }

    const maxCleanStreak = Math.max(
      fact.longestCleanStreak,
      session.maxCleanStreakInSession,
    );
    if (maxCleanStreak > this.progress.normalMaxCleanStreak) {
      this.progress.normalMaxCleanStreak = maxCleanStreak;
    }

    const unlockNormal = (id: string, evidence: string) => {
      this.unlockAchievement(id, 'normal', fact.timestamp, evidence, newlyUnlocked);
    };

    // Family B
    if (session.smallManualDeliveriesInRound >= 1) {
      unlockNormal('B01', `small_manual=${session.smallManualDeliveriesInRound}`);
    }
    if (session.largeManualDeliveriesInRound >= 1) {
      unlockNormal('B02', `large_manual=${session.largeManualDeliveriesInRound}`);
    }
    if (session.fullDeliveriesInRound >= 2) {
      unlockNormal('B03', `full_deliveries=${session.fullDeliveriesInRound}`);
    }
    if (session.manualDeliveriesInRound >= 1 && session.fullDeliveriesInRound >= 1) {
      unlockNormal(
        'B04',
        `manual=${session.manualDeliveriesInRound},full=${session.fullDeliveriesInRound}`,
      );
    }
    if (session.manualTwoSeenInRound && session.fullAfterManualTwoInRound) {
      unlockNormal('B05', 'manual_two_then_full');
    }
    if (session.immediateNextWordCleanAfterManualFour) {
      unlockNormal('B06', 'manual_four_then_clean_next');
    }

    // Family C
    const acc90 = meetsAccuracyThreshold(fact.correctKeyCount, fact.mistakeCount, 90);
    const acc95 = meetsAccuracyThreshold(fact.correctKeyCount, fact.mistakeCount, 95);
    const acc98 = meetsAccuracyThreshold(fact.correctKeyCount, fact.mistakeCount, 98);

    if (fact.completedWordCount >= 10 && acc90) {
      unlockNormal('C01', `words=${fact.completedWordCount},acc>=90`);
    }
    if (fact.completedWordCount >= 20 && acc95) {
      unlockNormal('C02', `words=${fact.completedWordCount},acc>=95`);
    }
    if (fact.completedWordCount >= 25 && acc98) {
      unlockNormal('C03', `words=${fact.completedWordCount},acc>=98`);
    }
    if (maxCleanStreak >= 5) {
      unlockNormal('C04', `streak=${maxCleanStreak}`);
    }
    if (maxCleanStreak >= 15) {
      unlockNormal('C05', `streak=${maxCleanStreak}`);
    }
    if (maxCleanStreak >= 20) {
      unlockNormal('C06', `streak=${maxCleanStreak}`);
    }

    // Family D
    if (meetsSpeedThreshold(fact.totalCanonicalLength, 60)) {
      unlockNormal('D01', `len=${fact.totalCanonicalLength}`);
    }
    if (meetsSpeedThreshold(fact.totalCanonicalLength, 100)) {
      unlockNormal('D02', `len=${fact.totalCanonicalLength}`);
    }
    if (meetsSpeedThreshold(fact.totalCanonicalLength, 160)) {
      unlockNormal('D03', `len=${fact.totalCanonicalLength}`);
    }

    const d04Absolute = fact.score >= 1000;
    const d04Improved =
      fact.completedWordCount >= 10 &&
      session.comparisonBestScore !== null &&
      fact.score > session.comparisonBestScore;
    if (d04Absolute || d04Improved) {
      unlockNormal(
        'D04',
        d04Absolute
          ? `score=${fact.score}`
          : `score=${fact.score}>best=${session.comparisonBestScore}`,
      );
    }

    const d05Absolute = meetsSpeedThreshold(fact.totalCanonicalLength, 180);
    const d05Improved =
      fact.completedWordCount >= 10 &&
      session.comparisonBestSpeed !== null &&
      meetsSpeedImprovement(fact.totalCanonicalLength, session.comparisonBestSpeed, 10);
    if (d05Absolute || d05Improved) {
      unlockNormal(
        'D05',
        d05Absolute
          ? `len=${fact.totalCanonicalLength}`
          : `len=${fact.totalCanonicalLength},best_speed=${session.comparisonBestSpeed}`,
      );
    }

    if (
      fact.completedWordCount >= 20 &&
      meetsSpeedThreshold(fact.totalCanonicalLength, 100) &&
      acc95
    ) {
      unlockNormal('D06', `words=${fact.completedWordCount},len=${fact.totalCanonicalLength}`);
    }

    // E06: 3 courses each with >= 5 completed words in normal round
    if (fact.completedWordCount >= 5) {
      this.normal5WordCoursesSet.add(fact.courseId);
      if (this.normal5WordCoursesSet.size >= 3) {
        unlockNormal('E06', 'all_3_courses_5_words');
      }
    }

    // F06: Practice-qualified word (before round start) completed clean in normal round
    if (session.qualifiedWordCleanInRound) {
      unlockNormal('F06', 'qualified_word_clean_in_normal_round');
    }

    // Family H
    if (meetsSpeedThreshold(fact.totalCanonicalLength, 200) && acc95) {
      unlockNormal('H01', `len=${fact.totalCanonicalLength},acc>=95`);
    }
    if (maxCleanStreak >= 30) {
      unlockNormal('H02', `streak=${maxCleanStreak}`);
    }
    if (session.fullDeliveriesInRound >= 4) {
      unlockNormal('H03', `full=${session.fullDeliveriesInRound}`);
    }
    if (
      session.manualTwoCountInRound >= 1 &&
      session.manualFourCountInRound >= 1 &&
      session.fullDeliveriesInRound >= 1
    ) {
      unlockNormal('H04', 'manual2+manual4+full5');
    }
    if (fact.completedWordCount >= 20 && acc95 && !session.guideUsed) {
      unlockNormal('H05', `words=${fact.completedWordCount},acc>=95,no_guide`);
    }
    if (fact.completedWordCount >= 20 && acc95) {
      this.normalMasteredCoursesSet.add(fact.courseId);
      if (this.normalMasteredCoursesSet.size >= 3) {
        unlockNormal('H06', 'all_3_courses_20_words_95_acc');
      }
    }
  }

  private evaluateAllScopeWordAchievements(
    timestamp: number,
    newlyUnlocked: string[],
  ): void {
    const unlockAll = (id: string, evidence: string) => {
      this.unlockAchievement(id, 'all', timestamp, evidence, newlyUnlocked);
    };

    if (this.progress.lifetimeCompletedWords >= 1) {
      unlockAll('A01', `lifetime_words=${this.progress.lifetimeCompletedWords}`);
    }
    if (this.progress.lifetimeCompletedWords >= 50) {
      unlockAll('G01', `lifetime_words=${this.progress.lifetimeCompletedWords}`);
    }
    if (this.progress.lifetimeCompletedWords >= 250) {
      unlockAll('G02', `lifetime_words=${this.progress.lifetimeCompletedWords}`);
    }
    if (this.progress.lifetimeCompletedWords >= 1000) {
      unlockAll('G03', `lifetime_words=${this.progress.lifetimeCompletedWords}`);
    }

    const distinctCount = this.distinctWordSet.size;
    if (distinctCount >= 10) unlockAll('E01', `distinct=${distinctCount}`);
    if (distinctCount >= 50) unlockAll('E02', `distinct=${distinctCount}`);
    if (distinctCount >= 150) unlockAll('E03', `distinct=${distinctCount}`);

    // E04: All 240 legacy words
    let legacyCompleted = 0;
    for (const id of LEGACY_240_WORD_IDS) {
      if (this.distinctWordSet.has(id)) {
        legacyCompleted += 1;
      }
    }
    if (legacyCompleted >= LEGACY_240_WORD_IDS.size) {
      unlockAll('E04', `legacy240=${legacyCompleted}`);
    }

    // E05 & L01..L06: Count across current 960-word set
    const topicCounts: Record<TopicId, number> = {
      daily: 0,
      food: 0,
      living: 0,
      town: 0,
      nature: 0,
      people: 0,
    };
    const courseCounts: Record<CourseId, number> = {
      relaxed: 0,
      standard: 0,
      challenge: 0,
    };
    let distinct960Count = 0;

    for (const wordId of this.distinctWordSet) {
      if (!ALL_960_WORD_IDS.has(wordId)) {
        continue;
      }
      distinct960Count += 1;
      const topic = WORD_TOPIC_BY_ID.get(wordId);
      if (topic) {
        topicCounts[topic] += 1;
      }
      const course = WORD_COURSE_BY_ID.get(wordId);
      if (course) {
        courseCounts[course] += 1;
      }
    }

    const qualifiedTopics = Object.values(topicCounts).filter((c) => c >= 5).length;
    if (qualifiedTopics >= 6) {
      unlockAll('E05', 'all_6_topics>=5');
    }

    if (distinct960Count >= 300) unlockAll('L01', `960_distinct=${distinct960Count}`);
    if (distinct960Count >= 480) unlockAll('L02', `960_distinct=${distinct960Count}`);
    if (distinct960Count >= 960) unlockAll('L03', `960_distinct=${distinct960Count}`);
    if (courseCounts.relaxed >= COURSE_WORD_COUNTS.relaxed) {
      unlockAll('L04', `relaxed=${courseCounts.relaxed}`);
    }
    if (courseCounts.standard >= COURSE_WORD_COUNTS.standard) {
      unlockAll('L05', `standard=${courseCounts.standard}`);
    }
    if (courseCounts.challenge >= COURSE_WORD_COUNTS.challenge) {
      unlockAll('L06', `challenge=${courseCounts.challenge}`);
    }
  }

  private evaluateAllScopeDeliveryAchievements(
    timestamp: number,
    newlyUnlocked: string[],
  ): void {
    const unlockAll = (id: string, evidence: string) => {
      this.unlockAchievement(id, 'all', timestamp, evidence, newlyUnlocked);
    };

    if (this.progress.manualDeliveryCount >= 1) {
      unlockAll('A02', `manual=${this.progress.manualDeliveryCount}`);
    }
    if (this.progress.groupedDeliveryCount >= 1) {
      unlockAll('A03', `grouped=${this.progress.groupedDeliveryCount}`);
    }
    if (this.progress.fullDeliveryCount >= 1) {
      unlockAll('A04', `full=${this.progress.fullDeliveryCount}`);
    }
    if (this.progress.lifetimeDeliveredCargo >= 50) {
      unlockAll('G04', `cargo=${this.progress.lifetimeDeliveredCargo}`);
    }
    if (this.progress.lifetimeDeliveredCargo >= 250) {
      unlockAll('G05', `cargo=${this.progress.lifetimeDeliveredCargo}`);
    }
  }

  private evaluatePracticeAchievements(
    timestamp: number,
    newlyUnlocked: string[],
  ): void {
    const unlockPractice = (id: string, evidence: string) => {
      this.unlockAchievement(id, 'practice', timestamp, evidence, newlyUnlocked);
    };

    if (this.progress.practiceCompletedWords >= 1) {
      unlockPractice('F01', `practice_words=${this.progress.practiceCompletedWords}`);
    }

    const counts = Object.values(this.progress.practiceCleanCountsByWord);
    const qualifiedWords = counts.filter((c) => c >= 3).length;
    if (qualifiedWords >= 1) {
      unlockPractice('F02', `qualified_words=${qualifiedWords}`);
    }
    if (qualifiedWords >= 5) {
      unlockPractice('F04', `qualified_words=${qualifiedWords}`);
    }

    const requiredTags: WordTag[] = ['n', 'sokuon', 'yoon', 'long_mark'];
    if (requiredTags.every((t) => this.practiceCleanTagSet.has(t))) {
      unlockPractice('F03', 'all_4_tags_clean');
    }

    if (this.progress.practiceMaxCleanStreak >= 5) {
      unlockPractice('F05', `practice_streak=${this.progress.practiceMaxCleanStreak}`);
    }
  }

  private evaluateNormalProvisional(
    id: string,
    session: ActiveSessionTracker,
  ): ProvisionalAchievementStatus {
    // Latch-style in-round conditions (stay held even after later mistakes)
    switch (id) {
      case 'B01':
        return session.smallManualDeliveriesInRound >= 1 ? 'provisional_held' : 'locked';
      case 'B02':
        return session.largeManualDeliveriesInRound >= 1 ? 'provisional_held' : 'locked';
      case 'B03':
        return session.fullDeliveriesInRound >= 2 ? 'provisional_held' : 'locked';
      case 'B04':
        return session.manualDeliveriesInRound >= 1 && session.fullDeliveriesInRound >= 1
          ? 'provisional_held'
          : 'locked';
      case 'B05':
        return session.manualTwoSeenInRound && session.fullAfterManualTwoInRound
          ? 'provisional_held'
          : 'locked';
      case 'B06':
        return session.immediateNextWordCleanAfterManualFour
          ? 'provisional_held'
          : 'locked';
      case 'C04':
        return session.maxCleanStreakInSession >= 5 ? 'provisional_held' : 'locked';
      case 'C05':
        return session.maxCleanStreakInSession >= 15 ? 'provisional_held' : 'locked';
      case 'C06':
        return session.maxCleanStreakInSession >= 20 ? 'provisional_held' : 'locked';
      case 'H02':
        return session.maxCleanStreakInSession >= 30 ? 'provisional_held' : 'locked';
      case 'H03':
        return session.fullDeliveriesInRound >= 4 ? 'provisional_held' : 'locked';
      case 'H04':
        return session.manualTwoCountInRound >= 1 &&
          session.manualFourCountInRound >= 1 &&
          session.fullDeliveriesInRound >= 1
          ? 'provisional_held'
          : 'locked';
      case 'F06':
        return session.qualifiedWordCleanInRound ? 'provisional_held' : 'locked';
      // Dynamic conditions that depend on final accuracy / round end
      case 'C01':
        return session.completedWordsCount >= 10 &&
          meetsAccuracyThreshold(session.correctKeysSoFar, session.mistakesSoFar, 90)
          ? 'provisional_in_range'
          : 'locked';
      case 'C02':
        return session.completedWordsCount >= 20 &&
          meetsAccuracyThreshold(session.correctKeysSoFar, session.mistakesSoFar, 95)
          ? 'provisional_in_range'
          : 'locked';
      case 'C03':
        return session.completedWordsCount >= 25 &&
          meetsAccuracyThreshold(session.correctKeysSoFar, session.mistakesSoFar, 98)
          ? 'provisional_in_range'
          : 'locked';
      case 'D01':
        return meetsSpeedThreshold(session.canonicalLengthSoFar, 60)
          ? 'provisional_in_range'
          : 'locked';
      case 'D02':
        return meetsSpeedThreshold(session.canonicalLengthSoFar, 100)
          ? 'provisional_in_range'
          : 'locked';
      case 'D03':
        return meetsSpeedThreshold(session.canonicalLengthSoFar, 160)
          ? 'provisional_in_range'
          : 'locked';
      case 'D06':
        return session.completedWordsCount >= 20 &&
          meetsSpeedThreshold(session.canonicalLengthSoFar, 100) &&
          meetsAccuracyThreshold(session.correctKeysSoFar, session.mistakesSoFar, 95)
          ? 'provisional_in_range'
          : 'locked';
      case 'H01':
        return meetsSpeedThreshold(session.canonicalLengthSoFar, 200) &&
          meetsAccuracyThreshold(session.correctKeysSoFar, session.mistakesSoFar, 95)
          ? 'provisional_in_range'
          : 'locked';
      case 'H05':
        return session.completedWordsCount >= 20 &&
          !session.guideUsed &&
          meetsAccuracyThreshold(session.correctKeysSoFar, session.mistakesSoFar, 95)
          ? 'provisional_in_range'
          : 'locked';
      default:
        return 'locked';
    }
  }

  private unlockAchievement(
    achievementId: string,
    scope: AchievementScope,
    timestamp: number,
    evidenceSummary: string,
    newlyUnlocked: string[],
  ): void {
    if (this.unlocks.has(achievementId)) {
      return;
    }
    const safeTs = timestamp >= 1_000_000_000_000 ? timestamp : Date.now();
    this.unlocks.set(achievementId, {
      achievementId,
      unlockedAt: safeTs,
      conditionRevision: this.catalogVersion,
      scope,
      evidenceSummary,
    });
    newlyUnlocked.push(achievementId);
  }

  private grantEligibleRewards(timestamp: number, previousUnlockedCount: number): {
    newlyUnlockedRewardIds: string[];
    newMilestoneRewardKeys: string[];
  } {
    const newlyUnlockedRewardIds: string[] = [];
    const newMilestoneRewardKeys: string[] = [];

    const grant = (rewardId: string, kind: string) => {
      if (this.rewards.has(rewardId)) {
        return;
      }
      this.rewards.set(rewardId, {
        rewardId,
        unlockedAt: timestamp,
        kind,
      });
      newlyUnlockedRewardIds.push(rewardId);
    };

    // 1. Family postcards (3+) & foil boards (6+)
    const familyCounts: Record<AchievementFamilyId, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
      F: 0,
      G: 0,
      H: 0,
      I: 0,
      J: 0,
      K: 0,
      L: 0,
    };

    for (const def of LEGACY_ACHIEVEMENTS) {
      if (this.unlocks.has(def.id)) {
        familyCounts[def.family_id] += 1;
      }
    }

    for (const [family, count] of Object.entries(familyCounts) as [
      AchievementFamilyId,
      number,
    ][]) {
      const lower = family.toLowerCase();
      if (count >= 3) {
        const id = `reward_family_${lower}_postcard`;
        grant(id, rewardById.get(id)?.kind ?? 'postcard');
      }
      if (count >= 6) {
        const id = `reward_family_${lower}_foil_board`;
        grant(id, rewardById.get(id)?.kind ?? 'foil_board');
      }
    }

    // 2. Total unlocked milestones (8, 16, 24, 36, 48, 60, 72)
    const totalUnlocked = Object.values(familyCounts).reduce((sum, count) => sum + count, 0);
    for (const threshold of MILESTONE_THRESHOLDS) {
      if (totalUnlocked >= threshold) {
        const rewardIds = TOTAL_MILESTONE_CATALOG_REWARDS[threshold] ?? [];
        const hadPrimary = rewardIds.length > 0 && this.rewards.has(rewardIds[0]);
        for (const rewardId of rewardIds) {
          grant(rewardId, rewardById.get(rewardId)?.kind ?? 'milestone');
        }
        if (!hadPrimary && MILESTONE_PRIMARY_REWARD_KEYS[threshold]) {
          newMilestoneRewardKeys.push(MILESTONE_PRIMARY_REWARD_KEYS[threshold]);
        }
      }
    }

    // 3. First Collection (A-H all 48 achievements)
    const firstCollectionComplete = FIRST_COLLECTION_FAMILIES.every(
      (fam) => familyCounts[fam] >= 6,
    );
    if (firstCollectionComplete) {
      grant('reward_first_collection_board', 'memorial_board');
      grant('reward_first_collection_stamp', 'memorial_stamp');
    }

    for (const frame of STAMP_COUNT_FRAMES) {
      if (previousUnlockedCount < frame.stampCount && frame.stampCount <= this.unlocks.size) {
        grant(frame.rewardId, 'frame');
      }
    }

    return { newlyUnlockedRewardIds, newMilestoneRewardKeys };
  }
}
