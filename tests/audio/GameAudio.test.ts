import { describe, expect, it, vi } from 'vitest';
import { GameAudio, soundStatusText, type SoundOutput } from '../../src/ui/audio';
import { GameSession, type SessionMode } from '../../src/typing';
import { filterCatalogue, createProfileProgress } from '../../src/profile';
import type { AudioKind, AudioStatus } from '../../src/audio/AudioPlayer';

class Output implements SoundOutput {
  status: AudioStatus = 'ready';
  settings = vi.fn();
  play = vi.fn((_kind: AudioKind) => {});
  pause = vi.fn(() => { if (this.status !== 'unavailable') this.status = 'paused'; });
  stopTheme = vi.fn();
  dispose = vi.fn();
  startFromGesture = vi.fn(async () => { this.status = 'ready'; return true; });
}
const preferences = { sound: true, audioVolume: { master: 0.5, effects: 0.7, music: 0.25 } };
const neko = filterCatalogue(createProfileProgress()).find(word => word.reading === 'ねこ')!;
const flush = async () => { for (let turn = 0; turn < 4; turn++) await Promise.resolve(); };
function fixture(mode: SessionMode = 'MAIN') {
  const output = new Output(); const audio = new GameAudio(output);
  audio.configure(preferences);
  const session = new GameSession({ words: [neko], mode, sessionId: 'audio-confirmed-input' });
  audio.beginSession(session.sessionId, session.snapshot(0));
  const observe = () => {
    const snapshot = session.snapshot(0); const facts = session.drainEvents();
    audio.observe(session.sessionId, snapshot, facts); return { snapshot, facts };
  };
  const complete = () => {
    if (session.snapshot(0).awaitingWordChoice) session.repeatWord(0);
    for (const key of session.snapshot(0).remainingGuide) { session.input(key, 0); observe(); }
  };
  const cues = () => output.play.mock.calls.map(call => call[0]).filter(kind => kind !== 'theme');
  return { output, audio, session, observe, complete, cues };
}

describe('confirmed UI audio feedback', () => {
  it('plays key, word and mistake once from actual confirmed input, giving completion priority over its last key', () => {
    const { session, observe, complete, cues } = fixture();
    complete(); expect(cues()).toEqual(['key', 'key', 'key', 'word']);
    session.input('z', 0); observe(); expect(cues().at(-1)).toBe('mistake');
    expect(session.snapshot(0).score).toBe(40);
  });
  it('plays distinct completion and delivery facts once while suppressing the final key on full cargo', () => {
    const { session, observe, complete, cues } = fixture();
    complete(); session.deliver(0); observe(); expect(cues().at(-1)).toBe('dispatch_small');
    for (let index = 0; index < 3; index++) complete();
    session.deliver(0); observe(); expect(cues().at(-1)).toBe('dispatch_medium');
    for (let index = 0; index < 5; index++) complete();
    expect(cues().at(-1)).toBe('dispatch_full');
    expect(cues().slice(-2)).toEqual(['word', 'dispatch_full']);
    expect(cues().filter(kind => kind === 'word')).toHaveLength(9);
    expect(session.snapshot(0).completedWords).toBe(9);
  });
  it('does not replay effects from redraws, reducer retries or an older snapshot', () => {
    const { session, audio, observe, complete, cues } = fixture();
    const old = session.snapshot(0); complete(); session.deliver(0);
    const { snapshot, facts } = observe(); const expected = [...cues()];
    audio.observe(session.sessionId, snapshot, facts); audio.observe(session.sessionId, old, []); observe();
    expect(cues()).toEqual(expected);
    audio.leaveSession(); audio.observe(session.sessionId, snapshot, facts); expect(cues()).toEqual(expected);
  });
  it('never doubles the same fact when a retry repeats it within one supplied batch', () => {
    const { session, audio, cues } = fixture();
    for (const key of session.snapshot(0).remainingGuide) session.input(key, 0);
    const facts = session.drainEvents();
    audio.observe(session.sessionId, session.snapshot(0), [...facts, ...facts]);
    expect(cues()).toEqual(['word']);
  });
  it('consumes muted facts without replaying them after the player opts in', async () => {
    const { output, audio, complete, observe, session, cues } = fixture();
    audio.configure({ ...preferences, sound: false }); complete(); session.deliver(0); observe(); expect(cues()).toEqual([]);
    audio.configure(preferences); audio.resumeFromGesture(); await flush();
    observe(); expect(cues()).toEqual([]);
    session.input('n', 0); observe(); expect(cues()).toEqual(['key']);
    expect(output.startFromGesture).toHaveBeenCalledTimes(1);
  });
  it('stops at pause and hidden, keeps stopped timers silent, and resumes only from an explicit gesture', async () => {
    const { output, audio, session, observe, complete, cues } = fixture();
    complete(); session.pause(0); observe(); const expected = [...cues()];
    observe(); observe(); expect(output.pause).toHaveBeenCalledTimes(1); expect(cues()).toEqual(expected);
    audio.visibility(true); audio.visibility(false); await flush(); expect(output.startFromGesture).not.toHaveBeenCalled();
    audio.resumeFromGesture(); session.resume(0); observe(); await flush();
    expect(output.startFromGesture).toHaveBeenCalledTimes(1); expect(cues()).toEqual(expected);
  });
  it('lets final deadline delivery finish after stopping BGM, and produces no new sound for abort', () => {
    const f = fixture(); f.complete(); f.session.tick(90_000);
    const snapshot = f.session.snapshot(90_000); const facts = f.session.drainEvents();
    f.audio.observe(f.session.sessionId, snapshot, facts);
    expect(f.output.stopTheme).toHaveBeenCalledTimes(1); expect(f.cues().at(-1)).toBe('dispatch_small');
    const aborted = fixture(); aborted.complete(); const before = aborted.cues().length;
    aborted.session.finish(0); aborted.observe(); expect(aborted.cues()).toHaveLength(before);
    expect(aborted.output.pause).toHaveBeenCalledTimes(1);
  });
  it('does not let unresolved audio startup delay a completed game word or score', () => {
    const { output, audio, complete, session } = fixture();
    output.status = 'idle'; output.startFromGesture.mockImplementation(() => new Promise(() => {}));
    audio.resumeFromGesture(); complete();
    expect(session.snapshot(0).completedWords).toBe(1); expect(session.snapshot(0).score).toBe(40);
  });
  it('requires the visible retry control after failure and never retries on every subsequent game input', async () => {
    const { output, audio } = fixture(); output.status = 'unavailable';
    audio.gesture(); audio.resumeFromGesture(); audio.pause(); audio.gesture(); expect(output.startFromGesture).not.toHaveBeenCalled();
    audio.retryFromGesture(); await flush(); expect(output.startFromGesture).toHaveBeenCalledTimes(1);
    expect(soundStatusText(true, 'unavailable')).toContain('消音で配達を続けられます');
  });
  it('ignores unrelated setting refreshes and disposes all optional sound resources', () => {
    const { output, audio } = fixture();
    audio.configure({ ...preferences, audioVolume: { ...preferences.audioVolume } });
    expect(output.settings).toHaveBeenCalledTimes(1);
    audio.dispose(); audio.gesture(); expect(output.dispose).toHaveBeenCalledTimes(1);
  });
});
