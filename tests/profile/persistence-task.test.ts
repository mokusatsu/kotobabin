import { afterEach, expect, test, vi } from 'vitest';
import { GenerationMismatchError, ProfileRepository } from '../../src/profile/repository';
import type { RecordContext } from '../../src/profile';
import { GameSession, type Word } from '../../src/typing';
import content from '../../spec/initial/data/words.json';

afterEach(() => { vi.useRealTimers(); });

test('confirmed batches keep queue order and generation fences while game timers are stopped', async () => {
  const repository = await ProfileRepository.open({ indexedDB: null });
  const before = repository.snapshot;
  const word = content.words.find(item => item.id === 'living_r02')! as Word;
  const context: RecordContext = { courseId: word.courseId, planId: 'timer-independent', contentVersion: '2.0.0', generatorVersion: 'qa', inputRuleVersion: 'romaji-1.0.0', scoringVersion: '1', guideUsed: false, assisted: false };
  const session = new GameSession({ mode: 'PRACTICE', words: [word], sessionId: 'timer-independent' });
  for (const key of session.snapshot(0).remainingGuide) session.input(key, 0);
  const facts = session.drainEvents();
  vi.useFakeTimers();
  try {
    const first = repository.commitFacts(facts, context, { generation: 0, afterInput: true });
    const replay = repository.commitFacts(facts, context, { generation: 0, afterInput: true });
    const reset = repository.resetRecords();
    await Promise.all([first, replay, reset]);
    const committed = repository.snapshot;
    expect(committed.progress.totalCompleted).toBe(1);
    expect(committed.progress.words[word.id].completed).toBe(1);
    expect(committed.metadata.generation).toBe(1);
    expect(before.progress.totalCompleted).toBe(0);
    await expect(repository.commitFacts(facts, context, { generation: 0, afterInput: true })).rejects.toBeInstanceOf(GenerationMismatchError);
    expect(repository.snapshot).toEqual(committed);
    expect(vi.getTimerCount()).toBe(0);
  } finally { repository.close(); }
}, 1000);
