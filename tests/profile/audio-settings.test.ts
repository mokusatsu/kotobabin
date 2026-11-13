import { describe, expect, it } from 'vitest';
import { createProfileDocument, parseProfileBackup, ProfileRepository, validateProfileDocument } from '../../src/profile';
import { createAppRuntime } from '../../src/app/runtime';

const defaults = { master: 0.5, effects: 0.7, music: 0.25 };
describe('selected sound preferences', () => {
  it('starts opted out with the canonical three independent volume defaults', () => {
    const profile = createProfileDocument();
    expect(profile.settings.sound).toBe(false); expect(profile.settings.audioVolume).toEqual(defaults);
    const unselected = createProfileDocument(); delete unselected.settings.audioVolume;
    expect(validateProfileDocument(unselected)).toBe(true);
  });
  it('validates only finite 0..1 levels at save/import boundaries', () => {
    for (const invalid of [null, [], {}, { ...defaults, master: -0.1 }, { ...defaults, music: 1.1 },
      { ...defaults, effects: NaN }, { ...defaults, master: Infinity }, { ...defaults, music: '0.5' }, { ...defaults, extra: 1 }]) {
      const profile = createProfileDocument(); Object.assign(profile.settings, { audioVolume: invalid });
      expect(validateProfileDocument(profile)).toBe(false);
      expect(() => parseProfileBackup(profile)).toThrow();
    }
  });
  it('preserves channels across record/collection resets and restores defaults only with a settings reset', async () => {
    const repo = await ProfileRepository.open({ indexedDB: null });
    await repo.updateSettings({ sound: true, audioVolume: { master: 0.4, effects: 0.2, music: 0.1 } });
    await repo.resetRecords(); expect(repo.snapshot.settings.sound).toBe(true);
    await repo.resetCollectionAndEconomy(); expect(repo.snapshot.settings.audioVolume).toEqual({ master: 0.4, effects: 0.2, music: 0.1 });
    await repo.resetSettings(); expect(repo.snapshot.settings).toMatchObject({ sound: false, audioVolume: defaults }); repo.close();
  });
  it('normalizes unselected levels and returns independent runtime settings values', async () => {
    const repo = await ProfileRepository.open({ indexedDB: null });
    const runtime = await createAppRuntime(repo);
    expect(runtime.settings).toMatchObject({ sound: false, audioVolume: defaults });
    const values = runtime.settings; values.audioVolume.master = 0;
    expect(runtime.settings.audioVolume.master).toBe(0.5);
    runtime.updateSettings({ sound: true, audioVolume: { master: 0.3, effects: 0.6, music: 0.15 } });
    expect(runtime.settings.audioVolume).toEqual({ master: 0.3, effects: 0.6, music: 0.15 });
    await runtime.retrySave(); runtime.close();
  });
});
