import type { ConfirmedFact, CourseId } from '@/contracts/types';
import {
  AchievementEngine,
  createInitialAchievementProgress,
  type AchievementEngineSnapshot,
  type AchievementProgressState,
  type CityAchievementSnapshot,
  type EvaluationResult,
  type RewardRecord,
  type SessionStartContext,
  type UnlockRecord,
} from './achievementEngine';

export const PROFILE_DB_NAME = 'kotobabin';
export const PROFILE_DB_VERSION = 4;
export const MAX_RECENT_RESULTS = 30;
export const INITIAL_RESET_GENERATION = 1;

export const STORE_NAMES = [
  'profile',
  'results',
  'achievementProgress',
  'unlocks',
  'rewards',
  'readState',
  'factCursors',
  'city',
  'economyProfile',
  'economyCursors',
  'metadata',
] as const;

export type StoreName = (typeof STORE_NAMES)[number];

export class TabLockError extends Error {
  readonly code = 'TAB_LOCK_REJECTED';

  constructor(message: string) {
    super(message);
    this.name = 'TabLockError';
  }
}

export class ResetGenerationError extends Error {
  readonly code = 'STALE_RESET_GENERATION';

  constructor(message: string) {
    super(message);
    this.name = 'ResetGenerationError';
  }
}

export interface TabLockToken {
  tabId: string;
  writeEpoch: number;
  resetGeneration?: number;
}

export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';
export type OnboardingStep = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8';

export interface OnboardingReceipt {
  unlockedStampIds: string[];
  unlockedRewardIds?: string[];
  generatedMaterialsMicro: string;
  supportMaterialsMicro: string;
  supportCoinsMicro: string;
}

export interface OnboardingStateRecord {
  version: 1;
  status: OnboardingStatus;
  step: OnboardingStep;
  updatedAt: number;
  receipt?: OnboardingReceipt;
  upgradeTargetSelected?: boolean;
  stampRevealIndex?: number;
}

export interface ProfileSettingsRecord {
  id: 'singleton';
  volume: number;
  fontSize: 'normal' | 'large';
  reduceMotion: boolean;
  deliveryKey: string;
  guideDefault: boolean;
  achievementToastEnabled: boolean;
  equippedTitleId: string | null;
  equippedFrameId: string | null;
  pinnedGoalAchievementId: string | null;
  tutorialCompleted: boolean;
  onboarding?: OnboardingStateRecord;
  catalogStartedAt: number;
}

export interface RoundResultRecord {
  sessionId: string;
  timestamp: number;
  courseId: CourseId;
  comparisonKey: string;
  planId: string;
  wordIds: string[];
  ruleVersion: string;
  completed: boolean;
  completedWordCount: number;
  correctKeyCount: number;
  mistakeCount: number;
  totalCanonicalLength: number;
  score: number;
  canonicalKpm: number;
  rescueUsed: boolean;
  guideUsed: boolean;
}

export interface ReadStateRecord {
  key: string; // e.g. 'achievement:A01' or 'reward:reward_total_24_album'
  kind: 'achievement' | 'reward';
  targetId: string;
  read: boolean;
  updatedAt: number;
}

export interface FactCursorRecord {
  sessionId: string;
  lastFactSequence: number;
}

export interface EconomyCursorRecord {
  cursorKey: string; // `${cityId}:${economyEventId}`
  cityId: string;
  economyEventId: string;
  appliedAt: number;
}

export interface CityStoreRecord {
  id: 'current';
  cityId: string;
  state: Record<string, unknown>;
  revision: number;
  updatedAt: number;
}

export interface EconomyProfileStoreRecord {
  id: 'singleton';
  state: Record<string, unknown>;
  updatedAt: number;
}

export interface MetadataRecord {
  id: 'singleton';
  schemaVersion: number;
  migratedFromLegacy: boolean;
  resetGeneration: number;
  ownerTabId: string;
  writeEpoch: number;
}

export interface ProfileSnapshot {
  profile: ProfileSettingsRecord;
  results: RoundResultRecord[];
  achievementProgress: AchievementProgressState;
  unlocks: Record<string, UnlockRecord>;
  rewards: Record<string, RewardRecord>;
  readState: Record<string, ReadStateRecord>;
  factCursors: Record<string, number>;
  city: CityStoreRecord | null;
  economyProfile: EconomyProfileStoreRecord | null;
  economyCursors: Record<string, EconomyCursorRecord>;
  metadata: MetadataRecord;
}

export type AppProfileSnapshot = Omit<ProfileSnapshot, 'economyCursors'>;

export function clearGrowthHistory(progress: AchievementProgressState): AchievementProgressState {
  return progress.series
    ? { ...progress, series: { ...progress.series, records: {} } }
    : progress;
}

export interface CommitFactsParams {
  lock: TabLockToken;
  facts: ConfirmedFact[];
  sessionContext?: {
    sessionId: string;
    context: SessionStartContext;
  };
  citySnapshot?: CityAchievementSnapshot;
  roundResult?: RoundResultRecord;
}

export interface CommitFactsResult {
  evaluation: EvaluationResult;
  metadata: MetadataRecord;
  appliedFactCount: number;
  skippedFactCount: number;
}

