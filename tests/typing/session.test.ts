import { describe, expect, it } from 'vitest';
import wordsData from '../../spec/initial/data/words.json';
import fixture from '../../spec/initial/data/screen_fixtures.json';
import { CourseGenerator, GameSession, RomajiEngine, type Word } from '../../src/typing';
const words = wordsData.words as Word[];
const neko = words.find((word) => word.reading === 'ねこ')!;
const complete = (session: GameSession, now: number) => {
  for (const key of session.snapshot(now).remainingGuide) session.input(key, now);
  return session.snapshot(now);
};

describe('GameSession scoring, clock, and event boundaries', () => {
  it('starts on the first scored character, including a wrong key, and excludes delivery from startup', () => {
    const session = new GameSession({ words: [neko] });
    expect(session.deliver(10_000).phase).toBe('READY');
    expect(session.tick(50_000).remainingMs).toBe(90_000);
    const state = session.input('z', 60_000);
    expect(state.phase).toBe('PLAYING'); expect(state.remainingMs).toBe(90_000); expect(state.mistakes).toBe(1);
    expect(state.wordStarted).toBe(true);
    expect(session.deliver(60_100).message).toBe('このことばを完成すると届けられます');
  });
  it('mistakes remove only pending bonus; accepted prefix and 10L completion score survive', () => {
    const session = new GameSession({ words: [neko] });
    complete(session, 0); complete(session, 100); complete(session, 200);
    const before = session.snapshot(200);
    expect(before.score).toBe(120); expect(before.pendingBonus).toBe(72);
    session.input('n', 300); session.input('z', 301);
    const state = complete(session, 400);
    expect(state.baseScore).toBe(160); expect(state.cargoCount).toBe(0); expect(state.mistakes).toBe(1);
    expect(state.completedHistory[3].clean).toBe(false);
  });
  it('manual delivery is blocked midword; five cargo automatically deliver exactly once', () => {
    const session = new GameSession({ words: [neko] });
    complete(session, 0);
    expect(session.deliver(1).bonusScore).toBe(8);
    for (let index = 0; index < 5; index++) complete(session, 10 + index);
    expect(session.snapshot(20).score).toBe(448);
    const deliveries = session.drainEvents().filter((event) => event.type === 'DeliveryCommitted');
    expect(deliveries.map((event) => [event.reason, event.cargoCount, event.bonus])).toEqual([['manual', 1, 8], ['full', 5, 200]]);
    expect(session.drainEvents()).toEqual([]);
  });
  it('deadline at exactly 90000ms preempts keys and flushes completed cargo once', () => {
    const session = new GameSession({ words: [neko] });
    complete(session, 1000);
    session.input('n', 90_999);
    const result = session.input('e', 91_000);
    expect(result.phase).toBe('RESULT'); expect(result.correctKeys).toBe(5);
    expect(result.score).toBe(48); expect(result.completedWords).toBe(1);
    expect(result.canonicalKpm).toBeCloseTo(4 / 90 * 60);
    session.tick(92_000); session.deliver(93_000); session.finish(94_000);
    const events = session.drainEvents();
    expect(events.filter((event) => event.type === 'RoundFinished')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'DeliveryCommitted')).toHaveLength(1);
    expect(new Set(events.map((event) => event.eventId)).size).toBe(events.length);
  });
  it('pause excludes elapsed time, is idempotent, and READY pause keeps clock unstarted', () => {
    const session = new GameSession({ words: [neko] });
    session.pause(10); session.resume(10_000);
    expect(session.snapshot(20_000).phase).toBe('READY');
    expect(session.snapshot(20_000).remainingMs).toBe(90_000);
    session.input('n', 20_000); session.pause(21_000); session.pause(40_000); session.resume(80_000);
    expect(session.snapshot(81_000).elapsedMs).toBe(2000);
    expect(session.snapshot(81_000).acceptedInput).toBe('n');
  });
  it('skip flushes cargo but retains key statistics; abort never flushes pending cargo', () => {
    const session = new GameSession({ words: [neko] });
    complete(session, 0); session.input('n', 10); session.pause(20); session.skip(21);
    const skipped = session.snapshot(21);
    expect(skipped.score).toBe(48); expect(skipped.correctKeys).toBe(5); expect(skipped.skips).toBe(1);
    session.resume(30); complete(session, 40);
    expect(session.finish(50).score).toBe(88);
    const events = session.drainEvents();
    const delivery = events.find((event) => event.type === 'DeliveryCommitted');
    expect(delivery?.type === 'DeliveryCommitted' && delivery.reason).toBe('skip');
  });
  it('practice has no 90-second deadline', () => {
    const session = new GameSession({ words: [neko], mode: 'PRACTICE' });
    complete(session, 0);
    expect(session.tick(500_000).phase).toBe('PLAYING');
    expect(session.snapshot(500_000).remainingMs).toBeNull();
  });
  it('matches the independent 20-word screen fixture: 2070 points and 93.3% accuracy', () => {
    const ordered = fixture.round.map((entry) => words.find((word) => word.id === entry.wordId)!);
    const session = new GameSession({ words: ordered, sessionId: 'screen-fixture' });
    session.input('o', 0); // first accepted key starts the clock at exactly zero
    for (const entry of fixture.round) {
      const engine = new RomajiEngine(session.snapshot(entry.completedAtMs).currentWord.reading);
      const wrong = 'abcdefghijklmnopqrstuvwxyz'.split('').find((key) => !new RomajiEngine(engine.reading).input(key).accepted)!;
      for (let index = 0; index < entry.mistakes; index++) session.input(wrong, entry.completedAtMs - 1);
      const state = complete(session, entry.completedAtMs);
      if (entry.position === fixture.playBoundary.afterWord) {
        expect(state.score).toBe(fixture.playBoundary.confirmedScore);
        expect(state.pendingBonus).toBe(fixture.playBoundary.manualBonus);
        expect(state.nextBonus).toBe(fixture.playBoundary.bonusIfNextCleanThenDelivered);
      }
    }
    const result = session.tick(90_000);
    expect(result.score).toBe(fixture.expected.score);
    expect(result.baseScore).toBe(fixture.expected.baseScore);
    expect(result.bonusScore).toBe(fixture.expected.deliveryBonus);
    expect(result.correctKeys).toBe(fixture.expected.correctKeys);
    expect(result.mistakes).toBe(fixture.expected.mistakes);
    expect(result.accuracy).toBeCloseTo(fixture.expected.accuracyRaw);
    expect(result.canonicalKpm).toBeCloseTo(fixture.expected.canonicalKpm);
    expect(result.maxCleanStreak).toBe(fixture.expected.longestCleanStreak);
  });
});

