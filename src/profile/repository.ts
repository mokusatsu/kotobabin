import { selectedAudioVolume, validAudioVolume, type AudioVolume } from '../audio/preferences';
import content from '../../spec/initial/data/words.json';
import {
  applySessionFact, createProfileProgress, validateAchievementState, resetAchievementRecords,
  type ProfileProgress, type RecordContext, type AchievementState,
} from './index';
import type { SessionFact } from '../typing';
import { decodeCityState } from '../economy';

export interface ProfileSettings {
  guide: boolean;
  fontScale: 100 | 125 | 150;
  deliveryKeys: ('Space' | 'Enter')[];
  reducedMotion: boolean;
  sound: boolean;
  audioVolume?: AudioVolume;
}
export interface ProfileDocument {
  settings: ProfileSettings;
  tutorialSeen: boolean;
  progress: ProfileProgress;
  /** Future city/achievement state shares this atomic document, without key logs. */
  extensions: Record<string, unknown>;
  metadata: {
    schemaVersion: 4;
    ownerTabId: string | null;
    writeEpoch: number;
    revision: number;
    generation: number;
  };
}
export interface RepositoryStatus {
  storage: 'indexeddb' | 'memory';
  ownership: 'owner' | 'readonly';
  saveState: 'saved' | 'pending' | 'unsaved';
  recoveryRequired: boolean;
  notice: string;
}
export const defaultProfileSettings: ProfileSettings = {
  guide: true, fontScale: 100, deliveryKeys: ['Space'], reducedMotion: false, sound: false, audioVolume: selectedAudioVolume(),
};
export function createProfileDocument(): ProfileDocument {
  return { settings: { ...defaultProfileSettings, deliveryKeys: [...defaultProfileSettings.deliveryKeys], audioVolume: selectedAudioVolume() }, tutorialSeen: false, progress: createProfileProgress(),
    extensions: {}, metadata: { schemaVersion: 4, ownerTabId: null, writeEpoch: 0, revision: 0, generation: 0 } };
}

