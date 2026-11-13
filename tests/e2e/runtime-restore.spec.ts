import { expect, test } from '@playwright/test';

test('the public runtime restores a confirmed current backup over protected corruption and preserves the raw original', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const repositorySource = '/src/profile/repository.ts';
    const runtimeSource = '/src/app/runtime.ts';
    const { ProfileRepository, createProfileDocument } = await import(repositorySource);
    const { createAppRuntime } = await import(runtimeSource);
    const dbName = `kotobabin-runtime-corrupt-restore-${crypto.randomUUID()}`;
    const bad = createProfileDocument(); bad.progress.totalCompleted = 999;
    bad.metadata = { ...bad.metadata, ownerTabId: 'old-owner', generation: 7, revision: 9, writeEpoch: 3 };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(dbName, 4);
      request.onupgradeneeded = () => request.result.createObjectStore('profile').put(bad, 'current');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { request.result.close(); resolve(); };
    });
    const repository = await ProfileRepository.open({ dbName, tabId: 'recovery-owner' });
    const runtime = await createAppRuntime(repository, { now: () => 0, wallNow: () => 1000 });
    await repository.refresh();
    const before = { runtime: runtime.status, repository: repository.status };
    const backup = createProfileDocument(); backup.settings.fontScale = 125;
    // This public method is called only after the UI's explicit overwrite confirmation.
    await runtime.restoreProfile({ repository: { current: backup } });
    await repository.refresh();
    const saved = { runtime: runtime.status, repository: repository.status, metadata: repository.snapshot.metadata,
      settings: runtime.settings, completed: runtime.profile.totalCompleted, exported: JSON.parse(runtime.exportData()) };
    let oldGeneration = '';
    try { await repository.mutateDocument((document: typeof backup) => document, { generation: 7 }); }
    catch (error) { oldGeneration = error instanceof Error ? error.constructor.name : String(error); }
    runtime.close();
    const reopened = await ProfileRepository.open({ dbName, tabId: 'recovery-owner' });
    const persisted = reopened.snapshot; const reopenedStatus = reopened.status;
    reopened.close(); indexedDB.deleteDatabase(dbName);
    return { before, saved, oldGeneration, persisted, reopenedStatus };
  });
  expect(result.before.repository.recoveryRequired).toBe(true);
  expect(result.before.runtime.storage).toBe('memory');
  expect(result.saved.runtime).toMatchObject({ storage: 'saved', writable: true });
  expect(result.saved.repository).toMatchObject({ storage: 'indexeddb', saveState: 'saved', recoveryRequired: false });
  expect(result.saved.metadata).toMatchObject({ generation: 8, writeEpoch: 4, ownerTabId: 'recovery-owner' });
  expect(result.saved.settings.fontScale).toBe(125); expect(result.saved.completed).toBe(0);
  const previous = result.saved.exported.repository.restoreBackups[0];
  expect(previous.persistedCurrent.progress.totalCompleted).toBe(999);
  expect(previous.originalInvalidData.progress.totalCompleted).toBe(999);
  expect(result.oldGeneration).toBe('GenerationMismatchError');
  expect(result.persisted.metadata.generation).toBe(8);
  expect(result.persisted.settings.fontScale).toBe(125);
  expect(result.persisted.progress.totalCompleted).toBe(0);
  expect(result.reopenedStatus).toMatchObject({ storage: 'indexeddb', saveState: 'saved', recoveryRequired: false });
});