export interface CommitCityEconomyParams {
  lock: TabLockToken;
  cityId: string;
  economyEventId: string;
  cityRecord: CityStoreRecord;
  economyProfileRecord?: EconomyProfileStoreRecord;
  cityAchievementSnapshot?: CityAchievementSnapshot;
  onboarding?: { state: OnboardingStateRecord; tutorialCompleted: boolean };
  timestamp?: number;
}

export interface CommitCityEconomyResult {
  applied: boolean;
  evaluation: EvaluationResult | null;
  metadata: MetadataRecord;
}

export type ResetScope = 'records' | 'city_and_achievements' | 'settings';

export interface ProfileRepository {
  readonly backend: 'indexeddb' | 'memory';
  init(tabId?: string): Promise<MetadataRecord>;
  acquireTabLock(tabId: string): Promise<MetadataRecord>;
  loadAll(): Promise<ProfileSnapshot>;
  /** Skip the write-only economy event ledger for runtime snapshots. */
  loadAll(options: { includeEconomyCursors: false }): Promise<AppProfileSnapshot>;
  commitTypingFacts(params: CommitFactsParams): Promise<CommitFactsResult>;
  commitCityEconomy(params: CommitCityEconomyParams): Promise<CommitCityEconomyResult>;
  saveProfile(
    profile: Partial<Omit<ProfileSettingsRecord, 'id'>>,
    lock: TabLockToken,
  ): Promise<ProfileSettingsRecord>;
  markAsRead(
    targets: { achievementIds?: string[]; rewardIds?: string[] },
    lock: TabLockToken,
    timestamp?: number,
  ): Promise<void>;
  resetData(scope: ResetScope, lock: TabLockToken): Promise<MetadataRecord>;
  close(): void;
}

export function createDefaultProfileSettings(now = Date.now()): ProfileSettingsRecord {
  return {
    id: 'singleton',
    volume: 0.7,
    fontSize: 'normal',
    reduceMotion: false,
    deliveryKey: 'Enter',
    guideDefault: true,
    achievementToastEnabled: true,
    equippedTitleId: null,
    equippedFrameId: null,
    pinnedGoalAchievementId: null,
    tutorialCompleted: false,
    onboarding: {
      version: 1,
      status: 'not_started',
      step: 'S1',
      updatedAt: now,
    },
    catalogStartedAt: now,
  };
}

export function createDefaultMetadata(tabId = ''): MetadataRecord {
  return {
    id: 'singleton',
    schemaVersion: PROFILE_DB_VERSION,
    migratedFromLegacy: false,
    resetGeneration: INITIAL_RESET_GENERATION,
    ownerTabId: tabId,
    writeEpoch: tabId ? 1 : 0,
  };
}

function assertLockValid(metadata: MetadataRecord, lock: TabLockToken): void {
  if (metadata.ownerTabId !== lock.tabId || metadata.writeEpoch !== lock.writeEpoch) {
    throw new TabLockError(
      `Tab lock rejected: expected (${metadata.ownerTabId}, epoch ${metadata.writeEpoch}), got (${lock.tabId}, epoch ${lock.writeEpoch})`,
    );
  }
  if (
    lock.resetGeneration !== undefined &&
    metadata.resetGeneration !== lock.resetGeneration
  ) {
    throw new ResetGenerationError(
      `Stale resetGeneration: expected ${metadata.resetGeneration}, got ${lock.resetGeneration}`,
    );
  }
}

function applyFactsAndCityToEngine(
  engine: AchievementEngine,
  params: CommitFactsParams,
  readStateMap: Map<string, ReadStateRecord>,
): {
  evaluation: EvaluationResult;
  appliedFactCount: number;
  skippedFactCount: number;
} {
  if (params.sessionContext) {
    const mode = params.facts[0]?.mode ?? 'MAIN';
    engine.startSession(
      params.sessionContext.sessionId,
      mode,
      params.sessionContext.context,
    );
  }

  let appliedFactCount = 0;
  let skippedFactCount = 0;
  let recordUpdates: EvaluationResult['recordUpdates'];
  const newlyUnlockedAchievements: string[] = [];
  const newlyUnlockedRewards: string[] = [];
  const newMilestoneRewardKeys: string[] = [];

  for (const fact of params.facts) {
    const res = engine.applyFact(fact);
    if (!res.applied) {
      skippedFactCount += 1;
      continue;
    }
    appliedFactCount += 1;
    recordUpdates = res.recordUpdates ?? recordUpdates;
    newlyUnlockedAchievements.push(...res.newlyUnlockedAchievementIds);
    newlyUnlockedRewards.push(...res.newlyUnlockedRewardIds);
    newMilestoneRewardKeys.push(...res.newMilestoneRewardKeys);
  }

  if (params.citySnapshot) {
    const cityRes = engine.applyCitySnapshot(params.citySnapshot);
    newlyUnlockedAchievements.push(...cityRes.newlyUnlockedAchievementIds);
    newlyUnlockedRewards.push(...cityRes.newlyUnlockedRewardIds);
    newMilestoneRewardKeys.push(...cityRes.newMilestoneRewardKeys);
  }

  const now = params.facts[params.facts.length - 1]?.timestamp ?? Date.now();
  for (const achievementId of newlyUnlockedAchievements) {
    const key = `achievement:${achievementId}`;
    if (!readStateMap.has(key)) {
      readStateMap.set(key, {
        key,
        kind: 'achievement',
        targetId: achievementId,
        read: false,
        updatedAt: now,
      });
    }
  }
  for (const rewardId of newlyUnlockedRewards) {
    const key = `reward:${rewardId}`;
    if (!readStateMap.has(key)) {
      readStateMap.set(key, {
        key,
        kind: 'reward',
        targetId: rewardId,
        read: false,
        updatedAt: now,
      });
    }
  }

  return {
    evaluation: {
      applied: appliedFactCount > 0 || Boolean(params.citySnapshot),
      newlyUnlockedAchievementIds: newlyUnlockedAchievements,
      newlyUnlockedRewardIds: newlyUnlockedRewards,
      newMilestoneRewardKeys,
      totalUnlockedCount: engine.getUnlockedCount(),
      recordUpdates,
    },
    appliedFactCount,
    skippedFactCount,
  };
}

