export type SoundEffectId =
  | 'audio_key'
  | 'audio_word'
  | 'audio_dispatch_small'
  | 'audio_dispatch_medium'
  | 'audio_dispatch_full'
  | 'audio_dispatch_extra'
  | 'audio_mistake'
  | 'audio_ui_click'
  | 'audio_pause'
  | 'audio_countdown_tick'
  | 'audio_round_start'
  | 'audio_round_finish'
  | 'audio_stamp_unlock'
  | 'audio_result_reveal'
  | 'audio_upgrade_buy'
  | 'audio_district_open'
  | 'audio_railway_synergy';

export type BgmTrackId = 'home' | 'play' | 'none';

export interface PlaySeOptions {
  /** Escalation stage (`1`..`10`) used by multi-stage cues like `audio_dispatch_extra`. */
  stage?: number;
  /** Optional playback delay in milliseconds for layering simultaneous dispatches. */
  delayMs?: number;
}

interface ScheduledSeHandle {
  cancelled: boolean;
  timerId?: ReturnType<typeof setTimeout>;
  sourceNode?: AudioBufferSourceNode;
}

const AUDIO_ASSET_VERSION = '20261128a';
const KEY_VARIANT_COUNT = 20;
const EXTRA_STAGE_MAX = 10;

type AudioContextCtor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextCtor | null {
  const g = globalThis as typeof globalThis & {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export class AudioPlayer {
  private seEnabled = true;
  private bgmEnabled = false;
  private volume = 0.7;
  private cache = new Map<string, HTMLAudioElement>();
  private currentBgmTrack: BgmTrackId = 'none';
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmCache = new Map<'home' | 'play', HTMLAudioElement>();
  private keyVariantCursor = 0;
  private audioCtx: AudioContext | null = null;
  private seBufferCache = new Map<string, AudioBuffer>();
  private seBufferPending = new Map<string, Promise<AudioBuffer>>();
  private scheduledSe = new Set<ScheduledSeHandle>();

  setPreferences(opts: { seEnabled: boolean; bgmEnabled: boolean; volume?: number }): void {
    this.seEnabled = opts.seEnabled;
    const prevBgm = this.bgmEnabled;
    this.bgmEnabled = opts.bgmEnabled;
    if (typeof opts.volume === 'number' && Number.isFinite(opts.volume)) {
      this.volume = Math.max(0, Math.min(1, opts.volume));
    }
    if (!this.seEnabled || this.volume <= 0) {
      this.cancelScheduledSe();
    }
    this.syncBgmVolume();
    if (!this.bgmEnabled) {
      this.pauseBgm();
    } else if (!prevBgm && this.currentBgmTrack !== 'none') {
      this.startBgmElement(this.currentBgmTrack);
    }
  }

  isBgmEnabled(): boolean {
    return this.bgmEnabled;
  }

  setBgmTrack(track: BgmTrackId): void {
    if (this.currentBgmTrack === track) {
      if (this.bgmEnabled && track !== 'none' && this.bgmAudio?.paused) {
        this.startBgmElement(track);
      }
      return;
    }
    this.currentBgmTrack = track;
    if (track === 'none' || !this.bgmEnabled) {
      this.pauseBgm();
      return;
    }
    this.startBgmElement(track);
  }

  unlock(): void {
    this.ensureAudioContext();
    if (this.bgmEnabled && this.currentBgmTrack !== 'none' && (!this.bgmAudio || this.bgmAudio.paused)) {
      this.startBgmElement(this.currentBgmTrack);
    }
  }

  /** Cancels any delayed SE playback queued via `delayMs` (e.g. on pause or round end). */
  cancelScheduledSe(): void {
    for (const handle of this.scheduledSe) {
      handle.cancelled = true;
      if (handle.timerId !== undefined) {
        clearTimeout(handle.timerId);
      }
      if (handle.sourceNode) {
        try {
          handle.sourceNode.stop();
          handle.sourceNode.disconnect();
        } catch {
          // Ignore already-stopped nodes
        }
      }
    }
    this.scheduledSe.clear();
  }

  playSe(id: SoundEffectId, options?: PlaySeOptions): void {
    this.unlock();
    if (!this.seEnabled || this.volume <= 0 || typeof Audio === 'undefined') {
      return;
    }
    const src = this.resolveSeSrc(id, options);
    const delayMs =
      typeof options?.delayMs === 'number' && Number.isFinite(options.delayMs) && options.delayMs > 0
        ? Math.round(options.delayMs)
        : 0;
    if (delayMs === 0) {
      this.playImmediateSe(src);
      return;
    }
    this.scheduleDelayedSe(src, delayMs);
  }

  destroy(): void {
    this.cancelScheduledSe();
    this.pauseBgm();
    this.bgmAudio = null;
    this.bgmCache.clear();
    this.cache.clear();
    this.seBufferCache.clear();
    this.seBufferPending.clear();
    if (this.audioCtx) {
      const ctx = this.audioCtx;
      this.audioCtx = null;
      try {
        void ctx.close?.().catch(() => {
          // Ignore close errors in headless environments
        });
      } catch {
        // Ignore close errors
      }
    }
  }

  private resolveSeSrc(id: SoundEffectId, options?: PlaySeOptions): string {
    let filename: string = id;
    if (id === 'audio_key') {
      const index = this.keyVariantCursor;
      this.keyVariantCursor = (this.keyVariantCursor + 1) % KEY_VARIANT_COUNT;
      filename = `audio_key_${String(index + 1).padStart(2, '0')}`;
    } else if (id === 'audio_dispatch_extra' && typeof options?.stage === 'number' && Number.isFinite(options.stage)) {
      const clampedStage = Math.max(1, Math.min(EXTRA_STAGE_MAX, Math.round(options.stage)));
      filename = `audio_dispatch_extra_${String(clampedStage).padStart(2, '0')}`;
    }
    return `./assets/sound_effect/${filename}.wav?v=${AUDIO_ASSET_VERSION}`;
  }

  private playImmediateSe(src: string): void {
    if (!this.seEnabled || this.volume <= 0 || typeof Audio === 'undefined') {
      return;
    }
    try {
      let audio = this.cache.get(src);
      if (!audio) {
        audio = new Audio(src);
        this.cache.set(src, audio);
      }
      audio.volume = this.volume;
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Ignore autoplay restriction errors
      });
    } catch {
      // Ignore audio errors in headless/unsupported environments
    }
  }

  private scheduleDelayedSe(src: string, delayMs: number): void {
    const handle: ScheduledSeHandle = { cancelled: false };
    this.scheduledSe.add(handle);

    const ctx = this.ensureAudioContext();
    if (ctx && typeof fetch === 'function') {
      const targetPerfMs = nowMs() + delayMs;
      void this.loadAudioBuffer(ctx, src)
        .then((buffer) => {
          if (handle.cancelled || !this.seEnabled || this.volume <= 0 || this.audioCtx !== ctx) {
            this.scheduledSe.delete(handle);
            return;
          }
          const remainingSec = Math.max(0, (targetPerfMs - nowMs()) / 1000);
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          source.buffer = buffer;
          gain.gain.value = this.volume;
          source.connect(gain);
          gain.connect(ctx.destination);
          handle.sourceNode = source;
          source.onended = () => {
            try {
              gain.disconnect();
            } catch {
              // Ignore cleanup error
            }
            this.scheduledSe.delete(handle);
          };
          source.start(ctx.currentTime + remainingSec);
        })
        .catch(() => {
          if (handle.cancelled) {
            this.scheduledSe.delete(handle);
            return;
          }
          const remainingMs = Math.max(0, Math.round(targetPerfMs - nowMs()));
          this.scheduleFallbackTimeout(handle, src, remainingMs);
        });
      return;
    }

    this.scheduleFallbackTimeout(handle, src, delayMs);
  }

  private scheduleFallbackTimeout(handle: ScheduledSeHandle, src: string, delayMs: number): void {
    handle.timerId = setTimeout(() => {
      this.scheduledSe.delete(handle);
      if (handle.cancelled) {
        return;
      }
      this.playImmediateSe(src);
    }, delayMs);
  }

  private ensureAudioContext(): AudioContext | null {
    if (!this.seEnabled) {
      return null;
    }
    const Ctor = getAudioContextConstructor();
    if (!Ctor) {
      return null;
    }
    try {
      if (!this.audioCtx) {
        this.audioCtx = new Ctor();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {
          // Ignore resume errors outside user gesture
        });
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  private loadAudioBuffer(ctx: AudioContext, src: string): Promise<AudioBuffer> {
    const cached = this.seBufferCache.get(src);
    if (cached) {
      return Promise.resolve(cached);
    }
    const pending = this.seBufferPending.get(src);
    if (pending) {
      return pending;
    }
    const promise = fetch(src)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.arrayBuffer();
      })
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((decoded) => {
        this.seBufferPending.delete(src);
        this.seBufferCache.set(src, decoded);
        return decoded;
      })
      .catch((err) => {
        this.seBufferPending.delete(src);
        throw err;
      });
    this.seBufferPending.set(src, promise);
    return promise;
  }

  private pauseBgm(): void {
    try {
      this.bgmAudio?.pause();
    } catch {
      // Ignore in headless environments
    }
  }

  private syncBgmVolume(): void {
    if (!this.bgmAudio) {
      return;
    }
    try {
      const base = this.volume > 0 ? this.volume : 0.7;
      this.bgmAudio.volume = Math.max(0, Math.min(1, base * 0.45));
    } catch {
      // Ignore
    }
  }

  private startBgmElement(track: 'home' | 'play'): void {
    if (typeof Audio === 'undefined') {
      return;
    }
    try {
      const nextSrc = `./assets/bgm/bgm_${track}.mp3?v=${AUDIO_ASSET_VERSION}`;
      let nextAudio = this.bgmCache.get(track);
      if (!nextAudio) {
        nextAudio = new Audio(nextSrc);
        nextAudio.loop = true;
        nextAudio.addEventListener?.('ended', () => {
          if (this.bgmEnabled && this.bgmAudio === nextAudio) {
            nextAudio.currentTime = 0;
            void nextAudio.play().catch(() => {
              // Ignore autoplay restriction errors
            });
          }
        });
        this.bgmCache.set(track, nextAudio);
      }
      nextAudio.loop = true;
      if (this.bgmAudio && this.bgmAudio !== nextAudio) {
        this.bgmAudio.pause();
      }
      this.bgmAudio = nextAudio;
      this.syncBgmVolume();
      void nextAudio.play().catch(() => {
        // Will retry on next user interaction via unlock()
      });
    } catch {
      // Ignore audio errors in headless/unsupported environments
    }
  }
}
