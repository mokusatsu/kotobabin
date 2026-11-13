export type AudioKind = 'key' | 'word' | 'mistake' | 'dispatch_small' | 'dispatch_medium' | 'dispatch_full' | 'theme';
export type AudioStatus = 'idle' | 'ready' | 'paused' | 'unavailable' | 'disposed';
export interface AudioSettings { enabled: boolean; master: number; effects: number; music: number }
export interface AudioPlayerOptions {
  baseUrl?: string;
  /** Dependency seams keep deterministic voice/failure tests independent of browser audio hardware. */
  createContext?: () => AudioContext | null;
  fetchAudio?: typeof fetch;
  onStatusChange?: (status: AudioStatus) => void;
}
interface Voice { kind: AudioKind; source: AudioBufferSourceNode; gain: GainNode; order: number }
const priorities: Record<AudioKind, number> = { theme: 0, key: 1, mistake: 2, word: 3, dispatch_small: 4, dispatch_medium: 4, dispatch_full: 4 };
const effects: AudioKind[] = ['key', 'word', 'mistake', 'dispatch_small', 'dispatch_medium', 'dispatch_full'];
const volume = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Optional feedback only. Callers never await playback to accept input or commit game events. */
export class AudioPlayer {
  private context: AudioContext | null = null;
  private values: AudioSettings = { enabled: true, master: 0.5, effects: 0.7, music: 0.25 };
  private readonly baseUrl: string;
  private readonly createContext: () => AudioContext | null;
  private readonly fetchAudio: typeof fetch;
  private readonly buffers = new Map<AudioKind, AudioBuffer>();
  private readonly loading = new Map<AudioKind, Promise<AudioBuffer | null>>();
  private readonly pendingCues = new Set<AudioKind>();
  private readonly voices = new Set<Voice>();
  private readonly abort = new AbortController();
  private order = 0;
  private cueGeneration = 0;
  private disposed = false;
  private themeWanted = false;
  private playbackAllowed = true;
  private currentStatus: AudioStatus = 'idle';
  private readonly onStatusChange: (status: AudioStatus) => void;

  constructor(options: AudioPlayerOptions = {}) {
    const base = options.baseUrl ?? import.meta.env.BASE_URL;
    this.baseUrl = base.endsWith('/') ? base : `${base}/`;
    this.createContext = options.createContext ?? (() => globalThis.AudioContext ? new globalThis.AudioContext() : null);
    this.onStatusChange = options.onStatusChange ?? (() => {});
    this.fetchAudio = options.fetchAudio ?? ((input, init) => globalThis.fetch(input, init));
  }

