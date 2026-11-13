import { describe, expect, it } from 'vitest';
import content from '../../spec/initial/data/words.json';
import { GameSession, type SessionMode, type Word } from '../../src/typing';
import { comparisonKey, type RecordContext } from '../../src/profile';
import { createAchievementState, beginAchievementSession, applyAchievementFacts } from '../../src/profile/achievements';

const words = content.words as Word[];
const neko = words.find((word) => word.reading === 'ねこ')!;
const context = (patch: Partial<RecordContext> = {}): RecordContext => ({
  courseId: 'relaxed', planId: 'actual-key-order', contentVersion: content.contentVersion,
  generatorVersion: 'fixed-word-list-1.0.0', inputRuleVersion: 'romaji-1.0.0',
  scoringVersion: 'score-1.0.0', guideUsed: true, assisted: false, ...patch,
});
type Ledger = ReturnType<typeof createAchievementState>;
const has = (ledger: Ledger, id: string) => Object.hasOwn(ledger.unlocks, id);

/** A shared persisted ledger, but every completion/delivery/finish comes from actual engine keys. */
function harness() {
  let ledger = createAchievementState();
  let counter = 0;
  function begin(mode: SessionMode = 'MAIN', patch: Partial<RecordContext> = {}, word = neko) {
    const fixed = context(patch);
    const session = new GameSession({ words: [word], mode, guideEnabled: fixed.guideUsed, sessionId: `actual-keys-${++counter}` });
    ledger = beginAchievementSession(ledger, { sessionId: session.sessionId, mode, context: fixed, atMs: 0 });
    const apply = () => {
      const facts = session.drainEvents();
      ledger = applyAchievementFacts(ledger, facts, fixed);
      return facts;
    };
    const complete = (count = 1, now = 0, manualEach = false) => {
      for (let index = 0; index < count; index++) {
        if (session.snapshot(now).awaitingWordChoice) session.repeatWord(now);
        for (const key of session.snapshot(now).remainingGuide) session.input(key, now);
        if (manualEach) session.deliver(now);
        apply();
      }
    };
    const finish = (completed = true) => {
      if (completed) session.tick(90_000); else session.finish(1);
      apply();
    };
    return { session, fixed, apply, complete, finish };
  }
  return { begin, get ledger() { return ledger; }, set ledger(value: Ledger) { ledger = value; } };
}

