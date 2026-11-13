import { expect, test } from 'vitest';
import { beginAchievementSession, createAchievementState, getAchievementViews } from '../../src/profile/achievements';
import type { RecordContext } from '../../src/profile';
import { GameSession, type Word } from '../../src/typing';
import content from '../../spec/initial/data/words.json';

const word = content.words.find(item => item.id === 'living_r02')! as Word;
const context: RecordContext = { courseId: word.courseId, planId: 'display', contentVersion: '2.0.0', generatorVersion: 'qa', inputRuleVersion: 'romaji-1.0.0', scoringVersion: '1', guideUsed: false, assisted: false };
function source() {
  const state = createAchievementState();
  state.measuredProgress.words[word.id] = { completed: 3, cleanCompleted: 3, practiceCompleted: 3, practiceCleanCompleted: 3 };
  state.measuredProgress.totalCompleted = 3;
  return state;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test('immutable display totals preserve all views and callers cannot corrupt subsequent progress lines', () => {
  const mutable = source(); const immutable = freeze(structuredClone(mutable));
  expect(getAchievementViews(immutable)).toEqual(getAchievementViews(mutable));
  const view = getAchievementViews(immutable);
  expect(view).toHaveLength(72);
  const line = view.find(item => item.id === 'F04')!.progress.find(item => item.key === `practice_word_${word.id}`)!;
  expect(line.current).toBe(3); line.current = 999;
  expect(getAchievementViews(immutable)).toEqual(getAchievementViews(mutable));
});

test('live accepted keys and mistakes remain fresh while immutable word counters stay unchanged', () => {
  const session = new GameSession({ mode: 'MAIN', words: [word], sessionId: 'display', guideEnabled: false });
  const state = freeze(beginAchievementSession(source(), { sessionId: session.sessionId, mode: 'MAIN', context, atMs: 0 }));
  const accuracy = () => getAchievementViews(state, session.snapshot(0), session.sessionId).find(item => item.id === 'C01')!.progress.find(item => item.key === 'accuracy_percent')!.current;
  expect(accuracy()).toBe(0);
  session.input('i', 0); expect(accuracy()).toBe(100);
  session.input('z', 0); expect(accuracy()).toBe(50);
});

test('shallow-frozen maps with mutable counters never retain stale display totals', () => {
  const state = source(); Object.freeze(state.measuredProgress.words);
  const cleanCount = () => getAchievementViews(state).find(item => item.id === 'F02')!.progress.find(item => item.key === 'same_word_practice_clean_count')!.current;
  expect(cleanCount()).toBe(3);
  Object.assign(state.measuredProgress.words[word.id], { completed: 6, cleanCompleted: 6, practiceCompleted: 6, practiceCleanCompleted: 6 });
  state.measuredProgress.totalCompleted = 6;
  expect(cleanCount()).toBe(6);
});
