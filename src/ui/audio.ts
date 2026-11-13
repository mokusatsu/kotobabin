import { AudioPlayer, type AudioKind, type AudioStatus } from '../audio/AudioPlayer';
import type { AudioVolume } from '../audio/preferences';
import type { SessionFact, SessionSnapshot } from '../typing';

export interface SoundPreferences { sound: boolean; audioVolume: AudioVolume }
export type SoundOutput = Pick<AudioPlayer, 'status' | 'settings' | 'startFromGesture' | 'play' | 'pause' | 'stopTheme' | 'dispose'>;
/** Feedback consumes newly confirmed UI operations, never repository reductions or redraw callbacks. */
export class GameAudio {
  private preferences: SoundPreferences = { sound: false, audioVolume: { master: 0.5, effects: 0.7, music: 0.25 } };
  private selected = '';
  private sessionId: string | null = null;
  private factCursor = 0;
  private correctKeys = 0;
  private mistakes = 0;
  private completedWords = 0;
  private paused = false;
  private hidden = false;
  private disposed = false;

  constructor(private readonly output: SoundOutput) {}
  get status(): AudioStatus { return this.output.status; }
  configure(preferences: SoundPreferences): void {
    const key = JSON.stringify([preferences.sound, preferences.audioVolume.master, preferences.audioVolume.effects, preferences.audioVolume.music]);
    if (key === this.selected || this.disposed) return;
    this.selected = key;
    this.preferences = { sound: preferences.sound, audioVolume: { ...preferences.audioVolume } };
    this.output.settings({ enabled: preferences.sound, ...preferences.audioVolume });
    if (!preferences.sound) this.output.pause();
  }
  /** Only call inside a trusted pointer/keyboard action; never wait for this in the game loop. */
  gesture(retry = false): void {
    if (!retry && this.output.status === 'unavailable') return;
    if (this.disposed || !this.preferences.sound || this.hidden) return;
    if (this.output.status === 'ready') { if (!this.paused) this.output.play('theme'); return; }
    void this.output.startFromGesture().then(ready => {
      if (!ready || this.disposed) return;
      if (!this.preferences.sound || this.hidden || this.paused) this.output.pause();
      else this.output.play('theme');
    }).catch(() => { /* Audio failure cannot reject a game operation. */ });
  }
  retryFromGesture(): void { this.gesture(true); }
  resumeFromGesture(): void { this.paused = false; this.gesture(); }
  pause(): void { this.paused = true; this.output.pause(); }
  visibility(hidden: boolean): void { this.hidden = hidden; if (hidden) this.pause(); }

  beginSession(sessionId: string, snapshot: SessionSnapshot): void {
    if (this.sessionId === sessionId) return;
    this.sessionId = sessionId; this.factCursor = 0;
    this.correctKeys = snapshot.correctKeys; this.mistakes = snapshot.mistakes; this.completedWords = snapshot.completedWords;
    this.paused = snapshot.phase === 'PAUSED';
  }
  leaveSession(): void { this.sessionId = null; this.paused = false; }
  observe(sessionId: string, snapshot: SessionSnapshot, facts: readonly SessionFact[]): void {
    if (this.disposed || this.sessionId !== sessionId) return;
    const fresh: SessionFact[] = [];
    for (const fact of facts) if (fact.sessionId === sessionId && fact.factSequence > this.factCursor) { this.factCursor = fact.factSequence; fresh.push(fact); }
    const correct = snapshot.correctKeys > this.correctKeys;
    const mistake = snapshot.mistakes > this.mistakes;
    const completed = snapshot.completedWords > this.completedWords;
    this.correctKeys = Math.max(this.correctKeys, snapshot.correctKeys);
    this.mistakes = Math.max(this.mistakes, snapshot.mistakes);
    this.completedWords = Math.max(this.completedWords, snapshot.completedWords);
    if (snapshot.phase === 'PAUSED') { if (!this.paused) this.pause(); return; }
    this.paused = false;
    if (snapshot.phase === 'RESULT') this.output.stopTheme();
    if (!this.preferences.sound || this.hidden) return;
    let domainCue = false;
    for (const fact of fresh) {
      let cue: AudioKind | undefined;
      if (fact.type === 'WordCompleted') cue = 'word';
      if (fact.type === 'DeliveryCommitted') cue = fact.cargoCount === 5 ? 'dispatch_full' : fact.cargoCount >= 3 ? 'dispatch_medium' : 'dispatch_small';
      if (cue) { domainCue = true; this.output.play(cue); }
    }
    // Completion and delivery are distinct facts. Each keeps its cue; their final
    // key is suppressed and the player's bounded voice priority handles crowding.
    if (!domainCue && mistake) this.output.play('mistake');
    else if (!domainCue && correct && !completed) this.output.play('key');
    else if (!domainCue && snapshot.phase === 'RESULT') this.output.pause();
  }
  dispose(): void { this.disposed = true; this.output.dispose(); }
}

export function soundStatusText(enabled: boolean, status: AudioStatus): string {
  if (!enabled) return '音はオフです。音なしでもすべての操作を使えます。';
  if (status === 'unavailable') return '音を再生できません。消音で配達を続けられます。';
  if (status === 'paused') return '音は一時停止中です。配達の再開時に戻ります。';
  if (status === 'ready') return '音を再生できます。';
  return '操作すると音を開始します。';
}
/** Semantic availability must not overwrite hidden flags owned by the panel pager. */
export function renderAudioStatus(root: HTMLElement, enabled: boolean, status: AudioStatus): void {
  root.querySelectorAll<HTMLElement>('[data-audio-status]').forEach(element => {
    const text = soundStatusText(enabled, status); if (element.textContent !== text) element.textContent = text;
  });
  root.querySelectorAll<HTMLButtonElement>('[data-action="enable-audio"]').forEach(button => {
    const needed = enabled && (status === 'unavailable' || status === 'idle');
    if (button.dataset.audioRetryNeeded !== String(needed)) {
      button.dataset.audioRetryNeeded = String(needed); button.toggleAttribute('data-ipad-exclude', !needed); button.hidden = !needed;
    }
  });
}
export function audioSettingsContent(settings: SoundPreferences, status: AudioStatus): string {
  return `<fieldset class="sound-settings" data-page-children><legend>音</legend><label class="setting-check"><input type="checkbox" name="sound" ${settings.sound ? 'checked' : ''}> 音を使う</label>${([
    ['master', '全体音量'], ['effects', '効果音'], ['music', 'BGM'],
  ] as const).map(([channel, label]) => `<div class="sound-volume"><label for="audio-${channel}">${label}</label><input id="audio-${channel}" name="audio-${channel}" type="range" min="0" max="100" step="1" value="${Math.round(settings.audioVolume[channel] * 100)}" aria-valuetext="${Math.round(settings.audioVolume[channel] * 100)}%"><output for="audio-${channel}" data-audio-volume="${channel}">${Math.round(settings.audioVolume[channel] * 100)}%</output></div>`).join('')}<p class="setting-note" data-audio-status role="status">${soundStatusText(settings.sound, status)}</p><button class="button" type="button" data-action="enable-audio" data-audio-retry-needed="${settings.sound && (status === 'unavailable' || status === 'idle')}" ${settings.sound && (status === 'unavailable' || status === 'idle') ? '' : 'hidden data-ipad-exclude'}>音をもう一度有効にする</button></fieldset>`;
}
