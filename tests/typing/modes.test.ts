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

describe('TUTORIAL progression', () => {
  it('succeeds only after a confirmed nonempty delivery, never from a completed word alone', () => {
    const session = new GameSession({ words: [neko, other], mode: 'TUTORIAL' });
    expect(session.deliver(0).tutorialDelivered).toBe(false);
    const state = complete(session, 1);
    expect(state.tutorialDelivered).toBe(false);
    expect(state.currentWord.id).toBe(other.id);
    expect(session.deliver(2).tutorialDelivered).toBe(true);
    session.finish(3);
    const events = session.drainEvents();
    expect(events.filter((event) => event.type === 'RoundFinished')).toHaveLength(0);
    expect(events.filter((event) => event.type === 'WordCompleted')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'DeliveryCommitted')).toHaveLength(1);
  });
  it('offers fallback after three consecutive cargo-free completions without resetting progress', () => {
    const session = new GameSession({ words: [neko], mode: 'TUTORIAL' });
    for (let index = 0; index < 3; index++) {
      session.input('z', index * 10);
      const state = complete(session, index * 10 + 1);
      expect(state.tutorialFailureStreak).toBe(index + 1);
      expect(state.tutorialFallbackAvailable).toBe(index === 2);
    }
    const state = complete(session, 40);
    expect(state.completedWords).toBe(4);
    expect(state.baseScore).toBe(160);
    expect(state.tutorialFailureStreak).toBe(0);
    expect(state.tutorialDelivered).toBe(false);
    expect(session.deliver(41).tutorialDelivered).toBe(true);
  });
  it('does not get stuck when a following error loses clean cargo before shipment', () => {
    const session = new GameSession({ words: [neko], mode: 'TUTORIAL' });
    complete(session, 0);
    session.input('z', 1); complete(session, 2);
    expect(session.snapshot(2).tutorialDelivered).toBe(false);
    expect(session.snapshot(2).cargoCount).toBe(0);
    expect(session.snapshot(2).tutorialFailureStreak).toBe(1);
    complete(session, 3);
    expect(session.deliver(4).tutorialDelivered).toBe(true);
  });
  it('a skip flush does not certify tutorial delivery, while full cargo does', () => {
    const skipped = new GameSession({ words: [neko], mode: 'TUTORIAL' });
    complete(skipped, 0); skipped.pause(1); skipped.skip(2);
    expect(skipped.snapshot(2).bonusScore).toBe(8);
    expect(skipped.snapshot(2).tutorialDelivered).toBe(false);
    const full = new GameSession({ words: [neko], mode: 'TUTORIAL' });
    for (let index = 0; index < 5; index++) complete(full, index);
    expect(full.snapshot(5).tutorialDelivered).toBe(true);
    expect(full.tick(150_000).phase).toBe('PLAYING');
  });
});

describe('unfinished-word review metadata', () => {
  it('includes a mistaken incomplete deadline word without awarding completion', () => {
    const session = new GameSession({ words: [neko] });
    session.input('n', 0); session.input('z', 1);
    const state = session.tick(90_000);
    expect(state.completedWords).toBe(0);
    expect(state.score).toBe(0);
    expect(state.unfinishedWord).toEqual({ wordId: neko.id, position: 1, acceptedKeys: 1, mistakes: 1 });
    expect(state.reviewWordIds).toEqual([neko.id]);
  });
  it('retains skipped mistakes, deduplicates, orders by total mistakes then first position, and caps at ten', () => {
    const chosen = words.filter((word) => word.courseId === 'relaxed').slice(0, 12);
    const session = new GameSession({ words: chosen, mode: 'PRACTICE' });
    for (let index = 0; index < chosen.length; index++) {
      const state = session.snapshot(index);
      const wrong = state.remainingGuide[0] === 'z' ? 'q' : 'z';
      for (let mistake = 0; mistake < (index === 11 ? 2 : 1); mistake++) session.input(wrong, index);
      session.nextPracticeWord(index, chosen[(index + 1) % chosen.length]);
    }
    const state = session.snapshot(20);
    expect(state.reviewWordIds).toHaveLength(10);
    expect(state.reviewWordIds[0]).toBe(chosen[11].id);
    expect(state.reviewWordIds.slice(1)).toEqual(chosen.slice(0, 9).map((word) => word.id));
    expect(state.completedWords).toBe(0);
  });
  it('does not duplicate a completed practice word as unfinished and keeps no review entry without errors', () => {
    const session = new GameSession({ words: [neko], mode: 'PRACTICE' });
    const state = complete(session, 0);
    expect(state.unfinishedWord).toBeNull();
    expect(state.reviewWordIds).toEqual([]);
  });
});
