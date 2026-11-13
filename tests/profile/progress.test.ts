import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/typing';
import {
  applyProfileFact, applySessionFact, collectionProgress, comparisonKey, createProfileProgress,
  filterCatalogue, practiceQualifiedWordIds, reviewWordIds,
  type ProfileFact, type ProfileProgress, type RecordContext, type RoundRecord,
} from '../../src/profile';

const context: RecordContext = {
  courseId: 'relaxed', planId: 'plan-a', contentVersion: '2.0.0', generatorVersion: '1.0.0',
  inputRuleVersion: 'romaji-1.0.0', scoringVersion: '1.0.0', guideUsed: true, assisted: false,
};
const completed = (sessionId: string, factSequence: number, wordId: string, mode: ProfileFact['mode'] = 'PRACTICE', mistakes = 0): ProfileFact => ({
  sessionId, factSequence, mode, type: 'WordCompleted', wordId, mistakes,
});
const round = (sessionId: string, factSequence: number, overrides: Partial<RoundRecord> = {}, finished = true): ProfileFact => ({
  sessionId, factSequence, mode: 'MAIN', type: 'RoundFinished', completed: finished,
  record: {sessionId, wordIds: ['daily_r01'], context, score: 1000, completedWords: 10, canonicalLength: 60, correctKeys: 60, mistakes: 0, ...overrides},
});

describe('confirmed collection and practice progress', () => {
  it('counts all actual completions once across tutorial, practice, main and retries', () => {
    let state = createProfileProgress();
    const fact = completed('tutorial', 1, 'daily_r01', 'TUTORIAL', 2);
    state = applyProfileFact(state, fact);
    expect(applyProfileFact(state, fact)).toBe(state);
    state = applyProfileFact(state, completed('practice', 1, 'daily_r01'));
    state = applyProfileFact(state, completed('main', 1, 'daily_r01', 'MAIN'));
    expect(state.totalCompleted).toBe(3);
    expect(state.words.daily_r01).toEqual({completed: 3, cleanCompleted: 2, practiceCompleted: 1, practiceCleanCompleted: 1});
    expect(collectionProgress(state, 'kotobabin-ja-960-v2')).toEqual({completed: 1, total: 960});
  });

  it('requires three clean practice completions and never removes qualification on later mistakes', () => {
    let state = createProfileProgress();
    for (let n = 1; n <= 3; n++) state = applyProfileFact(state, completed('p', n, 'daily_r01'));
    state = applyProfileFact(state, completed('p', 4, 'daily_r01', 'PRACTICE', 3));
    state = applyProfileFact(state, completed('main', 1, 'daily_r02', 'MAIN'));
    expect(practiceQualifiedWordIds(state)).toEqual(['daily_r01']);
    expect(state.words.daily_r01.practiceCleanCompleted).toBe(3);
    expect(state.words.daily_r01.completed).toBe(4);
  });

  it('does not silently apply out-of-order facts and does not mutate prior snapshots', () => {
    const initial = createProfileProgress();
    const next = applyProfileFact(initial, completed('p', 1, 'daily_r01'));
    expect(initial.words).toEqual({});
    expect(() => applyProfileFact(next, completed('p', 3, 'daily_r01'))).toThrow('gap');
    expect(next.totalCompleted).toBe(1);
  });

  it('offers all 960 words immediately and combines fixed legacy, course, topic and unfinished filters', () => {
    let state = createProfileProgress();
    expect(filterCatalogue(state)).toHaveLength(960);
    const selected = filterCatalogue(state, {collectionSet: 'kotobabin-ja-240-v1', courseId: 'relaxed', topicId: 'daily', uncompleted: true});
    const word = selected[0];
    expect(word).toBeDefined();
    state = applyProfileFact(state, completed('p', 1, word.id));
    const filtered = filterCatalogue(state, {collectionSet: 'kotobabin-ja-240-v1', courseId: 'relaxed', topicId: 'daily', uncompleted: true});
    expect(filtered).toHaveLength(selected.length - 1);
    expect(filtered.some(item => item.id === word.id)).toBe(false);
    expect(collectionProgress(state, 'kotobabin-ja-240-v1')).toEqual({completed: 1, total: 240});
    expect(filterCatalogue(state, {query: word.reading}).some(item => item.id === word.id)).toBe(true);
  });
});

