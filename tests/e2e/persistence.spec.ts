import { expect, test } from '@playwright/test';

// These tests use genuine browser IndexedDB with isolated database names.
// They exercise the repository contract directly, separately from UI navigation.
test('IndexedDB commits confirmed facts atomically and reopens without duplicate progress', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const repositorySource = '/src/profile/repository.ts';
    const typingSource = '/src/typing/index.ts';
    const { ProfileRepository } = await import(repositorySource);
    const { GameSession } = await import(typingSource);
    const response = await fetch('/spec/initial/data/words.json');
    const content = await response.json();
    const dbName = `kotobabin-qa-facts-${crypto.randomUUID()}`;
    const repository = await ProfileRepository.open({ dbName, tabId: 'facts-owner' });
    const statuses: string[] = [];
    repository.subscribe(() => statuses.push(repository.status.saveState));
    const session = new GameSession({
      words: [content.words.find((word: { id: string }) => word.id === 'living_r01')],
      mode: 'PRACTICE', sessionId: 'idempotent-practice',
    });
    for (const key of session.snapshot(0).remainingGuide) session.input(key, 1);
    const facts = session.drainEvents();
    const context = { courseId: 'relaxed', planId: 'qa', contentVersion: '2.0.0', generatorVersion: 'qa',
      inputRuleVersion: 'romaji-1.0.0', scoringVersion: '1', guideUsed: true, assisted: false };
    await repository.commitFacts(facts, context);
    await repository.commitFacts(facts, context);
    await repository.updateSettings({ fontScale: 150, deliveryKeys: ['Enter'] });
    const saved = repository.status;
    repository.close();
    const reopened = await ProfileRepository.open({ dbName, tabId: 'facts-owner' });
    const snapshot = reopened.snapshot;
    const reopenedStatus = reopened.status;
    reopened.close();
    indexedDB.deleteDatabase(dbName);
    return { statuses, saved, reopenedStatus, total: snapshot.progress.totalCompleted,
      clean: snapshot.progress.words.living_r01.practiceCleanCompleted, settings: snapshot.settings };
  });
  expect(result.saved).toMatchObject({ storage: 'indexeddb', saveState: 'saved', ownership: 'owner' });
  expect(result.statuses).toContain('pending');
  expect(result.statuses.at(-1)).toBe('saved');
  expect(result.reopenedStatus).toMatchObject({ storage: 'indexeddb', saveState: 'saved', ownership: 'owner' });
  expect(result.total).toBe(1);
  expect(result.clean).toBe(1);
  expect(result.settings.fontScale).toBe(150);
  expect(result.settings.deliveryKeys).toEqual(['Enter']);
});

test('ownership takeover rejects stale writes and preserves abandoned unsaved data for export', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const source = '/src/profile/repository.ts';
    const { ProfileRepository } = await import(source);
    const dbName = `kotobabin-qa-owner-${crypto.randomUUID()}`;
    // Prove transaction epoch checks also work when ownership notifications are unavailable.
    const channelDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'BroadcastChannel');
    Object.defineProperty(globalThis, 'BroadcastChannel', { configurable: true, value: undefined });
    const first = await ProfileRepository.open({ dbName, tabId: 'first' });
    const second = await ProfileRepository.open({ dbName, tabId: 'second' });
    if (channelDescriptor) Object.defineProperty(globalThis, 'BroadcastChannel', channelDescriptor);
    else Reflect.deleteProperty(globalThis, 'BroadcastChannel');
    const secondInitially = second.status.ownership;
    await first.updateSettings({ guide: false });
    await second.takeover();
    let staleError = '';
    try { await first.updateSettings({ fontScale: 150 }); } catch (error) {
      staleError = error instanceof Error ? error.constructor.name : String(error);
    }
    await second.updateSettings({ fontScale: 125 });
    let unconfirmedDiscardError = '';
    try { await first.takeover(); } catch (error) {
      unconfirmedDiscardError = error instanceof Error ? error.constructor.name : String(error);
    }
    await first.takeover({ discardUnsaved: true });
    const current = first.snapshot;
    const exported = JSON.parse(first.exportData());
    const recovered = first.status;
    first.close(); second.close();
    indexedDB.deleteDatabase(dbName);
    return { secondInitially, staleError, unconfirmedDiscardError, recovered, settings: current.settings,
      abandonedScale: exported.originalInvalidData?.abandonedUnsavedData?.settings.fontScale };
  });
  expect(result.secondInitially).toBe('readonly');
  expect(result.staleError).toBe('OwnershipError');
  expect(result.unconfirmedDiscardError).toBe('RevisionConflictError');
  expect(result.recovered).toMatchObject({ ownership: 'owner', storage: 'indexeddb', saveState: 'saved' });
  expect(result.settings).toMatchObject({ guide: false, fontScale: 125 });
  expect(result.abandonedScale).toBe(150);
});

test('unmigrated legacy storage remains protected across repeated opens', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const dbName = `kotobabin-qa-legacy-${crypto.randomUUID()}`;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 3);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('legacyRecords').put({ score: 123, title: 'preserved' }, 'old-record');
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    const source = '/src/profile/repository.ts';
    const { ProfileRepository } = await import(source);
    const first = await ProfileRepository.open({ dbName, tabId: 'legacy-first' });
    const firstStatus = first.status;
    first.close();
    const second = await ProfileRepository.open({ dbName, tabId: 'legacy-second' });
    const secondStatus = second.status;
    const exported = second.exportData();
    second.close();
    indexedDB.deleteDatabase(dbName);
    return { firstStatus, secondStatus, exported };
  });
  expect(result.firstStatus).toMatchObject({ storage: 'memory', recoveryRequired: true });
  expect(result.secondStatus).toMatchObject({ storage: 'memory', recoveryRequired: true });
  expect(result.exported).toContain('old-record');
  expect(result.exported).toContain('preserved');
});