/**
 * In-memory ProfileRepository implementation with identical contract,
 * single-tab epoch enforcement, and idempotency guarantees.
 */
export class MemoryProfileRepository implements ProfileRepository {
  readonly backend = 'memory' as const;

  private profile: ProfileSettingsRecord;
  private results: RoundResultRecord[] = [];
  private achievementProgress: AchievementProgressState;
  private unlocks = new Map<string, UnlockRecord>();
  private rewards = new Map<string, RewardRecord>();
  private readState = new Map<string, ReadStateRecord>();
  private factCursors = new Map<string, number>();
  private city: CityStoreRecord | null = null;
  private economyProfile: EconomyProfileStoreRecord | null = null;
  private economyCursors = new Map<string, EconomyCursorRecord>();
  private metadata: MetadataRecord;

  constructor(initial?: Partial<ProfileSnapshot>) {
    this.profile = initial?.profile ?? createDefaultProfileSettings();
    this.results = [...(initial?.results ?? [])];
    this.achievementProgress =
      initial?.achievementProgress ?? createInitialAchievementProgress();
    if (initial?.unlocks) {
      this.unlocks = new Map(Object.entries(initial.unlocks));
    }
    if (initial?.rewards) {
      this.rewards = new Map(Object.entries(initial.rewards));
    }
    if (initial?.readState) {
      this.readState = new Map(Object.entries(initial.readState));
    }
    if (initial?.factCursors) {
      this.factCursors = new Map(Object.entries(initial.factCursors));
    }
    this.city = initial?.city ?? null;
    this.economyProfile = initial?.economyProfile ?? null;
    if (initial?.economyCursors) {
      this.economyCursors = new Map(Object.entries(initial.economyCursors));
    }
    this.metadata = initial?.metadata ?? createDefaultMetadata();
  }

  async init(tabId?: string): Promise<MetadataRecord> {
    if (tabId) {
      return this.acquireTabLock(tabId);
    }
    return { ...this.metadata };
  }

  async acquireTabLock(tabId: string): Promise<MetadataRecord> {
    this.metadata = {
      ...this.metadata,
      ownerTabId: tabId,
      writeEpoch: this.metadata.writeEpoch + 1,
    };
    return { ...this.metadata };
  }

  async loadAll(): Promise<ProfileSnapshot>;
  async loadAll(options: { includeEconomyCursors: false }): Promise<AppProfileSnapshot>;
  async loadAll(options?: { includeEconomyCursors: false }): Promise<AppProfileSnapshot> {
    const includeEconomyCursors = options?.includeEconomyCursors !== false;
    return {
      profile: { ...this.profile },
      results: this.results.map((r) => ({ ...r, wordIds: [...r.wordIds] })),
      achievementProgress: {
        ...this.achievementProgress,
        completedRoundsByOrder: { ...this.achievementProgress.completedRoundsByOrder },
        distinctCompletedWordIds: [...this.achievementProgress.distinctCompletedWordIds],
        practiceCleanCountsByWord: {
          ...this.achievementProgress.practiceCleanCountsByWord,
        },
        practiceCleanTags: [...this.achievementProgress.practiceCleanTags],
        normalCompletedCoursesWith5Words: [
          ...this.achievementProgress.normalCompletedCoursesWith5Words,
        ],
        normalMasteredCourses20Words95Acc: [
          ...this.achievementProgress.normalMasteredCourses20Words95Acc,
        ],
      },
      unlocks: Object.fromEntries(this.unlocks.entries()),
      rewards: Object.fromEntries(this.rewards.entries()),
      readState: Object.fromEntries(this.readState.entries()),
      factCursors: Object.fromEntries(this.factCursors.entries()),
      city: this.city ? { ...this.city, state: { ...this.city.state } } : null,
      economyProfile: this.economyProfile
        ? { ...this.economyProfile, state: { ...this.economyProfile.state } }
        : null,
      ...(includeEconomyCursors
        ? { economyCursors: Object.fromEntries(this.economyCursors.entries()) }
        : {}),
      metadata: { ...this.metadata },
    };
  }

  async commitTypingFacts(params: CommitFactsParams): Promise<CommitFactsResult> {
    assertLockValid(this.metadata, params.lock);

    const engine = new AchievementEngine({
      progress: this.achievementProgress,
      unlocks: Object.fromEntries(this.unlocks.entries()),
      rewards: Object.fromEntries(this.rewards.entries()),
      factCursors: Object.fromEntries(this.factCursors.entries()),
    });

    const { evaluation, appliedFactCount, skippedFactCount } = applyFactsAndCityToEngine(
      engine,
      params,
      this.readState,
    );

    const snap = engine.getSnapshot();
    this.achievementProgress = snap.progress;
    this.unlocks = new Map(Object.entries(snap.unlocks));
    this.rewards = new Map(Object.entries(snap.rewards));
    this.factCursors = new Map(Object.entries(snap.factCursors));

    if (params.roundResult) {
      this.results = [
        params.roundResult,
        ...this.results.filter((r) => r.sessionId !== params.roundResult!.sessionId),
      ]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_RECENT_RESULTS);
    }

