import { expect, test } from '@playwright/test';

test('the actual runtime persists confirmed typing once and caps offline city time once across reopen', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const profileSource = '/src/profile/index.ts';
    const runtimeSource = '/src/app/runtime.ts';
    const typingSource = '/src/typing/index.ts';
    const wordsSource = '/spec/initial/data/words.json';
    const { ProfileRepository } = await import(profileSource);
    const { createAppRuntime } = await import(runtimeSource);
    const { GameSession } = await import(typingSource);
    const content = await (await fetch(wordsSource)).json();
    const word = content.words.find((value: { id: string }) => value.id === 'living_r02');
    const context = { courseId: 'relaxed', planId: 'runtime-qa', contentVersion: '2.0.0', generatorVersion: 'runtime-qa', inputRuleVersion: 'romaji-1.0.0', scoringVersion: '1', guideUsed: true, assisted: false };
    const dbName = `kotobabin-qa-runtime-${crypto.randomUUID()}`;
    let mono = 0; let wall = 1000;
    let repository = await ProfileRepository.open({ dbName, tabId: 'runtime-owner' });
    let runtime = await createAppRuntime(repository, { now: () => mono, wallNow: () => wall });
    await repository.refresh();
    const session = new GameSession({ mode: 'PRACTICE', words: [word], sessionId: 'runtime-five-dogs' });
    runtime.beginSession(session.sessionId, 'PRACTICE');
    for (let index = 0; index < 5; index++) {
      for (const key of session.snapshot(0).remainingGuide) session.input(key, 0);
      const facts = session.drainEvents();
      runtime.applyFacts(facts, context);
      runtime.applyFacts(facts, context); // A retried confirmed batch is a no-op.
      if (index < 4) session.repeatWord(0);
    }
    await repository.refresh();
    const generated = runtime.city.generatedMicro.toString();
    const completed = runtime.profile.totalCompleted;
    mono = 8000; wall += 8000;
    runtime.advanceWorld();
    session.endPractice(0, 'home'); runtime.applyFacts(session.drainEvents(), context);
    await repository.refresh();
    const before = { clock: runtime.city.clockMs, generated: runtime.city.generatedMicro.toString(), coins: runtime.city.coinsMicro.toString(), stage: runtime.city.districts.residential.stage };
    runtime.close();
    wall += 10 * 60 * 60 * 1000; mono = 0;
    repository = await ProfileRepository.open({ dbName, tabId: 'runtime-owner' });
    runtime = await createAppRuntime(repository, { now: () => mono, wallNow: () => wall });
    await repository.refresh();
    const after = { clock: runtime.city.clockMs, generated: runtime.city.generatedMicro.toString(), coins: runtime.city.coinsMicro.toString(), credited: runtime.returnSummary?.creditedMs, completed: runtime.profile.totalCompleted, active: runtime.city.activeSession };
    runtime.close();
    repository = await ProfileRepository.open({ dbName, tabId: 'runtime-owner' });
    runtime = await createAppRuntime(repository, { now: () => mono, wallNow: () => wall });
    await repository.refresh();
    const reopened = { clock: runtime.city.clockMs, generated: runtime.city.generatedMicro.toString(), coins: runtime.city.coinsMicro.toString() };
    runtime.close(); indexedDB.deleteDatabase(dbName);
    return { generated, completed, before, after, reopened };
  });
  expect(result.generated).toBe('30000000');
  expect(result.completed).toBe(5);
  expect(result.before.stage).toBe(1);
  expect(result.after.credited).toBe(8 * 60 * 60 * 1000);
  expect(result.after.clock - result.before.clock).toBe(8 * 60 * 60 * 1000);
  expect(result.after.generated).toBe(result.before.generated);
  expect(result.after.completed).toBe(5);
  expect(result.after.active).toBeNull();
  expect(BigInt(result.after.coins)).toBeGreaterThan(BigInt(result.before.coins));
  expect(result.reopened).toEqual({ clock: result.after.clock, generated: result.after.generated, coins: result.after.coins });
});
