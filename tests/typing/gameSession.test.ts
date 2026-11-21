// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { WORDS_DATA } from '@/contracts/data';
import type { ConfirmedFact, Word } from '@/contracts/types';
import screenFixtures from '../../spec/initial/data/screen_fixtures.json';
import {
  CourseGenerator,
  WAVE_PATTERN,
  getPrototypeIds,
  getPrototypeWords,
  getTutorialIds,
  getTutorialWords,
} from '@/typing/courseGenerator';
import { GameSession } from '@/typing/gameSession';
import { InputAdapter } from '@/typing/inputAdapter';
import { RomajiEngine } from '@/typing/romajiEngine';

function makeWord(id: string, reading: string, display = reading): Word {
  const engine = new RomajiEngine(reading);
  return {
    id,
    display,
    reading,
    courseId: 'relaxed',
    topicId: 'daily',
    dictionarySetId: 'test',
    difficultyBand: 'easy',
    tags: [],
    canonicalLength: engine.canonicalLength,
    complexityScore: engine.canonicalLength,
    reviewed: true,
    editorialNote: '',
  };
}

function typeWordClean(session: GameSession, reading: string, timeMs: number) {
  const engine = new RomajiEngine(reading);
  const guide = engine.guide;
  let lastResult;
  for (const ch of guide) {
    lastResult = session.handleKey(ch, timeMs);
  }
  return lastResult;
}

describe('CourseGenerator', () => {
  it('records time spent entering a practice word without the pause', () => {
    const facts: ConfirmedFact[] = [];
    const session = new GameSession({
      words: [makeWord('cat', 'ねこ')], mode: 'PRACTICE', onFact: (fact) => facts.push(fact),
    });
    session.handleKey('n', 100);
    session.pause(200);
    session.resume(1200);
    session.handleKey('e', 1300);
    session.handleKey('k', 1400);
    session.handleKey('o', 1500);
    expect(facts[0]).toMatchObject({ type: 'WordCompleted', inputElapsedMs: 400 });
  });

  it('starts the round clock after preparation without consuming a typing key', () => {
    let now = 0;
    const session = new GameSession({ words: [makeWord('start', 'ねこ')], now: () => now });
    session.enterInputCheck();
    session.handleKey('f');
    now = 3000;
    session.completeInputCheck();
    session.startRound();
    expect(session.currentState).toBe('PLAYING');
    expect(session.getSnapshot().typed).toBe('');
    expect(session.getSnapshot().mistakeCount).toBe(0);
    expect(session.getRemainingMs()).toBe(90000);
    now = 4000;
    expect(session.getRemainingMs()).toBe(89000);
  });

  it('generates deterministic 5-word waves [easy, medium, medium, hard, easy]', () => {
    const genA = new CourseGenerator({ courseId: 'standard', seed: 42 });
    const genB = new CourseGenerator({ courseId: 'standard', seed: 42 });
    const genC = new CourseGenerator({ courseId: 'standard', seed: 99 });

    const wordsA = genA.peekWords(15);
    const wordsB = genB.peekWords(15);
    const wordsC = genC.peekWords(15);

    expect(wordsA.map((w) => w.id)).toEqual(wordsB.map((w) => w.id));
    expect(wordsA.map((w) => w.id)).not.toEqual(wordsC.map((w) => w.id));

    for (let i = 0; i < wordsA.length; i++) {
      expect(wordsA[i].courseId).toBe('standard');
      expect(wordsA[i].difficultyBand).toBe(
        WAVE_PATTERN[i % WAVE_PATTERN.length],
      );
    }
  });

  it('refills exhausted bags without immediate duplicate', () => {
    const gen = new CourseGenerator({ courseId: 'relaxed', seed: 123 });
    // relaxed has 48 hard words; draw 200 waves (200 hard words)
    const hardWords: string[] = [];
    for (let w = 0; w < 200; w++) {
      hardWords.push(gen.getWordAt(w * 5 + 3).id);
    }
    for (let i = 1; i < hardWords.length; i++) {
      expect(hardWords[i]).not.toBe(hardWords[i - 1]);
    }
  });

  it('places preferredWordId in matching difficulty slot of first wave', () => {
    const target = WORDS_DATA.words.find(
      (w) => w.courseId === 'standard' && w.difficultyBand === 'hard',
    )!;
    const gen = new CourseGenerator({
      courseId: 'standard',
      seed: 7,
      preferredWordId: target.id,
    });
    const wave1 = gen.peekWords(5);
    expect(wave1[3].id).toBe(target.id);
    // Should not repeat immediately in wave 2
    expect(gen.getWordAt(8).id).not.toBe(target.id);
  });

  it('provides tutorialIds and prototypeIds helpers', () => {
    expect(getTutorialIds().length).toBeGreaterThan(0);
    expect(getTutorialWords().length).toBe(getTutorialIds().length);
    expect(getPrototypeIds().length).toBe(30);
    expect(getPrototypeWords().length).toBe(30);
  });
});