    return {
      evaluation,
      metadata: { ...this.metadata },
      appliedFactCount,
      skippedFactCount,
    };
  }

  async commitCityEconomy(
    params: CommitCityEconomyParams,
  ): Promise<CommitCityEconomyResult> {
    assertLockValid(this.metadata, params.lock);

    const cursorKey = `${params.cityId}:${params.economyEventId}`;
    if (this.economyCursors.has(cursorKey)) {
      return {
        applied: false,
        evaluation: null,
        metadata: { ...this.metadata },
      };
    }

    this.economyCursors.set(cursorKey, {
      cursorKey,
      cityId: params.cityId,
      economyEventId: params.economyEventId,
      appliedAt: params.timestamp ?? Date.now(),
    });
    this.city = { ...params.cityRecord, state: { ...params.cityRecord.state } };
    if (params.onboarding) {
      this.profile = {
        ...this.profile,
        onboarding: params.onboarding.state,
        tutorialCompleted: params.onboarding.tutorialCompleted,
      };
    }
    if (params.economyProfileRecord) {
      this.economyProfile = {
        ...params.economyProfileRecord,
        state: { ...params.economyProfileRecord.state },
      };
    }

    let evaluation: EvaluationResult | null = null;
    if (params.cityAchievementSnapshot) {
      const engine = new AchievementEngine({
        progress: this.achievementProgress,
        unlocks: Object.fromEntries(this.unlocks.entries()),
        rewards: Object.fromEntries(this.rewards.entries()),
        factCursors: Object.fromEntries(this.factCursors.entries()),
      });
      evaluation = engine.applyCitySnapshot(
        params.cityAchievementSnapshot,
        params.timestamp ?? Date.now(),
      );
      const snap = engine.getSnapshot();
      this.unlocks = new Map(Object.entries(snap.unlocks));
      this.rewards = new Map(Object.entries(snap.rewards));
      for (const id of evaluation.newlyUnlockedAchievementIds) {
        const key = `achievement:${id}`;
        if (!this.readState.has(key)) {
          this.readState.set(key, {
            key,
            kind: 'achievement',
            targetId: id,
            read: false,
            updatedAt: params.timestamp ?? Date.now(),
          });
        }
      }
      for (const id of evaluation.newlyUnlockedRewardIds) {
        const key = `reward:${id}`;
        if (!this.readState.has(key)) {
          this.readState.set(key, {
            key,
            kind: 'reward',
            targetId: id,
            read: false,
            updatedAt: params.timestamp ?? Date.now(),
          });
        }
      }
    }

    return {
      applied: true,
      evaluation,
      metadata: { ...this.metadata },
    };
  }

  async saveProfile(
    profile: Partial<Omit<ProfileSettingsRecord, 'id'>>,
    lock: TabLockToken,
  ): Promise<ProfileSettingsRecord> {
    assertLockValid(this.metadata, lock);
    this.profile = {
      ...this.profile,
      ...profile,
      id: 'singleton',
    };
    return { ...this.profile };
  }

  async markAsRead(
    targets: { achievementIds?: string[]; rewardIds?: string[] },
    lock: TabLockToken,
    timestamp = Date.now(),
  ): Promise<void> {
    assertLockValid(this.metadata, lock);
    for (const id of targets.achievementIds ?? []) {
      this.readState.set(`achievement:${id}`, {
        key: `achievement:${id}`,
        kind: 'achievement',
        targetId: id,
        read: true,
        updatedAt: timestamp,
      });
    }
    for (const id of targets.rewardIds ?? []) {
      this.readState.set(`reward:${id}`, {
        key: `reward:${id}`,
        kind: 'reward',
        targetId: id,
        read: true,
        updatedAt: timestamp,
      });
    }
  }

  async resetData(scope: ResetScope, lock: TabLockToken): Promise<MetadataRecord> {
    assertLockValid(this.metadata, lock);

    if (scope === 'records') {
      this.results = [];
      this.achievementProgress = clearGrowthHistory(this.achievementProgress);
      this.metadata = { ...this.metadata, resetGeneration: this.metadata.resetGeneration + 1 };
    } else if (scope === 'city_and_achievements') {
      this.achievementProgress = createInitialAchievementProgress();
      this.unlocks.clear();
      this.rewards.clear();
      this.readState.clear();
      this.factCursors.clear();
      this.city = null;
      this.economyProfile = null;
      this.economyCursors.clear();
      this.metadata = {
        ...this.metadata,
        resetGeneration: this.metadata.resetGeneration + 1,
      };
    } else if (scope === 'settings') {
      this.profile = {
        ...createDefaultProfileSettings(this.profile.catalogStartedAt),
        tutorialCompleted: this.profile.tutorialCompleted,
        onboarding: this.profile.onboarding,
      };
    }

    return { ...this.metadata };
  }

  close(): void {
    // No-op for memory implementation
  }
}

function idbRequestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function idbTransactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export interface IndexedDbRepositoryOptions {
  dbName?: string;
  indexedDB?: IDBFactory;
}

/**
 * IndexedDB v4 implementation with 11 stores, atomic readwrite transactions,
 * single-tab ownerTabId + writeEpoch lock, and tx.oncomplete confirmation.
 */
export class IndexedDbProfileRepository implements ProfileRepository {
  readonly backend = 'indexeddb' as const;
  private readonly dbName: string;
  private readonly idbFactory: IDBFactory;
  private db: IDBDatabase | null = null;

  constructor(options: IndexedDbRepositoryOptions = {}) {
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory) {
      throw new Error('IndexedDB is not available in this environment');
    }
    this.dbName = options.dbName ?? PROFILE_DB_NAME;
    this.idbFactory = factory;
  }

  async init(tabId?: string): Promise<MetadataRecord> {
    if (!this.db) {
      this.db = await this.openDatabase();
    }
    await this.ensureSingletonDefaults();
    if (tabId) {
      return this.acquireTabLock(tabId);
    }
    const tx = this.db.transaction(['metadata'], 'readonly');
    const existing = (await idbRequestToPromise(
      tx.objectStore('metadata').get('singleton'),
    )) as MetadataRecord | undefined;
    await idbTransactionDone(tx);
    return existing ?? createDefaultMetadata();
  }

  async acquireTabLock(tabId: string): Promise<MetadataRecord> {
    const db = this.requireDb();
    const tx = db.transaction(['metadata'], 'readwrite');
    const store = tx.objectStore('metadata');
    const current =
      ((await idbRequestToPromise(store.get('singleton'))) as
        | MetadataRecord
        | undefined) ?? createDefaultMetadata();

    const updated: MetadataRecord = {
      ...current,
      ownerTabId: tabId,
      writeEpoch: current.writeEpoch + 1,
    };
    store.put(updated);
    await idbTransactionDone(tx);
    return updated;
  }

  async loadAll(): Promise<ProfileSnapshot>;
  async loadAll(options: { includeEconomyCursors: false }): Promise<AppProfileSnapshot>;
  async loadAll(options?: { includeEconomyCursors: false }): Promise<AppProfileSnapshot> {
    const includeEconomyCursors = options?.includeEconomyCursors !== false;
    const db = this.requireDb();
    const tx = db.transaction([...STORE_NAMES], 'readonly');

    const [
      profileRaw,
      resultsRaw,
      progressRaw,
      unlocksRaw,
      rewardsRaw,
      readStateRaw,
      factCursorsRaw,
      cityRaw,
      economyProfileRaw,
      economyCursorsRaw,
      metadataRaw,
    ] = await Promise.all([
      idbRequestToPromise(tx.objectStore('profile').get('singleton')),
      idbRequestToPromise(tx.objectStore('results').getAll()),
      idbRequestToPromise(tx.objectStore('achievementProgress').get('singleton')),
      idbRequestToPromise(tx.objectStore('unlocks').getAll()),
      idbRequestToPromise(tx.objectStore('rewards').getAll()),
      idbRequestToPromise(tx.objectStore('readState').getAll()),
      idbRequestToPromise(tx.objectStore('factCursors').getAll()),
      idbRequestToPromise(tx.objectStore('city').get('current')),
      idbRequestToPromise(tx.objectStore('economyProfile').get('singleton')),
      includeEconomyCursors
        ? idbRequestToPromise(tx.objectStore('economyCursors').getAll())
        : undefined,
      idbRequestToPromise(tx.objectStore('metadata').get('singleton')),
    ]);

    await idbTransactionDone(tx);

    const unlocks: Record<string, UnlockRecord> = {};
    for (const u of unlocksRaw as UnlockRecord[]) {
      unlocks[u.achievementId] = u;
    }

    const rewards: Record<string, RewardRecord> = {};
    for (const r of rewardsRaw as RewardRecord[]) {
      rewards[r.rewardId] = r;
    }

    const readState: Record<string, ReadStateRecord> = {};
    for (const rs of readStateRaw as ReadStateRecord[]) {
      readState[rs.key] = rs;
    }

    const factCursors: Record<string, number> = {};
    for (const fc of factCursorsRaw as FactCursorRecord[]) {
      factCursors[fc.sessionId] = fc.lastFactSequence;
    }

    const economyCursors: Record<string, EconomyCursorRecord> = {};
    for (const ec of (economyCursorsRaw ?? []) as EconomyCursorRecord[]) {
      economyCursors[ec.cursorKey] = ec;
    }

    const results = (resultsRaw as RoundResultRecord[]).sort(
      (a, b) => b.timestamp - a.timestamp,
    );

    const progressWrapper = progressRaw as
      | { id: 'singleton'; state: AchievementProgressState }
      | undefined;

    return {
      profile: (profileRaw as ProfileSettingsRecord | undefined) ?? createDefaultProfileSettings(),
      results,
      achievementProgress: progressWrapper?.state ?? createInitialAchievementProgress(),
      unlocks,
      rewards,
      readState,
      factCursors,
      city: (cityRaw as CityStoreRecord | undefined) ?? null,
      economyProfile: (economyProfileRaw as EconomyProfileStoreRecord | undefined) ?? null,
      ...(includeEconomyCursors ? { economyCursors } : {}),
      metadata: (metadataRaw as MetadataRecord | undefined) ?? createDefaultMetadata(),
    };
  }

  async commitTypingFacts(params: CommitFactsParams): Promise<CommitFactsResult> {
    const db = this.requireDb();
    const stores: StoreName[] = [
      'metadata',
      'achievementProgress',
      'unlocks',
      'rewards',
      'readState',
      'factCursors',
      'results',
    ];
    const tx = db.transaction(stores, 'readwrite');

    const metadata =
      ((await idbRequestToPromise(tx.objectStore('metadata').get('singleton'))) as
        | MetadataRecord
        | undefined) ?? createDefaultMetadata();

    try {
      assertLockValid(metadata, params.lock);
    } catch (err) {
      tx.abort();
      throw err;
    }

    const [progressWrapper, unlocksRaw, rewardsRaw, readStateRaw, factCursorsRaw] =
      await Promise.all([
        idbRequestToPromise(tx.objectStore('achievementProgress').get('singleton')),
        idbRequestToPromise(tx.objectStore('unlocks').getAll()),
        idbRequestToPromise(tx.objectStore('rewards').getAll()),
        idbRequestToPromise(tx.objectStore('readState').getAll()),
        idbRequestToPromise(tx.objectStore('factCursors').getAll()),
      ]);

    const existingUnlocks: Record<string, UnlockRecord> = {};
    for (const u of unlocksRaw as UnlockRecord[]) {
      existingUnlocks[u.achievementId] = u;
    }
    const existingRewards: Record<string, RewardRecord> = {};
    for (const r of rewardsRaw as RewardRecord[]) {
      existingRewards[r.rewardId] = r;
    }
    const readStateMap = new Map<string, ReadStateRecord>();
    for (const rs of readStateRaw as ReadStateRecord[]) {
      readStateMap.set(rs.key, rs);
    }
    const existingFactCursors: Record<string, number> = {};
    for (const fc of factCursorsRaw as FactCursorRecord[]) {
      existingFactCursors[fc.sessionId] = fc.lastFactSequence;
    }

    const engine = new AchievementEngine({
      progress:
        (progressWrapper as { id: 'singleton'; state: AchievementProgressState } | undefined)
          ?.state ?? createInitialAchievementProgress(),
      unlocks: existingUnlocks,
      rewards: existingRewards,
      factCursors: existingFactCursors,
    });

    const { evaluation, appliedFactCount, skippedFactCount } = applyFactsAndCityToEngine(
      engine,
      params,
      readStateMap,
    );

    const nextSnap: AchievementEngineSnapshot = engine.getSnapshot();

    tx.objectStore('achievementProgress').put({
      id: 'singleton',
      state: nextSnap.progress,
    });

    const unlockStore = tx.objectStore('unlocks');
    for (const id of evaluation.newlyUnlockedAchievementIds) {
      const rec = nextSnap.unlocks[id];
      if (rec) {
        unlockStore.put(rec);
      }
    }

    const rewardStore = tx.objectStore('rewards');
    for (const id of evaluation.newlyUnlockedRewardIds) {
      const rec = nextSnap.rewards[id];
      if (rec) {
        rewardStore.put(rec);
      }
    }

    const readStore = tx.objectStore('readState');
    for (const id of evaluation.newlyUnlockedAchievementIds) {
      const rec = readStateMap.get(`achievement:${id}`);
      if (rec) {
        readStore.put(rec);
      }
    }
    for (const id of evaluation.newlyUnlockedRewardIds) {
      const rec = readStateMap.get(`reward:${id}`);
      if (rec) {
        readStore.put(rec);
      }
    }

    const cursorStore = tx.objectStore('factCursors');
    for (const [sessionId, lastFactSequence] of Object.entries(nextSnap.factCursors)) {
      if (existingFactCursors[sessionId] !== lastFactSequence) {
        cursorStore.put({ sessionId, lastFactSequence } satisfies FactCursorRecord);
      }
    }

    if (params.roundResult) {
      const resultsStore = tx.objectStore('results');
      resultsStore.put(params.roundResult);
      const allResults = (await idbRequestToPromise(
        resultsStore.getAll(),
      )) as RoundResultRecord[];
      allResults.sort((a, b) => b.timestamp - a.timestamp);
      for (const stale of allResults.slice(MAX_RECENT_RESULTS)) {
        resultsStore.delete(stale.sessionId);
      }
    }

    await idbTransactionDone(tx);

    return {
      evaluation,
      metadata,
      appliedFactCount,
      skippedFactCount,
    };
  }

  async commitCityEconomy(
    params: CommitCityEconomyParams,
  ): Promise<CommitCityEconomyResult> {
    const db = this.requireDb();
    const stores: StoreName[] = [
      'metadata',
      'city',
      'economyProfile',
      'economyCursors',
      'achievementProgress',
      'unlocks',
      'rewards',
      'readState',
    ];
    if (params.onboarding) {
      stores.push('profile');
    }
    const tx = db.transaction(stores, 'readwrite');

    const metadata =
      ((await idbRequestToPromise(tx.objectStore('metadata').get('singleton'))) as
        | MetadataRecord
        | undefined) ?? createDefaultMetadata();

    try {
      assertLockValid(metadata, params.lock);
    } catch (err) {
      tx.abort();
      throw err;
    }

    const cursorKey = `${params.cityId}:${params.economyEventId}`;
    const existingCursor = await idbRequestToPromise(
      tx.objectStore('economyCursors').get(cursorKey),
    );
    if (existingCursor) {
      await idbTransactionDone(tx);
      return {
        applied: false,
        evaluation: null,
        metadata,
      };
    }

    const now = params.timestamp ?? Date.now();
    tx.objectStore('economyCursors').put({
      cursorKey,
      cityId: params.cityId,
      economyEventId: params.economyEventId,
      appliedAt: now,
    } satisfies EconomyCursorRecord);
    tx.objectStore('city').put(params.cityRecord);
    if (params.onboarding) {
      const profileStore = tx.objectStore('profile');
      const current = (await idbRequestToPromise(profileStore.get('singleton'))) as
        | ProfileSettingsRecord
        | undefined;
      profileStore.put({
        ...(current ?? createDefaultProfileSettings()),
        onboarding: params.onboarding.state,
        tutorialCompleted: params.onboarding.tutorialCompleted,
      } satisfies ProfileSettingsRecord);
    }
    if (params.economyProfileRecord) {
      tx.objectStore('economyProfile').put(params.economyProfileRecord);
    }

    let evaluation: EvaluationResult | null = null;
    if (params.cityAchievementSnapshot) {
      const [progressWrapper, unlocksRaw, rewardsRaw, readStateRaw] = await Promise.all([
        idbRequestToPromise(tx.objectStore('achievementProgress').get('singleton')),
        idbRequestToPromise(tx.objectStore('unlocks').getAll()),
        idbRequestToPromise(tx.objectStore('rewards').getAll()),
        idbRequestToPromise(tx.objectStore('readState').getAll()),
      ]);

      const existingUnlocks: Record<string, UnlockRecord> = {};
      for (const u of unlocksRaw as UnlockRecord[]) {
        existingUnlocks[u.achievementId] = u;
      }
      const existingRewards: Record<string, RewardRecord> = {};
      for (const r of rewardsRaw as RewardRecord[]) {
        existingRewards[r.rewardId] = r;
      }
      const readStateMap = new Map<string, ReadStateRecord>();
      for (const rs of readStateRaw as ReadStateRecord[]) {
        readStateMap.set(rs.key, rs);
      }

      const engine = new AchievementEngine({
        progress:
          (
            progressWrapper as
              | { id: 'singleton'; state: AchievementProgressState }
              | undefined
          )?.state ?? createInitialAchievementProgress(),
        unlocks: existingUnlocks,
        rewards: existingRewards,
      });

      evaluation = engine.applyCitySnapshot(params.cityAchievementSnapshot, now);
      const nextSnap = engine.getSnapshot();

      const unlockStore = tx.objectStore('unlocks');
      const rewardStore = tx.objectStore('rewards');
      const readStore = tx.objectStore('readState');

      for (const id of evaluation.newlyUnlockedAchievementIds) {
        const rec = nextSnap.unlocks[id];
        if (rec) unlockStore.put(rec);
        const key = `achievement:${id}`;
        if (!readStateMap.has(key)) {
          readStore.put({
            key,
            kind: 'achievement',
            targetId: id,
            read: false,
            updatedAt: now,
          } satisfies ReadStateRecord);
        }
      }
      for (const id of evaluation.newlyUnlockedRewardIds) {
        const rec = nextSnap.rewards[id];
        if (rec) rewardStore.put(rec);
        const key = `reward:${id}`;
        if (!readStateMap.has(key)) {
          readStore.put({
            key,
            kind: 'reward',
            targetId: id,
            read: false,
            updatedAt: now,
          } satisfies ReadStateRecord);
        }
      }
    }

    await idbTransactionDone(tx);
    return {
      applied: true,
      evaluation,
      metadata,
    };
  }

  async saveProfile(
    profile: Partial<Omit<ProfileSettingsRecord, 'id'>>,
    lock: TabLockToken,
  ): Promise<ProfileSettingsRecord> {
    const db = this.requireDb();
    const tx = db.transaction(['metadata', 'profile'], 'readwrite');
    const metadata =
      ((await idbRequestToPromise(tx.objectStore('metadata').get('singleton'))) as
        | MetadataRecord
        | undefined) ?? createDefaultMetadata();

    try {
      assertLockValid(metadata, lock);
    } catch (err) {
      tx.abort();
      throw err;
    }

    const current =
      ((await idbRequestToPromise(tx.objectStore('profile').get('singleton'))) as
        | ProfileSettingsRecord
        | undefined) ?? createDefaultProfileSettings();
    const updated: ProfileSettingsRecord = {
      ...current,
      ...profile,
      id: 'singleton',
    };
    tx.objectStore('profile').put(updated);
    await idbTransactionDone(tx);
    return updated;
  }

  async markAsRead(
    targets: { achievementIds?: string[]; rewardIds?: string[] },
    lock: TabLockToken,
    timestamp = Date.now(),
  ): Promise<void> {
    const db = this.requireDb();
    const tx = db.transaction(['metadata', 'readState'], 'readwrite');
    const metadata =
      ((await idbRequestToPromise(tx.objectStore('metadata').get('singleton'))) as
        | MetadataRecord
        | undefined) ?? createDefaultMetadata();

    try {
      assertLockValid(metadata, lock);
    } catch (err) {
      tx.abort();
      throw err;
    }

    const store = tx.objectStore('readState');
    for (const id of targets.achievementIds ?? []) {
      store.put({
        key: `achievement:${id}`,
        kind: 'achievement',
        targetId: id,
        read: true,
        updatedAt: timestamp,
      } satisfies ReadStateRecord);
    }
    for (const id of targets.rewardIds ?? []) {
      store.put({
        key: `reward:${id}`,
        kind: 'reward',
        targetId: id,
        read: true,
        updatedAt: timestamp,
      } satisfies ReadStateRecord);
    }

    await idbTransactionDone(tx);
  }

  async resetData(scope: ResetScope, lock: TabLockToken): Promise<MetadataRecord> {
    const db = this.requireDb();
    const tx = db.transaction([...STORE_NAMES], 'readwrite');

    const metadata =
      ((await idbRequestToPromise(tx.objectStore('metadata').get('singleton'))) as
        | MetadataRecord
        | undefined) ?? createDefaultMetadata();

    try {
      assertLockValid(metadata, lock);
    } catch (err) {
      tx.abort();
      throw err;
    }

    let updatedMetadata = metadata;

    if (scope === 'records') {
      const progressStore = tx.objectStore('achievementProgress');
      const progress = await idbRequestToPromise(progressStore.get('singleton')) as
        { id: 'singleton'; state: AchievementProgressState } | undefined;
      tx.objectStore('results').clear();
      if (progress?.state.series) {
        progressStore.put({ id: 'singleton', state: clearGrowthHistory(progress.state) });
      }
      updatedMetadata = { ...metadata, resetGeneration: metadata.resetGeneration + 1 };
      tx.objectStore('metadata').put(updatedMetadata);
    } else if (scope === 'city_and_achievements') {
      tx.objectStore('achievementProgress').put({
        id: 'singleton',
        state: createInitialAchievementProgress(),
      });
      tx.objectStore('unlocks').clear();
      tx.objectStore('rewards').clear();
      tx.objectStore('readState').clear();
      tx.objectStore('factCursors').clear();
      tx.objectStore('city').clear();
      tx.objectStore('economyProfile').clear();
      tx.objectStore('economyCursors').clear();

      updatedMetadata = {
        ...metadata,
        resetGeneration: metadata.resetGeneration + 1,
      };
      tx.objectStore('metadata').put(updatedMetadata);
    } else if (scope === 'settings') {
      const current =
        ((await idbRequestToPromise(tx.objectStore('profile').get('singleton'))) as
          | ProfileSettingsRecord
          | undefined) ?? createDefaultProfileSettings();
      tx.objectStore('profile').put(
        {
          ...createDefaultProfileSettings(current.catalogStartedAt),
          tutorialCompleted: current.tutorialCompleted,
          onboarding: current.onboarding,
        },
      );
    }

    await idbTransactionDone(tx);
    return updatedMetadata;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private requireDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('IndexedDbProfileRepository is not initialized. Call init() first.');
    }
    return this.db;
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = this.idbFactory.open(this.dbName, PROFILE_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        const keyPaths: Record<StoreName, string> = {
          profile: 'id',
          results: 'sessionId',
          achievementProgress: 'id',
          unlocks: 'achievementId',
          rewards: 'rewardId',
          readState: 'key',
          factCursors: 'sessionId',
          city: 'id',
          economyProfile: 'id',
          economyCursors: 'cursorKey',
          metadata: 'id',
        };
        for (const storeName of STORE_NAMES) {
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: keyPaths[storeName] });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    });
  }

  private async ensureSingletonDefaults(): Promise<void> {
    const db = this.requireDb();
    const tx = db.transaction(
      ['profile', 'achievementProgress', 'metadata'],
      'readwrite',
    );
    const profileStore = tx.objectStore('profile');
    const progressStore = tx.objectStore('achievementProgress');
    const metaStore = tx.objectStore('metadata');

    const [profile, progress, metadata] = await Promise.all([
      idbRequestToPromise(profileStore.get('singleton')),
      idbRequestToPromise(progressStore.get('singleton')),
      idbRequestToPromise(metaStore.get('singleton')),
    ]);

    if (!profile) {
      profileStore.put(createDefaultProfileSettings());
    }
    if (!progress) {
      progressStore.put({ id: 'singleton', state: createInitialAchievementProgress() });
    }
    if (!metadata) {
      metaStore.put(createDefaultMetadata());
    }

    await idbTransactionDone(tx);
  }
}

/**
 * Creates an IndexedDbProfileRepository when IndexedDB is available and opens cleanly,
 * otherwise falls back gracefully to MemoryProfileRepository.
 */
export async function createProfileRepository(
  options: IndexedDbRepositoryOptions & { tabId?: string } = {},
): Promise<{ repository: ProfileRepository; metadata: MetadataRecord }> {
  const idb = options.indexedDB ?? globalThis.indexedDB;
  if (idb) {
    try {
      const repo = new IndexedDbProfileRepository({
        dbName: options.dbName,
        indexedDB: idb,
      });
      const metadata = await repo.init(options.tabId);
      return { repository: repo, metadata };
    } catch {
      // Graceful fallback to MemoryProfileRepository when IndexedDB cannot open
    }
  }
  const memoryRepo = new MemoryProfileRepository();
  const metadata = await memoryRepo.init(options.tabId);
  return { repository: memoryRepo, metadata };
}
