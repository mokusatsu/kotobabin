import { describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import type { WordCompletedFact } from '@/contracts/types';
import { AchievementEngine } from '@/progression/achievementEngine';
import {
  IndexedDbProfileRepository,
  MemoryProfileRepository,
  PROFILE_DB_VERSION,
  ResetGenerationError,
  STORE_NAMES,
  TabLockError,
  createProfileRepository,
} from '@/progression/profileRepository';

function makeFact(seq: number, sessionId = 'session-1'): WordCompletedFact {
  return {
    type: 'WordCompleted',
    sessionId,
    factSequence: seq,
    mode: 'MAIN',
    ruleVersion: '1.0.0',
    timestamp: 1000 + seq,
    wordId: `daily_r0${seq}`,
    topicId: 'daily',
    tags: [],
    canonicalLength: 6,
    mistakes: 0,
    wordPosition: seq,
  };
}

describe('ProfileRepository (IndexedDB v4 & Memory fallback)', () => {
  it('keeps mastery and round delivery observations through partial commits and retry', async () => {
    const idb = new IDBFactory();
    const repo = new IndexedDbProfileRepository({ dbName: 'series-progress', indexedDB: idb });
    const meta = await repo.init('series-tab');
    const lock = { tabId: meta.ownerTabId, writeEpoch: meta.writeEpoch };
    const first = { ...makeFact(1), inputElapsedMs: 700 };
    await repo.commitTypingFacts({ lock, facts: [first, {
      ...first, type: 'DeliveryCommitted', factSequence: 2,
      reason: 'manual', cargoCount: 1, bonus: 10, precedingWordPosition: 1,
    }] });
    await repo.commitTypingFacts({ lock, facts: [first, {
      ...first, factSequence: 3, wordPosition: 2, inputElapsedMs: 600,
    }, {
      ...first, type: 'RoundFinished', factSequence: 4, elapsedMs: 90_000,
      courseId: 'relaxed', districtId: 'residential', completed: true, completedWordCount: 2,
      correctKeyCount: 12, mistakeCount: 0, totalCanonicalLength: 12, score: 130,
      baseScore: 120, deliveryBonus: 10, longestCleanStreak: 2, rescueUsed: false, skips: 0, guideUsed: true,
    }] });
    await repo.commitTypingFacts({ lock, facts: [{ ...first, sessionId: 'practice-1', mode: 'PRACTICE', inputElapsedMs: 800 }] });
    repo.close();

    const reopened = new IndexedDbProfileRepository({ dbName: 'series-progress', indexedDB: idb });
    await reopened.init();
    const snapshot = await reopened.loadAll();
    const achievement = new AchievementEngine({ progress: snapshot.achievementProgress, unlocks: snapshot.unlocks });
    expect(achievement.getWordMastery('daily_r01')).toEqual({ cleanSessions: 2, bestMs: 600 });
    expect(achievement.getSeriesMetric('cargo_residential')).toBe(1);
    expect(snapshot.unlocks['series-manual_1-1']).toBeDefined();
    expect(snapshot.readState['achievement:series-manual_1-1']?.read).toBe(false);
    reopened.close();
  });

  it('creates IndexedDB v4 with all 11 stores and persists round-trip data', async () => {
    const idb = new IDBFactory();
    const dbName = 'kotobabin-test-roundtrip';

    const repo1 = new IndexedDbProfileRepository({ dbName, indexedDB: idb });
    const meta1 = await repo1.init('tab-1');
    expect(meta1.schemaVersion).toBe(PROFILE_DB_VERSION);
    expect(meta1.ownerTabId).toBe('tab-1');
    expect(meta1.writeEpoch).toBe(1);

    // Verify all 11 stores exist
    const checkDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = idb.open(dbName, PROFILE_DB_VERSION);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    for (const storeName of STORE_NAMES) {
      expect(checkDb.objectStoreNames.contains(storeName)).toBe(true);
    }
    expect(checkDb.objectStoreNames.length).toBe(11);
    checkDb.close();

    // Commit fact and profile update
    const lock = {
      tabId: meta1.ownerTabId,
      writeEpoch: meta1.writeEpoch,
      resetGeneration: meta1.resetGeneration,
    };

    const commitRes = await repo1.commitTypingFacts({
      lock,
      facts: [makeFact(1)],
    });
    expect(commitRes.appliedFactCount).toBe(1);
    expect(commitRes.evaluation.newlyUnlockedAchievementIds).toContain('A01');

    await repo1.saveProfile({ volume: 0.4, fontSize: 'large' }, lock);
    await repo1.markAsRead({ achievementIds: ['A01'] }, lock, 5000);
    repo1.close();

    // Reopen with a new repository instance and verify round-trip
    const repo2 = new IndexedDbProfileRepository({ dbName, indexedDB: idb });
    await repo2.init();
    const snapshot = await repo2.loadAll();

    expect(snapshot.profile.volume).toBe(0.4);
    expect(snapshot.profile.fontSize).toBe('large');
    expect(snapshot.achievementProgress.lifetimeCompletedWords).toBe(1);
    expect(snapshot.unlocks.A01).toBeDefined();
    expect(snapshot.readState['achievement:A01']?.read).toBe(true);
    expect(snapshot.factCursors['session-1']).toBe(1);
    repo2.close();
  });

  it('enforces atomic factCursors & economyCursors idempotency', async () => {
    const idb = new IDBFactory();
    const repo = new IndexedDbProfileRepository({
      dbName: 'kotobabin-test-idempotency',
      indexedDB: idb,
    });
    const meta = await repo.init('tab-a');
    const lock = { tabId: meta.ownerTabId, writeEpoch: meta.writeEpoch };

    const first = await repo.commitTypingFacts({
      lock,
      facts: [makeFact(1), makeFact(2)],
    });
    expect(first.appliedFactCount).toBe(2);
    expect(first.skippedFactCount).toBe(0);

    // Replay fact 1 & 2 along with new fact 3
    const replay = await repo.commitTypingFacts({
      lock,
      facts: [makeFact(1), makeFact(2), makeFact(3)],
    });
    expect(replay.appliedFactCount).toBe(1);
    expect(replay.skippedFactCount).toBe(2);

    const snapshot = await repo.loadAll();
    expect(snapshot.achievementProgress.lifetimeCompletedWords).toBe(3);
    expect(snapshot.factCursors['session-1']).toBe(3);

    // Economy cursor idempotency
    const econ1 = await repo.commitCityEconomy({
      lock,
      cityId: 'city-1',
      economyEventId: 'ev-1',
      cityRecord: {
        id: 'current',
        cityId: 'city-1',
        state: { coins: 100 },
        revision: 1,
        updatedAt: 1000,
      },
    });
    expect(econ1.applied).toBe(true);

    const econDup = await repo.commitCityEconomy({
      lock,
      cityId: 'city-1',
      economyEventId: 'ev-1',
      cityRecord: {
        id: 'current',
        cityId: 'city-1',
        state: { coins: 999 },
        revision: 2,
        updatedAt: 2000,
      },
    });
    expect(econDup.applied).toBe(false);

    const afterEcon = await repo.loadAll();
    expect(afterEcon.city?.state.coins).toBe(100);
    repo.close();
  });

  it.each(['indexeddb', 'memory'])('skips economy cursor materialization for routine %s snapshots without weakening deduplication', async (backend) => {
    const repo = backend === 'indexeddb'
      ? new IndexedDbProfileRepository({ dbName: 'cursor-projection', indexedDB: new IDBFactory() })
      : new MemoryProfileRepository();
    const { writeEpoch, resetGeneration } = await repo.init('projection-tab');
    const lock = { tabId: 'projection-tab', writeEpoch, resetGeneration };
    const params = {
      lock,
      cityId: 'city-1',
      economyEventId: 'auto-1',
      cityRecord: {
        id: 'current' as const,
        cityId: 'city-1',
        state: { coins: 100 },
        revision: 1,
        updatedAt: 1000,
      },
    };
    await repo.commitTypingFacts({ lock, facts: [makeFact(1)] });
    expect((await repo.commitCityEconomy(params)).applied).toBe(true);

    const storeRead = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    const cursorBulkReads = () => storeRead.mock.contexts.filter(
      (store) => (store as IDBObjectStore).name === 'economyCursors',
    ).length;
    try {
      const projected = await repo.loadAll({ includeEconomyCursors: false });
      expect(projected).not.toHaveProperty('economyCursors');
      expect(cursorBulkReads()).toBe(0);
      expect((await repo.commitCityEconomy({
        ...params,
        cityRecord: { ...params.cityRecord, state: { coins: 999 }, revision: 2 },
      })).applied).toBe(false);

      const { economyCursors, ...full } = await repo.loadAll();
      expect(cursorBulkReads()).toBe(backend === 'indexeddb' ? 1 : 0);
      expect(full).toEqual(projected);
      expect(full.city?.state.coins).toBe(100);
      expect(economyCursors['city-1:auto-1']).toMatchObject({ economyEventId: 'auto-1' });
    } finally {
      storeRead.mockRestore();
      repo.close();
    }
  });

  it.each(['indexeddb', 'memory'])('resets the growth baseline without losing earned progress (%s)', async (backend) => {
    const indexedDB = new IDBFactory();
    const open = () => new IndexedDbProfileRepository({ dbName: 'growth-reset', indexedDB });
    let repo = backend === 'indexeddb' ? open() : new MemoryProfileRepository();
    const { ownerTabId, writeEpoch, resetGeneration } = await repo.init('growth-tab');
    let lock = { tabId: ownerTabId, writeEpoch, resetGeneration };
    const run = (sessionId: string, length: number, score: number) => {
      const comparisonKey = 'same-order-v1';
      const result = {
        sessionId, timestamp: length, comparisonKey, courseId: 'relaxed' as const,
        planId: 'plan', ruleVersion: '1.0.0', wordIds: ['daily_r01'],
        completed: true, completedWordCount: 10, correctKeyCount: length, mistakeCount: 0,
        totalCanonicalLength: length, score, canonicalKpm: length * 2 / 3, rescueUsed: false,
        guideUsed: true,
      };
      return repo.commitTypingFacts({
        lock,
        facts: [
          { ...makeFact(1, sessionId), inputElapsedMs: 700 },
          { ...result, type: 'RoundFinished', mode: 'MAIN', factSequence: 2, elapsedMs: 90_000,
            districtId: 'residential', baseScore: score, deliveryBonus: 0, longestCleanStreak: 10, skips: 0 },
        ],
        roundResult: result,
      });
    };

    expect((await run('old-first', 60, 100)).evaluation.recordUpdates).toEqual({ speed: false, score: false });
    expect((await run('old-pb', 75, 150)).evaluation.recordUpdates).toEqual({ speed: true, score: true });
    const before = await repo.loadAll();
    expect(before.results).toHaveLength(2);
    expect(before.unlocks['series-score_pb-1']).toBeDefined();
    expect(Object.keys(before.rewards).length).toBeGreaterThan(0);
    const resetMeta = await repo.resetData('records', lock);
    expect(resetMeta.resetGeneration).toBe(lock.resetGeneration + 1);
    if (backend === 'indexeddb') {
      repo.close();
      repo = open();
      await repo.init();
    }
    const after = await repo.loadAll();
    expect(after.results).toEqual([]);
    const { series: oldSeries, ...oldProgress } = before.achievementProgress;
    const { series: newSeries, ...newProgress } = after.achievementProgress;
    expect(newProgress).toEqual(oldProgress);
    expect(after.unlocks).toEqual(before.unlocks);
    expect(after.rewards).toEqual(before.rewards);
    expect(after.readState).toEqual(before.readState);
    expect(after.factCursors).toEqual(before.factCursors);
    expect(after.metadata.resetGeneration).toBe(resetMeta.resetGeneration);
    await expect(run('old-pb', 75, 150)).rejects.toThrow(ResetGenerationError);
    expect((await repo.loadAll()).results).toEqual([]);
    lock = { ...lock, resetGeneration: resetMeta.resetGeneration };

    expect((await run('new-first', 90, 200)).evaluation.recordUpdates).toEqual({ speed: false, score: false });
    expect(newSeries).toEqual({ ...oldSeries, records: {} });
    expect((await run('new-pb', 105, 250)).evaluation.recordUpdates).toEqual({ speed: true, score: true });
    const latest = await repo.loadAll();
    expect(Object.values(latest.achievementProgress.series!.records)).toEqual([
      { length: 105, score: 250, speedUpdates: 1, scoreUpdates: 1 },
    ]);
    repo.close();
  });

  it('rejects stale tab writes when another tab acquires the single-tab lock', async () => {
    const idb = new IDBFactory();
    const dbName = 'kotobabin-test-tab-lock';

    const tab1 = new IndexedDbProfileRepository({ dbName, indexedDB: idb });
    const meta1 = await tab1.init('tab-1');
    const lock1 = { tabId: 'tab-1', writeEpoch: meta1.writeEpoch };

    // Tab 2 takes over ownership -> writeEpoch increments to 2
    const tab2 = new IndexedDbProfileRepository({ dbName, indexedDB: idb });
    const meta2 = await tab2.init('tab-2');
    expect(meta2.ownerTabId).toBe('tab-2');
    expect(meta2.writeEpoch).toBe(2);

    // Tab 1's stale write must be rejected
    await expect(
      tab1.commitTypingFacts({ lock: lock1, facts: [makeFact(1)] }),
    ).rejects.toThrow(TabLockError);

    await expect(tab1.saveProfile({ volume: 0.1 }, lock1)).rejects.toThrow(TabLockError);

    // Tab 2's write succeeds
    const res2 = await tab2.commitTypingFacts({
      lock: { tabId: 'tab-2', writeEpoch: meta2.writeEpoch },
      facts: [makeFact(1)],
    });
    expect(res2.appliedFactCount).toBe(1);

    tab1.close();
    tab2.close();
  });

  it('rejects stale resetGeneration after city_and_achievements reset', async () => {
    const idb = new IDBFactory();
    const repo = new IndexedDbProfileRepository({
      dbName: 'kotobabin-test-reset-gen',
      indexedDB: idb,
    });
    const meta1 = await repo.init('tab-1');
    const staleLock = {
      tabId: 'tab-1',
      writeEpoch: meta1.writeEpoch,
      resetGeneration: meta1.resetGeneration,
    };

    await repo.commitTypingFacts({ lock: staleLock, facts: [makeFact(1)] });
    const meta2 = await repo.resetData('city_and_achievements', staleLock);
    expect(meta2.resetGeneration).toBe(meta1.resetGeneration + 1);

    await expect(
      repo.commitTypingFacts({ lock: staleLock, facts: [makeFact(2)] }),
    ).rejects.toThrow(ResetGenerationError);

    const snapshot = await repo.loadAll();
    expect(snapshot.achievementProgress.lifetimeCompletedWords).toBe(0);
    expect(snapshot.unlocks).toEqual({});
    repo.close();
  });

  it('falls back gracefully to MemoryProfileRepository when IndexedDB is unavailable or fails', async () => {
    const { repository: memRepo, metadata } = await createProfileRepository({
      indexedDB: undefined,
      tabId: 'mem-tab',
    });
    expect(memRepo.backend).toBe('memory');
    expect(memRepo).toBeInstanceOf(MemoryProfileRepository);
    expect(metadata.ownerTabId).toBe('mem-tab');

    const res = await memRepo.commitTypingFacts({
      lock: { tabId: 'mem-tab', writeEpoch: metadata.writeEpoch },
      facts: [makeFact(1)],
    });
    expect(res.appliedFactCount).toBe(1);
    expect(res.evaluation.newlyUnlockedAchievementIds).toContain('A01');

    // Also test failing IDBFactory.open
    const brokenIdb = {
      open: () => {
        throw new Error('IDB blocked');
      },
    } as unknown as IDBFactory;

    const fallback = await createProfileRepository({
      indexedDB: brokenIdb,
      tabId: 'fallback-tab',
    });
    expect(fallback.repository.backend).toBe('memory');
  });
});
