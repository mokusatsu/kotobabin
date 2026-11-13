import content from '../../spec/initial/data/words.json';
import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/typing';
import {
  ProfileRepository, createProfileDocument, filterCatalogue, createProfileProgress,
  validateProfileDocument, applySessionFact, type RecordContext,
} from '../../src/profile';

const context: RecordContext = {courseId:'relaxed', planId:'test', contentVersion:'2', generatorVersion:'1', inputRuleVersion:'romaji-1.0.0', scoringVersion:'1', guideUsed:true, assisted:false};
const facts = () => {
  const game = new GameSession({words:[filterCatalogue(createProfileProgress())[0]],sessionId:'persistence-test'});
  for (const key of game.snapshot(0).remainingGuide) game.input(key,1);
  game.deliver(2);
  game.tick(90001);
  return game.drainEvents();
};

describe('storage boundary validation', () => {
  it('accepts a real accumulated profile with ordered result word IDs and cloned settings', async () => {
    const repository = await ProfileRepository.open({indexedDB:null,tabId:'one'});
    await repository.commitFacts(facts(),context);
    expect(validateProfileDocument(repository.snapshot)).toBe(true);
    expect(repository.snapshot.progress.recentRounds[0].wordIds).toEqual(['daily_r01','daily_r01']);
    expect(validateProfileDocument(createProfileDocument())).toBe(true);
    const a = createProfileDocument();
    a.settings.deliveryKeys.push('Enter');
    expect(createProfileDocument().settings.deliveryKeys).toEqual(['Space']);
  });

  it('rejects unknown word IDs at the persistence boundary while accepting legacy collection IDs', async () => {
    const repository = await ProfileRepository.open({indexedDB:null});
    await repository.commitFacts(facts(),context);
    const valid = repository.snapshot;
    const legacyId = content.collectionSets['kotobabin-ja-240-v1'].at(-1)!;
    const counts = {completed:1,cleanCompleted:1,practiceCompleted:0,practiceCleanCompleted:0};
    valid.progress.words = {[legacyId]: counts};
    expect(validateProfileDocument(valid)).toBe(true);
    expect(validateProfileDocument({...valid, progress:{...valid.progress, words:{unknown_word:counts}}})).toBe(false);
    valid.progress.recentRounds[0].wordIds = ['unknown_word'];
    expect(validateProfileDocument(valid)).toBe(false);
  });

  it('rejects wrong versions, corrupt balances/counters, malformed nested records and polluted keys', () => {
    const value = createProfileDocument();
    for (const corrupt of [
      {...value, metadata:{...value.metadata,schemaVersion:5}},
      {...value, metadata:{...value.metadata,writeEpoch:-1}},
      {...value, settings:{...value.settings,deliveryKeys:['Space','Space']}},
      {...value, progress:{...value.progress,totalCompleted:1}},
      {...value, progress:{...value.progress,words:{bad:{completed:1,cleanCompleted:2,practiceCompleted:0,practiceCleanCompleted:0}},totalCompleted:1}},
      {...value, progress:{...value.progress,factCursors:{bad:Infinity}}},
      {...value, progress:{...value.progress,recentRounds:[{sessionId:'bad'}]}},
      {...value, extensions:JSON.parse('{"__proto__":{"polluted":true}}')},
    ]) expect(validateProfileDocument(corrupt)).toBe(false);
  });
});

