import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayer, type SoundEffectId } from '@/ui/components/audioPlayer';

class MockAudio {
  src: string;
  loop = false;
  volume = 1;
  currentTime = 0;
  paused = true;
  playCalls = 0;
  pauseCalls = 0;
  private listeners = new Map<string, Array<() => void>>();

  constructor(src: string) {
    this.src = src;
  }

  addEventListener(type: string, cb: () => void): void {
    const arr = this.listeners.get(type) ?? [];
    arr.push(cb);
    this.listeners.set(type, arr);
  }

  dispatchEnded(): void {
    this.paused = true;
    for (const cb of this.listeners.get('ended') ?? []) {
      cb();
    }
  }

  play(): Promise<void> {
    this.paused = false;
    this.playCalls += 1;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
    this.pauseCalls += 1;
  }
}

describe('AudioPlayer', () => {
  const originalAudio = globalThis.Audio;
  const created: MockAudio[] = [];

  beforeEach(() => {
    created.length = 0;
    globalThis.Audio = vi.fn((src: string) => {
      const inst = new MockAudio(src);
      created.push(inst);
      return inst;
    }) as unknown as typeof Audio;
  });

  afterEach(() => {
    globalThis.Audio = originalAudio;
  });

  it('cycles through 20 audio_key variants sequentially and reuses cached elements', () => {
    const player = new AudioPlayer();
    player.setPreferences({ seEnabled: true, bgmEnabled: false, volume: 0.6 });

    for (let i = 0; i < 21; i++) {
      player.playSe('audio_key');
    }

    expect(created).toHaveLength(20);
    expect(created[0].src).toMatch(/^\.\/assets\/sound_effect\/audio_key_01\.wav\?v=/);
    expect(created[19].src).toMatch(/^\.\/assets\/sound_effect\/audio_key_20\.wav\?v=/);
  });

  it('resolves and clamps 10 audio_dispatch_extra stages and cancels delayed SE', async () => {
    const player = new AudioPlayer();
    player.setPreferences({ seEnabled: true, bgmEnabled: false, volume: 0.6 });

    player.playSe('audio_dispatch_extra', { stage: 0 });
    player.playSe('audio_dispatch_extra', { stage: 5 });
    player.playSe('audio_dispatch_extra', { stage: 99 });

    expect(created).toHaveLength(3);
    expect(created[0].src).toMatch(/^\.\/assets\/sound_effect\/audio_dispatch_extra_01\.wav\?v=/);
    expect(created[1].src).toMatch(/^\.\/assets\/sound_effect\/audio_dispatch_extra_05\.wav\?v=/);
    expect(created[2].src).toMatch(/^\.\/assets\/sound_effect\/audio_dispatch_extra_10\.wav\?v=/);

    player.playSe('audio_dispatch_extra', { stage: 3, delayMs: 15 });
    expect(created).toHaveLength(3);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(created).toHaveLength(4);
    expect(created[3].src).toMatch(/^\.\/assets\/sound_effect\/audio_dispatch_extra_03\.wav\?v=/);

    player.playSe('audio_dispatch_extra', { stage: 4, delayMs: 15 });
    player.cancelScheduledSe();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(created).toHaveLength(4);
  });

  it('plays SE with configured volume and skips when disabled or volume is 0', () => {
    const player = new AudioPlayer();
    player.setPreferences({ seEnabled: true, bgmEnabled: false, volume: 0.6 });

    const ids: SoundEffectId[] = ['audio_ui_click', 'audio_stamp_unlock', 'audio_district_open'];
    for (const id of ids) {
      player.playSe(id);
    }
    expect(created).toHaveLength(3);
    expect(created[0].src).toMatch(/^\.\/assets\/sound_effect\/audio_ui_click\.wav\?v=/);
    expect(created[0].volume).toBeCloseTo(0.6);

    player.setPreferences({ seEnabled: false, bgmEnabled: false, volume: 0.6 });
    player.playSe('audio_round_start');
    expect(created).toHaveLength(3);

    player.setPreferences({ seEnabled: true, bgmEnabled: false, volume: 0 });
    player.playSe('audio_round_start');
    expect(created).toHaveLength(3);
  });

  it('switches looping BGM tracks and pauses when disabled', () => {
    const player = new AudioPlayer();
    player.setBgmTrack('home');
    expect(created).toHaveLength(0); // bgmEnabled defaults to false

    player.setPreferences({ seEnabled: true, bgmEnabled: true, volume: 0.8 });
    expect(created).toHaveLength(1);
    const homeBgm = created[0];
    expect(homeBgm.src).toMatch(/^\.\/assets\/bgm\/bgm_home\.mp3\?v=/);
    expect(homeBgm.loop).toBe(true);
    expect(homeBgm.volume).toBeCloseTo(0.8 * 0.45);
    expect(homeBgm.paused).toBe(false);

    // Verify ended fallback restarts playback when loop event fires
    homeBgm.dispatchEnded();
    expect(homeBgm.currentTime).toBe(0);
    expect(homeBgm.paused).toBe(false);

    player.setBgmTrack('play');
    expect(created).toHaveLength(2);
    const playBgm = created[1];
    expect(playBgm.src).toMatch(/^\.\/assets\/bgm\/bgm_play\.mp3\?v=/);
    expect(homeBgm.paused).toBe(true);
    expect(playBgm.paused).toBe(false);

    player.setPreferences({ seEnabled: true, bgmEnabled: false, volume: 0.8 });
    expect(playBgm.paused).toBe(true);
  });
});
