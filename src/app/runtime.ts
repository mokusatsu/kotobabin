import { applySessionFact, parseProfileBackup, ProfileRepository, type ProfileDocument, type ProfileProgress, type RecordContext } from '../profile';
import { CityEconomy, initialCityState, encodeCityState, decodeCityState, executeCityCommand, type CityState, type CityCommand, type DistrictId, type AdvanceResult, type EconomyMode } from '../economy';
import type { SessionFact, SessionMode } from '../typing';
import content from '../../spec/initial/data/words.json';
import { createAchievementState, beginAchievementSession, applyAchievementFacts, applyAchievementCity, applyAchievementAction, type AchievementState, type AchievementAction } from '../profile/achievements';

export interface AppSettings {
  tutorialSeen: boolean; fontScale: 100 | 125 | 150; guide: boolean;
  deliveryKeys: ('Space' | 'Enter')[]; reducedMotion: boolean;
}
export interface RuntimeStatus { storage: 'saved' | 'saving' | 'memory' | 'error'; writable: boolean; message: string }
export interface AppRuntime {
  readonly settings: AppSettings;
  readonly profile: ProfileProgress;
  readonly achievements: AchievementState;
  readonly status: RuntimeStatus;
  readonly city: CityState;
  readonly destination: DistrictId;
  readonly cityBusy: boolean;
  readonly returnSummary: AdvanceResult | null;
  beginSession(sessionId: string, mode: SessionMode, destination?: DistrictId, context?: RecordContext): boolean;
  achievementAction(action: AchievementAction): void;
  endSession(sessionId: string): void;
  selectDestination(id: DistrictId): void;
  cityCommand(command: CityCommand): Promise<void>;
  advanceWorld(): void;
  updateSettings(patch: Partial<AppSettings>): void;
  applyFacts(facts: SessionFact[], context: RecordContext): void;
  takeOver(options?: { discardUnsaved?: boolean }): Promise<void>;
  retrySave(): Promise<void>;
  resetProfile(scope: 'settings' | 'records' | 'collection'): Promise<void>;
  restoreProfile(payload: string): Promise<void>;
  exportData(): string;
  subscribe(listener: () => void): () => void;
  close(): void;
}
interface RuntimeClock { now(): number; wallNow(): number }
const modes: Record<SessionMode, EconomyMode> = { MAIN: 'normal', PRACTICE: 'practice', TUTORIAL: 'intro' };
const wordValues = new Map(content.words.map(word => [word.id, word.canonicalLength * 10]));
function freezeSnapshot<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}