  /** Invoke directly from a trusted click/key handler; failure leaves the game usable in silence. */
  async startFromGesture(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.currentStatus === 'ready' && this.context?.state === 'running' && this.playbackAllowed) return true;
    try {
      if (!this.context || this.context.state === 'closed') {
        this.context = this.createContext();
        if (this.context) this.context.onstatechange = () => {
          if (!this.disposed && this.currentStatus === 'ready' && this.context?.state !== 'running') this.silence('unavailable');
        };
      }
      if (!this.context) { this.silence('unavailable'); return false; }
      if (this.context.state !== 'running') await this.context.resume();
      if (this.disposed) return false;
      if (this.context.state !== 'running') { this.silence('unavailable'); return false; }
      this.playbackAllowed = true;
      this.setStatus('ready');
      // Preload short feedback without making startup or the game wait for decoding.
      if (this.values.enabled) for (const kind of effects) void this.load(kind);
      if (this.themeWanted) this.play('theme');
      return true;
    } catch { this.silence('unavailable'); return false; }
  }

  settings(patch: Partial<AudioSettings>): void {
    if (this.disposed) return;
    this.cueGeneration++;
    this.values = { enabled: patch.enabled ?? this.values.enabled,
      master: patch.master === undefined ? this.values.master : volume(patch.master),
      effects: patch.effects === undefined ? this.values.effects : volume(patch.effects),
      music: patch.music === undefined ? this.values.music : volume(patch.music) };
    for (const voice of [...this.voices]) {
      const level = this.level(voice.kind);
      if (!level) this.removeVoice(voice);
      else try { voice.gain.gain.value = level; } catch { this.removeVoice(voice); }
    }
    if (this.themeWanted && this.level('theme') > 0) this.play('theme');
  }

  play(kind: AudioKind): void {
    if (this.disposed || !this.playbackAllowed) return;
    if (kind === 'theme') this.themeWanted = true;
    if (!this.context || this.context.state !== 'running' || !this.level(kind)) return;
    if (kind === 'theme' && [...this.voices].some((voice) => voice.kind === 'theme')) return;
    const buffer = this.buffers.get(kind);
    if (buffer) { this.startVoice(kind, buffer); return; }
    // A burst during first decoding is coalesced; old keystrokes are never queued into a delayed chorus.
    if (this.pendingCues.has(kind)) return;
    this.pendingCues.add(kind);
    const generation = this.cueGeneration;
    void this.load(kind).then((decoded) => {
      this.pendingCues.delete(kind);
      if (generation !== this.cueGeneration) { if (kind === 'theme' && this.themeWanted) this.play('theme'); return; }
      if (decoded && !this.disposed && this.playbackAllowed && (kind !== 'theme' || this.themeWanted) && this.context?.state === 'running' && this.level(kind)) this.startVoice(kind, decoded);
    });
  }

  private level(kind: AudioKind): number {
    return this.values.enabled ? this.values.master * (kind === 'theme' ? this.values.music : this.values.effects) : 0;
  }
  private load(kind: AudioKind): Promise<AudioBuffer | null> {
    const ready = this.buffers.get(kind);
    if (ready) return Promise.resolve(ready);
    const current = this.loading.get(kind);
    if (current) return current;
    const pending = (async () => {
      const files = kind === 'theme' ? ['audio_theme.ogg', 'audio_theme.mp3'] : [`audio_${kind}.wav`];
      for (const file of files) {
        try {
          if (this.disposed || !this.context) return null;
          const response = await this.fetchAudio(`${this.baseUrl}assets/${kind === 'theme' ? 'bgm' : 'sound_effect'}/${file}`, { signal: this.abort.signal });
          if (!response.ok) continue;
          const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
          if (this.disposed) return null;
          this.buffers.set(kind, buffer);
          return buffer;
        } catch { /* Try the alternate encoding; silence never affects the game. */ }
      }
      if (this.playbackAllowed && !this.disposed && this.values.enabled) this.silence('unavailable');
      return null;
    })();
    this.loading.set(kind, pending);
    void pending.finally(() => this.loading.delete(kind));
    return pending;
  }
  private startVoice(kind: AudioKind, buffer: AudioBuffer): void {
    const context = this.context;
    if (!context || this.disposed || !this.playbackAllowed || !this.level(kind)) return;
    if (kind === 'theme' && [...this.voices].some((voice) => voice.kind === 'theme')) return;
    if (this.voices.size >= 8) {
      const eligible = [...this.voices].filter((voice) => priorities[voice.kind] <= priorities[kind]);
      // Preserve speech-like completion cues; first thin the oldest short typing feedback.
      const candidate = eligible.filter((voice) => voice.kind === 'key').sort((a, b) => a.order - b.order)[0]
        ?? eligible.sort((a, b) => priorities[a.kind] - priorities[b.kind] || a.order - b.order)[0];
      if (!candidate) return;
      this.removeVoice(candidate);
    }
    let voice: Voice | null = null;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer; source.loop = kind === 'theme'; gain.gain.value = this.level(kind);
      source.connect(gain); gain.connect(context.destination);
      voice = { kind, source, gain, order: ++this.order };
      this.voices.add(voice);
      source.onended = () => {
        if (!voice) return;
        this.removeVoice(voice, false);
        if (this.themeWanted && kind !== 'theme' && this.voices.size < 8) this.play('theme');
      };
      source.start();
    } catch { if (voice) this.removeVoice(voice); this.silence('unavailable'); }
  }
  private removeVoice(voice: Voice, stop = true): void {
    this.voices.delete(voice);
    voice.source.onended = null;
    if (stop) try { voice.source.stop(); } catch { /* Already ended or interrupted. */ }
    try { voice.source.disconnect(); voice.gain.disconnect(); } catch { /* Interrupted contexts may reject cleanup. */ }
  }
  get status(): AudioStatus { return this.currentStatus; }
  private setStatus(status: AudioStatus): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    try { this.onStatusChange(status); } catch { /* Presentation cannot affect game input. */ }
  }
  private silence(status: 'paused' | 'unavailable'): void {
    if (this.disposed) return;
    this.playbackAllowed = false;
    this.themeWanted = false;
    this.cueGeneration++;
    for (const voice of [...this.voices]) this.removeVoice(voice);
    this.setStatus(status);
  }
  /** Discard all pending feedback; a later explicit gesture can re-enable playback. */
  pause(): void { this.silence(this.currentStatus === 'unavailable' ? 'unavailable' : 'paused'); }
  /** Let final delivery feedback finish while stopping the background loop. */
  stopTheme(): void {
    this.themeWanted = false;
    for (const voice of [...this.voices]) if (voice.kind === 'theme') this.removeVoice(voice);
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.themeWanted = false;
    this.playbackAllowed = false;
    this.setStatus('disposed');
    this.abort.abort();
    for (const voice of [...this.voices]) this.removeVoice(voice);
    this.buffers.clear(); this.pendingCues.clear();
    if (this.context) {
      this.context.onstatechange = null;
      try { void this.context.close().catch(() => {}); } catch { /* Audio is optional. */ }
    }
  }
}
