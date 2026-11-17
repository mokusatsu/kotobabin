import { describe, expect, it } from 'vitest';
import screenFixtures from '@spec-data/screen_fixtures.json';
import { WORDS_DATA } from '@/contracts/data';
import type {
  ConfirmedFact,
  DistrictId,
  RoundFinishedFact,
  WordCompletedFact,
} from '@/contracts/types';
import {
  AchievementEngine,
  CATALOG_ACHIEVEMENTS,
  CATALOG_REWARDS,
  type CityAchievementSnapshot,
  type UnlockRecord,
  meetsAccuracyThreshold,
  meetsSpeedImprovement,
  meetsSpeedThreshold,
} from '@/progression/achievementEngine';
import {
  DictionaryTracker,
  LEGACY_240_WORD_IDS,
} from '@/progression/dictionaryTracker';

function makeWordFact(
  overrides: Partial<WordCompletedFact> = {},
): WordCompletedFact {
  return {
    type: 'WordCompleted',
    sessionId: 's1',
    factSequence: 1,
    mode: 'MAIN',
    ruleVersion: '1.0.0',
    timestamp: 1000,
    wordId: 'daily_r01',
    topicId: 'daily',
    tags: [],
    canonicalLength: 6,
    mistakes: 0,
    wordPosition: 1,
    ...overrides,
  };
}

function makeRoundFact(
  overrides: Partial<RoundFinishedFact> = {},
): RoundFinishedFact {
  return {
    type: 'RoundFinished',
    sessionId: 's1',
    factSequence: 100,
    mode: 'MAIN',
    ruleVersion: '1.0.0',
    timestamp: 90000,
    courseId: 'standard',
    districtId: 'residential',
    completed: true,
    completedWordCount: 10,
    correctKeyCount: 70,
    mistakeCount: 0,
    totalCanonicalLength: 70,
    score: 500,
    baseScore: 500,
    deliveryBonus: 0,
    longestCleanStreak: 10,
    rescueUsed: false,
    skips: 0,
    guideUsed: false,
    elapsedMs: 90000,
    ...overrides,
  };
}

function makeEmptyCitySnapshot(): CityAchievementSnapshot {
  const districts: Record<DistrictId, { stage: number; shops: number }> = {
    residential: { stage: 0, shops: 0 },
    market: { stage: 0, shops: 0 },
    workshop: { stage: 0, shops: 0 },
    park: { stage: 0, shops: 0 },
    station: { stage: 0, shops: 0 },
    harbor: { stage: 0, shops: 0 },
  };
  return {
    districts,
    openedRoutesCount: 0,
    railRoutesCount: 0,
    currentCityArrivedMaterials: 0,
    lifetimeArrivedMaterials: 0,
    paidEquipmentPurchaseCount: 0,
    packagingLevel: 0,
    purchasedSynergies: [],
    cityRestartCount: 0,
    researchRanks: { materials: 0, logistics: 0, commerce: 0 },
  };
}