describe('completed course records', () => {
  it('preserves word progress from aborts without creating a round best or double counting final summaries', () => {
    let state = applyProfileFact(createProfileProgress(), completed('main', 1, 'daily_r01', 'MAIN'));
    state = applyProfileFact(state, round('main', 2, {}, false));
    expect(state.totalCompleted).toBe(1);
    expect(state.bestByComparison).toEqual({});
    state = applyProfileFact(state, round('other', 1));
    expect(state.totalCompleted).toBe(1);
    expect(state.bestByComparison[comparisonKey(context)].bestScore).toBe(1000);
  });

  it('separates guide, assistance and plan comparisons, and growth references require ten words', () => {
    let state = createProfileProgress();
    state = applyProfileFact(state, round('a', 1, {completedWords: 9, score: 3000}));
    expect(state.bestByComparison[comparisonKey(context)].growthBestScore).toBeNull();
    state = applyProfileFact(state, round('b', 1, {score: 500}));
    state = applyProfileFact(state, round('c', 1, {context: {...context, assisted: true}, score: 4000}));
    state = applyProfileFact(state, round('d', 1, {context: {...context, guideUsed: false}, score: 900}));
    state = applyProfileFact(state, round('e', 1, {context: {...context, planId: 'plan-b'}, score: 200}));
    const normal = state.bestByComparison[comparisonKey(context)];
    expect(normal.bestScore).toBe(3000);
    expect(normal.growthBestScore).toBe(500);
    expect(Object.keys(state.bestByComparison)).toHaveLength(4);
  });

  it('keeps aggregate bests after older detailed records leave the latest thirty', () => {
    let state: ProfileProgress = createProfileProgress();
    for (let n = 0; n < 31; n++) state = applyProfileFact(state, round(`s${n}`, 1, {score: n === 0 ? 5000 : 10}));
    expect(state.recentRounds).toHaveLength(30);
    expect(state.recentRounds[0].sessionId).toBe('s1');
    expect(state.bestByComparison[comparisonKey(context)].bestScore).toBe(5000);
  });
});

it('review includes unfinished errors, deduplicates words, orders ties by first appearance, caps at ten', () => {
  const attempts = [
    {wordId:'b', wordPosition:2, mistakes:2}, {wordId:'a', wordPosition:0, mistakes:2},
    {wordId:'b', wordPosition:3, mistakes:1}, {wordId:'clean', wordPosition:1, mistakes:0},
    ...Array.from({length:12}, (_, i) => ({wordId:`late${i}`, wordPosition:4+i, mistakes:1})),
  ];
  expect(reviewWordIds(attempts)).toEqual(['b','a',...Array.from({length:8}, (_, i) => `late${i}`)]);
  expect(reviewWordIds([])).toEqual([]);
});


it('consumes real engine facts including delivery cursor positions and skipped qualification', () => {
  const word = filterCatalogue(createProfileProgress())[0];
  const game = new GameSession({words: [word], sessionId: 'bridge'});
  for (const key of game.snapshot(0).remainingGuide) game.input(key, 1);
  game.deliver(2);
  game.pause(3);
  game.skip(4);
  game.resume(5);
  game.tick(90005);
  const facts = game.drainEvents();
  const initial = createProfileProgress();
  const state = facts.reduce((progress, fact) => applySessionFact(progress, fact, context), initial);
  expect(state.totalCompleted).toBe(1);
  expect(state.recentRounds).toHaveLength(1);
  expect(state.recentRounds[0].context.assisted).toBe(true);
  expect(state.factCursors.bridge).toBe(facts.length);
  expect(facts.reduce((progress, fact) => applySessionFact(progress, fact, context), state)).toBe(state);
});
