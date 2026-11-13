import manifest from '../../spec/initial/data/visual_resource_manifest.json';
import { describe, expect, it, vi } from 'vitest';
import { AudioPlayer, type AudioKind } from '../../src/audio/AudioPlayer';

class FakeGain {
  gain = { value: 1 };
  connect = vi.fn();
  disconnect = vi.fn();
}
class FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  ended = false;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn(() => { this.started = true; });
  stop = vi.fn(() => { this.stopped = true; });
  end() { this.ended = true; this.onended?.(); }
  get active() { return this.started && !this.stopped && !this.ended; }
}
class FakeContext {
  state: AudioContextState = 'suspended';
  destination = {};
  sources: FakeSource[] = [];
  gains: FakeGain[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async (_data: ArrayBuffer) => ({ duration: 48 }) as AudioBuffer);
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
  createGain() { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  get active() { return this.sources.filter((source) => source.active); }
}
const flush = async () => { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); };
function fixture(options: { failOgg?: boolean; decodeOggFailure?: boolean } = {}) {
  const context = new FakeContext();
  const fetched: string[] = [];
  const fetchAudio: typeof fetch = vi.fn(async (input) => {
    const url = String(input); fetched.push(url);
    return { ok: !(options.failOgg && url.endsWith('.ogg')),
      arrayBuffer: async () => new Uint8Array([url.endsWith('.ogg') ? 1 : 0]).buffer } as Response;
  });
  if (options.decodeOggFailure) context.decodeAudioData.mockImplementation(async (data) => {
    if (new Uint8Array(data)[0] === 1) throw new Error('Codec unavailable');
    return { duration: 48 } as AudioBuffer;
  });
  const player = new AudioPlayer({ createContext: () => context as unknown as AudioContext, fetchAudio, baseUrl: '/kotobabin' });
  return { player, context, fetched, fetchAudio };
}
async function ready() {
  const f = fixture(); expect(await f.player.startFromGesture()).toBe(true); await flush(); return f;
}