describe('CourseGenerator', () => {
  it('reproduces retry beyond the prior reached word, with the fixed difficulty wave', () => {
    const a = new CourseGenerator(words, { seed: 2026, courseId: 'standard' });
    const b = new CourseGenerator(words, { seed: 2026, courseId: 'standard' });
    const bands = ['easy', 'medium', 'medium', 'hard', 'easy'];
    const ids = Array.from({ length: 1000 }, (_, index) => {
      const word = a.next();
      expect(word.difficultyBand).toBe(bands[index % 5]);
      return word.id;
    });
    expect(Array.from({ length: 1000 }, () => b.next().id)).toEqual(ids);
    expect(ids.every((id, index) => index === 0 || id !== ids[index - 1])).toBe(true);
    for (const band of ['easy', 'medium', 'hard']) {
      const pool = words.filter((word) => word.courseId === 'standard' && word.difficultyBand === band);
      const picked = ids.filter((_, index) => bands[index % 5] === band).slice(0, pool.length);
      expect(new Set(picked).size).toBe(pool.length);
    }
  });
  it('places a preferred word within the first five and removes it from its initial bag', () => {
    for (const band of ['easy', 'medium', 'hard']) {
      const preferred = words.find((word) => word.courseId === 'relaxed' && word.difficultyBand === band)!;
      const generator = new CourseGenerator(words, { seed: 4, courseId: 'relaxed', preferredWordId: preferred.id });
      const first = Array.from({ length: 5 }, () => generator.next());
      expect(first.filter((word) => word.id === preferred.id)).toHaveLength(1);
      expect(first.map((word) => word.difficultyBand)).toEqual(['easy', 'medium', 'medium', 'hard', 'easy']);
    }
  });
});