describe('GameSession', () => {
  it('restores tutorial actions without re-emitting their facts or changing cargo, score, or partial input', () => {
    const words = [makeWord('cat', 'ねこ'), makeWord('flower', 'はな')];
    const original = new GameSession({ mode: 'TUTORIAL', words });
    typeWordClean(original, 'ねこ', 1);
    original.handleKey('h');
    original.handleKey('x');
    const onFact = vi.fn();
    const restored = new GameSession({ mode: 'TUTORIAL', words, tutorialCheckpoint: original.getTutorialCheckpoint(), onFact });
    expect(restored.getSnapshot()).toEqual(original.getSnapshot());
    expect(onFact).not.toHaveBeenCalled();
    restored.handleKey('a');
    restored.handleKey('n');
    restored.handleKey('a');
    expect(onFact).toHaveBeenCalledOnce();
    expect(restored.facts[1]?.factSequence).toBe(2);
  });

  it('loads burst mistakes at one position and ships regular and extra deliveries independently', () => {
    const word = makeWord('w5', 'あいうえお');
    const session = new GameSession({ words: [word], now: () => 0 });
    for (let i = 0; i < 4; i++) typeWordClean(session, word.reading, 0);
    for (const key of ['z', 'x', 'q']) session.handleKey(key, 0);
    expect(session.getSnapshot()).toMatchObject({ wordMistakePositions: 1, cargoCount: 4, currentCleanStreak: 0 });
    expect(typeWordClean(session, word.reading, 0)).toMatchObject({
      autoDelivered: true, extraDelivered: false, cargoLoaded: true,
    });

    for (let i = 0; i < 4; i++) typeWordClean(session, word.reading, 0);
    expect(typeWordClean(session, word.reading, 0)).toMatchObject({
      autoDelivered: true, extraDelivered: true, cargoLoaded: true, dispatchBonus: 500,
    });

    typeWordClean(session, word.reading, 0);
    for (const key of ['z', 'a', 'z', 'i', 'u', 'e', 'o']) session.handleKey(key, 0);
    expect(session.getSnapshot()).toMatchObject({ cargoCount: 1, completedWordCount: 12, mistakeCount: 5, baseScore: 600 });
    const shipments = session.facts.filter((fact) => fact.type === 'DeliveryCommitted');
    expect(shipments.map(({ reason, cargoCount, precedingWordPosition }) => [reason, cargoCount, precedingWordPosition]))
      .toEqual([['full', 5, 5], ['full', 5, 10], ['extra', 0, 10]]);
  });

  it('gives identical score and cargo value for shi vs si', () => {
    const shiWord = makeWord('shi', 'し');
    const s1 = new GameSession({ words: [shiWord], now: () => 0 });
    s1.handleKey('s', 0);
    s1.handleKey('h', 0);
    s1.handleKey('i', 0);

    const s2 = new GameSession({ words: [shiWord], now: () => 0 });
    s2.handleKey('s', 0);
    s2.handleKey('i', 0);

    expect(s1.getSnapshot().score).toBe(20);
    expect(s2.getSnapshot().score).toBe(20);
    expect(s1.getSnapshot().cargoBase).toBe(s2.getSnapshot().cargoBase);
  });

  it('enforces 89,999ms vs 90,000ms timer boundary and delivers remaining cargo on deadline', () => {
    const w2 = makeWord('w2', 'あい'); // len 2 -> 20 pts
    let nowMs = 10_000; // starts at 10,000ms
    const session = new GameSession({
      words: [w2, w2, w2, w2],
      now: () => nowMs,
    });

    // First key starts timer at 10,000ms
    session.handleKey('a', nowMs);
    session.handleKey('i', nowMs);
    // Complete 2 more words (total 3 clean words -> base 60, cargo 3)
    nowMs = 10_000 + 50_000;
    typeWordClean(session, 'あい', nowMs);
    typeWordClean(session, 'あい', nowMs);
    expect(session.getSnapshot().cargoCount).toBe(3);

    // Start 4th word at 89,998ms, finish at 89,999ms
    nowMs = 10_000 + 89_998;
    expect(session.handleKey('a', nowMs).accepted).toBe(true);
    nowMs = 10_000 + 89_999;
    const at89999 = session.handleKey('i', nowMs);
    expect(at89999.accepted).toBe(true);
    expect(at89999.wordCompleted).toBe(true);
    expect(session.currentState).toBe('PLAYING');

    // Key at 90,000ms triggers deadline without scoring that key
    nowMs = 10_000 + 90_000;
    const at90000 = session.handleKey('a', nowMs);
    expect(at90000.deadlineReached).toBe(true);
    expect(at90000.accepted).toBe(false);
    expect(session.currentState).toBe('RESULT');

    // 4 clean words = 80 base + floor(80 * 4 / 5) = 80 + 64 = 144
    const snap = session.getSnapshot();
    expect(snap.completedWordCount).toBe(4);
    expect(snap.baseScore).toBe(80);
    expect(snap.deliveryBonus).toBe(64);
    expect(snap.score).toBe(144);
    expect(snap.correctKeyCount).toBe(8);
  });

  it('handles pause/resume without counting paused time and deduplicates pause', () => {
    const w4 = makeWord('w4', 'ねこ');
    let nowMs = 0;
    const session = new GameSession({ words: [w4, w4], now: () => nowMs });

    session.handleKey('n', nowMs); // starts at 0
    nowMs = 20_000;
    expect(session.pause(nowMs)).toBe(true);
    expect(session.pause(nowMs)).toBe(false); // idempotent

    nowMs = 50_000; // 30s paused
    expect(session.resume(nowMs)).toBe(true);
    expect(session.getRemainingMs(nowMs)).toBe(70_000);
  });

  it('handles skip from PAUSED preserving key accuracy and delivering cargo with reason skip', () => {
    const w4 = makeWord('w4', 'ねこ');
    const w5 = makeWord('w5', 'あいうえお');
    const nowMs = 0;
    const session = new GameSession({
      words: [w4, w5, w4],
      now: () => nowMs,
    });

    // Complete first word cleanly (4 keys)
    typeWordClean(session, 'ねこ', nowMs);
    expect(session.getSnapshot().cargoCount).toBe(1);

    // Type 4 keys of second word, then pause and skip
    session.handleKey('a', nowMs);
    session.handleKey('i', nowMs);
    session.handleKey('u', nowMs);
    session.handleKey('e', nowMs);
    session.pause(nowMs);
    expect(session.skipWord(nowMs)).toBe(true);
    session.resume(nowMs);

    // Complete third word (4 keys)
    typeWordClean(session, 'ねこ', nowMs);

    const snap = session.getSnapshot();
    expect(snap.skips).toBe(1);
    expect(snap.rescueUsed).toBe(true);
    expect(snap.correctKeyCount).toBe(12); // 4 + 4 + 4
    expect(snap.mistakeCount).toBe(0);
    expect(snap.accuracyDisplayed).toBe('100.0%');
    expect(snap.completedWordCount).toBe(2);

    const skipDelivery = session.facts.find(
      (f) => f.type === 'DeliveryCommitted' && f.reason === 'skip',
    );
    expect(skipDelivery).toBeDefined();
  });

  it('tracks guideUsed even when guide is toggled off mid-session', () => {
    const w4 = makeWord('w4', 'ねこ');
    const session = new GameSession({
      words: [w4],
      guideEnabled: false,
    });
    expect(session.getSnapshot().guideUsed).toBe(false);
    expect(session.getSnapshot().guide).toBe('');
    session.setGuideEnabled(true);
    expect(session.getSnapshot().guide).toBe('neko');
    session.setGuideEnabled(false);
    expect(session.getSnapshot().guideUsed).toBe(true);
  });

  it('calculates the new regular and extra shipments for the representative 20-word input', () => {
    const wordById = new Map(WORDS_DATA.words.map((w) => [w.id, w]));
    const roundWords = screenFixtures.round.map((entry) => {
      const w = wordById.get(entry.wordId);
      if (!w) throw new Error(`Missing word ${entry.wordId}`);
      return w;
    });

    let nowMs = 0;
    const facts: ConfirmedFact[] = [];
    const session = new GameSession({
      courseId: 'standard',
      districtId: 'residential',
      words: roundWords,
      now: () => nowMs,
      onFact: (f) => facts.push(f),
    });

    for (let i = 0; i < screenFixtures.round.length; i++) {
      const entry = screenFixtures.round[i];
      const word = roundWords[i];
      // Start clock at 0ms on the very first key of the round (clock_origin_ms: 0)
      const keyTime = i === 0 ? 0 : entry.completedAtMs;
      if (entry.mistakes > 0) {
        for (let m = 0; m < entry.mistakes; m++) {
          const badKey = ['q', 'v', 'x', 'z', '-'].find(
            (k) => !new RomajiEngine(word.reading).step(k).accepted,
          )!;
          const res = session.handleKey(badKey, keyTime);
          expect(res.accepted).toBe(false);
        }
      }

      nowMs = entry.completedAtMs;
      typeWordClean(session, word.reading, nowMs);

      if (entry.position === screenFixtures.playBoundary.afterWord) {
        expect(session.getSnapshot(nowMs)).toMatchObject({
          score: 300, cargoCount: 4, cargoBase: 300, pendingBonus: 240, currentCleanStreak: 3,
        });
      }
    }

    expect(facts.filter((fact) => fact.type === 'DeliveryCommitted').map(
      ({ reason, precedingWordPosition, bonus }) => [reason, precedingWordPosition, bonus],
    )).toEqual([
      ['full', 5, 350], ['extra', 6, 340], ['full', 10, 360],
      ['full', 15, 330], ['extra', 16, 330], ['full', 20, 360],
    ]);

    // Reach 90,000ms deadline
    nowMs = 90_000;
    expect(session.tick(nowMs)).toBe(true);
    expect(session.currentState).toBe('RESULT');

    const finalSnap = session.getSnapshot(nowMs);
    expect(finalSnap.completedWordCount).toBe(
      screenFixtures.expected.completedWords,
    );
    expect(finalSnap.baseScore).toBe(screenFixtures.expected.baseScore);
    expect(finalSnap.deliveryBonus).toBe(2070);
    expect(finalSnap.score).toBe(3470);
    expect(finalSnap.correctKeyCount).toBe(screenFixtures.expected.correctKeys);
    expect(finalSnap.mistakeCount).toBe(screenFixtures.expected.mistakes);
    expect(finalSnap.accuracyDisplayed).toBe(
      screenFixtures.expected.accuracyDisplayed,
    );
    expect(finalSnap.canonicalKpmDisplayed).toBe(
      screenFixtures.expected.canonicalKpmDisplayed,
    );
    expect(finalSnap.longestCleanStreak).toBe(
      screenFixtures.expected.longestCleanStreak,
    );

    // Verify monotonic factSequence and RoundFinished fact
    for (let i = 1; i < facts.length; i++) {
      expect(facts[i].factSequence).toBe(facts[i - 1].factSequence + 1);
    }
    const roundFinished = facts[facts.length - 1];
    expect(roundFinished.type).toBe('RoundFinished');
    if (roundFinished.type === 'RoundFinished') {
      expect(roundFinished.completed).toBe(true);
      expect(roundFinished.score).toBe(3470);
      expect(roundFinished.baseScore).toBe(1400);
      expect(roundFinished.deliveryBonus).toBe(2070);
      expect(roundFinished.longestCleanStreak).toBe(5);
    }
  });
});

