import { applySessionFact, ProfileRepository, type ProfileProgress, type RecordContext } from '../profile';
import type { SessionFact } from '../typing';

export interface AppSettings {
  tutorialSeen: boolean;
  fontScale: 100 | 125 | 150;
  guide: boolean;
  deliveryKeys: ('Space' | 'Enter')[];
  reducedMotion: boolean;
}
export interface RuntimeStatus {
  storage: 'saved' | 'saving' | 'memory' | 'error';
  writable: boolean;
  message: string;
}
/** UI contract. State reductions and storage remain outside the view. */
export interface AppRuntime {
  readonly settings: AppSettings;
  readonly profile: ProfileProgress;
  readonly status: RuntimeStatus;
  updateSettings(patch: Partial<AppSettings>): void;
  applyFacts(facts: SessionFact[], context: RecordContext): void;
  takeOver(options?: { discardUnsaved?: boolean }): Promise<void>;
  retrySave(): Promise<void>;
  exportData(): string;
  subscribe(listener: () => void): () => void;
  close(): void;
}


/** The view receives memory updates immediately; only the repository confirms durability. */
export async function createAppRuntime(repository?: ProfileRepository): Promise<AppRuntime> {
  const repo = repository ?? await ProfileRepository.open();
  let progress = repo.snapshot.progress;
  let settings: AppSettings = { ...repo.snapshot.settings, tutorialSeen: repo.snapshot.tutorialSeen };
  let errorMessage = '';
  let pendingWrites = 0;
  let closed = false;
  const listeners = new Set<() => void>();
  const emit = () => { if (!closed) for (const listener of listeners) listener(); };
  const syncSnapshot = () => {
    const snapshot = repo.snapshot;
    progress = snapshot.progress;
    settings = { ...snapshot.settings, tutorialSeen: snapshot.tutorialSeen };
  };
  const unsubscribe = repo.subscribe(() => {
    // A completion from an older queued write must not replace newer local projections.
    if (!pendingWrites) syncSnapshot();
    emit();
  });
  const persist = (operation: () => Promise<void>) => {
    pendingWrites++;
    errorMessage = '';
    void operation().catch((error: unknown) => {
      errorMessage = error instanceof Error ? error.message : '保存を完了できませんでした。';
    }).finally(() => {
      pendingWrites--;
      // Rejected ownership/revision writes keep their ephemeral progress for export.
      if (!pendingWrites && repo.status.saveState === 'saved') syncSnapshot();
      emit();
    });
    emit();
  };
  // BroadcastChannel provides prompt handoff; refresh also handles unsupported channels.
  const refresh = () => { if (!closed && !pendingWrites) void repo.refresh().catch((error: unknown) => {
    errorMessage = error instanceof Error ? error.message : '保存状態を確認できませんでした。';
    emit();
  }); };
  const timer = setInterval(refresh, 1500);
  const runtime: AppRuntime = {
    get profile() { return progress; },
    get settings() { return { ...settings, deliveryKeys: [...settings.deliveryKeys] }; },
    get status() {
      const state = repo.status;
      const storage: RuntimeStatus['storage'] = state.storage === 'memory' ? 'memory' : state.saveState === 'pending' || pendingWrites > 0 ? 'saving' : state.saveState === 'unsaved' || errorMessage ? 'error' : 'saved';
      return { storage, writable: state.ownership === 'owner', message: errorMessage || state.notice || (storage === 'saving' ? '保存しています。' : '保存済みです。') };
    },
    updateSettings(patch) {
      if (!runtime.status.writable) return;
      settings = { ...settings, ...patch, deliveryKeys: [...(patch.deliveryKeys ?? settings.deliveryKeys)] };
      const { tutorialSeen, ...change } = patch;
      persist(async () => {
        if (Object.keys(change).length) await repo.updateSettings(change);
        if (tutorialSeen) await repo.markTutorialSeen();
      });
    },
    applyFacts(facts, context) {
      if (!runtime.status.writable || !facts.length) return;
      // Every fact, including non-scoring lifecycle facts, advances the ordered cursor.
      progress = facts.reduce((current, fact) => applySessionFact(current, fact, context), progress);
      persist(() => repo.commitFacts(facts, context));
    },
    async takeOver(options) {
      try {
        await repo.takeover(options);
        errorMessage = '';
        syncSnapshot();
        emit();
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : '操作するタブを切り替えられませんでした。';
        emit();
        throw error;
      }
    },
    async retrySave() {
      try {
        await repo.retry();
        errorMessage = '';
        if (!pendingWrites && repo.status.saveState === 'saved') syncSnapshot();
      } catch (error) { errorMessage = error instanceof Error ? error.message : '保存を完了できませんでした。'; }
      emit();
    },
    exportData() { return JSON.stringify({ repository: JSON.parse(repo.exportData()), currentView: { settings, progress }, pendingWrites }, null, 2); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { closed = true; clearInterval(timer); unsubscribe(); repo.close(); listeners.clear(); },
  };
  return runtime;
}
