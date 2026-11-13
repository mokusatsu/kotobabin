import { expect, test } from '@playwright/test';

test('city command receipts survive IndexedDB reopen and a failing profile fact rolls back the whole city mutation', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const profileSource = '/src/profile/index.ts';
    const economySource = '/src/economy/index.ts';
    const { ProfileRepository, applySessionFact } = await import(profileSource);
    const { CityEconomy, encodeCityState, decodeCityState, executeCityCommand } = await import(economySource);
    const dbName = `kotobabin-qa-city-atomic-${crypto.randomUUID()}`;
    let repository = await ProfileRepository.open({ dbName, tabId: 'city-owner' });
    // A deterministic domain fixture: five confirmed L3 words and their full shipment produce 30 materials.
    await repository.mutateDocument((document: { extensions: Record<string, unknown> }) => {
      const city = new CityEconomy();
      city.beginSession('fixture-five-dogs');
      for (let sequence = 1; sequence <= 5; sequence++) city.completeWord({ cityId: 'city-1', sessionId: 'fixture-five-dogs', factSequence: sequence, baseLength: 3 });
      city.shipCargo({ cityId: 'city-1', sessionId: 'fixture-five-dogs', factSequence: 6, scoreSum: 150, cargoCount: 5, reason: 'full' });
      city.endSession(); city.advance(60000);
      return { ...document, extensions: { ...document.extensions, city: encodeCityState(city.snapshot()) } };
    });
    const command = { type: 'purchase', kind: 'packaging', quantity: 1, cityId: 'city-1', economyEventId: 'purchase-once', atMs: 60000, expectedCount: 1, expectedTotalCostMicro: '50000000' };
    const purchase = (document: { extensions: Record<string, unknown> }) => {
      const city = new CityEconomy(decodeCityState(document.extensions.city));
      executeCityCommand(city, command);
      return { ...document, extensions: { ...document.extensions, city: encodeCityState(city.snapshot()) } };
    };
    await repository.mutateDocument(purchase);
    const afterPurchase = repository.snapshot;
    repository.close();
    repository = await ProfileRepository.open({ dbName, tabId: 'city-owner' });
    await repository.mutateDocument(purchase);
    const afterReplay = repository.snapshot;
    let collision = '';
    try {
      await repository.mutateDocument((document: { extensions: Record<string, unknown> }) => {
        const city = new CityEconomy(decodeCityState(document.extensions.city));
        executeCityCommand(city, { ...command, quantity: 10 });
        return { ...document, extensions: { ...document.extensions, city: encodeCityState(city.snapshot()) } };
      });
    } catch (error) { collision = error instanceof Error ? error.message : String(error); }
    const beforeAtomicFailure = repository.snapshot;
    let atomicFailure = '';
    try {
      await repository.mutateDocument((document: { extensions: Record<string, unknown>; progress: unknown }) => {
        const city = new CityEconomy(decodeCityState(document.extensions.city));
        city.advance(1000); // Must not persist if the related profile reduction fails.
        document.extensions.city = encodeCityState(city.snapshot());
        document.progress = applySessionFact(document.progress, {
          type: 'WordCompleted', sessionId: 'invalid-gap', factSequence: 99, mode: 'MAIN', wordId: 'living_r02', mistakes: 0,
        }, { courseId: 'relaxed', planId: 'fixture', contentVersion: '2.0.0', generatorVersion: 'fixture', inputRuleVersion: 'romaji-1.0.0', scoringVersion: '1', guideUsed: true, assisted: false });
        return document;
      });
    } catch (error) { atomicFailure = error instanceof Error ? error.message : String(error); }
    const afterAtomicFailure = repository.snapshot;
    repository.close();
    repository = await ProfileRepository.open({ dbName, tabId: 'city-owner' });
    const reopenedAfterFailure = repository.snapshot;
    const status = repository.status;
    repository.close(); indexedDB.deleteDatabase(dbName);
    return { afterPurchase, afterReplay, collision, beforeAtomicFailure, atomicFailure, afterAtomicFailure, reopenedAfterFailure, status };
  });
  expect(result.afterPurchase.extensions.city).toMatchObject({ packagingLevel: 1, coinsMicro: '15250000', generatedMicro: '30000000' });
  expect(result.afterReplay.extensions.city).toEqual(result.afterPurchase.extensions.city);
  expect(result.collision).toContain('different content');
  expect(result.atomicFailure).toContain('gap');
  expect(result.afterAtomicFailure).toEqual(result.beforeAtomicFailure);
  expect(result.reopenedAfterFailure).toEqual(result.beforeAtomicFailure);
  expect(result.status).toMatchObject({ storage: 'indexeddb', ownership: 'owner', saveState: 'saved' });
});