describe('InputAdapter', () => {
  it('ignores repeat keys, handles Backspace notice, IME pause, and blur/visibility', () => {
    const inputEl = document.createElement('input');
    document.body.appendChild(inputEl);

    const w4 = makeWord('w4', 'ねこ');
    const nowMs = 0;
    const session = new GameSession({ words: [w4, w4], now: () => nowMs });
    const onNotice = vi.fn();
    const onImePause = vi.fn();
    const onPause = vi.fn();

    const adapter = new InputAdapter({
      inputElement: inputEl,
      session,
      onNotice,
      onImePause,
      onPause,
    });
    adapter.attach();

    // Repeat key ignored
    inputEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', repeat: true, bubbles: true }),
    );
    expect(session.currentState).toBe('READY');
    expect(session.getSnapshot().typed).toBe('');

    // Valid key starts session
    inputEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'n', bubbles: true }),
    );
    expect(session.currentState).toBe('PLAYING');
    expect(session.getSnapshot().typed).toBe('n');

    // Backspace triggers notice without mistake
    inputEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }),
    );
    expect(onNotice).toHaveBeenCalledWith('訂正は不要です');
    expect(session.getSnapshot().mistakeCount).toBe(0);

    // IME keyCode 229 or Process triggers pause without losing confirmed 'n'
    inputEl.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Process', bubbles: true }),
    );
    expect(session.currentState).toBe('PAUSED');
    expect(onImePause).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().typed).toBe('n');

    // Resume and test blur pause
    session.resume(nowMs);
    expect(session.currentState).toBe('PLAYING');
    inputEl.dispatchEvent(new FocusEvent('blur'));
    expect(session.currentState).toBe('PAUSED');
    expect(onPause).toHaveBeenCalledTimes(2);

    adapter.detach();
    inputEl.remove();
  });
});
