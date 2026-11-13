import { describe, expect, test } from 'vitest';
import content from '../../spec/initial/data/words.json';
import { GameSession, type Word } from '../../src/typing';
import { DEFAULT_SESSION_RULES, sessionRules } from '../../src/config/game-parameters';
import { comparisonExport, createComparison, type DevConditions } from '../../src/dev/comparison';
const words = content.words as Word[];
const dog = words.find(word => word.reading === 'いぬ')!;
const conditions = (patch: Partial<DevConditions> = {}): DevConditions => ({ courseId: 'relaxed', wordId: dog.id, seed: 42, cargoCount: 0, remainingMs: 90_000, imePaused: false, event: 'none', rules: {}, ...patch });
describe('isolated development comparisons', () => {
  test('formal constructor and explicit defaults preserve the reference scoring facts', () => {
    const normal = new GameSession({ words: [dog], sessionId: 'same' });
    const explicit = new GameSession({ words: [dog], sessionId: 'same', rules: DEFAULT_SESSION_RULES });
    for (let count = 0; count < 5; count++) for (const key of 'inu') { normal.input(key, 10); explicit.input(key, 10); }
    expect(explicit.snapshot(10)).toEqual(normal.snapshot(10));
    expect(explicit.snapshot(10).score).toBe(300);
    expect(explicit.drainEvents()).toEqual(normal.drainEvents());
  });
  test('three-cargo comparison uses the actual engine and consistent full coefficient', () => {
    const result = createComparison(words, conditions({ cargoCount: 2, remainingMs: 5000,
      rules: { roundDurationMs: 60_000, pointPerCanonicalKey: 20, maxCargo: 3, cargoRateNumerators: [1, 2, 3], cargoRateDenominator: 3 } }));
    const before = result.session.snapshot(result.nowMs);
    expect(before).toMatchObject({ phase: 'PAUSED', cargoCount: 2, baseScore: 120, remainingMs: 5000 });
    result.session.resume(result.nowMs);
    for (const key of 'inu') result.session.input(key, result.nowMs);
    expect(result.session.snapshot(result.nowMs)).toMatchObject({ score: 360, baseScore: 180, bonusScore: 180, cargoCount: 0 });
    expect(result.session.drainEvents()).toContainEqual(expect.objectContaining({ type: 'DeliveryCommitted', reason: 'full', cargoCount: 3, bonus: 180 }));
    expect(new GameSession({ words: [dog] }).snapshot(0).remainingMs).toBe(90_000);
  });
  test('rules reject inconsistent cargo rates and cannot be changed after construction', () => {
    expect(() => sessionRules({ maxCargo: 3 })).toThrow('係数');
    expect(() => sessionRules({ cargoRateNumerators: [1, 2, 1, 4, 5] })).toThrow('係数');
    const rates = [1, 2, 3];
    const configured = sessionRules({ maxCargo: 3, cargoRateNumerators: rates, cargoRateDenominator: 3 });
    rates[0] = 100;
    expect(configured.cargoRateNumerators).toEqual([1, 2, 3]);
    expect(Object.isFrozen(configured)).toBe(true);
  });
  test('seed replay is deterministic, custom readings reuse RomajiEngine, and exports are development-only', () => {
    const input = conditions({ wordId: null, event: 'complete' });
    const first = createComparison(words, input), second = createComparison(words, input);
    expect(first.session.snapshot(first.nowMs).wordIds).toEqual(second.session.snapshot(second.nowMs).wordIds);
    expect(first.session.sessionId).not.toBe(second.session.sessionId);
    const custom = createComparison(words, conditions({ customWord: { display: '試験', reading: 'しんぶん' }, event: 'complete' }));
    expect(custom.facts[0]).toMatchObject({ type: 'WordCompleted', wordId: 'development-custom', canonicalLength: 7 });
    expect(comparisonExport(custom, custom.session.snapshot(0))).toMatchObject({ kind: 'kotobabin-development-comparison', normalRecord: false });
  });
  test('all requested score events are actual engine facts rather than assigned values', () => {
    const full = createComparison(words, conditions({ cargoCount: 5 }));
    expect(full.session.snapshot(0).cargoCount).toBe(0);
    expect(full.facts).toContainEqual(expect.objectContaining({ type: 'DeliveryCommitted', reason: 'full', cargoCount: 5 }));
    const manual = createComparison(words, conditions({ event: 'manual' }));
    expect(manual.facts).toContainEqual(expect.objectContaining({ type: 'DeliveryCommitted', reason: 'manual', cargoCount: 1 }));
    const error = createComparison(words, conditions({ cargoCount: 2, event: 'mistake' }));
    expect(error.session.snapshot(0)).toMatchObject({ mistakes: 1, cargoCount: 0, baseScore: 60 });
    const skipped = createComparison(words, conditions({ event: 'skip' }));
    expect(skipped.facts).toContainEqual(expect.objectContaining({ type: 'WordSkipped' }));
    const deadline = createComparison(words, conditions({ cargoCount: 2, event: 'deadline' }));
    expect(deadline.session.snapshot(deadline.nowMs)).toMatchObject({ phase: 'RESULT', remainingMs: 0, baseScore: 60, bonusScore: 24 });
    expect(deadline.facts).toContainEqual(expect.objectContaining({ type: 'RoundFinished', completed: true }));
    expect(createComparison(words, conditions({ imePaused: true })).imePaused).toBe(true);
  });
});
