import type { ProfileProgress, RecordContext } from '../profile';
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
  takeOver(): Promise<void>;
  subscribe(listener: () => void): () => void;
  close(): void;
}