describe('achievement eligibility from confirmed GameSession event streams', () => {
  for (const mode of ['TUTORIAL', 'PRACTICE', 'MAIN'] as const) {
    it(`keeps immediate all-mode gains after ${mode} abort and applies replay once`, () => {
      const h = harness(); const run = h.begin(mode);
      run.complete(); run.session.deliver(0);
      const facts = run.apply();
      expect(has(h.ledger, 'A01')).toBe(true);
      expect(has(h.ledger, 'A02')).toBe(true);
      expect(has(h.ledger, 'F01')).toBe(mode === 'PRACTICE');
      const before = structuredClone(h.ledger);
      h.ledger = applyAchievementFacts(h.ledger, facts, run.fixed);
      expect(h.ledger).toEqual(before);
      run.finish(false);
      expect(has(h.ledger, 'A01')).toBe(true);
      expect(has(h.ledger, 'A05')).toBe(false);
      expect(has(h.ledger, 'B01')).toBe(false);
    });
  }

  it('only commits normal achievements on an unassisted finish, preserving all-mode and rescued-finish gains', () => {
    for (const disposition of ['normal', 'skip', 'abort'] as const) {
      const h = harness(); const run = h.begin();
      run.complete(1, 0, true); run.complete(4);
      expect(has(h.ledger, 'B01')).toBe(false);
      expect(has(h.ledger, 'C04')).toBe(false);
      if (disposition === 'skip') { run.session.pause(0); run.session.skip(0); run.session.resume(0); run.apply(); }
      run.finish(disposition !== 'abort');
      expect(has(h.ledger, 'A01')).toBe(true);
      expect(has(h.ledger, 'A02')).toBe(true);
      expect(has(h.ledger, 'A05')).toBe(disposition !== 'abort');
      expect(has(h.ledger, 'B01')).toBe(disposition === 'normal');
      expect(has(h.ledger, 'C04')).toBe(disposition === 'normal');
    }
  });

  it('does not count an empty 90-second round as an eligible finish', () => {
    const h = harness(); const run = h.begin();
    run.session.input('z', 0); run.apply(); run.finish();
    expect(has(h.ledger, 'A05')).toBe(false);
    expect(has(h.ledger, 'A06')).toBe(false);
    expect(has(h.ledger, 'D04')).toBe(false);
  });

  it('requires manual-two before full-five for B05 within the same round', () => {
    for (const forward of [true, false]) {
      const h = harness(); const run = h.begin();
      if (!forward) run.complete(5);
      run.complete(2); run.session.deliver(0); run.apply();
      if (forward) run.complete(5);
      run.finish();
      expect(has(h.ledger, 'B04')).toBe(true);
      expect(has(h.ledger, 'B05')).toBe(forward);
    }
  });

  it('requires the immediately following clean word for B06 and keeps attained maximum streak after a later error', () => {
    for (const cleanNext of [true, false]) {
      const h = harness(); const run = h.begin();
      run.complete(4); run.session.deliver(0); run.apply();
      if (!cleanNext) run.session.input('z', 0);
      run.complete();
      if (cleanNext) run.session.input('z', 0); // later unfinished error cannot erase the already attained five-word maximum
      run.apply(); run.finish();
      expect(has(h.ledger, 'B06')).toBe(cleanNext);
      expect(has(h.ledger, 'C04')).toBe(cleanNext);
    }
  });

  it('resets practice current streak on an unfinished next-word choice without erasing attained gains', () => {
    const h = harness(); const run = h.begin('PRACTICE');
    run.complete(4); run.session.repeatWord(0); run.session.input('n', 0); run.session.nextPracticeWord(0, neko); run.apply();
    run.complete();
    expect(has(h.ledger, 'F05')).toBe(false);
    run.complete(4);
    expect(has(h.ledger, 'F05')).toBe(true);
    run.session.repeatWord(0); run.session.input('z', 0); run.apply(); run.finish(false);
    expect(has(h.ledger, 'F05')).toBe(true);
  });

  it('does not round 94.988 percent up to a 95 percent achievement threshold', () => {
    const h = harness(); const run = h.begin();
    run.complete(99); run.session.input('n', 0); run.session.input('e', 0);
    for (let index = 0; index < 21; index++) run.session.input('z', 0);
    run.finish();
    const result = run.session.snapshot(90_000);
    expect(result.correctKeys).toBe(398);
    expect(result.mistakes).toBe(21);
    expect(result.accuracy!.toFixed(1)).toBe('95.0');
    expect(has(h.ledger, 'C01')).toBe(true);
    expect(has(h.ledger, 'C02')).toBe(false);
    expect(has(h.ledger, 'H01')).toBe(false);
  });

  it('does not split a hidden sequence across rounds', () => {
    const h = harness(); const first = h.begin();
    first.complete(2); first.session.deliver(0); first.apply(); first.finish();
    const second = h.begin(); second.complete(5); second.finish();
    expect(has(h.ledger, 'B05')).toBe(false);
  });

  it('counts delivered cargo rather than shipment count, excluding deadline and skip flushes', () => {
    const excluded = harness();
    for (let index = 0; index < 50; index++) {
      const run = excluded.begin(); run.complete();
      if (index % 2) { run.session.pause(0); run.session.skip(0); run.session.resume(0); run.apply(); }
      run.finish();
    }
    expect(has(excluded.ledger, 'G01')).toBe(true);
    expect(has(excluded.ledger, 'G04')).toBe(false);
    expect(has(excluded.ledger, 'A02')).toBe(false);
    expect(has(excluded.ledger, 'A03')).toBe(false);
    const included = harness(); const practice = included.begin('PRACTICE');
    practice.complete(50, 0, true);
    expect(has(included.ledger, 'G04')).toBe(true);
  });

  it('uses sticky guide evidence even with a frozen guide-off context', () => {
    const h = harness(); const run = h.begin('MAIN', { guideUsed: false });
    run.complete(20);
    run.session.pause(0); run.session.setGuideEnabled(true, 0); run.session.setGuideEnabled(false, 0); run.session.resume(0);
    run.finish();
    expect(has(h.ledger, 'C02')).toBe(true);
    expect(has(h.ledger, 'H05')).toBe(false);
    const record = h.ledger.measuredProgress.recentRounds.at(-1)!;
    expect(record.context.guideUsed).toBe(true);
    expect(h.ledger.measuredProgress.bestByComparison[comparisonKey({ ...run.fixed, guideUsed: true })]).toBeDefined();
  });

  it('allows guide-free H05 and keeps A06 order identity across guide and rescue settings', () => {
    const h = harness(); const first = h.begin('MAIN', { guideUsed: false });
    first.complete(20); first.finish();
    expect(has(h.ledger, 'H05')).toBe(true);
    const second = h.begin('MAIN', { guideUsed: true });
    second.complete(); second.session.pause(0); second.session.skip(0); second.session.resume(0); second.apply(); second.finish();
    expect(has(h.ledger, 'A06')).toBe(true);
  });
});

