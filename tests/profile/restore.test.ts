import { describe, expect, it } from 'vitest';
import { CityEconomy, encodeCityState } from '../../src/economy';
import { ProfileRepository, createProfileDocument, parseProfileBackup, validateProfileDocument } from '../../src/profile';

const populated = () => {
  const p = createProfileDocument(); p.settings.fontScale = 150; p.tutorialSeen = true;
  const city = new CityEconomy(); city.beginSession('saved-session'); city.completeWord({cityId:'city-1',sessionId:'saved-session',factSequence:1,baseLength:3}); city.endSession();
  p.extensions.city = encodeCityState(city.state);
  p.extensions.backupNotes = ['current product notes'];
  p.metadata = {...p.metadata,ownerTabId:'foreign-import-owner',writeEpoch:999,revision:999,generation:999};
  return p;
};

describe('supported current backup formats and restore boundary', () => {
  it('accepts real v4 repository/runtime envelopes and raw documents while rejecting other versions', () => {
    const current = populated();
    for (const source of [current,{current},{repository:{current},currentView:{ignored:true}}]) {
      expect(parseProfileBackup(JSON.stringify(source))).toEqual(current);
    }
    const unsupported = populated(); unsupported.metadata.schemaVersion = 3 as 4;
    expect(() => parseProfileBackup({current:unsupported})).toThrow('形式・版・整合性');
    expect(() => parseProfileBackup('{')).toThrow('形式・版・整合性');
    expect(() => parseProfileBackup({settings:{guide:true},score:10000})).toThrow('形式・版・整合性');
  });
  it('rejects corrupt known city data at the external boundary, leaving original data intact', () => {
    const profile = populated(); const corrupt = structuredClone(profile);
    (corrupt.extensions.city as {generatedMicro:string}).generatedMicro = '0';
    expect(validateProfileDocument(corrupt)).toBe(false);
    expect(() => parseProfileBackup({current:corrupt})).toThrow('形式・版・整合性');
    expect(validateProfileDocument(profile)).toBe(true);
  });
  it('requires confirmed replacement and archives unsaved data while retaining local metadata/generation', async () => {
    const repo = await ProfileRepository.open({indexedDB:null,tabId:'local'});
    await repo.updateSettings({guide:false});
    const before = repo.snapshot;
    await expect(repo.restoreData(populated(),{confirmed:false,discardUnsaved:true})).rejects.toThrow('確認');
    expect(repo.snapshot).toEqual(before);
    await expect(repo.restoreData(populated(),{confirmed:true})).rejects.toThrow('古い状態');
    expect(repo.snapshot).toEqual(before);
    await repo.restoreData({repository:{current:populated()}},{confirmed:true,discardUnsaved:true});
    expect(repo.snapshot.settings.fontScale).toBe(150);
    expect(repo.snapshot.metadata).toEqual({...before.metadata,ownerTabId:'local',writeEpoch:before.metadata.writeEpoch+1,revision:before.metadata.revision+1,generation:before.metadata.generation+1});
    expect(repo.snapshot.extensions).toEqual(populated().extensions);
    expect(repo.status).toMatchObject({storage:'memory',saveState:'unsaved',recoveryRequired:false});
    const backup = JSON.parse(repo.exportData());
    expect(backup.restoreBackups[0].current.settings.guide).toBe(false);
    await expect(repo.mutateDocument(document => document,{generation:before.metadata.generation})).rejects.toThrow('削除前');
    repo.close();
  });
  it('deletes collection/economy only, preserving unrelated current extension values', async () => {
    const repo = await ProfileRepository.open({indexedDB:null});
    await repo.restoreData(populated(),{confirmed:true});
    await repo.resetCollectionAndEconomy();
    expect(repo.snapshot.extensions.city).toBeUndefined();
    expect(repo.snapshot.extensions.backupNotes).toEqual(populated().extensions.backupNotes);
    repo.close();
  });
});
