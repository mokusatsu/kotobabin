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
});
