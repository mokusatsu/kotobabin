export type SoundEffectId =
  | 'audio_key'
  | 'audio_word'
  | 'audio_dispatch_small'
  | 'audio_dispatch_medium'
  | 'audio_dispatch_full'
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

const AUDIO_ASSET_VERSION = '20261115e';

export class AudioPlayer {
  private seEnabled = true;
  private bgmEnabled = false;
  private volume = 0.7;
  private cache = new Map<string, HTMLAudioElement>();
  private currentBgmTrack: BgmTrackId = 'none';
  private bgmAudio: HTMLAudioElement | null = null;
  private bgmCache = new Map<'home' | 'play', HTMLAudioElement>();

  setPreferences(opts: { seEnabled: boolean; bgmEnabled: boolean; volume?: number }): void {
    this.seEnabled = opts.seEnabled;
    const prevBgm = this.bgmEnabled;
    this.bgmEnabled = opts.bgmEnabled;
    if (typeof opts.volume === 'number' && Number.isFinite(opts.volume)) {
      this.volume = Math.max(0, Math.min(1, opts.volume));
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
    if (this.bgmEnabled && this.currentBgmTrack !== 'none' && (!this.bgmAudio || this.bgmAudio.paused)) {
      this.startBgmElement(this.currentBgmTrack);
    }
  }

  playSe(id: SoundEffectId): void {
    this.unlock();
    if (!this.seEnabled || this.volume <= 0 || typeof Audio === 'undefined') {
      return;
    }
    try {
      const src = `./assets/sound_effect/${id}.wav?v=${AUDIO_ASSET_VERSION}`;
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

  destroy(): void {
    this.currentBgmTrack = 'none';
    this.pauseBgm();
    this.bgmAudio = null;
    this.bgmCache.clear();
    for (const audio of this.cache.values()) {
      if (!audio.paused) this.pauseAudio(audio);
    }
    this.cache.clear();
  }

  private pauseBgm(): void {
    if (this.bgmAudio) this.pauseAudio(this.bgmAudio);
  }

  private pauseAudio(audio: HTMLAudioElement): void {
    try {
      audio.pause();
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
          if (this.bgmEnabled && this.currentBgmTrack === track && this.bgmAudio === nextAudio) {
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
        this.pauseAudio(this.bgmAudio);
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
