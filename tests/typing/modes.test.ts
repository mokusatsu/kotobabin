import { describe, expect, it } from 'vitest';
import wordsData from '../../spec/initial/data/words.json';
import { GameSession, type Word } from '../../src/typing';
const words = wordsData.words as Word[];
const neko = words.find((word) => word.reading === 'ねこ')!;
const other = words.find((word) => word.id !== neko.id && word.courseId === 'relaxed')!;
const complete = (session: GameSession, now: number) => {
  for (const key of session.snapshot(now).remainingGuide) session.input(key, now);
  return session.snapshot(now);
};

describe('PRACTICE lifecycle', () => {
  it('waits on the completed selected word, ignores extra keys, and delivers at its completed boundary', () => {
    const session = new GameSession({ words: [neko, other], mode: 'PRACTICE' });
    const state = complete(session, 0);
    expect(state.currentWord.id).toBe(neko.id);
    expect(state.awaitingWordChoice).toBe(true);
    expect(state.wordStarted).toBe(false);
    session.input('z', 1);
    expect(session.snapshot(1).mistakes).toBe(0);
    expect(session.deliver(2).bonusScore).toBe(8);
    expect(session.drainEvents().filter((event) => event.type === 'WordCompleted')).toHaveLength(1);
  });
  it('preserves current and maximum streak across completed repeat/next and pause', () => {
    const session = new GameSession({ words: [neko, other], mode: 'PRACTICE' });
    complete(session, 0);
    session.repeatWord(1); complete(session, 2);
    session.pause(3); session.resume(100);
    session.nextPracticeWord(101, other);
    const state = complete(session, 102);
    expect(state.currentWord.id).toBe(other.id);
    expect(state.completedWords).toBe(3);
    expect(state.currentCleanStreak).toBe(3);
    expect(state.maxCleanStreak).toBe(3);
  });
  it('does not award an unfinished word and resets current streak when next skips it', () => {
    const session = new GameSession({ words: [neko, other], mode: 'PRACTICE' });
    complete(session, 0); session.repeatWord(1); session.input('n', 2);
    const state = session.nextPracticeWord(3, other);
    expect(state.baseScore).toBe(40);
    expect(state.correctKeys).toBe(5);
    expect(state.currentCleanStreak).toBe(0);
    expect(state.maxCleanStreak).toBe(1);
    expect(state.currentWord.id).toBe(other.id);
    expect(state.completedWords).toBe(1);
  });
  it('emits PracticeSessionEnded once, carries the maximum, and never emits RoundFinished', () => {
    const session = new GameSession({ words: [neko], mode: 'PRACTICE' });
    complete(session, 0); session.repeatWord(1); complete(session, 2);
    const state = session.endPractice(3, 'main');
    expect(state.phase).toBe('RESULT');
    expect(state.bonusScore).toBe(0); // unfinished pending bonus is not automatically delivered
    session.endPractice(4, 'home'); session.finish(5); session.tick(90_000);
    const events = session.drainEvents();
    expect(events.filter((event) => event.type === 'RoundFinished')).toHaveLength(0);
    expect(events.filter((event) => event.type === 'WordCompleted')).toHaveLength(2);
    const ended = events.filter((event) => event.type === 'PracticeSessionEnded');
    expect(ended).toHaveLength(1);
    expect(ended[0].reason).toBe('main');
    expect(ended[0].maxCleanStreak).toBe(2);
  });
  it('routes generic finish to the correct practice end fact', () => {
    const session = new GameSession({ words: [neko], mode: 'PRACTICE' });
    session.finish(0, false);
    expect(session.drainEvents().map((event) => event.type)).toEqual(['PracticeSessionEnded']);
  });
  it('pause skip after a completed practice word preserves its clean streak', () => {
    const session = new GameSession({ words: [neko], mode: 'PRACTICE' });
    complete(session, 0); session.pause(1); session.skip(2);
    expect(session.snapshot(2).currentCleanStreak).toBe(1);
    expect(session.snapshot(2).phase).toBe('PAUSED');
    expect(session.snapshot(2).skips).toBe(0);
  });
});

describe('guide exposure', () => {
  it('is fixed in history once shown even after turning off, pause and resume', () => {
    const session = new GameSession({ words: [neko], guideEnabled: false });
    expect(session.snapshot(0).guideUsed).toBe(false);
    session.input('n', 1); session.pause(2);
    session.setGuideEnabled(true, 3); session.setGuideEnabled(false, 4); session.resume(5);
    complete(session, 10); session.tick(90_005);
    const state = session.snapshot(90_005);
    expect(state.guideEnabled).toBe(false);
    expect(state.guideUsed).toBe(true);
    expect(session.drainEvents().every((event) => event.guideUsed)).toBe(true);
  });
  it('starts with the initial setting and preserves an unseen-guide result', () => {
    expect(new GameSession({ words: [neko] }).snapshot(0).guideUsed).toBe(true);
    const session = new GameSession({ words: [neko], guideEnabled: false });
    complete(session, 0); session.tick(90_000); session.setGuideEnabled(true, 91_000);
    expect(session.snapshot(91_000).guideUsed).toBe(false);
    expect(session.drainEvents().every((event) => !event.guideUsed)).toBe(true);
  });
});
