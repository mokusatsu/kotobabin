// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROMAJI_RULES, WORDS_DATA } from '@/contracts/data';
import type { RoundFinishedFact } from '@/contracts/types';
import { IndexedDbProfileRepository, MAX_RECENT_RESULTS, type RoundResultRecord } from '@/progression/profileRepository';
import { GENERATOR_VERSION } from '@/typing/courseGenerator';
import { AppController } from '@/ui/appController';

describe('durable comparison records', () => {
  let app: AppController | undefined;
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });
  afterEach(() => {
    app?.destroy();
    app = undefined;
    window.localStorage.clear();
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the best saved same-condition round even after that detail ages out, then clears it on record reset', async () => {
    const courseId = 'relaxed';
    const seed = 123;
    const comparisonKey = `${courseId}:${GENERATOR_VERSION}:${WORDS_DATA.contentVersion}:${seed}`;
    const planId = `${courseId}:${seed}`;
    const repo = new IndexedDbProfileRepository();
    const meta = await repo.init('seed');
    const lock = { tabId: meta.ownerTabId, writeEpoch: meta.writeEpoch, resetGeneration: meta.resetGeneration };
    const start = Date.now();
    async function saveRound(number: number, score: number, totalCanonicalLength: number, guideUsed = true) {
      const sessionId = `fixture-${number}`;
      const result: RoundResultRecord = {
        sessionId, timestamp: start + number, courseId, comparisonKey, planId,
        wordIds: [], ruleVersion: ROMAJI_RULES.inputRuleVersion,
        completed: true, completedWordCount: 10, correctKeyCount: totalCanonicalLength, mistakeCount: 0,
        totalCanonicalLength, score, canonicalKpm: totalCanonicalLength * 2 / 3,
        rescueUsed: false, guideUsed,
      };
      const fact: RoundFinishedFact = {
        ...result, type: 'RoundFinished', mode: 'MAIN', factSequence: 1, districtId: 'residential',
        elapsedMs: 90_000, baseScore: score, deliveryBonus: 0, longestCleanStreak: 10, skips: 0,
      };
      await repo.commitTypingFacts({ lock, facts: [fact], roundResult: result });
    }
    try {
      await saveRound(0, 700, 70);
      await saveRound(1, 690, 73);
      await saveRound(2, 900, 85, false);
      for (let i = 3; i < MAX_RECENT_RESULTS + 3; i++) await saveRound(i, 500, 50);
    } finally {
      repo.close();
    }

    const mount = document.body.appendChild(document.createElement('div'));
    const controller = new AppController(mount);
    app = controller;
    await controller.init();
    expect(controller.getRecentResults()).toHaveLength(MAX_RECENT_RESULTS);
    expect(controller.getRecentResults().every((result) => result.score === 500)).toBe(true);
    controller.startMainRound(seed);
    expect(controller['currentSessionContext']).toMatchObject({
      comparisonBestScore: 700, comparisonBestCanonicalLength: 73, comparisonGuideUsed: true,
    });

    controller.cancelInputCheck();
    controller.navigate('SETTINGS');
    controller.resetSave('records');
    await vi.waitFor(() => expect(controller.getRecentResults()).toHaveLength(0));
    controller.startMainRound(seed);
    expect(controller['currentSessionContext']).toMatchObject({
      comparisonBestScore: null, comparisonBestCanonicalLength: null,
    });
  });
  it('keeps city-reset records visible without comparing them, even when the old result has the same timestamp', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const courseId = 'relaxed';
    const seed = 123;
    const comparisonKey = `${courseId}:${GENERATOR_VERSION}:${WORDS_DATA.contentVersion}:${seed}`;
    const repo = new IndexedDbProfileRepository();
    const meta = await repo.init('seed');
    const lock = { tabId: meta.ownerTabId, writeEpoch: meta.writeEpoch, resetGeneration: meta.resetGeneration };
    const oldResult: RoundResultRecord = {
      sessionId: 'before-reset', timestamp: now, courseId, comparisonKey, planId: `${courseId}:${seed}`,
      wordIds: [], ruleVersion: ROMAJI_RULES.inputRuleVersion,
      completed: true, completedWordCount: 10, correctKeyCount: 73, mistakeCount: 0,
      totalCanonicalLength: 73, score: 700, canonicalKpm: 73 * 2 / 3,
      rescueUsed: false, guideUsed: true,
    };
    await repo.commitTypingFacts({ lock, facts: [], roundResult: oldResult });
    repo.close();

    const mount = document.body.appendChild(document.createElement('div'));
    async function openApp() {
      const controller = new AppController(mount);
      await controller.init();
      return controller;
    }
    app = await openApp();
    // Pre-reset legacy fallback still works, including through a settings-only reset.
    app.resetSave('settings');
    await vi.waitFor(() => expect(app!['settingsNotice']).toContain('入力・表示・サウンド'));
    app.startMainRound(seed);
    expect(app['currentSessionContext']).toMatchObject({ comparisonBestScore: 700, comparisonBestCanonicalLength: 73 });
    app.cancelInputCheck();

    app.resetSave('city_and_achievements');
    await vi.waitFor(() => expect(app!['settingsNotice']).toContain('街と手帳を初期化'));
    expect(app.getRecentResults()).toEqual([oldResult]);
    app.destroy();
    app = await openApp();
    app.startMainRound(seed);
    expect(app.getRecentResults()).toEqual([oldResult]);
    expect(app['currentSessionContext']).toMatchObject({ comparisonBestScore: null, comparisonBestCanonicalLength: null });

    // A new completion in the new generation contributes its own PB, even
    // with the same wall-clock time. The stronger retained row stays display-only.
    const freshResult = { ...oldResult, sessionId: 'after-reset', score: 500, totalCanonicalLength: 51 };
    const fact: RoundFinishedFact = {
      ...freshResult, type: 'RoundFinished', mode: 'MAIN', factSequence: 1, districtId: 'residential',
      elapsedMs: 90_000, baseScore: 500, deliveryBonus: 0, longestCleanStreak: 10, skips: 0,
    };
    app.destroy();
    const writer = new IndexedDbProfileRepository();
    const freshMeta = await writer.init('writer');
    try {
      await writer.commitTypingFacts({
        lock: { tabId: freshMeta.ownerTabId, writeEpoch: freshMeta.writeEpoch, resetGeneration: freshMeta.resetGeneration },
        facts: [fact],
        roundResult: freshResult,
      });
    } finally {
      writer.close();
    }
    app = await openApp();
    expect(app.getRecentResults()).toHaveLength(2);
    app.startMainRound(seed);
    expect(app['currentSessionContext']).toMatchObject({ comparisonBestScore: 500, comparisonBestCanonicalLength: 51 });
  });
});