describe('READY-frozen practice qualifications and growth comparisons', () => {
  it('qualifies F06 only when three clean practice completions existed before READY', () => {
    for (const qualifiedBeforeReady of [true, false]) {
      const h = harness(); const practice = h.begin('PRACTICE');
      practice.complete(qualifiedBeforeReady ? 3 : 2);
      const main = h.begin(); // Freeze qualifications before the possible final practice gain below.
      if (!qualifiedBeforeReady) practice.complete();
      main.complete(); main.finish();
      expect(has(h.ledger, 'F02')).toBe(true);
      expect(has(h.ledger, 'F06')).toBe(qualifiedBeforeReady);
    }
  });

  it('does not call the first sub-1000 result an improvement, then compares a later result to a frozen eligible prior best', () => {
    const h = harness(); const first = h.begin();
    first.complete(10, 0, true); first.finish();
    expect(has(h.ledger, 'D04')).toBe(false); // 480 points, first eligible comparison
    const next = h.begin(); next.complete(10); next.finish(); // 800 points, strict improvement
    expect(has(h.ledger, 'D04')).toBe(true);
  });

  it('does not use a nine-word, different-plan, or different-guide prior result for D04', () => {
    for (const excluded of ['short', 'plan', 'guide'] as const) {
      const h = harness();
      const first = h.begin('MAIN', excluded === 'plan' ? { planId: 'other-plan' } : excluded === 'guide' ? { guideUsed: false } : {});
      first.complete(excluded === 'short' ? 9 : 10, 0, true); first.finish();
      const next = h.begin(); next.complete(10); next.finish();
      expect(has(h.ledger, 'D04'), excluded).toBe(false);
    }
  });

  it('requires the current comparison round to have ten completed words as well', () => {
    const h = harness(); const first = h.begin(); first.complete(10, 0, true); first.finish();
    const next = h.begin(); next.complete(9); next.finish();
    expect(next.session.snapshot(90_000).score).toBe(688);
    expect(has(h.ledger, 'D04')).toBe(false);
  });

  it('allows absolute growth alternatives without inventing a previous record', () => {
    const longest = words.find((word) => word.canonicalLength === 24)!;
    const score = harness(); const short = score.begin('MAIN', { courseId: longest.courseId }, longest);
    short.complete(3); short.finish();
    expect(short.session.snapshot(90_000).completedWords).toBe(3);
    expect(short.session.snapshot(90_000).score).toBe(1152);
    expect(has(score.ledger, 'D04')).toBe(true);
    const speed = harness(); const fast = speed.begin('MAIN', { courseId: longest.courseId }, longest);
    fast.complete(12); fast.finish();
    expect(fast.session.snapshot(90_000).canonicalKpm).toBe(192);
    expect(has(speed.ledger, 'D05')).toBe(true);
  });

  it('requires at least ten canonical keystrokes per minute of speed growth, using fixed 90-second denominators', () => {
    for (const count of [13, 14]) {
      const h = harness(); const first = h.begin(); first.complete(10); first.finish();
      const next = h.begin(); next.complete(count); next.finish();
      // 40 canonical keys ->52/56, respectively +8/+10.666... per minute.
      expect(has(h.ledger, 'D05')).toBe(count === 14);
    }
  });

  it('captures both guide comparison buckets at READY, so later guide exposure can use the matching prior record', () => {
    const h = harness(); const prior = h.begin('MAIN', { guideUsed: true });
    prior.complete(10, 0, true); prior.finish();
    const next = h.begin('MAIN', { guideUsed: false });
    next.complete(10); next.session.pause(0); next.session.setGuideEnabled(true, 0); next.session.resume(0); next.finish();
    expect(has(h.ledger, 'D04')).toBe(true);
  });
});