describe('functional per-page memory fallback', () => {
  it('falls back when the browser blocks access to the IndexedDB getter itself', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    Object.defineProperty(globalThis, 'indexedDB', {configurable:true, get() {throw new DOMException('Storage is blocked', 'SecurityError');}});
    try {
      const repository = await ProfileRepository.open({tabId:'restricted'});
      expect(repository.status).toMatchObject({storage:'memory',ownership:'owner',saveState:'unsaved'});
      expect(repository.status.notice).toContain('ページを閉じると残りません');
      expect(repository.status.notice).toContain('Storage is blocked');
      await repository.commitFacts(facts(),context);
      expect(repository.snapshot.progress.totalCompleted).toBe(1);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor);
      else Reflect.deleteProperty(globalThis, 'indexedDB');
    }
  });

  it('continues game records/settings with an explicit unsaved notice and safe replay', async () => {
    const repository = await ProfileRepository.open({indexedDB:null,tabId:'memory'});
    expect(repository.status).toMatchObject({storage:'memory',ownership:'owner',saveState:'unsaved'});
    expect(repository.status.notice).toContain('ページを閉じると残りません');
    let changes=0; repository.subscribe(()=>changes++);
    await repository.commitFacts(facts(),context);
    await repository.commitFacts(facts(),context);
    await repository.updateSettings({fontScale:150,deliveryKeys:['Space','Enter']});
    await repository.markTutorialSeen();
    expect(repository.snapshot.progress.totalCompleted).toBe(1);
    expect(repository.snapshot.settings.fontScale).toBe(150);
    expect(repository.snapshot.tutorialSeen).toBe(true);
    expect(repository.status.saveState).toBe('unsaved');
    expect(changes).toBeGreaterThan(0);
    const exported=JSON.parse(repository.exportData());
    expect(exported.current.progress.totalCompleted).toBe(1);
    expect(exported.current).not.toHaveProperty('keyLogs');
    repository.close();
  });

  it('applies batches atomically in memory and rejects invalid settings at the boundary', async () => {
    const repository = await ProfileRepository.open({indexedDB:null});
    const batch=facts();
    await expect(repository.commitFacts([batch[0],{...batch[1],factSequence:99}],context)).rejects.toThrow('gap');
    expect(repository.snapshot.progress.totalCompleted).toBe(0);
    await expect(repository.updateSettings({fontScale:90 as 100})).rejects.toThrow('設定');
    expect(repository.snapshot.settings.fontScale).toBe(100);
    const cloned=repository.snapshot; cloned.progress.totalCompleted=50;
    expect(repository.snapshot.progress.totalCompleted).toBe(0);
  });

  it('stores future extensions and related facts in one mutation without persisting key logs', async () => {
    const repository = await ProfileRepository.open({indexedDB:null});
    await repository.commitExtension('city',{coinsMicro:'1000000'},facts(),context);
    expect(repository.snapshot.extensions.city).toEqual({coinsMicro:'1000000'});
    expect(repository.snapshot.progress.totalCompleted).toBe(1);
    await expect(repository.commitExtension('__proto__',{})).rejects.toThrow('保存項目');
  });
});


describe('atomic document reducers', () => {
  it('applies city state and confirmed typing facts together with replay-safe event identities', async () => {
    const repository = await ProfileRepository.open({indexedDB:null});
    const batch = facts();
    const reduce = (document: ReturnType<typeof createProfileDocument>) => {
      const alreadyApplied = document.progress.factCursors[batch[0].sessionId] >= batch.at(-1)!.factSequence;
      return { ...document,
        progress: batch.reduce((progress, fact) => applySessionFact(progress, fact, context), document.progress),
        extensions: alreadyApplied ? document.extensions : {...document.extensions, city:{generatedMaterials:'6'}},
      };
    };
    await repository.mutateDocument(reduce);
    await repository.mutateDocument(reduce);
    expect(repository.snapshot.progress.totalCompleted).toBe(1);
    expect(repository.snapshot.extensions.city).toEqual({generatedMaterials:'6'});
  });

  it('derives queued operations from the latest document and protects repository metadata', async () => {
    const repository = await ProfileRepository.open({indexedDB:null});
    const increment = (document: ReturnType<typeof createProfileDocument>) => ({
      ...document, extensions:{...document.extensions, count:Number(document.extensions.count ?? 0)+1},
      metadata:{...document.metadata, ownerTabId:'intruder', revision:999},
    });
    await Promise.all([repository.mutateDocument(increment), repository.mutateDocument(increment)]);
    expect(repository.snapshot.extensions.count).toBe(2);
    expect(repository.snapshot.metadata).toEqual(createProfileDocument().metadata);
  });

  it('does not partially apply city state when a related profile fact fails', async () => {
    const repository = await ProfileRepository.open({indexedDB:null});
    const invalid = {...facts()[0],factSequence:99};
    await expect(repository.mutateDocument(document => {
      document.extensions.city = {generatedMaterials:'100'};
      document.progress = applySessionFact(document.progress,invalid,context);
      return document;
    })).rejects.toThrow('gap');
    expect(repository.snapshot.extensions).toEqual({});
    expect(repository.snapshot.progress.totalCompleted).toBe(0);
  });
});
