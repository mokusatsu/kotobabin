import { expect, test } from 'vitest';
import { applyAchievementCity, applyAchievementFacts, beginAchievementSession, createAchievementState } from '../../src/profile/achievements';
import { initialCityState } from '../../src/economy';
import { GameSession, type Word } from '../../src/typing';
import type { RecordContext } from '../../src/profile';
import content from '../../spec/initial/data/words.json';

const context: RecordContext = { courseId: 'relaxed', planId: 'immutable', contentVersion: '2.0.0', generatorVersion: 'qa', inputRuleVersion: 'romaji-1.0.0', scoringVersion: '1', guideUsed: false, assisted: false };
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}

test('confirmed words, deliveries, and terminal awards leave previously observed achievement history intact', () => {
  const game = new GameSession({ mode: 'MAIN', words: [content.words[0] as Word], sessionId: 'immutable', guideEnabled: false });
  const ready = freeze(beginAchievementSession(createAchievementState(), { sessionId: game.sessionId, mode: 'MAIN', context, atMs: 0 }));
  const readyJSON = JSON.stringify(ready);
  for (let word = 0; word < 10; word++) for (const key of game.snapshot(0).remainingGuide) game.input(key, 0);
  const active = freeze(applyAchievementFacts(ready, game.drainEvents(), context));
  const activeJSON = JSON.stringify(active);
  expect(active.sessions.immutable.completedWords).toBe(10);
  expect(active.fullDeliveries).toBe(2);
  expect(active.unlocks.A01).toBeDefined();
  game.tick(90000);
  const completed = freeze(applyAchievementFacts(active, game.drainEvents(), context));
  expect(completed.completedRounds).toBe(1);
  expect(completed.measuredProgress.recentRounds).toHaveLength(1);
  expect(completed.unlocks.C04).toBeDefined();
  expect(JSON.stringify(ready)).toBe(readyJSON);
  expect(JSON.stringify(active)).toBe(activeJSON);
  expect(completed.sessions.immutable.phase).toBe('completed');
});

test('city rewards and event deduplication cannot mutate an earlier achievement view', () => {
  const before = freeze(createAchievementState());
  const originalJSON = JSON.stringify(before);
  const event = { eventId: 'purchase', atMs: 1, city: initialCityState(0), paidEquipmentPurchase: true };
  const after = freeze(applyAchievementCity(before, event));
  const afterJSON = JSON.stringify(after);
  const replay = applyAchievementCity(after, event);
  expect(after.unlocks.K01).toBeDefined();
  expect(after.paidEquipmentPurchases).toBe(1);
  expect(replay.paidEquipmentPurchases).toBe(1);
  expect(replay.unreadRewards).toEqual(after.unreadRewards);
  expect(JSON.stringify(before)).toBe(originalJSON);
  expect(JSON.stringify(after)).toBe(afterJSON);
});
