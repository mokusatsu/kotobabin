import { expect, test } from 'vitest';
import { createAchievementState, getAchievementViews } from '../../src/profile/achievements';
import { recommendDeliveryGoal } from '../../src/ui/goal-recommendation';
import { goalStrip } from '../../src/ui/handbook';

test('fresh recommendations expose engine counters without pinning or modifying the ledger', () => {
  const state = createAchievementState();
  const before = JSON.stringify(state);
  const views = getAchievementViews(state);
  const recommended = recommendDeliveryGoal(views)!;
  expect(recommended.achievement.id).toBe('A01');
  expect(recommended.progress).toBe(views[0].progress[0]);
  expect(goalStrip(views, state)).toBe('');
  const markup = goalStrip(views, state, { recommend: true });
  expect(markup).toContain('data-goal-kind="recommended"');
  expect(markup).toContain(recommended.achievement.condition);
  expect(markup).toContain(`${recommended.progress.current} / ${recommended.progress.target}`);
  expect(markup).not.toContain('data-action=');
  expect(JSON.stringify(state)).toBe(before);
});

test('explicit goals always win over a recommendation, including an ineligible chosen goal', () => {
  const state = createAchievementState();
  state.targetId = 'B01';
  const views = getAchievementViews(state).map(view => view.id === 'B01' ? { ...view, ineligible: true } : view);
  const markup = goalStrip(views, state, { recommend: true });
  expect(markup).toContain('data-goal-kind="pinned"');
  expect(markup).toContain('data-achievement-id="B01"');
  expect(markup).toContain('今回は対象外');
  expect(markup).not.toContain('おすすめ');
});

test('suggestions skip earned, ineligible, hidden, practice-only and nonnumeric views', () => {
  const views = getAchievementViews(createAchievementState());
  const unusable = views.map(view => ({ ...view, earned: true }));
  const candidates = [
    { ...views[0], ineligible: true },
    { ...views[1], hidden: true, hiddenRevealed: true },
    { ...views[2], scope: '練' },
    { ...views[3], progress: views[3].progress.map(line => ({ ...line, target: null })) },
    views[4],
  ];
  expect(recommendDeliveryGoal([...candidates, ...unusable])?.achievement.id).toBe('A05');
  expect(recommendDeliveryGoal(unusable)).toBeNull();
  expect(goalStrip(unusable, createAchievementState(), { recommend: true })).toBe('');
});

test('earning the suggested stamp advances the next view-only reward', () => {
  const views = getAchievementViews(createAchievementState());
  expect(recommendDeliveryGoal(views.map(view => view.id === 'A01' ? { ...view, earned: true } : view))?.achievement.id).toBe('A02');
});

test('a remaining main achievement is still suggested after the introductory families are complete', () => {
  const views = getAchievementViews(createAchievementState()).map(view => ({ ...view, earned: view.id !== 'H01' }));
  expect(recommendDeliveryGoal(views)?.achievement.id).toBe('H01');
});
