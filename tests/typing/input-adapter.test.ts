import { describe, expect, it } from 'vitest';
import { GameSession, InputAdapter, type Word } from '../../src/typing';

// A native-like event-sequence harness; browser/OS compatibility is tested separately.
function harness() {
  let nowMs = 0;
  const view = Object.assign(new EventTarget(), { performance: { now: () => nowMs } });
  const document = Object.assign(new EventTarget(), { defaultView: view, activeElement: null as EventTarget | null, hidden: false });
  const input = Object.assign(new EventTarget(), { ownerDocument: document, value: '' });
  document.activeElement = input;
  const word: Word = { id: 'clock-test', display: 'あ', reading: 'あ', canonicalLength: 1, courseId: 'relaxed', difficultyBand: 'easy', topicId: 'daily', tags: [] };
  const session = new GameSession({ words: [word], sessionId: 'deadline-harness' });
  session.input('a', 0);
  const checks: number[] = [];
  const adapter = new InputAdapter(input as unknown as HTMLInputElement, {
    now: () => nowMs,
    onCharacter: (key, at) => { session.input(key, at); },
    onDeliver: (at) => { session.deliver(at); },
    onPause: (_reason, at) => { session.pause(at); },
    onInputCheckRequired: (_reason, at) => { checks.push(at); },
  });
  const dispatch = (target: EventTarget, type: string, properties: Record<string, unknown> = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, properties);
    Object.defineProperty(event, 'isTrusted', { value: true });
    target.dispatchEvent(event);
  };
  const startPending = () => {
    nowMs = 89_999;
    dispatch(input, 'keydown', { key: 'a', code: 'KeyA', isComposing: false, repeat: false });
    nowMs = 90_010;
    expect(session.tick(adapter.deadlineTime(nowMs)).phase).toBe('PLAYING');
    expect(adapter.hasPendingOperation).toBe(true);
  };
  return { session, adapter, input, document, checks, dispatch, startPending, now: () => nowMs };
}

describe('InputAdapter pending-operation deadline classification', () => {
  for (const trigger of ['keyup', 'blur', 'compositionstart', 'beforeinput', 'input', 'paste', 'drop', 'hidden']) {
    it(`does not extend the round when ${trigger} rejects the last pending key after the deadline`, () => {
      const fixture = harness();
      const { session, adapter, input, document, dispatch } = fixture;
      fixture.startPending();
      if (trigger === 'hidden') {
        document.hidden = true;
        dispatch(document, 'visibilitychange');
      } else if (trigger === 'keyup') dispatch(input, trigger, { key: 'a', code: 'KeyA' });
      else if (trigger === 'beforeinput' || trigger === 'input') dispatch(input, trigger, { inputType: 'insertText', data: 'b', isComposing: false });
      else dispatch(input, trigger);
      const result = session.snapshot(fixture.now());
      expect(adapter.hasPendingOperation).toBe(false);
      expect(result.phase).toBe('RESULT');
      expect(result.elapsedMs).toBe(90_000);
      expect(result.correctKeys).toBe(1);
      expect(result.score).toBe(12);
      expect(session.resume(91_000).phase).toBe('RESULT');
      session.tick(92_000);
      const events = session.drainEvents();
      expect(events.filter((event) => event.type === 'RoundFinished')).toHaveLength(1);
      expect(events.filter((event) => event.type === 'DeliveryCommitted')).toHaveLength(1);
      if (trigger !== 'hidden') expect(fixture.checks).toEqual([90_010]);
      adapter.destroy();
    });
  }
  it('counts a confirmed predeadline key once before the deferred final deadline tick', () => {
    const fixture = harness();
    const { session, adapter, input, dispatch } = fixture;
    fixture.startPending();
    dispatch(input, 'beforeinput', { inputType: 'insertText', data: 'a', isComposing: false });
    input.value = 'a';
    dispatch(input, 'input', { inputType: 'insertText', data: 'a', isComposing: false });
    expect(session.snapshot(fixture.now()).correctKeys).toBe(2);
    const result = session.tick(adapter.deadlineTime(fixture.now()));
    expect(result.phase).toBe('RESULT');
    expect(result.elapsedMs).toBe(90_000);
    expect(result.score).toBe(28);
    expect(result.completedWords).toBe(2);
    session.tick(95_000);
    const events = session.drainEvents();
    expect(events.filter((event) => event.type === 'WordCompleted')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'RoundFinished')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'DeliveryCommitted')).toHaveLength(1);
    expect(fixture.checks).toEqual([]);
    adapter.destroy();
  });
});
