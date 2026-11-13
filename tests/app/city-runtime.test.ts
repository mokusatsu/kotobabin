import { expect, test } from 'vitest';
import { createAppRuntime } from '../../src/app/runtime';
import { ProfileRepository, type RecordContext } from '../../src/profile';
import { CityEconomy, decodeCityState, encodeCityState, initialCityState, MICRO_UNIT, type CityCommand } from '../../src/economy';
import { GameSession, type Word } from '../../src/typing';
import content from '../../spec/initial/data/words.json';
const word = content.words.find(word => word.id === 'living_r02')! as Word;
const context: RecordContext = { courseId: word.courseId, planId: 'city-runtime-test', contentVersion: '2.0.0', generatorVersion: 'test', inputRuleVersion: 'romaji-1.0.0', scoringVersion: 'score-1.0.0', guideUsed: true, assisted: false };

test('confirmed typing grows the first building, purchases once, and freezes the next session multiplier', async () => {
  let mono = 0; let wall = 100_000;
  const repository = await ProfileRepository.open({ indexedDB: null });
  const runtime = await createAppRuntime(repository, { now: () => mono, wallNow: () => wall });
  try {
    const session = new GameSession({ words: [word], mode: 'PRACTICE' });
    expect(runtime.beginSession(session.sessionId, session.mode)).toBe(true);
    for (let index = 0; index < 5; index++) {
      for (const key of 'inu') session.input(key, mono);
      runtime.applyFacts(session.drainEvents(), context);
      if (index < 4) session.repeatWord(mono);
    }
    expect(session.snapshot(mono).score).toBe(300);
    expect(runtime.city.generatedMicro).toBe(30n * MICRO_UNIT);
    expect(runtime.achievements.unlocks.A01).toMatchObject({ acquiredAtMs: 100_000, mode: 'PRACTICE' });
    expect(runtime.achievements.unlocks.F05).toBeDefined();
    mono = 8_000; wall += 8_000;
    runtime.advanceWorld();
    expect(runtime.city.districts.residential.stage).toBe(1);
    expect(runtime.city.districts.residential.shops).toBe(1);
    expect(runtime.city.coinsMicro).toBe(60_050_000n);
    session.endPractice(mono, 'home'); runtime.applyFacts(session.drainEvents(), context);
    const command: CityCommand = { type: 'purchase', cityId: runtime.city.cityId, economyEventId: 'packaging-1', kind: 'packaging', quantity: 1, expectedCount: 1, expectedTotalCostMicro: '50000000' };
    await runtime.cityCommand(command);
    expect(runtime.city.packagingLevel).toBe(1);
    expect(runtime.city.coinsMicro).toBe(10_050_000n);
    expect(runtime.achievements.unlocks.I01).toBeDefined();
    expect(runtime.achievements.unlocks.K01).toBeDefined();
    expect(runtime.achievements.paidEquipmentPurchases).toBe(1);
    const snapshot = runtime.city;
    await runtime.cityCommand(command);
    expect(runtime.city).toEqual(snapshot);
    expect(runtime.achievements.paidEquipmentPurchases).toBe(1);
    expect(new Set(runtime.achievements.unreadAchievements).size).toBe(runtime.achievements.unreadAchievements.length);
    const next = new GameSession({ words: [word], mode: 'PRACTICE' });
    expect(runtime.beginSession(next.sessionId, next.mode)).toBe(true);
    for (const key of 'inu') next.input(key, mono);
    runtime.applyFacts(next.drainEvents(), context);
    expect(next.snapshot(mono).score).toBe(30);
    expect(runtime.city.generatedMicro).toBe(33_750_000n);
    await repository.refresh();
    expect(decodeCityState(repository.snapshot.extensions.city).generatedMicro).toBe(33_750_000n);
    expect(repository.snapshot.extensions.achievements).toEqual(runtime.achievements);
  } finally { runtime.close(); }
});

test('offline clock and saved basis are applied once without generating typing facts', async () => {
  const city = new CityEconomy(initialCityState(100_000));
  city.beginSession('prior'); city.completeWord({ cityId: city.state.cityId, sessionId: 'prior', factSequence: 1, baseLength: 30 }); city.endSession();
  const first = await ProfileRepository.open({ indexedDB: null });
  await first.mutateDocument(document => ({ ...document, extensions: { city: encodeCityState(city.state) } }));
  const now = 100_000 + 9 * 3_600_000;
  const runtime = await createAppRuntime(first, { now: () => 0, wallNow: () => now });
  let stored;
  try {
    expect(runtime.returnSummary?.creditedMs).toBe(28_800_000);
    expect(runtime.city.coinsMicro).toBe(2_939_250_000n);
    expect(runtime.profile.totalCompleted).toBe(0);
    await first.refresh(); stored = first.snapshot;
  } finally { runtime.close(); }
  const reopened = await ProfileRepository.open({ indexedDB: null });
  await reopened.mutateDocument(document => ({ ...document, extensions: stored.extensions, progress: stored.progress }));
  const again = await createAppRuntime(reopened, { now: () => 0, wallNow: () => now });
  try { expect(again.returnSummary).toBe(null); expect(again.city.coinsMicro).toBe(2_939_250_000n); }
  finally { again.close(); }
});

test('invalid stored city is preserved for backup while a shadow memory city remains playable', async () => {
  const repository = await ProfileRepository.open({ indexedDB: null });
  await repository.mutateDocument(document => ({ ...document, extensions: { city: { malformed: 'preserved' } } }));
  const runtime = await createAppRuntime(repository, { now: () => 0, wallNow: () => 100_000 });
  try {
    expect(runtime.status.storage).toBe('memory');
    expect(runtime.status.message).toContain('元データ');
    expect(JSON.parse(runtime.exportData()).originalCityData.current.extensions.city.malformed).toBe('preserved');
    const session = new GameSession({ words: [word], mode: 'PRACTICE' });
    runtime.beginSession(session.sessionId, session.mode);
    for (const key of 'inu') session.input(key, 0);
    runtime.applyFacts(session.drainEvents(), context);
    expect(runtime.profile.totalCompleted).toBe(1);
    expect(runtime.city.generatedMicro).toBe(3_000_000n);
  } finally { runtime.close(); }
});