/** Memory reflects confirmed typing immediately; the repository alone confirms durable changes. */
export async function createAppRuntime(repository?: ProfileRepository, clock: RuntimeClock = { now: () => performance.now(), wallNow: () => Date.now() }): Promise<AppRuntime> {
  let repo = repository ?? await ProfileRepository.open();
  let progress = repo.snapshot.progress;
  let settings: AppSettings = { ...repo.snapshot.settings, tutorialSeen: repo.snapshot.tutorialSeen };
  let errorMessage = '';
  let cityRecovery = '';
  let cityAvailable = true;
  let originalCityData: string | null = null;
  let pendingWrites = 0;
  let rejectedProjection = false;
  let abandonedProjection: Record<string, unknown> | null = null;
  let closed = false;
  let busy = false;
  let returnSummary: AdvanceResult | null = null;
  const listeners = new Set<() => void>();
  const sessions = new Map<string, { cityId: string; generation: number }>();
  const explicitlyAbandoned = new Set<string>();
  const wallNow = () => Math.max(0, Math.floor(clock.wallNow()));
  const readCity = (document: ProfileDocument, wall: number) => document.extensions.city === undefined ? initialCityState(wall) : decodeCityState(document.extensions.city);
  const readDestination = (document: ProfileDocument, state: CityState): DistrictId => {
    const value = document.extensions.cityDestination;
    return typeof value === 'string' && Object.hasOwn(state.districts, value) && state.districts[value].open ? value : 'residential';
  };
  let city: CityState;
  try { city = readCity(repo.snapshot, wallNow()); }
  catch {
    const original = repo; const snapshot = original.snapshot;
    originalCityData = original.exportData();
    city = initialCityState(wallNow());
    repo = await ProfileRepository.open({ indexedDB: null });
    const freshCity = encodeCityState(city);
    await repo.mutateDocument(document => ({ ...document, settings: snapshot.settings, tutorialSeen: snapshot.tutorialSeen,
      progress: snapshot.progress, extensions: { ...snapshot.extensions, city: freshCity, cityDestination: 'residential' } }));
    original.close();
    cityRecovery = '街の保存データを確認できません。元データを控えに残し、今回は保存せずに続けます。';
  }
  let destination = readDestination(repo.snapshot, city);
  const readAchievements = (document: ProfileDocument): AchievementState => document.extensions.achievements === undefined
    ? createAchievementState() : structuredClone(document.extensions.achievements as AchievementState);
  let achievements = readAchievements(repo.snapshot);
  let publicAchievements: { source: AchievementState; value: AchievementState } | undefined;
  const observeCity = (value: AchievementState, state: CityState, atMs: number) => applyAchievementCity(value, {
    eventId: `world:${state.cityId}:${state.clockMs}`, atMs, city: state,
  });
  const interruptAchievements = (value: AchievementState, id: string | undefined): AchievementState => {
    if (!id || value.sessions[id]?.phase !== 'active') return value;
    const next = structuredClone(value);
    next.sessions[id].phase = 'aborted';
    return next;
  };
  let baseClock = city.clockMs;
  let baseMono = clock.now();
  const capture = () => ({ atMs: baseClock + Math.max(0, Math.floor(clock.now() - baseMono)), wallMs: wallNow() });
  const advance = (engine: CityEconomy, time: ReturnType<typeof capture>) => {
    engine.advanceTo(time.atMs);
    engine.state.savedWallMs = Math.max(engine.state.savedWallMs, time.wallMs);
  };
  const putCity = (document: ProfileDocument, state: CityState, acquiredAtMs: number, selected = readDestination(document, state)): ProfileDocument => ({
    ...document, extensions: { ...document.extensions, city: encodeCityState(state), cityDestination: selected,
      achievements: observeCity(readAchievements(document), state, acquiredAtMs) },
  });
  const emit = () => { if (!closed) for (const listener of listeners) listener(); };
  const syncCity = () => {
    if (!cityAvailable) return;
    const snapshot = repo.snapshot;
    try { city = readCity(snapshot, wallNow()); destination = readDestination(snapshot, city); }
    catch { cityAvailable = false; cityRecovery = '街の保存データを確認できません。控えを保存してからページを開き直してください。'; }
  };
  const syncSnapshot = () => {
    const snapshot = repo.snapshot;
    progress = snapshot.progress;
    achievements = readAchievements(snapshot);
    settings = { ...snapshot.settings, tutorialSeen: snapshot.tutorialSeen };
    syncCity();
  };
  const unsubscribe = repo.subscribe(() => {
    if (!pendingWrites && !rejectedProjection) syncSnapshot();
    emit();
  });
  const persist = (operation: () => Promise<void>, protectProjection = true): Promise<void> => {
    pendingWrites++;
    errorMessage = '';
    const result = operation().catch((error: unknown) => {
      if (protectProjection) rejectedProjection = true;
      errorMessage = error instanceof Error ? error.message : '保存を完了できませんでした。';
      throw error;
    }).finally(() => {
      pendingWrites--;
      if (!pendingWrites && !rejectedProjection && repo.status.saveState === 'saved') syncSnapshot();
      emit();
    });
    void result.catch(() => {});
    emit();
    return result;
  };
  const initializeCity = () => {
    if (repo.status.ownership !== 'owner' || !cityAvailable) return;
    const wall = wallNow();
    const engine = new CityEconomy(structuredClone(city));
    // An interrupted round is never resumed or awarded a deadline bonus on reload.
    achievements = interruptAchievements(achievements, engine.state.activeSession?.sessionId);
    if (engine.state.activeSession) engine.endSession();
    const returned = engine.restoreAt(wall);
    if (returned.creditedMs >= 1000 || returned.arrivedMicro > 0n || returned.shopCoinsMicro > 0n || returned.completed.length) returnSummary = returned;
    city = engine.snapshot();
    achievements = observeCity(achievements, city, wall);
    baseClock = city.clockMs; baseMono = clock.now();
    void persist(() => repo.mutateDocument(document => {
      const current = new CityEconomy(readCity(document, wall));
      const interrupted = interruptAchievements(readAchievements(document), current.state.activeSession?.sessionId);
      if (current.state.activeSession) current.endSession();
      current.restoreAt(wall);
      return putCity({ ...document, extensions: { ...document.extensions, achievements: interrupted } }, current.state, wall);
    }));
  };
  const timer = setInterval(() => {
    if (closed) return;
    runtime.advanceWorld();
    if (!pendingWrites) void repo.refresh().catch((error: unknown) => {
      errorMessage = error instanceof Error ? error.message : '保存状態を確認できませんでした。'; emit();
    });
  }, 1500);
  const runtime: AppRuntime = {
    get profile() { return progress; },
    get achievements() {
      // A read may occur several times for every key and timer tick. Clone and
      // freeze only when a confirmed projection changes, keeping old views safe.
      if (publicAchievements?.source !== achievements) publicAchievements = {
        source: achievements, value: freezeSnapshot(structuredClone(achievements)),
      };
      return publicAchievements.value;
    },
    get settings() { return { ...settings, deliveryKeys: [...settings.deliveryKeys] }; },
    get city() { return structuredClone(city); },
    get destination() { return destination; },
    get cityBusy() { return busy; },
    get returnSummary() { return returnSummary && structuredClone(returnSummary); },
    get status() {
      const state = repo.status;
      const storage: RuntimeStatus['storage'] = state.storage === 'memory' || cityRecovery ? 'memory' : state.saveState === 'pending' || pendingWrites > 0 ? 'saving' : state.saveState === 'unsaved' || errorMessage || rejectedProjection ? 'error' : 'saved';
      return { storage, writable: state.ownership === 'owner', message: cityRecovery || errorMessage || state.notice || (storage === 'saving' ? '保存しています。' : '保存済みです。') };
    },
    beginSession(sessionId, mode, selected = destination, context) {
      if (!runtime.status.writable || busy) return false;
      const time = capture(); const generation = repo.snapshot.metadata.generation;
      const candidate = new CityEconomy(structuredClone(city));
      advance(candidate, time);
      if (candidate.state.activeSession?.sessionId === sessionId) return true;
      candidate.beginSession(sessionId, selected, modes[mode]);
      city = candidate.snapshot();
      achievements = observeCity(achievements, city, time.wallMs);
      if (context) achievements = beginAchievementSession(achievements, { sessionId, mode, context, atMs: time.wallMs });
      sessions.set(sessionId, { cityId: city.cityId, generation });
      void persist(() => repo.mutateDocument(document => {
        const current = new CityEconomy(readCity(document, time.wallMs));
        advance(current, time); current.beginSession(sessionId, selected, modes[mode]);
        const started = context ? beginAchievementSession(readAchievements(document), { sessionId, mode, context, atMs: time.wallMs }) : readAchievements(document);
        return putCity({ ...document, extensions: { ...document.extensions, achievements: started } }, current.state, time.wallMs, selected);
      }, { generation }));
      return true;
    },
    endSession(sessionId) {
      if (!runtime.status.writable || city.activeSession?.sessionId !== sessionId) return;
      const time = capture(); const generation = sessions.get(sessionId)?.generation ?? repo.snapshot.metadata.generation;
      const candidate = new CityEconomy(structuredClone(city)); advance(candidate, time); candidate.endSession(); city = candidate.snapshot();
      achievements = interruptAchievements(achievements, sessionId);
      achievements = observeCity(achievements, city, time.wallMs);
      void persist(() => repo.mutateDocument(document => {
        const current = new CityEconomy(readCity(document, time.wallMs)); advance(current, time);
        if (current.state.activeSession?.sessionId === sessionId) current.endSession();
        return putCity({ ...document, extensions: { ...document.extensions,
          achievements: interruptAchievements(readAchievements(document), sessionId) } }, current.state, time.wallMs);
      }, { generation }));
    },
    selectDestination(id) {
      if (!runtime.status.writable || busy || city.activeSession) return;
      if (!Object.hasOwn(city.districts, id) || !city.districts[id].open) throw new Error('開通済みの届け先を選んでください。');
      destination = id;
      const wall = wallNow();
      void persist(() => repo.mutateDocument(document => {
        const current = readCity(document, wall);
        if (current.activeSession || !current.districts[id]?.open) throw new Error('配達を終えてから、開通済みの届け先を選んでください。');
        return putCity(document, current, wall, id);
      }));
    },
    async cityCommand(command) {
      if (!runtime.status.writable || busy) throw new Error('処理が終わってから、もう一度お試しください。');
      const time = capture(); const generation = repo.snapshot.metadata.generation;
      const key = JSON.stringify([command.cityId, command.economyEventId]);
      const previous = city.commandLedger[key];
      // A retransmission keeps the original command's logical time, including after reload.
      const priorTime = previous ? (JSON.parse(previous) as { atMs?: number }).atMs : undefined;
      const fixed = { ...command, atMs: command.atMs ?? priorTime ?? time.atMs } as CityCommand;
      const preview = new CityEconomy(structuredClone(city)); executeCityCommand(preview, fixed);
      busy = true; emit();
      try {
        await persist(() => repo.mutateDocument(document => {
          const current = new CityEconomy(readCity(document, time.wallMs));
          let paidEquipmentPurchase = false;
          if (fixed.type === 'purchase' && fixed.cityId === current.state.cityId && !current.state.commandLedger[key]) {
            const quoteAtTime = new CityEconomy(current.snapshot());
            if (fixed.atMs !== undefined) quoteAtTime.advanceTo(fixed.atMs);
            paidEquipmentPurchase = quoteAtTime.quotePurchase(fixed.kind, fixed.quantity, fixed.districtId).totalCostMicro > 0n;
          }
          const receipt = executeCityCommand(current, fixed);
          if (receipt.applied) current.state.savedWallMs = Math.max(current.state.savedWallMs, time.wallMs);
          const updated = applyAchievementCity(readAchievements(document), { eventId: key, atMs: time.wallMs, city: current.state,
            paidEquipmentPurchase: receipt.applied && paidEquipmentPurchase,
            researchPurchased: receipt.applied && fixed.type === 'buyResearch' });
          return putCity({ ...document, extensions: { ...document.extensions, achievements: updated } }, current.state, time.wallMs);
        }, { generation }), false);
        syncSnapshot();
      } catch (error) {
        if (error instanceof Error && error.message.includes('quote changed')) throw new Error('購入数や価格が変わりました。表示を確認して、もう一度購入してください。');
        throw error;
      } finally { busy = false; emit(); }
    },
    advanceWorld() {
      if (closed || !runtime.status.writable || busy || !cityAvailable) return;
      const time = capture();
      if (time.atMs <= city.clockMs) return;
      const candidate = new CityEconomy(structuredClone(city)); advance(candidate, time); city = candidate.snapshot();
      achievements = observeCity(achievements, city, time.wallMs);
      void persist(() => repo.mutateDocument(document => {
        const current = new CityEconomy(readCity(document, time.wallMs)); advance(current, time); return putCity(document, current.state, time.wallMs);
      }));
    },
    updateSettings(patch) {
      if (!runtime.status.writable) return;
      settings = { ...settings, ...patch, deliveryKeys: [...(patch.deliveryKeys ?? settings.deliveryKeys)] };
      const { tutorialSeen, ...change } = patch;
      void persist(async () => {
        if (Object.keys(change).length) await repo.updateSettings(change);
        if (tutorialSeen) await repo.markTutorialSeen();
      });
    },
    achievementAction(action) {
      if (!runtime.status.writable || busy) return;
      const fixed = structuredClone(action);
      const generation = repo.snapshot.metadata.generation;
      achievements = applyAchievementAction(achievements, fixed);
      void persist(() => repo.mutateDocument(document => ({ ...document, extensions: { ...document.extensions,
        achievements: applyAchievementAction(readAchievements(document), fixed) } }), { generation }));
    },
    applyFacts(facts, context) {
      if (!runtime.status.writable || !facts.length) return;
      if (facts.every(fact => fact.factSequence <= (progress.factCursors[fact.sessionId] ?? 0))) return;
      const first = facts[0];
      if (!sessions.has(first.sessionId) && !runtime.beginSession(first.sessionId, first.mode)) return;
      const identity = sessions.get(first.sessionId)!; const time = capture();
      const abandonClosing = explicitlyAbandoned.has(first.sessionId) && facts.every(fact =>
        (fact.type === 'RoundFinished' && !fact.completed) || fact.type === 'PracticeSessionEnded');
      if (!abandonClosing && facts.some(fact => fact.type === 'WordCompleted' || fact.type === 'DeliveryCommitted')
        && (city.activeSession?.sessionId !== first.sessionId || identity.cityId !== city.cityId)) {
        errorMessage = '前の便は終了しています。新しい配達を始めてください。'; emit(); return;
      }
      const reduceProgress = (current: ProfileProgress) => abandonClosing
        ? { ...current, factCursors: { ...current.factCursors, [first.sessionId]: Math.max(current.factCursors[first.sessionId] ?? 0, ...facts.map(fact => fact.factSequence)) } }
        : facts.reduce((value, fact) => applySessionFact(value, fact, context), current);
      // Session facts use a monotonic input clock. History uses the wall time
      // captured here; neither date nor time participates in eligibility.
      const historyFacts = facts.map(fact => ({ ...fact, confirmedAtMs: time.wallMs }));
      const reduceAchievements = (current: AchievementState): AchievementState => {
        if (abandonClosing) return { ...interruptAchievements(current, first.sessionId), measuredProgress: { ...current.measuredProgress, factCursors: {
          ...current.measuredProgress.factCursors, [first.sessionId]: Math.max(current.measuredProgress.factCursors[first.sessionId] ?? 0, ...facts.map(fact => fact.factSequence)),
        } } };
        const started = beginAchievementSession(current, { sessionId: first.sessionId, mode: first.mode, context, atMs: time.wallMs });
        return applyAchievementFacts(started, historyFacts, context);
      };
      const reduceCity = (state: CityState) => {
        const engine = new CityEconomy(structuredClone(state)); advance(engine, time);
        for (const fact of facts) {
          const base = { cityId: identity.cityId, sessionId: fact.sessionId, factSequence: fact.factSequence };
          if (fact.type === 'WordCompleted') engine.completeWord({ ...base, baseLength: fact.canonicalLength, mistakes: fact.mistakes });
          if (fact.type === 'DeliveryCommitted') {
            const scoreSum = fact.cargoWordIds.reduce((sum, id) => sum + wordValues.get(id)!, 0);
            engine.shipCargo({ ...base, scoreSum, cargoCount: fact.cargoCount, reason: fact.reason });
          }
          if ((fact.type === 'RoundFinished' || fact.type === 'PracticeSessionEnded') && engine.state.activeSession?.sessionId === fact.sessionId) engine.endSession();
        }
        return engine.state;
      };
      const reduce = (document: ProfileDocument): ProfileDocument => putCity(
        { ...document, progress: reduceProgress(document.progress), extensions: { ...document.extensions,
          achievements: reduceAchievements(readAchievements(document)) } }, reduceCity(readCity(document, time.wallMs)), time.wallMs);
      if (identity.generation !== repo.snapshot.metadata.generation) { errorMessage = '記録が削除されたため、古い便の成果は保存しません。新しい配達を始めてください。'; emit(); return; }
      const nextProgress = reduceProgress(progress);
      const nextCity = reduceCity(city);
      achievements = observeCity(reduceAchievements(achievements), nextCity, time.wallMs);
      progress = nextProgress; city = nextCity;
      void persist(() => repo.mutateDocument(reduce, { generation: identity.generation }));
    },
    async takeOver(options) {
      try {
        if (rejectedProjection && !options?.discardUnsaved) throw new Error('この画面には未保存の進捗があります。控えを残して最新状態へ切り替えてください。');
        if (rejectedProjection) abandonedProjection = structuredClone({ settings, progress, achievements, city: encodeCityState(city), destination });
        await repo.takeover(options);
        if (options?.discardUnsaved) for (const id of sessions.keys()) explicitlyAbandoned.add(id);
        rejectedProjection = false; errorMessage = ''; syncSnapshot(); initializeCity(); emit();
      } catch (error) { errorMessage = error instanceof Error ? error.message : '操作するタブを切り替えられませんでした。'; emit(); throw error; }
    },
    async retrySave() {
      try {
        if (rejectedProjection) throw new Error('この画面の未保存進捗を保持しています。控えを保存し、「ここで続ける」から切り替えてください。');
        await repo.retry(); errorMessage = '';
        if (!pendingWrites && !rejectedProjection && repo.status.saveState === 'saved') syncSnapshot();
      } catch (error) { errorMessage = error instanceof Error ? error.message : '保存を完了できませんでした。'; }
      emit();
    },
    async resetProfile(scope) {
      if (!runtime.status.writable || busy) throw new Error('操作するタブで、処理が終わってからお試しください。');
      if (rejectedProjection) throw new Error('未保存の進捗があります。控えを保存してから最新状態へ切り替えてください。');
      busy = true; emit();
      try {
        // The UI has already ended its GameSession. Also close the economic
        // session before changing a deletion generation or resetting settings.
        if (city.activeSession) runtime.endSession(city.activeSession.sessionId);
        await persist(() => scope === 'settings' ? repo.resetSettings()
          : scope === 'records' ? repo.resetRecords() : repo.resetCollectionAndEconomy(), false);
        syncSnapshot();
        baseClock = city.clockMs; baseMono = clock.now(); returnSummary = null;
      } finally { busy = false; emit(); }
    },
    async restoreProfile(payload) {
      if (!runtime.status.writable || busy) throw new Error('操作するタブで、処理が終わってからお試しください。');
      if (rejectedProjection) throw new Error('未保存の進捗があります。控えを保存してから最新状態へ切り替えてください。');
      // Validate before ending a session; malformed input cannot alter the city.
      parseProfileBackup(payload);
      busy = true; emit();
      try {
        if (city.activeSession) runtime.endSession(city.activeSession.sessionId);
        // This explicit replacement retains the old projection in the restore
        // backup, including a memory-only repository's unsaved operations.
        await persist(() => repo.restoreData(payload, { confirmed: true, discardUnsaved: true }), false);
        syncSnapshot();
        baseClock = city.clockMs; baseMono = clock.now(); returnSummary = null;
        initializeCity();
      } finally { busy = false; emit(); }
    },
    exportData() { return JSON.stringify({ repository: JSON.parse(repo.exportData()), currentView: { settings, progress, achievements, city: encodeCityState(city), destination }, pendingWrites, rejectedProjection, abandonedProjection, originalCityData: originalCityData && JSON.parse(originalCityData) }, null, 2); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { closed = true; clearInterval(timer); unsubscribe(); repo.close(); listeners.clear(); },
  };
  initializeCity();
  return runtime;
}