describe('AchievementEngine & DictionaryTracker', () => {
  it('loads all 72 achievements (A01..L06) and all 40 rewards from catalog', () => {
    expect(CATALOG_ACHIEVEMENTS).toHaveLength(72);
    expect(CATALOG_REWARDS).toHaveLength(40);
    const ids = new Set(CATALOG_ACHIEVEMENTS.map((a) => a.id));
    expect(ids.size).toBe(72);
    expect(AchievementEngine.getScope('A01')).toBe('all');
    expect(AchievementEngine.getScope('F01')).toBe('practice');
    expect(AchievementEngine.getScope('A05')).toBe('round');
    expect(AchievementEngine.getScope('B03')).toBe('normal');
    expect(AchievementEngine.getScope('I01')).toBe('city');
  });

  it('reproduces screen_fixtures.json 20-word trace: 21 -> 22 (K02) -> 25 (B03, C01, C04) and milestone:24:album', () => {
    const initialUnlocks: Record<string, UnlockRecord> = {};
    for (const id of screenFixtures.initialAchievementIds) {
      initialUnlocks[id] = {
        achievementId: id,
        unlockedAt: 1,
        conditionRevision: '4.1.0',
        scope: AchievementEngine.getScope(id),
        evidenceSummary: 'seed',
      };
    }

    const distinctCompletedWordIds = WORDS_DATA.words
      .slice(0, screenFixtures.initialProfile.totalDistinctCompleted)
      .map((w) => w.id);
    // Ensure all 20 round words are already in distinctCompletedWordIds as noted in fixture
    for (const entry of screenFixtures.round) {
      if (!distinctCompletedWordIds.includes(entry.wordId)) {
        distinctCompletedWordIds.push(entry.wordId);
      }
    }

    const practiceCleanCountsByWord: Record<string, number> = {};
    for (const id of screenFixtures.initialProfile.practiceQualifiedWordIds) {
      practiceCleanCountsByWord[id] = 3;
    }

    const engine = new AchievementEngine({
      unlocks: initialUnlocks,
      progress: {
        lifetimeCompletedWords: screenFixtures.initialProfile.totalCompleted,
        manualDeliveryCount: 5,
        groupedDeliveryCount: 3,
        fullDeliveryCount: 2,
        lifetimeDeliveredCargo: screenFixtures.initialProfile.totalDeliveredCargo,
        completedRounds: 6,
        roundsWith5WordsCompleted:
          screenFixtures.initialProfile.roundsWith5WordsCompleted,
        completedRoundsByOrder: {},
        distinctCompletedWordIds,
        practiceCompletedWords: 10,
        practiceCleanCountsByWord,
        practiceCleanTags: ['n', 'sokuon', 'yoon'],
        practiceMaxCleanStreak: 3,
        normalMaxCleanStreak: screenFixtures.initialProfile.normalMaxStreak,
        normalCompletedCoursesWith5Words: ['standard'],
        normalMasteredCourses20Words95Acc: [],
      },
    });

    expect(engine.getUnlockedCount()).toBe(21);

    // Pre-round packaging level 10 purchase unlocks K02 -> 22
    const cityBefore = makeEmptyCitySnapshot();
    cityBefore.districts.residential = { stage: 2, shops: 1 };
    cityBefore.districts.market = { stage: 1, shops: 1 };
    cityBefore.lifetimeArrivedMaterials = 1000;
    cityBefore.currentCityArrivedMaterials = 1000;
    cityBefore.paidEquipmentPurchaseCount = 1;
    cityBefore.packagingLevel = 10;

    const preRoundRes = engine.applyCitySnapshot(cityBefore, 100);
    expect(preRoundRes.newlyUnlockedAchievementIds).toEqual(['K02']);
    expect(engine.getUnlockedCount()).toBe(
      screenFixtures.preRoundPurchase.achievementTotalAfter,
    );
    expect(engine.getUnlockedCount()).toBe(22);

    // Start 20-word normal round
    const sessionId = 'fixture-round-1';
    engine.startSession(sessionId, 'MAIN', {
      orderKey: 'fixture-order-1',
      comparisonBestScore: 2500, // higher than 2070 so D04 already unlocked anyway
      comparisonBestSpeed: screenFixtures.initialProfile.bestCanonicalKpmSameConditions,
      practiceQualifiedWordIds: screenFixtures.initialProfile.practiceQualifiedWordIds,
    });

    let seq = 1;
    const shipmentAfter = new Map(
      screenFixtures.shipments.map((s) => [s.afterWord, s]),
    );
    const wordById = new Map(WORDS_DATA.words.map((w) => [w.id, w]));

    for (const w of screenFixtures.round) {
      const wordMeta = wordById.get(w.wordId)!;
      const res = engine.applyFact(
        makeWordFact({
          sessionId,
          factSequence: seq++,
          mode: 'MAIN',
          timestamp: w.completedAtMs,
          wordId: w.wordId,
          topicId: wordMeta.topicId,
          tags: wordMeta.tags,
          canonicalLength: w.canonicalLength,
          mistakes: w.mistakes,
          wordPosition: w.position,
        }),
      );
      expect(res.applied).toBe(true);

      const shipment = shipmentAfter.get(w.position);
      if (shipment) {
        engine.applyFact({
          type: 'DeliveryCommitted',
          sessionId,
          factSequence: seq++,
          mode: 'MAIN',
          ruleVersion: '1.0.0',
          timestamp: w.completedAtMs,
          reason: 'full',
          cargoCount: 5,
          bonus: shipment.bonus,
          precedingWordPosition: w.position,
        });
      }
    }

    const roundFinishRes = engine.applyFact(
      makeRoundFact({
        sessionId,
        factSequence: seq++,
        courseId: 'standard',
        completed: true,
        completedWordCount: screenFixtures.expected.completedWords,
        correctKeyCount: screenFixtures.expected.correctKeys,
        mistakeCount: screenFixtures.expected.mistakes,
        totalCanonicalLength: screenFixtures.expected.correctKeys,
        score: screenFixtures.expected.score,
        baseScore: screenFixtures.expected.baseScore,
        deliveryBonus: screenFixtures.expected.deliveryBonus,
        longestCleanStreak: screenFixtures.expected.longestCleanStreak,
        skips: screenFixtures.skips,
        rescueUsed: false,
        guideUsed: screenFixtures.romanGuide,
      }),
    );

    expect(roundFinishRes.newlyUnlockedAchievementIds).toEqual(
      screenFixtures.expected.newAchievementIds,
    );
    expect(roundFinishRes.totalUnlockedCount).toBe(
      screenFixtures.expected.achievementTotalAfter,
    );
    expect(roundFinishRes.newMilestoneRewardKeys).toEqual(
      screenFixtures.expected.newMilestoneRewardKeys,
    );
  });

  it('enforces idempotency by (sessionId, factSequence) and excludes deadline/skip deliveries', () => {
    const engine = new AchievementEngine();
    const fact = makeWordFact({ sessionId: 's-idem', factSequence: 1 });

    const first = engine.applyFact(fact);
    expect(first.applied).toBe(true);
    expect(first.newlyUnlockedAchievementIds).toContain('A01');

    // Replay same (sessionId, factSequence)
    const replay = engine.applyFact(fact);
    expect(replay.applied).toBe(false);
    expect(replay.newlyUnlockedAchievementIds).toEqual([]);
    expect(engine.getSnapshot().progress.lifetimeCompletedWords).toBe(1);

    // Deliveries: 2 manual (1+1), 1 full (5), 1 deadline (3), 1 skip (2)
    const facts: ConfirmedFact[] = [
      {
        type: 'DeliveryCommitted',
        sessionId: 's-idem',
        factSequence: 2,
        mode: 'MAIN',
        ruleVersion: '1.0.0',
        timestamp: 2000,
        reason: 'manual',
        cargoCount: 1,
        bonus: 20,
        precedingWordPosition: 1,
      },
      {
        type: 'DeliveryCommitted',
        sessionId: 's-idem',
        factSequence: 3,
        mode: 'MAIN',
        ruleVersion: '1.0.0',
        timestamp: 3000,
        reason: 'full',
        cargoCount: 5,
        bonus: 200,
        precedingWordPosition: 6,
      },
      {
        type: 'DeliveryCommitted',
        sessionId: 's-idem',
        factSequence: 4,
        mode: 'MAIN',
        ruleVersion: '1.0.0',
        timestamp: 4000,
        reason: 'deadline',
        cargoCount: 3,
        bonus: 50,
        precedingWordPosition: 9,
      },
      {
        type: 'DeliveryCommitted',
        sessionId: 's-idem',
        factSequence: 5,
        mode: 'MAIN',
        ruleVersion: '1.0.0',
        timestamp: 5000,
        reason: 'skip',
        cargoCount: 2,
        bonus: 10,
        precedingWordPosition: 11,
      },
    ];
    for (const f of facts) {
      engine.applyFact(f);
    }

    const progress = engine.getSnapshot().progress;
    expect(progress.manualDeliveryCount).toBe(1);
    expect(progress.fullDeliveryCount).toBe(1);
    expect(progress.lifetimeDeliveredCargo).toBe(6);
  });

  it('uses exact integer cross-multiplication for accuracy and speed thresholds', () => {
    // 94.96% (9496 / 10000) must NOT pass 95%
    expect(meetsAccuracyThreshold(9496, 504, 95)).toBe(false);
    // 95.00% (19 / 20) passes 95%
    expect(meetsAccuracyThreshold(19, 1, 95)).toBe(true);
    // Zero denominator never passes
    expect(meetsAccuracyThreshold(0, 0, 90)).toBe(false);

    // D05: comparisonBestSpeed = 100 (150 canonical chars in 90s)
    // +14 chars = 164 -> +9.33 KPM -> false
    expect(meetsSpeedImprovement(164, 100, 10)).toBe(false);
    // +15 chars = 165 -> +10.00 KPM -> true
    expect(meetsSpeedImprovement(165, 100, 10)).toBe(true);
    expect(meetsSpeedThreshold(270, 180)).toBe(true);
    expect(meetsSpeedThreshold(269, 180)).toBe(false);
  });

  it('evaluates scope isolation, B05/B06 sequence rules, F03/F06, H05, and provisional status', () => {
    const engine = new AchievementEngine();

    // Practice word with multiple tags credits all tags (F03) and F01
    engine.startSession('p1', 'PRACTICE');
    const pRes = engine.applyFact(
      makeWordFact({
        sessionId: 'p1',
        factSequence: 1,
        mode: 'PRACTICE',
        wordId: 'food_s06',
        tags: ['yoon', 'long_mark', 'n'],
        mistakes: 0,
      }),
    );
    expect(pRes.newlyUnlockedAchievementIds).toContain('A01');
    expect(pRes.newlyUnlockedAchievementIds).toContain('F01');
    expect(pRes.newlyUnlockedAchievementIds).not.toContain('A05');

    // Complete remaining tag 'sokuon' and 3 clean practices for 'daily_r01'
    engine.applyFact(
      makeWordFact({
        sessionId: 'p1',
        factSequence: 2,
        mode: 'PRACTICE',
        wordId: 'daily_s03',
        tags: ['sokuon'],
        mistakes: 0,
      }),
    );
    expect(engine.isUnlocked('F03')).toBe(true);

    for (let i = 0; i < 3; i++) {
      engine.applyFact(
        makeWordFact({
          sessionId: 'p1',
          factSequence: 3 + i,
          mode: 'PRACTICE',
          wordId: 'daily_r01',
          tags: [],
          mistakes: 0,
        }),
      );
    }
    expect(engine.isUnlocked('F02')).toBe(true);

    // Main round with B05 (2-manual -> 5-full), B06 (4-manual -> clean next word), F06
    engine.startSession('m1', 'MAIN');
    engine.applyFact(
      makeWordFact({
        sessionId: 'm1',
        factSequence: 1,
        mode: 'MAIN',
        wordId: 'daily_r01', // qualified before round start
        wordPosition: 1,
        mistakes: 0,
      }),
    );
    engine.applyFact({
      type: 'DeliveryCommitted',
      sessionId: 'm1',
      factSequence: 2,
      mode: 'MAIN',
      ruleVersion: '1.0.0',
      timestamp: 2000,
      reason: 'manual',
      cargoCount: 2,
      bonus: 50,
      precedingWordPosition: 1,
    });
    engine.applyFact({
      type: 'DeliveryCommitted',
      sessionId: 'm1',
      factSequence: 3,
      mode: 'MAIN',
      ruleVersion: '1.0.0',
      timestamp: 3000,
      reason: 'full',
      cargoCount: 5,
      bonus: 200,
      precedingWordPosition: 6,
    });
    engine.applyFact({
      type: 'DeliveryCommitted',
      sessionId: 'm1',
      factSequence: 4,
      mode: 'MAIN',
      ruleVersion: '1.0.0',
      timestamp: 4000,
      reason: 'manual',
      cargoCount: 4,
      bonus: 150,
      precedingWordPosition: 10,
    });
    engine.applyFact(
      makeWordFact({
        sessionId: 'm1',
        factSequence: 5,
        mode: 'MAIN',
        wordId: 'daily_r02',
        wordPosition: 11,
        mistakes: 0,
      }),
    );

    // Provisional check before RoundFinished
    const prov = engine.getProvisionalStatuses('m1');
    expect(prov.B05).toBe('provisional_held');
    expect(prov.B06).toBe('provisional_held');
    expect(prov.F06).toBe('provisional_held');

    // Show guide -> H05 disqualified for this round only
    engine.markSessionGuideShown('m1');
    expect(engine.getProvisionalStatuses('m1').H05).toBe('disqualified_this_round');

    engine.applyFact(
      makeRoundFact({
        sessionId: 'm1',
        factSequence: 6,
        completedWordCount: 20,
        correctKeyCount: 150,
        mistakeCount: 0,
        totalCanonicalLength: 150,
        guideUsed: true,
      }),
    );

    expect(engine.isUnlocked('B05')).toBe(true);
    expect(engine.isUnlocked('B06')).toBe(true);
    expect(engine.isUnlocked('F06')).toBe(true);
    expect(engine.isUnlocked('H05')).toBe(false);
  });

  it('unlocks all 72 achievements and distinguishes 48 total board from A-H first collection', () => {
    const engine = new AchievementEngine();

    // Unlock all 240 legacy + all 960 words across 6 topics & 3 courses
    let seq = 1;
    for (const word of WORDS_DATA.words) {
      engine.applyFact(
        makeWordFact({
          sessionId: 'all-words',
          factSequence: seq++,
          mode: 'PRACTICE',
          wordId: word.id,
          topicId: word.topicId,
          tags: word.tags,
          canonicalLength: word.canonicalLength,
          mistakes: 0,
          wordPosition: seq,
        }),
      );
    }
    // Practice 5 distinct words 3 times each + 5 streak
    const practiceSample = WORDS_DATA.words.slice(0, 5);
    for (const w of practiceSample) {
      for (let k = 0; k < 2; k++) {
        engine.applyFact(
          makeWordFact({
            sessionId: 'all-words',
            factSequence: seq++,
            mode: 'PRACTICE',
            wordId: w.id,
            topicId: w.topicId,
            tags: w.tags,
            canonicalLength: w.canonicalLength,
            mistakes: 0,
            wordPosition: seq,
          }),
        );
      }
    }

    // Complete 1000 lifetime words if needed (960 + 10 = 970, add 30 more)
    for (let i = 0; i < 30; i++) {
      engine.applyFact(
        makeWordFact({
          sessionId: 'all-words',
          factSequence: seq++,
          mode: 'PRACTICE',
          wordId: WORDS_DATA.words[0].id,
          mistakes: 0,
          wordPosition: seq,
        }),
      );
    }

    // Deliveries for A02..A04, G04, G05 (50 * 5 = 250 cargo)
    for (let i = 0; i < 50; i++) {
      engine.applyFact({
        type: 'DeliveryCommitted',
        sessionId: 'all-words',
        factSequence: seq++,
        mode: 'MAIN',
        ruleVersion: '1.0.0',
        timestamp: 5000 + i,
        reason: 'full',
        cargoCount: 5,
        bonus: 100,
        precedingWordPosition: i + 1,
      });
    }

    // City achievements I01..I06, J01..J06, K01..K06
    const maxCity = makeEmptyCitySnapshot();
    for (const d of Object.keys(maxCity.districts) as DistrictId[]) {
      maxCity.districts[d] = { stage: 5, shops: 10 };
    }
    maxCity.openedRoutesCount = 6;
    maxCity.railRoutesCount = 6;
    maxCity.currentCityArrivedMaterials = 100000;
    maxCity.lifetimeArrivedMaterials = 100000;
    maxCity.paidEquipmentPurchaseCount = 1;
    maxCity.packagingLevel = 10;
    maxCity.purchasedSynergies = [
      'joint_delivery',
      'sorting_network',
      'tourism_service',
    ];
    maxCity.cityRestartCount = 1;
    maxCity.researchRanks = { materials: 1, logistics: 0, commerce: 0 };
    engine.applyCitySnapshot(maxCity);

    // At this point, E01..E05, F01..F05, G01..G05, I01..I06, J01..J06, K01..K06, L01..L06, A01, A03, A04 are unlocked.
    // Total >= 48? Let's verify first collection board is NOT unlocked yet because B/C/D/H are incomplete!
    expect(engine.getUnlockedRewardIds()).not.toContain(
      'reward_first_collection_board',
    );

    // Now run 10 normal rounds across all 3 courses with same order key for A06, B01..B06, C01..C06, D01..D06, E06, F06, G06, H01..H06
    const courses = ['relaxed', 'standard', 'challenge'] as const;
    for (let r = 0; r < 10; r++) {
      const sid = `master-round-${r}`;
      const courseId = courses[r % 3];
      engine.startSession(sid, 'MAIN', {
        orderKey: 'same-order',
        practiceQualifiedWordIds: ['daily_r01'],
      });
      let rSeq = 1;
      engine.applyFact(
        makeWordFact({
          sessionId: sid,
          factSequence: rSeq++,
          mode: 'MAIN',
          wordId: 'daily_r01',
          wordPosition: 1,
          mistakes: 0,
        }),
      );
      engine.applyFact({
        type: 'DeliveryCommitted',
        sessionId: sid,
        factSequence: rSeq++,
        mode: 'MAIN',
        ruleVersion: '1.0.0',
        timestamp: 2000,
        reason: 'manual',
        cargoCount: 2,
        bonus: 50,
        precedingWordPosition: 1,
      });
      engine.applyFact({
        type: 'DeliveryCommitted',
        sessionId: sid,
        factSequence: rSeq++,
        mode: 'MAIN',
        ruleVersion: '1.0.0',
        timestamp: 3000,
        reason: 'manual',
        cargoCount: 4,
        bonus: 100,
        precedingWordPosition: 2,
      });
      engine.applyFact(
        makeWordFact({
          sessionId: sid,
          factSequence: rSeq++,
          mode: 'MAIN',
          wordId: 'daily_r02',
          wordPosition: 3,
          mistakes: 0,
        }),
      );
      for (let f = 0; f < 4; f++) {
        engine.applyFact({
          type: 'DeliveryCommitted',
          sessionId: sid,
          factSequence: rSeq++,
          mode: 'MAIN',
          ruleVersion: '1.0.0',
          timestamp: 4000 + f,
          reason: 'full',
          cargoCount: 5,
          bonus: 200,
          precedingWordPosition: 5 + f,
        });
      }
      engine.applyFact(
        makeRoundFact({
          sessionId: sid,
          factSequence: rSeq++,
          courseId,
          completedWordCount: 30,
          correctKeyCount: 300,
          mistakeCount: 0,
          totalCanonicalLength: 300, // 200 KPM
          score: 3000,
          longestCleanStreak: 30,
          guideUsed: false,
        }),
      );
    }

    expect(engine.getUnlockedCount()).toBe(72);
    expect(engine.getUnlockedRewardIds()).toHaveLength(40);
    expect(engine.getUnlockedRewardIds()).toContain('reward_first_collection_board');
    expect(engine.getUnlockedRewardIds()).toContain('reward_complete_72_stamp');
  });

  it('tracks 960 words, 240 legacy filter, clean-3 practice mastery, and course/topic filters', () => {
    const tracker = new DictionaryTracker(['daily_r01'], {
      daily_r01: 3,
      daily_r02: 1,
    });

    const summary = tracker.getSummary();
    expect(summary.totalWords).toBe(960);
    expect(summary.legacyTotalWords).toBe(240);
    expect(summary.completedWords).toBe(1);
    expect(summary.legacyCompletedWords).toBe(1);
    expect(summary.masteredWords).toBe(1);

    expect(tracker.getPracticeMasteryDisplay('daily_r01')).toBe('3/3');
    expect(tracker.getPracticeMasteryDisplay('daily_r02')).toBe('1/3');
    expect(tracker.getPracticeMasteryDisplay('daily_r03')).toBe('0/3');

    const legacyUnfinished = tracker.filterWords({
      collection: 'legacy240',
      status: 'unfinished',
    });
    expect(legacyUnfinished).toHaveLength(LEGACY_240_WORD_IDS.size - 1);

    const practicing = tracker.filterWords({ status: 'practicing' });
    expect(practicing.map((w) => w.word.id)).toEqual(['daily_r02']);

    const relaxedDaily = tracker.filterWords({
      collection: 'relaxed',
      topic: 'daily',
    });
    expect(relaxedDaily).toHaveLength(40);
  });
});
