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
  it('does not restart an ended track after changing to silence', () => {
    const player = new AudioPlayer();
    player.setPreferences({ seEnabled: false, bgmEnabled: true });
    player.setBgmTrack('home');
    const bgm = created[0];
    player.setBgmTrack('none');
    bgm.dispatchEnded();
    expect(bgm.playCalls).toBe(1);
    expect(bgm.paused).toBe(true);
  });

  it('stops active sound effects when the player is destroyed', () => {
    const player = new AudioPlayer();
    player.playSe('audio_round_start');
    const se = created[0];
    expect(se.paused).toBe(false);
    player.destroy();
    expect(se.paused).toBe(true);
  });

});
