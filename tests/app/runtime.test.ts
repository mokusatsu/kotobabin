import { expect, test } from 'vitest';
import { createAppRuntime } from '../../src/app/runtime';
import { ProfileRepository, type RecordContext } from '../../src/profile';
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