const knownWordIds = new Set(content.words.map(word => word.id));
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => !forbiddenKeys.has(key));
}
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function finiteText(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function metadata(value: unknown): value is ProfileDocument['metadata'] {
  return object(value) && value.schemaVersion === 4 && (value.ownerTabId === null || finiteText(value.ownerTabId))
    && integer(value.writeEpoch) && integer(value.revision) && integer(value.generation);
}
function settings(value: unknown): value is ProfileSettings {
  return object(value) && typeof value.guide === 'boolean' && [100, 125, 150].includes(value.fontScale as number)
    && Array.isArray(value.deliveryKeys) && value.deliveryKeys.length > 0 && value.deliveryKeys.length <= 2
    && value.deliveryKeys.every(key => key === 'Space' || key === 'Enter') && new Set(value.deliveryKeys).size === value.deliveryKeys.length
    && typeof value.reducedMotion === 'boolean' && typeof value.sound === 'boolean'
    && (value.audioVolume === undefined || validAudioVolume(value.audioVolume));
}
function context(value: unknown): value is RecordContext {
  return object(value) && ['relaxed', 'standard', 'challenge'].includes(value.courseId as string)
    && ['planId', 'contentVersion', 'generatorVersion', 'inputRuleVersion', 'scoringVersion'].every(key => finiteText(value[key]))
    && typeof value.guideUsed === 'boolean' && typeof value.assisted === 'boolean';
}

/** External persistence/import boundary only. Never used on every keystroke. */
export function validateProfileDocument(value: unknown): value is ProfileDocument {
  if (!object(value) || !settings(value.settings) || typeof value.tutorialSeen !== 'boolean'
    || !object(value.extensions) || !object(value.metadata) || !object(value.progress)) return false;
  try { if (value.extensions.city !== undefined) decodeCityState(value.extensions.city); } catch { return false; }
  if (value.extensions.achievements !== undefined && !validateAchievementState(value.extensions.achievements)) return false;
  if (!metadata(value.metadata)) return false;
  const p = value.progress;
  if (!object(p.words) || !object(p.factCursors) || !integer(p.totalCompleted)
    || !Array.isArray(p.recentRounds) || p.recentRounds.length > 30 || !object(p.bestByComparison)) return false;
  let total = 0;
  for (const [wordId, value] of Object.entries(p.words)) {
    if (!knownWordIds.has(wordId) || !object(value) || !['completed', 'cleanCompleted', 'practiceCompleted', 'practiceCleanCompleted'].every(key => integer(value[key]))) return false;
    const { completed, cleanCompleted, practiceCompleted, practiceCleanCompleted } = value as unknown as {
      completed: number; cleanCompleted: number; practiceCompleted: number; practiceCleanCompleted: number;
    };
    if (cleanCompleted > completed || practiceCompleted > completed || practiceCleanCompleted > practiceCompleted || practiceCleanCompleted > cleanCompleted) return false;
    total += completed;
  }
  if (!Number.isSafeInteger(total) || total !== p.totalCompleted || !Object.values(p.factCursors).every(integer)) return false;
  for (const r of p.recentRounds) {
    if (!object(r) || !finiteText(r.sessionId) || !context(r.context)
      || !['score', 'completedWords', 'canonicalLength', 'correctKeys', 'mistakes'].every(key => integer(r[key]))
      || !Array.isArray(r.wordIds) || !r.wordIds.every(id => typeof id === 'string' && knownWordIds.has(id))) return false;
  }
  for (const b of Object.values(p.bestByComparison)) {
    if (!object(b) || !integer(b.bestScore) || !integer(b.bestCanonicalLength)
      || !(b.growthBestScore === null || integer(b.growthBestScore))
      || !(b.growthBestCanonicalLength === null || integer(b.growthBestCanonicalLength))) return false;
  }
  return true;
}

export class OwnershipError extends Error { constructor() { super('別のタブが操作中です。「ここで続ける」で引き継いでください。'); } }
export class RevisionConflictError extends Error { constructor() { super('保存状態が更新されています。古い状態では上書きしません。'); } }
export class GenerationMismatchError extends Error { constructor() { super('削除前のプレイ内容は新しい記録へ適用できません。'); } }
export interface MutationOptions {
  /** Capture at session READY and reuse for every fact batch from that session. */
  generation?: number;
  /** Runtime has already confirmed input synchronously; start durable work in a task. */
  afterInput?: boolean;
}
export class BackupValidationError extends Error { constructor() { super('復元するデータの形式・版・整合性を確認できません。元データは変更していません。'); } }
export interface RestoreOptions {
  /** The caller confirms replacement after stopping the active game session. */
  confirmed: boolean;
  discardUnsaved?: boolean;
  /** Explicitly replace an invalid current entry, retaining all original data. */
  replaceProtectedData?: boolean;
}

/** Supported sources are actual v4 repository/runtime exports or a v4 document.
 * Only the current v4 format is supported; backward compatibility is intentionally excluded by the user. */
export function parseProfileBackup(source: string | unknown): ProfileDocument {
  let value: unknown = source;
  if (typeof source === 'string') {
    try { value = JSON.parse(source) as unknown; } catch { throw new BackupValidationError(); }
  }
  if (object(value) && object(value.repository)) value = value.repository;
  if (object(value) && 'current' in value) value = value.current;
  if (!validateProfileDocument(value)) throw new BackupValidationError();
  try { return structuredClone(value); } catch { throw new BackupValidationError(); }
}

export class RecoveryRequiredError extends Error { constructor() { super('保存データを確認できません。元データを保持して今回のみで続けます。'); } }

type Mutation = (document: ProfileDocument) => ProfileDocument;
const STORE = 'profile';
const KEY = 'current';
const BACKUPS_KEY = 'restoreBackups';
const MEMORY_NOTICE = 'この回の街と切手は、ページを閉じると残りません。複数ページ間の同期はできません。';

export class ProfileRepository {
  private document = createProfileDocument();
  private state: RepositoryStatus = { storage: 'memory', ownership: 'owner', saveState: 'unsaved', recoveryRequired: false, notice: MEMORY_NOTICE };
  private database: IDBDatabase | null = null;
  private readonly listeners = new Set<() => void>();
  private pending: Mutation[] = [];
  private tail: Promise<unknown> = Promise.resolve();
  private persistedRevision = 0;
  private persistedGeneration = 0;
  private rawRecovery: unknown = undefined;
  private restoreBackups: unknown = undefined;
  private channel: BroadcastChannel | null = null;
  private closed = false;

  private constructor(readonly tabId: string, readonly dbName: string) {}

  static async open(options: { dbName?: string; tabId?: string; indexedDB?: IDBFactory | null } = {}): Promise<ProfileRepository> {
    const repository = new ProfileRepository(options.tabId ?? crypto.randomUUID(), options.dbName ?? 'kotobabin');
    try {
      const factory = options.indexedDB === undefined ? globalThis.indexedDB : options.indexedDB;
      if (!factory) return repository;
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(repository.dbName, 4);
        let rejected = false;
        request.onblocked = () => { rejected = true; reject(new Error('保存データを使う別のページを閉じてください。')); };
        request.onerror = () => reject(request.error);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
        };
        request.onsuccess = () => { if (rejected) request.result.close(); else resolve(request.result); };
      });
      repository.database = database;
      database.onversionchange = () => {
        database.close(); repository.database = null;
        repository.state = { ...repository.state, storage: 'memory', saveState: 'unsaved', notice: MEMORY_NOTICE };
        repository.emit();
      };
      repository.restoreBackups = await repository.readStored(BACKUPS_KEY);
      await repository.loadOrClaim();
      if (typeof BroadcastChannel !== 'undefined') {
        repository.channel = new BroadcastChannel(`${repository.dbName}:ownership`);
        repository.channel.onmessage = () => { void repository.refresh().catch(() => {}); };
      }
    } catch (error) {
      repository.state = { ...repository.state, notice: `${MEMORY_NOTICE} ${error instanceof Error ? error.message : ''}` };
    }
    return repository;
  }

  private readStored(key: string): Promise<unknown> {
    const database = this.database!;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  /** Metadata-only session fence: reading it must not clone the profile history. */
  get generation(): number { return this.document.metadata.generation; }
  get snapshot(): ProfileDocument { return structuredClone(this.document); }
  get status(): RepositoryStatus { return { ...this.state }; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(): void { for (const listener of this.listeners) listener(); }
  private queue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }

  /** The callback and put run synchronously within one readwrite transaction. */
  private transaction(update: (current: unknown) => ProfileDocument | undefined, beforePut?: (store: IDBObjectStore, current: unknown) => void): Promise<ProfileDocument> {
    const database = this.database;
    if (!database || this.closed) return Promise.reject(new Error('保存データベースを利用できません。'));
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      let result: ProfileDocument;
      let failure: unknown;
      const request = transaction.objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        try {
          const next = update(request.result);
          result = next ?? request.result;
          if (next) { beforePut?.(transaction.objectStore(STORE), request.result); transaction.objectStore(STORE).put(next, KEY); }
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('保存を完了できませんでした。'));
      transaction.onerror = () => { /* onabort is the definitive failure event. */ };
    });
  }

  private async loadOrClaim(): Promise<void> {
    try {
      const loaded = await this.transaction(raw => {
        const document = raw === undefined ? createProfileDocument() : raw;
        if (!validateProfileDocument(document)) { this.rawRecovery = raw; throw new RecoveryRequiredError(); }
        if (document.metadata.ownerTabId === null) {
          const claimed = structuredClone(document);
          claimed.metadata.ownerTabId = this.tabId;
          claimed.metadata.writeEpoch++;
          claimed.metadata.revision++;
          return claimed;
        }
        return undefined;
      });
      this.document = loaded;
      this.persistedRevision = loaded.metadata.revision;
      this.persistedGeneration = loaded.metadata.generation;
      this.state = { storage: 'indexeddb', ownership: loaded.metadata.ownerTabId === this.tabId ? 'owner' : 'readonly', saveState: 'saved', recoveryRequired: false,
        notice: loaded.metadata.ownerTabId === this.tabId ? '' : '別のタブが操作中です。「ここで続ける」で引き継げます。' };
    } catch (error) {
      if (error instanceof RecoveryRequiredError) this.state = { ...this.state, recoveryRequired: true, notice: error.message };
      else throw error;
    }
  }

  private write(mutation: Mutation, afterInput = false): Promise<void> {
    return this.queue(async () => {
      // Browsers run Promise checkpoints between native event listeners. Keep
      // durable snapshot/replay work in its own task, after confirmed input.
      // The ordered tail and every ownership/revision/generation fence still apply.
      if (afterInput) await new Promise<void>(resolve => setTimeout(resolve, 0));
      if (this.closed) throw new Error('保存処理は終了しています。');
      if (this.state.ownership !== 'owner') throw new OwnershipError();
      const next = mutation(structuredClone(this.document));
      // A failing reducer cannot partially change the current in-memory document.
      this.pending.push(mutation);
      this.document = next;
      this.state = { ...this.state, saveState: 'pending' };
      this.emit();
      if (!this.database || this.state.recoveryRequired) {
        this.state = { ...this.state, saveState: 'unsaved', notice: this.state.recoveryRequired ? this.state.notice : MEMORY_NOTICE };
        this.emit();
        return;
      }
      await this.flush();
    });
  }

  private async flush(): Promise<void> {
    const pending = [...this.pending];
    if (!pending.length) return;
    const expected = this.document.metadata;
    try {
      const saved = await this.transaction(raw => {
        if (!validateProfileDocument(raw)) { this.rawRecovery = raw; throw new RecoveryRequiredError(); }
        if (raw.metadata.ownerTabId !== this.tabId || raw.metadata.writeEpoch !== expected.writeEpoch) throw new OwnershipError();
        if (raw.metadata.revision !== this.persistedRevision || raw.metadata.generation !== this.persistedGeneration) throw new RevisionConflictError();
        let next = structuredClone(raw);
        for (const mutation of pending) next = mutation(next);
        next.metadata.revision++;
        return next;
      });
      this.document = saved;
      this.persistedRevision = saved.metadata.revision;
      this.persistedGeneration = saved.metadata.generation;
      this.pending.splice(0, pending.length);
      this.state = { ...this.state, storage: 'indexeddb', saveState: 'saved', notice: '' };
      this.channel?.postMessage('updated');
    } catch (error) {
      this.state = { ...this.state, saveState: 'unsaved', notice: `${error instanceof Error ? error.message : ''} ${MEMORY_NOTICE}` };
      if (error instanceof OwnershipError) this.state.ownership = 'readonly';
      if (error instanceof RecoveryRequiredError) this.state.recoveryRequired = true;
      this.emit();
      if (error instanceof OwnershipError || error instanceof RevisionConflictError || error instanceof RecoveryRequiredError) throw error;
      return;
    }
    this.emit();
  }

  /** A pure synchronous reducer may run twice: once for this page and once on the
   * latest persisted document inside the readwrite transaction. Never capture a
   * stale document or perform I/O here; city/event reducers must be idempotent.
   * Ownership, revision and deletion-generation metadata remain repository-owned.
   */
  mutateDocument(reducer: (current: ProfileDocument) => ProfileDocument, options: MutationOptions = {}): Promise<void> {
    const generation = options.generation ?? this.document.metadata.generation;
    return this.write(current => {
      if (current.metadata.generation !== generation) throw new GenerationMismatchError();
      const metadata = { ...current.metadata };
      return { ...reducer(current), metadata };
    }, options.afterInput);
  }

  commitFacts(facts: readonly SessionFact[], recordContext: RecordContext, options: MutationOptions = {}): Promise<void> {
    const batch = structuredClone(facts);
    const context = structuredClone(recordContext);
    return this.mutateDocument(document => ({ ...document, progress: batch.reduce((progress, fact) => applySessionFact(progress, fact, context), document.progress) }), options);
  }
  updateSettings(patch: Partial<ProfileSettings>): Promise<void> {
    const change = structuredClone(patch);
    if (!settings({ ...this.document.settings, ...change })) return Promise.reject(new Error('設定値を確認してください。'));
    return this.mutateDocument(document => ({ ...document, settings: { ...document.settings, ...change } }));
  }
  markTutorialSeen(): Promise<void> { return this.mutateDocument(document => ({ ...document, tutorialSeen: true })); }

  /** Future state modules can commit related facts and extension values atomically. */
  commitExtension(key: string, value: unknown, facts: readonly SessionFact[] = [], recordContext?: RecordContext): Promise<void> {
    if (forbiddenKeys.has(key) || !key || (facts.length > 0 && !recordContext)) return Promise.reject(new Error('保存項目を確認してください。'));
    const extension = structuredClone(value);
    const batch = structuredClone(facts);
    const context = recordContext && structuredClone(recordContext);
    return this.mutateDocument(document => ({ ...document, extensions: { ...document.extensions, [key]: extension },
      progress: context ? batch.reduce((progress, fact) => applySessionFact(progress, fact, context), document.progress) : document.progress }));
  }

  /** Caller confirms each scope before invoking; never use this for city restart. */
  resetSettings(): Promise<void> {
    return this.mutateDocument(document => ({ ...document,
      settings: { ...defaultProfileSettings, deliveryKeys: [...defaultProfileSettings.deliveryKeys], audioVolume: selectedAudioVolume() },
      extensions: { ...document.extensions, ...(document.extensions.achievements === undefined ? {} : {
        achievements: { ...document.extensions.achievements as AchievementState, notificationMode: 'live' },
      }) },
    }));
  }
  resetRecords(): Promise<void> {
    const generation = this.document.metadata.generation;
    return this.write(document => {
      if (document.metadata.generation !== generation) throw new GenerationMismatchError();
      const extensions = { ...document.extensions };
      if (extensions.achievements !== undefined) extensions.achievements = resetAchievementRecords(extensions.achievements as AchievementState);
      return { ...document, extensions, progress: { ...document.progress, recentRounds: [], bestByComparison: {} },
        metadata: { ...document.metadata, generation: generation + 1 } };
    });
  }
  resetCollectionAndEconomy(): Promise<void> {
    const generation = this.document.metadata.generation;
    return this.write(document => {
      if (document.metadata.generation !== generation) throw new GenerationMismatchError();
      const bestByComparison = Object.fromEntries(Object.entries(document.progress.bestByComparison).map(([key, best]) => [
        key, { ...best, growthBestScore: null, growthBestCanonicalLength: null },
      ]));
      const extensions = { ...document.extensions };
      for (const key of ['city', 'cityDestination', 'achievements']) delete extensions[key];
      return { ...document, extensions, progress: { ...createProfileProgress(),
        recentRounds: document.progress.recentRounds, bestByComparison,
        // Retain processed positions so displayed old results cannot replay facts.
        factCursors: document.progress.factCursors,
      }, metadata: { ...document.metadata, generation: generation + 1 } };
    });
  }

  refresh(): Promise<void> {
    return this.queue(async () => {
      if (!this.database || this.state.recoveryRequired) return;
      const raw = await this.transaction(() => undefined);
      if (!validateProfileDocument(raw)) { this.rawRecovery = raw; this.state = { ...this.state, recoveryRequired: true, saveState: 'unsaved', notice: new RecoveryRequiredError().message }; this.emit(); return; }
      if (raw.metadata.ownerTabId !== this.tabId || raw.metadata.writeEpoch !== this.document.metadata.writeEpoch) {
        this.state = { ...this.state, ownership: 'readonly', notice: '別のタブが操作中です。「ここで続ける」で引き継げます。' };
        // Keep unsaved facts for export, never replay them into the new owner's state.
        if (!this.pending.length) { this.document = raw; this.persistedRevision = raw.metadata.revision; this.persistedGeneration = raw.metadata.generation; }
      } else if (!this.pending.length) { this.document = raw; this.persistedRevision = raw.metadata.revision; this.persistedGeneration = raw.metadata.generation; }
      this.emit();
    });
  }
  takeover(options: { discardUnsaved?: boolean } = {}): Promise<void> {
    return this.queue(async () => {
      if (!this.database || this.state.recoveryRequired) throw new RecoveryRequiredError();
      if (this.pending.length && !options.discardUnsaved) throw new RevisionConflictError();
      const abandoned = this.pending.length ? structuredClone(this.document) : undefined;
      const claimed = await this.transaction(raw => {
        if (!validateProfileDocument(raw)) throw new RecoveryRequiredError();
        const next = structuredClone(raw);
        next.metadata.ownerTabId = this.tabId; next.metadata.writeEpoch++; next.metadata.revision++;
        return next;
      });
      if (abandoned) this.rawRecovery = { abandonedUnsavedData: abandoned };
      this.pending = [];
      this.document = claimed; this.persistedRevision = claimed.metadata.revision; this.persistedGeneration = claimed.metadata.generation;
      this.state = { storage: 'indexeddb', ownership: 'owner', saveState: 'saved', recoveryRequired: false, notice: '' };
      this.channel?.postMessage('ownership'); this.emit();
    });
  }
  /** Replacement is atomic with backup creation; imported ownership metadata is never trusted. */
  restoreData(source: string | unknown, options: RestoreOptions): Promise<void> {
    let imported: ProfileDocument;
    try {
      if (!options?.confirmed) throw new Error('復元で置き換わる内容を確認してください。');
      imported = parseProfileBackup(source);
    } catch (error) { return Promise.reject(error); }
    return this.queue(async () => {
      if (this.closed) throw new Error('保存処理は終了しています。');
      if (this.state.ownership !== 'owner') throw new OwnershipError();
      if (this.pending.length && !options.discardUnsaved) throw new RevisionConflictError();
      if (this.state.recoveryRequired && !options.replaceProtectedData) throw new RecoveryRequiredError();
      const originalMemory = structuredClone(this.document);
      const backup = { id: crypto.randomUUID(), createdAtMs: Date.now(), current: originalMemory, originalInvalidData: this.rawRecovery };
      const replace = (currentMetadata: ProfileDocument['metadata']): ProfileDocument => {
        if ([currentMetadata.revision, currentMetadata.generation, currentMetadata.writeEpoch].some(value => value >= Number.MAX_SAFE_INTEGER)) throw new RevisionConflictError();
        return { ...structuredClone(imported), metadata: { ...currentMetadata, schemaVersion: 4, ownerTabId: this.tabId,
          writeEpoch: currentMetadata.writeEpoch + (currentMetadata.ownerTabId === this.tabId ? 0 : 1),
          revision: currentMetadata.revision + 1, generation: currentMetadata.generation + 1,
        } };
      };
      if (!this.database) {
        const previous = Array.isArray(this.restoreBackups) ? this.restoreBackups : this.restoreBackups === undefined ? [] : [this.restoreBackups];
        this.restoreBackups = [...previous, backup];
        this.document = replace(this.document.metadata); this.pending = [];
        this.state = { storage: 'memory', ownership: 'owner', saveState: 'unsaved', recoveryRequired: false, notice: MEMORY_NOTICE };
        this.emit(); return;
      }
      let savedBackups: unknown;
      const saved = await this.transaction(raw => {
        const valid = validateProfileDocument(raw);
        if (!valid && !options.replaceProtectedData) throw new RecoveryRequiredError();
        const currentMetadata = valid ? raw.metadata : object(raw) && metadata(raw.metadata) ? raw.metadata : this.document.metadata;
        if (valid && (currentMetadata.ownerTabId !== this.tabId || currentMetadata.writeEpoch !== this.document.metadata.writeEpoch)) throw new OwnershipError();
        if (valid && (currentMetadata.revision !== this.persistedRevision || currentMetadata.generation !== this.persistedGeneration)) throw new RevisionConflictError();
        return replace(currentMetadata);
      }, (store, raw) => {
        const request = store.get(BACKUPS_KEY);
        request.onsuccess = () => {
          const previous = Array.isArray(request.result) ? request.result : request.result === undefined ? [] : [request.result];
          savedBackups = [...previous, { ...backup, persistedCurrent: raw }];
          store.put(savedBackups, BACKUPS_KEY);
        };
      });
      this.restoreBackups = savedBackups;
      this.document = saved; this.pending = []; this.persistedRevision = saved.metadata.revision; this.persistedGeneration = saved.metadata.generation;
      this.state = { storage: 'indexeddb', ownership: 'owner', saveState: 'saved', recoveryRequired: false, notice: '' };
      this.channel?.postMessage('restored'); this.emit();
    });
  }

  retry(): Promise<void> { return this.queue(async () => { if (this.state.ownership !== 'owner') throw new OwnershipError(); await this.flush(); }); }
  exportData(): string { return JSON.stringify({ current: this.document, status: this.state, originalInvalidData: this.rawRecovery, restoreBackups: this.restoreBackups }, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2); }
  close(): void {
    this.closed = true; this.database?.close(); this.channel?.close(); this.listeners.clear();
  }
}
