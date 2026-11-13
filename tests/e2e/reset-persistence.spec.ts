import { expect, test } from '@playwright/test';

test('actual IndexedDB resets keep separate scopes and reject facts from a deleted generation after reopen', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const profileSource = '/src/profile/index.ts';
    const typingSource = '/src/typing/index.ts';
    const economySource = '/src/economy/index.ts';
    const { ProfileRepository } = await import(profileSource);
    const { GameSession } = await import(typingSource);
    const { encodeCityState, initialCityState } = await import(economySource);
    const content = await (await fetch('/spec/initial/data/words.json')).json();
    const word = content.words.find((word: { id: string }) => word.id === 'living_r01');
    const context = { courseId: 'relaxed', planId: 'reset-test', contentVersion: '2.0.0', generatorVersion: 'test',
      inputRuleVersion: 'romaji-1.0.0', scoringVersion: '1', guideUsed: true, assisted: false };
    const facts = (id: string, mode: 'MAIN' | 'PRACTICE') => {
      const session = new GameSession({ words: [word], sessionId: id, mode });
      for (const key of session.snapshot(0).remainingGuide) session.input(key, 0);
      if (mode === 'MAIN') session.tick(90000); else session.endPractice(1, 'home');
      return session.drainEvents();
    };
    const dbName = `kotobabin-qa-reset-${crypto.randomUUID()}`;
    let repository = await ProfileRepository.open({ dbName, tabId: 'reset-owner' });
    const originalGeneration = repository.snapshot.metadata.generation;
    await repository.commitFacts(facts('initial-main', 'MAIN'), context, { generation: originalGeneration });
    await repository.commitFacts(facts('initial-practice', 'PRACTICE'), context, { generation: originalGeneration });
    await repository.updateSettings({ guide: false, fontScale: 150 });
    await repository.markTutorialSeen();
    await repository.commitExtension('city', encodeCityState(initialCityState()));
    await repository.resetRecords();
    const recordsReset = repository.snapshot;
    repository.close();
    repository = await ProfileRepository.open({ dbName, tabId: 'reset-owner' });
    const recordsReopened = repository.snapshot;
    let oldFactError = '';
    try { await repository.commitFacts(facts('old-delayed-session', 'MAIN'), context, { generation: originalGeneration }); }
    catch (error) { oldFactError = error instanceof Error ? error.constructor.name : String(error); }
    const afterRejected = repository.snapshot;
    await repository.commitFacts(facts('new-main', 'MAIN'), context, { generation: afterRejected.metadata.generation });
    await repository.resetCollectionAndEconomy();
    const collectionReset = repository.snapshot;
    await repository.resetSettings();
    const settingsReset = repository.snapshot;
    repository.close();
    repository = await ProfileRepository.open({ dbName, tabId: 'reset-owner' });
    const final = repository.snapshot;
    const finalStatus = repository.status;
    repository.close();
    indexedDB.deleteDatabase(dbName);
    return { originalGeneration, recordsReset, recordsReopened, oldFactError, afterRejected, collectionReset, settingsReset, final, finalStatus };
  });
  expect(result.recordsReset.progress.totalCompleted).toBe(2);
  expect(result.recordsReset.progress.recentRounds).toHaveLength(0);
  expect(result.recordsReset.extensions.city.cityId).toBe('city-1');
  expect(result.recordsReset.metadata.generation).toBe(result.originalGeneration + 1);
  expect(result.recordsReopened).toEqual(result.recordsReset);
  expect(result.oldFactError).toBe('GenerationMismatchError');
  expect(result.afterRejected).toEqual(result.recordsReopened);
  expect(result.collectionReset.progress.totalCompleted).toBe(0);
  expect(result.collectionReset.progress.words).toEqual({});
  expect(result.collectionReset.progress.recentRounds).toHaveLength(1);
  expect(result.collectionReset.extensions).toEqual({});
  expect(result.collectionReset.settings).toMatchObject({ guide: false, fontScale: 150 });
  expect(result.collectionReset.tutorialSeen).toBe(true);
  expect(result.settingsReset.settings).toMatchObject({ guide: true, fontScale: 100 });
  expect(result.settingsReset.metadata.generation).toBe(result.originalGeneration + 2);
  expect(result.final).toEqual(result.settingsReset);
  expect(result.finalStatus).toMatchObject({ storage: 'indexeddb', saveState: 'saved', ownership: 'owner' });
});