describe('optional nonblocking AudioPlayer', () => {
  it('creates no context or network activity until a gesture and never starts playback from silent calls', async () => {
    const createContext = vi.fn(() => null);
    const fetchAudio = vi.fn();
    const player = new AudioPlayer({ createContext, fetchAudio: fetchAudio as typeof fetch });
    player.play('key'); player.play('theme'); player.settings({ master: 0.5 });
    expect(createContext).not.toHaveBeenCalled(); expect(fetchAudio).not.toHaveBeenCalled();
    expect(await player.startFromGesture()).toBe(false);
    expect(createContext).toHaveBeenCalledTimes(1);
    player.dispose();
  });

  it('uses separate spec-default gains and BASE_URL paths, with one looping background voice', async () => {
    const { player, context, fetched } = await ready();
    player.play('key');
    expect(context.gains.at(-1)!.gain.value).toBeCloseTo(0.5 * 0.7);
    player.play('theme'); await flush(); player.play('theme');
    expect(context.active.filter((source) => source.loop)).toHaveLength(1);
    expect(context.gains.at(-1)!.gain.value).toBeCloseTo(0.5 * 0.25);
    expect(fetched).toContain('/kotobabin/assets/sound_effect/audio_key.wav');
    expect(fetched).toContain('/kotobabin/assets/bgm/audio_theme.ogg');
    const exports = manifest.assets.filter(asset => asset.kind === 'audio').flatMap(asset => asset.runtime_exports);
    expect(fetched.every(url => exports.includes(url.slice('/kotobabin/'.length)))).toBe(true);
    player.settings({ master: 0.8, effects: 0.4, music: 0.2 });
    expect(context.gains[0].gain.value).toBeCloseTo(0.32);
    expect(context.gains[1].gain.value).toBeCloseTo(0.16);
    player.dispose();
  });

  it('limits simultaneous voices to eight including BGM and removes the oldest key first for delivery', async () => {
    const { player, context } = await ready();
    player.play('theme'); await flush();
    for (let index = 0; index < 7; index++) player.play('key');
    expect(context.active).toHaveLength(8);
    const music = context.sources[0]; const oldestKey = context.sources[1];
    player.play('dispatch_full');
    expect(context.active).toHaveLength(8);
    expect(oldestKey.stopped).toBe(true);
    expect(music.stopped).toBe(false);
    expect(context.sources.at(-1)!.active).toBe(true);
    player.dispose();
  });

  it('drops lower priority cues when all eight active voices are deliveries, then restores BGM into a free slot', async () => {
    const { player, context } = await ready();
    for (let index = 0; index < 8; index++) player.play('dispatch_full');
    const deliveries = [...context.sources];
    for (const kind of ['word', 'mistake', 'key', 'theme'] as AudioKind[]) player.play(kind);
    await flush();
    expect(context.active).toHaveLength(8);
    expect(deliveries.every((source) => !source.stopped)).toBe(true);
    expect(context.sources).toHaveLength(8);
    deliveries[0].end(); await flush();
    expect(context.active).toHaveLength(8);
    expect(context.active.filter((source) => source.loop)).toHaveLength(1);
    player.dispose();
  });

  it('prioritizes word over mistake over key when no older key is available', async () => {
    const { player, context } = await ready();
    for (let index = 0; index < 8; index++) player.play('mistake');
    const oldestMistake = context.sources[0];
    player.play('key'); expect(context.sources).toHaveLength(8);
    player.play('word'); expect(oldestMistake.stopped).toBe(true);
    expect(context.active).toHaveLength(8);
    player.dispose();
  });

  for (const failure of ['http', 'decode'] as const) {
    it(`falls back from Ogg to MP3 after an ${failure} failure without duplicate music`, async () => {
      const { player, context, fetched } = fixture({ failOgg: failure === 'http', decodeOggFailure: failure === 'decode' });
      await player.startFromGesture(); await flush(); player.play('theme'); player.play('theme'); await flush();
      expect(fetched.filter((url) => url.endsWith('.ogg'))).toHaveLength(1);
      expect(fetched.filter((url) => url.endsWith('.mp3'))).toHaveLength(1);
      expect(context.active).toHaveLength(1); expect(context.active[0].loop).toBe(true);
      player.dispose();
    });
  }

  it('keeps startup and play usable when context creation, resume, network, or decoding fails', async () => {
    const unavailable = new AudioPlayer({ createContext: () => { throw new Error('No hardware'); } });
    expect(await unavailable.startFromGesture()).toBe(false); expect(() => unavailable.play('word')).not.toThrow(); unavailable.dispose();
    const interrupted = fixture();
    interrupted.context.resume.mockRejectedValueOnce(new Error('Autoplay denied'));
    expect(await interrupted.player.startFromGesture()).toBe(false);
    expect(await interrupted.player.startFromGesture()).toBe(true); // explicit next gesture can retry
    interrupted.player.dispose();
    const failing = fixture(); failing.context.decodeAudioData.mockRejectedValue(new Error('Decode failed'));
    await failing.player.startFromGesture(); failing.player.play('word'); failing.player.play('theme'); await flush();
    expect(failing.context.active).toHaveLength(0); failing.player.dispose();
    const offline = new AudioPlayer({ createContext: () => new FakeContext() as unknown as AudioContext,
      fetchAudio: vi.fn().mockRejectedValue(new Error('Offline')) as typeof fetch });
    expect(await offline.startFromGesture()).toBe(true);
    expect(() => offline.play('key')).not.toThrow(); await flush(); offline.dispose();
  });

  it('mutes active voices immediately and disposes without playback or resource resurrection', async () => {
    const { player, context } = await ready();
    player.play('key'); player.play('theme'); await flush();
    expect(context.active).toHaveLength(2);
    player.settings({ enabled: false }); expect(context.active).toHaveLength(0);
    player.play('word'); expect(context.active).toHaveLength(0);
    player.settings({ enabled: true }); expect(context.active.filter((source) => source.loop)).toHaveLength(1);
    player.dispose(); player.dispose(); await flush();
    expect(context.active).toHaveLength(0); expect(context.close).toHaveBeenCalledTimes(1);
    expect(await player.startFromGesture()).toBe(false); player.play('key');
    expect(context.active).toHaveLength(0);
  });

  it('never replays a pending first-load cue after mute or disposal', async () => {
    const context = new FakeContext();
    let release!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { release = resolve; });
    const player = new AudioPlayer({ createContext: () => context as unknown as AudioContext, fetchAudio: (() => response) as typeof fetch });
    await player.startFromGesture();
    player.play('word'); player.settings({ enabled: false }); player.settings({ enabled: true });
    release({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) } as Response); await flush();
    expect(context.active).toHaveLength(0);
    player.play('word'); expect(context.active).toHaveLength(1);
    player.dispose(); expect(context.active).toHaveLength(0);
  });
});

describe('audio lifecycle and retry status', () => {
  it('stops all voices at pause and needs an explicit gesture before playback resumes', async () => {
    const { player, context } = await ready();
    player.play('key'); player.play('theme'); await flush();
    player.pause();
    expect(player.status).toBe('paused'); expect(context.active).toHaveLength(0);
    player.play('word'); player.play('theme'); expect(context.active).toHaveLength(0);
    expect(await player.startFromGesture()).toBe(true);
    player.play('theme'); await flush(); expect(context.active.filter(source => source.loop)).toHaveLength(1);
    player.dispose(); expect(player.status).toBe('disposed');
  });
  it('can stop only the background loop while final delivery feedback finishes', async () => {
    const { player, context } = await ready();
    player.play('theme'); await flush(); player.play('dispatch_full');
    const delivery = context.sources.at(-1)!;
    player.stopTheme();
    expect(context.active).toEqual([delivery]); delivery.end(); await flush();
    expect(context.active).toHaveLength(0); player.dispose();
  });
  it('reports unavailable feedback after decoding failure and recovers on a fresh explicit gesture', async () => {
    const { player, context } = fixture();
    context.decodeAudioData.mockRejectedValueOnce(new Error('Temporary decode failure'));
    await player.startFromGesture(); await flush();
    expect(player.status).toBe('unavailable');
    player.pause(); expect(player.status).toBe('unavailable'); // pausing cannot hide the explicit retry requirement
    expect(await player.startFromGesture()).toBe(true); await flush();
    expect(player.status).toBe('ready'); player.play('key'); expect(context.active).toHaveLength(1); player.dispose();
  });
});
