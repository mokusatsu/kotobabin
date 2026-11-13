import { expect, test } from 'vitest';
import { createAppRuntime } from '../../src/app/runtime';
import { OwnershipError, ProfileRepository, type RecordContext } from '../../src/profile';
import { GameSession, type Word } from '../../src/typing';
import content from '../../spec/initial/data/words.json';

const word = content.words.find(word => word.reading === 'ねこ')! as Word;
const context: RecordContext = { courseId: word.courseId, planId: 'runtime-test', contentVersion: '2.0.0', generatorVersion: 'runtime-test', inputRuleVersion: 'romaji-1.0.0', scoringVersion: 'score-1.0.0', guideUsed: true, assisted: false };

test('memory fallback projects confirmed practice immediately, persists ordered facts, and ignores replays', async () => {
  const repository = await ProfileRepository.open({ indexedDB: null });
  const runtime = await createAppRuntime(repository);
  try {
    expect(runtime.status.storage).toBe('memory');
    expect(runtime.status.writable).toBe(true);
    const session = new GameSession({ words: [word], mode: 'PRACTICE' });
    for (let i = 0; i < 3; i++) {
      for (const key of 'neko') session.input(key, i * 100);
      const facts = session.drainEvents();
      runtime.applyFacts(facts, context);
      runtime.applyFacts(facts, context);
      expect(runtime.profile.words[word.id].practiceCleanCompleted).toBe(i + 1);
      if (i < 2) session.repeatWord(i * 100 + 1);
    }
    await repository.refresh();
    expect(repository.snapshot.progress.words[word.id].practiceCleanCompleted).toBe(3);
    expect(runtime.profile.totalCompleted).toBe(3);
    expect(runtime.status.storage).toBe('memory');
    expect(runtime.status.message).toContain('残りません');
  } finally { runtime.close(); }
});

test('queued settings cannot replace newer local projections with an older write completion', async () => {
  const repository = await ProfileRepository.open({ indexedDB: null });
  const runtime = await createAppRuntime(repository);
  try {
    runtime.updateSettings({ fontScale: 125 });
    runtime.updateSettings({ fontScale: 150, guide: false, deliveryKeys: ['Space', 'Enter'] });
    runtime.updateSettings({ tutorialSeen: true });
    expect(runtime.settings.fontScale).toBe(150);
    expect(runtime.settings.tutorialSeen).toBe(true);
    // The export also includes the immediate projection while queued writes are pending.
    expect(JSON.parse(runtime.exportData()).currentView.settings.fontScale).toBe(150);
    await repository.refresh();
    await repository.refresh();
    expect(runtime.settings.fontScale).toBe(150);
    expect(repository.snapshot.settings.deliveryKeys).toEqual(['Space', 'Enter']);
    expect(repository.snapshot.tutorialSeen).toBe(true);
  } finally { runtime.close(); }
});


test('a pre-stage ownership rejection preserves confirmed projection through refresh and requires explicit discard', async () => {
  const repository = await ProfileRepository.open({ indexedDB: null });
  let notify = () => {};
  repository.subscribe = listener => { notify = listener; return () => {}; };
  const status = { storage: 'indexeddb' as const, ownership: 'owner' as 'owner' | 'readonly', saveState: 'saved' as const, recoveryRequired: false, notice: '' };
  Object.defineProperty(repository, 'status', { get: () => ({ ...status }) });
  const mutate = repository.mutateDocument.bind(repository);
  let mutationTail = Promise.resolve();
  repository.mutateDocument = (reducer, options) => {
    const result = mutationTail.then(async () => {
      if (reducer(repository.snapshot).progress.totalCompleted > 0) { status.ownership = 'readonly'; notify(); throw new OwnershipError(); }
      await mutate(reducer, options);
    });
    mutationTail = result.catch(() => {});
    return result;
  };
  repository.takeover = async () => { status.ownership = 'owner'; notify(); };
  const runtime = await createAppRuntime(repository);
  try {
    const session = new GameSession({ words: [word], mode: 'PRACTICE' });
    for (const key of 'neko') session.input(key, 1);
    runtime.applyFacts(session.drainEvents(), context);
    expect(runtime.profile.totalCompleted).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 0));
    notify();
    expect(runtime.profile.totalCompleted).toBe(1);
    expect(runtime.status).toMatchObject({ writable: false, storage: 'error' });
    expect(JSON.parse(runtime.exportData()).currentView.progress.totalCompleted).toBe(1);
    await runtime.retrySave();
    notify();
    expect(runtime.profile.totalCompleted).toBe(1);
    await expect(runtime.takeOver()).rejects.toThrow('未保存');
    await runtime.takeOver({ discardUnsaved: true });
    expect(runtime.profile.totalCompleted).toBe(0);
    expect(JSON.parse(runtime.exportData()).abandonedProjection.progress.totalCompleted).toBe(1);
  } finally { runtime.close(); }
});
