import type {
  ConfirmedFact,
  CourseId,
  DistrictId,
  LandscapeId,
  ResearchId,
  SynergyId,
  Word,
} from '@/contracts/types';
import {
  CityEconomy,
  type CityEconomySnapshot,
  type EquipmentKind,
  type PurchaseQuantity,
} from '@/economy/cityEconomy';
import { WorldClock } from '@/economy/worldClock';
import {
  AchievementEngine,
  CATALOG_ACHIEVEMENTS,
  type AchievementFamilyId,
  type UnlockRecord,
} from '@/progression/achievementEngine';
import { DictionaryTracker } from '@/progression/dictionaryTracker';
import {
  createDefaultProfileSettings,
  createProfileRepository,
  TabLockError,
  type OnboardingStateRecord,
  type OnboardingStep,
  type ProfileRepository,
  type ProfileSettingsRecord,
  type ReadStateRecord,
  type RoundResultRecord,
  type TabLockToken,
} from '@/progression/profileRepository';
import {
  CourseGenerator,
  GENERATOR_VERSION,
  getTutorialWords,
} from '@/typing/courseGenerator';
import { GameSession, type SessionSnapshot } from '@/typing/gameSession';
import { InputAdapter, type DeliveryKeyOption } from '@/typing/inputAdapter';
import { WORDS_DATA } from '@/contracts/data';
import { AudioPlayer } from './components/audioPlayer';
import { renderNormalHeader, renderPlayHeader } from './components/header';
import { renderDictionaryScreen, type DictionaryScreenState } from './screens/dictionaryScreen';
import { renderDistrictDetailScreen } from './screens/districtDetailScreen';
import {
  renderHandbookScreen,
  type HandbookFilter,
  type HandbookTab,
} from './screens/handbookScreen';
import { renderHomeScreen } from './screens/homeScreen';
import { renderNewCityScreen } from './screens/newCityScreen';
import { syncPlayScreen } from './screens/playScreen';
import { renderResultScreen } from './screens/resultScreen';
import { renderSettingsScreen } from './screens/settingsScreen';
import { renderUpgradesScreen } from './screens/upgradesScreen';
import type {
  AppScreen,
  LastResultContext,
  OnboardingUiState,
  PlayUiFeedback,
  UIControllerActions,
  UpgradeCategory,
  WelcomeBackModalState,
} from './types';
import { el } from './utils/dom';
import {
  buildCityAchievementSnapshot,
  DISTRICT_NAME_MAP,
  DISTRICT_ORDER,
  formatCoins,
  formatDurationMs,
  formatMaterials,
  formatRatePerSec,
} from './utils/format';

function createInitialOnboardingUiState(
  active = false,
  step: OnboardingStep = 'S1',
): OnboardingUiState {
  return {
    active,
    step,
    lockedDistrictNotice: null,
    collapseLessonShown: false,
    collapseSampleSeq: 0,
    mistakeZeroCargoNoticeShown: false,
    actualCollapseNoticeShown: false,
    singleDeliveryNoticeShown: false,
    consecutiveFailedWords: 0,
    rescueOffered: false,
    generatedMaterialsMicro: 0n,
    lastDeliveredCargoCount: 0,
    lastDeliveredBonus: 0,
    deliveryInTransit: false,
    deliveryArrived: false,
    unlockedStampIds: [],
  };
}

export class AppController implements UIControllerActions {
  private readonly mountEl: HTMLElement;
  private readonly tabId: string;

  private repository!: ProfileRepository;
  private lock!: TabLockToken;
  private economy!: CityEconomy;
  private worldClock!: WorldClock;
  private achievements!: AchievementEngine;
  private dictionary!: DictionaryTracker;
  private readonly audio = new AudioPlayer();

  private settings: ProfileSettingsRecord = createDefaultProfileSettings();
  private unlocks: Record<string, UnlockRecord> = {};
  private readState: Record<string, ReadStateRecord> = {};
  private recentResults: RoundResultRecord[] = [];
  private paidEquipmentPurchaseCount = 0;

  private screen: AppScreen = 'HOME';
  private selectedCourseId: CourseId = 'relaxed';
  private selectedDistrictId: DistrictId = 'residential';
  private difficultyPopupOpen = false;
  private selectedUpgradeCategory: UpgradeCategory = 'architecture';
  private purchaseQuantity: PurchaseQuantity = 1;
  private selectedNewCityLandscape: LandscapeId = 'riverside';

  private handbookFamily: AchievementFamilyId = 'A';
  private handbookSelectedId: string | null = null;
  private handbookFilter: HandbookFilter = 'all';
  private handbookTab: HandbookTab = 'stamps';
  private readonly revealedHiddenIds = new Set<string>();

  private dictionaryState: DictionaryScreenState = {
    collection: 'all',
    status: 'all',
    topic: 'all',
    search: '',
    page: 0,
  };

  private highContrast = false;
  private fontScale: '1.0' | '1.15' | '1.3' = '1.0';
  private bgmEnabled = true;
  private tabLockLost = false;
  private welcomeBack: WelcomeBackModalState | null = null;

  // Active typing session state
  private session: GameSession | null = null;
  private inputAdapter: InputAdapter | null = null;
  private readonly playInputEl: HTMLInputElement;
  private currentSeed = 1;
  private currentGenerator: CourseGenerator | null = null;
  private currentComparisonKey = '';
  private currentPlanId = '';
  private pendingFacts: ConfirmedFact[] = [];
  private sessionWordIds: string[] = [];
  private mistakeWordIds = new Set<string>();
  private lastMistakeWordIds: string[] = [];
  private initialStageSnapshot = 0;
  private sessionBeforeIncomePerSecMicro = 0n;
  private sessionUnlockedAchievementIds: string[] = [];
  private resultRevealIndex = 0;
  private resultRevealDone = true;
  private lastResult: LastResultContext | null = null;

  private playFeedback: PlayUiFeedback = {
    mistakeFlash: false,
    mistakeLabel: null,
    mistakeSeq: 0,
    wordPopSeq: 0,
    deliveryPopSeq: 0,
    fullDeliveryFlash: false,
    midWordDeliveryAttempt: false,
    notice: null,
    imePauseReason: false,
    lastDeliveredCargoCount: 0,
    lastDeliveryBonus: null,
    lastUnlockedStampNames: [],
    lastUnlockedStampAssetIds: [],
    tutorialStampUnlocked: false,
  };
  private lastObservedCargoCount = 0;
  private lastCountdownSec: number | null = null;
  private readonly handlePointerUnlockBound = (): void => {
    this.audio.unlock();
  };

  private lastEconomyWallMs = Date.now();
  private economyTickTimer: number | null = null;
  private autoSaveTimer: number | null = null;
  private playTimerHandle: number | null = null;
  private feedbackClearTimer: number | null = null;
  private onboardingArrivalTimer: number | null = null;
  private tabChannel: BroadcastChannel | null = null;
  private eventCounter = 0;
  private readonly handleGlobalKeyDownBound = (e: KeyboardEvent) => this.handleGlobalKeyDown(e);

  private playHostEl: HTMLElement | null = null;
  private onboardingUi: OnboardingUiState = createInitialOnboardingUiState(false, 'S1');
  private onboardingKeyMistakeStreak = 0;
  private pendingResetConfirm: 'records' | 'city_and_achievements' | 'settings' | null = null;
  private settingsNotice: string | null = null;

  constructor(mountEl: HTMLElement) {
    this.mountEl = mountEl;
    this.tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.playInputEl = document.createElement('input');
    this.playInputEl.type = 'text';
  }

  async init(): Promise<void> {
    const { repository, metadata } = await createProfileRepository({ tabId: this.tabId });
    this.repository = repository;
    this.lock = {
      tabId: metadata.ownerTabId,
      writeEpoch: metadata.writeEpoch,
      resetGeneration: metadata.resetGeneration,
    };

    const snapshot = await this.repository.loadAll();
    this.settings = snapshot.profile;
    this.unlocks = snapshot.unlocks;
    this.readState = snapshot.readState;
    this.recentResults = snapshot.results;

    if (snapshot.city?.state) {
      try {
        this.economy = CityEconomy.fromSnapshot(
          snapshot.city.state as unknown as CityEconomySnapshot,
        );
      } catch {
        this.economy = new CityEconomy(Date.now());
      }
    } else {
      this.economy = new CityEconomy(Date.now());
    }

    const savedPaidCount = this.economy.persistent.records['paidEquipmentPurchaseCount'];
    if (typeof savedPaidCount === 'number' && Number.isFinite(savedPaidCount)) {
      this.paidEquipmentPurchaseCount = savedPaidCount;
    }

    const nowWall = Date.now();
    this.worldClock = new WorldClock(this.economy.savedWallMs || nowWall);
    const restore = this.economy.restoreAt(nowWall);
    this.worldClock.commitWallMs(nowWall);
    this.lastEconomyWallMs = nowWall;

    this.achievements = new AchievementEngine({
      progress: snapshot.achievementProgress,
      unlocks: snapshot.unlocks,
      rewards: snapshot.rewards,
      factCursors: snapshot.factCursors,
    });
    this.dictionary = new DictionaryTracker(
      snapshot.achievementProgress.distinctCompletedWordIds,
      snapshot.achievementProgress.practiceCleanCountsByWord,
    );

    const hasPriorActivity =
      this.recentResults.length > 0 ||
      BigInt(this.economy.snapshot().lifetime.arrived_micro) > 0n;
    this.syncOnboardingStateFromProfile(hasPriorActivity);
    if (
      hasPriorActivity &&
      restore.wall_elapsed_ms >= 60_000 &&
      (BigInt(restore.arrived_micro) >= 1_000_000n ||
        BigInt(restore.shop_coins_micro) >= 1_000_000n ||
        restore.completed.length > 0)
    ) {
      this.welcomeBack = { restore };
    }

    try {
      const savedFontScale = window.localStorage.getItem('kotobabin:fontScale');
      if (savedFontScale === '1.0' || savedFontScale === '1.15' || savedFontScale === '1.3') {
        this.fontScale = savedFontScale;
      }
      const savedHighContrast = window.localStorage.getItem('kotobabin:highContrast');
      if (savedHighContrast === 'true') {
        this.highContrast = true;
      } else if (savedHighContrast === 'false') {
        this.highContrast = false;
      }
      const savedBgm = window.localStorage.getItem('kotobabin:bgmEnabled');
      if (savedBgm === 'false') {
        this.bgmEnabled = false;
      } else if (savedBgm === 'true') {
        this.bgmEnabled = true;
      }
    } catch {
      // Ignore storage restrictions
    }
    this.applyAccessibilitySettings();
    this.audio.setPreferences({
      seEnabled: this.settings.volume > 0,
      bgmEnabled: this.bgmEnabled,
      volume: this.settings.volume,
    });
    this.audio.setBgmTrack('home');

    this.setupSingleTabLock();
    this.startTimers();
    window.addEventListener('keydown', this.handleGlobalKeyDownBound);
    this.mountEl.addEventListener('pointerdown', this.handlePointerUnlockBound, { passive: true });
    this.render();
  }

  private clearOnboardingArrivalTimer(): void {
    if (this.onboardingArrivalTimer !== null) {
      window.clearTimeout(this.onboardingArrivalTimer);
      this.onboardingArrivalTimer = null;
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleGlobalKeyDownBound);
    this.mountEl.removeEventListener('pointerdown', this.handlePointerUnlockBound);
    this.clearOnboardingArrivalTimer();
    this.audio.destroy();
    if (this.economyTickTimer !== null) {
      window.clearInterval(this.economyTickTimer);
      this.economyTickTimer = null;
    }
    if (this.autoSaveTimer !== null) {
      window.clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (this.playTimerHandle !== null) {
      window.clearInterval(this.playTimerHandle);
      this.playTimerHandle = null;
    }
    this.inputAdapter?.detach();
    this.tabChannel?.close();
    this.repository?.close();
  }

  private setupSingleTabLock(): void {
    if (typeof BroadcastChannel !== 'undefined') {
      this.tabChannel = new BroadcastChannel('kotobabin-tab-lock');
      this.tabChannel.postMessage({ type: 'claim', tabId: this.tabId });
      this.tabChannel.addEventListener('message', (ev) => {
        const data = ev.data as { type?: string; tabId?: string } | null;
        if (data?.type === 'claim' && data.tabId && data.tabId !== this.tabId) {
          this.handleTabLockLost();
        }
      });
    }
    window.addEventListener('storage', (ev) => {
      if (ev.key === 'kotobabin-active-tab' && ev.newValue && ev.newValue !== this.tabId) {
        this.handleTabLockLost();
      }
    });
    try {
      window.localStorage.setItem('kotobabin-active-tab', this.tabId);
    } catch {
      // Ignore storage errors in restricted environments
    }
  }

  private handleTabLockLost(): void {
    if (this.tabLockLost) {
      return;
    }
    this.tabLockLost = true;
    if (this.session) {
      this.session.pause();
    }
    this.render();
  }

  async reacquireTabLock(): Promise<void> {
    try {
      const meta = await this.repository.acquireTabLock(this.tabId);
      this.lock = {
        tabId: meta.ownerTabId,
        writeEpoch: meta.writeEpoch,
        resetGeneration: meta.resetGeneration,
      };
      this.tabLockLost = false;
      this.tabChannel?.postMessage({ type: 'claim', tabId: this.tabId });
      try {
        window.localStorage.setItem('kotobabin-active-tab', this.tabId);
      } catch {
        // Ignore
      }
      this.render();
    } catch {
      this.tabLockLost = true;
      this.render();
    }
  }

  private startTimers(): void {
    this.economyTickTimer = window.setInterval(() => {
      if (this.screen !== 'PLAY' && !this.tabLockLost) {
        const completedCount = this.advanceEconomyToNow();
        if (
          completedCount > 0 ||
          (this.screen === 'HOME' && !this.difficultyPopupOpen) ||
          this.screen === 'DISTRICT_DETAIL'
        ) {
          this.render();
        } else {
          this.updateHeaderStatsInPlace();
        }
      }
    }, 1000);

    this.autoSaveTimer = window.setInterval(() => {
      if (this.screen !== 'PLAY' && !this.tabLockLost && !this.economy.activeSession) {
        void this.persistCitySnapshot(`autosave-${++this.eventCounter}`);
      }
    }, 15000);
  }

  private advanceEconomyToNow(): number {
    const nowWall = Date.now();
    const delta = Math.max(0, nowWall - this.lastEconomyWallMs);
    this.lastEconomyWallMs = nowWall;
    if (delta > 0) {
      const res = this.economy.advanceTime(delta, nowWall);
      this.worldClock.commitWallMs(nowWall);
      return res.completed.length;
    }
    return 0;
  }

  private updateHeaderStatsInPlace(): void {
    const coinsEl = this.mountEl.querySelector<HTMLElement>('[data-testid="header-coins"]');
    if (coinsEl) {
      coinsEl.textContent = `${formatCoins(this.economy.coinsMicro)} コイン`;
    }
    const rateEl = this.mountEl.querySelector<HTMLElement>('[data-testid="header-income-rate"]');
    if (rateEl) {
      rateEl.textContent = `+${formatRatePerSec(this.economy.totalIncomePerSecondMicro())}`;
    }
  }

  private nextEconomyEventId(prefix: string): string {
    this.eventCounter += 1;
    return `${prefix}:${this.tabId}:${Date.now()}:${this.eventCounter}`;
  }

  private async persistCitySnapshot(eventId: string): Promise<void> {
    if (this.tabLockLost) {
      return;
    }
    try {
      this.economy.persistent.records['paidEquipmentPurchaseCount'] = this.paidEquipmentPurchaseCount;
      const snap = this.economy.snapshot();
      const res = await this.repository.commitCityEconomy({
        lock: this.lock,
        cityId: snap.city_id,
        economyEventId: eventId,
        cityRecord: {
          id: 'current',
          cityId: snap.city_id,
          state: snap as unknown as Record<string, unknown>,
          revision: (snap.clock_ms || 0) + this.eventCounter,
          updatedAt: Date.now(),
        },
        cityAchievementSnapshot: buildCityAchievementSnapshot(
          this.economy,
          this.paidEquipmentPurchaseCount,
        ),
        timestamp: Date.now(),
      });
      this.lock = {
        tabId: res.metadata.ownerTabId,
        writeEpoch: res.metadata.writeEpoch,
        resetGeneration: res.metadata.resetGeneration,
      };
      if (res.evaluation && res.evaluation.newlyUnlockedAchievementIds.length > 0) {
        const loaded = await this.repository.loadAll();
        this.unlocks = loaded.unlocks;
        this.readState = loaded.readState;
        this.achievements = new AchievementEngine({
          progress: loaded.achievementProgress,
          unlocks: loaded.unlocks,
          rewards: loaded.rewards,
          factCursors: loaded.factCursors,
        });
      }
    } catch (err) {
      if (err instanceof TabLockError) {
        this.handleTabLockLost();
      }
    }
  }

  private applyAccessibilitySettings(): void {
    const root = document.documentElement;
    root.dataset.highContrast = this.highContrast ? 'true' : 'false';
    root.dataset.reducedMotion = this.settings.reduceMotion ? 'true' : 'false';
    root.style.setProperty('--kb-font-scale', this.fontScale);
  }

  // Navigation & Selection
  navigate(screen: AppScreen): void {
    if (this.screen === 'PLAY' && screen !== 'PLAY') {
      return;
    }
    if (
      this.screen === 'HOME' &&
      this.onboardingUi.active &&
      this.onboardingUi.step === 'S2' &&
      screen !== 'HOME'
    ) {
      return;
    }
    this.clearOnboardingArrivalTimer();
    this.advanceEconomyToNow();
    if (this.screen !== screen) {
      this.audio.playSe('audio_ui_click');
      if (screen !== 'HANDBOOK') {
        this.handbookSelectedId = null;
      }
    }
    this.screen = screen;
    this.difficultyPopupOpen = false;
    this.pendingResetConfirm = null;
    this.settingsNotice = null;
    this.syncBgmTrack();
    this.render();
  }

  private syncBgmTrack(): void {
    if (this.screen === 'PLAY') {
      this.audio.setBgmTrack('play');
    } else {
      this.audio.setBgmTrack('home');
    }
  }

  selectCourse(courseId: CourseId): void {
    this.audio.playSe('audio_ui_click');
    this.selectedCourseId = courseId;
    this.render();
  }

  private syncOnboardingStateFromProfile(hasPriorActivity: boolean): void {
    const saved = this.settings.onboarding;
    const isCompletedOrSkipped =
      hasPriorActivity ||
      this.settings.tutorialCompleted ||
      saved?.status === 'completed' ||
      saved?.status === 'skipped';

    if (isCompletedOrSkipped) {
      const resolvedStatus = saved?.status === 'skipped' ? 'skipped' : 'completed';
      this.onboardingUi = createInitialOnboardingUiState(false, 'S5');
      if (saved?.status !== resolvedStatus) {
        this.settings = {
          ...this.settings,
          tutorialCompleted: resolvedStatus === 'completed' ? true : this.settings.tutorialCompleted,
          onboarding: {
            version: 1,
            status: resolvedStatus,
            step: saved?.step ?? 'S5',
            updatedAt: Date.now(),
          },
        };
      }
      return;
    }

    const resumeStep: OnboardingStep =
      saved?.status === 'in_progress' && saved.step === 'S2' ? 'S2' : 'S1';
    this.onboardingUi = createInitialOnboardingUiState(true, resumeStep);
    this.settings = {
      ...this.settings,
      onboarding: {
        version: 1,
        status: 'in_progress',
        step: resumeStep,
        updatedAt: Date.now(),
      },
    };
  }

  private persistOnboardingState(state: OnboardingStateRecord): void {
    if (this.tabLockLost) {
      return;
    }
    const nextTutorialCompleted =
      state.status === 'completed' ? true : this.settings.tutorialCompleted;
    this.settings = {
      ...this.settings,
      tutorialCompleted: nextTutorialCompleted,
      onboarding: state,
    };
    void this.repository
      .saveProfile(
        {
          tutorialCompleted: nextTutorialCompleted,
          onboarding: state,
        },
        this.lock,
      )
      .catch((err) => {
        if (err instanceof TabLockError) {
          this.handleTabLockLost();
        }
      });
  }

  selectDistrict(districtId: DistrictId): void {
    this.audio.playSe('audio_ui_click');
    if (this.onboardingUi.active && this.onboardingUi.step === 'S2') {
      if (!this.economy.districts[districtId].open) {
        this.onboardingUi.lockedDistrictNotice = `「${DISTRICT_NAME_MAP[districtId]}」は未開通です。光っている「住宅地」を選んでください。`;
        this.render();
        return;
      }
      this.onboardingUi.lockedDistrictNotice = null;
      this.selectedDistrictId = districtId;
      this.selectedCourseId = 'relaxed';
      this.startTutorial();
      return;
    }
    this.selectedDistrictId = districtId;
    this.render();
  }

  selectAndOpenDifficultyPopup(districtId: DistrictId): void {
    this.audio.playSe('audio_ui_click');
    if (this.onboardingUi.active && this.onboardingUi.step === 'S2') {
      if (!this.economy.districts[districtId].open) {
        this.onboardingUi.lockedDistrictNotice = `「${DISTRICT_NAME_MAP[districtId]}」は未開通です。光っている「住宅地」を選んでください。`;
        this.render();
        return;
      }
      this.onboardingUi.lockedDistrictNotice = null;
      this.selectedDistrictId = districtId;
      this.selectedCourseId = 'relaxed';
      this.startTutorial();
      return;
    }
    this.selectedDistrictId = districtId;
    if (this.economy.districts[districtId].open) {
      this.difficultyPopupOpen = true;
    }
    this.render();
  }

  openDifficultyPopup(): void {
    if (!this.economy.districts[this.selectedDistrictId].open) {
      this.navigate('DISTRICT_DETAIL');
      return;
    }
    this.audio.playSe('audio_ui_click');
    this.difficultyPopupOpen = true;
    this.render();
  }

  closeDifficultyPopup(): void {
    this.audio.playSe('audio_ui_click');
    this.difficultyPopupOpen = false;
    this.render();
  }

  startMainRoundWithCourse(courseId: CourseId): void {
    this.selectedCourseId = courseId;
    this.difficultyPopupOpen = false;
    this.startMainRound();
  }

  // Typing Session Lifecycle
  startMainRound(customSeed?: number): void {
    if (!this.economy.districts[this.selectedDistrictId].open) {
      return;
    }
    this.audio.playSe('audio_ui_click');
    this.difficultyPopupOpen = false;
    this.onboardingUi.active = false;
    this.advanceEconomyToNow();
    this.currentSeed = customSeed ?? Math.floor(Math.random() * 1_000_000) + 1;
    this.launchSession('MAIN', 'READY', this.currentSeed, null);
  }

  startPractice(preferredWord?: Word): void {
    this.audio.playSe('audio_ui_click');
    this.onboardingUi.active = false;
    this.advanceEconomyToNow();
    this.currentSeed = Math.floor(Math.random() * 1_000_000) + 1;
    const courseId = preferredWord ? preferredWord.courseId : this.selectedCourseId;
    this.selectedCourseId = courseId;
    this.launchSession('PRACTICE', 'PRACTICE', this.currentSeed, preferredWord?.id ?? null);
  }

  startTutorial(): void {
    this.clearOnboardingArrivalTimer();
    this.audio.playSe('audio_ui_click');
    this.advanceEconomyToNow();
    this.selectedDistrictId = this.economy.districts[this.selectedDistrictId].open
      ? this.selectedDistrictId
      : 'residential';
    this.selectedCourseId = 'relaxed';
    this.onboardingUi = createInitialOnboardingUiState(true, 'S3');
    this.onboardingKeyMistakeStreak = 0;
    const savedStatus = this.settings.onboarding?.status;
    if (savedStatus !== 'completed' && savedStatus !== 'skipped') {
      this.persistOnboardingState({
        version: 1,
        status: 'in_progress',
        step: 'S3',
        updatedAt: Date.now(),
      });
    }
    this.currentSeed = 1;
    this.launchSession('TUTORIAL', 'TUTORIAL', 1, null);
  }

  advanceOnboardingToDistrictSelect(): void {
    this.audio.playSe('audio_ui_click');
    this.selectedDistrictId = 'residential';
    this.onboardingUi.active = true;
    this.onboardingUi.step = 'S2';
    this.onboardingUi.lockedDistrictNotice = null;
    if (this.settings.onboarding?.status !== 'completed') {
      this.persistOnboardingState({
        version: 1,
        status: 'in_progress',
        step: 'S2',
        updatedAt: Date.now(),
      });
    }
    this.render();
  }

  skipOnboarding(): void {
    this.clearOnboardingArrivalTimer();
    this.audio.playSe('audio_ui_click');
    this.stopPlayTimer();
    this.inputAdapter?.detach();
    if (this.session) {
      this.session.abort('user_quit');
      this.session = null;
    }
    if (this.economy.activeSession) {
      this.advanceEconomyToNow();
      this.economy.endSession({ atMs: this.economy.clockMs });
    }
    if (this.pendingFacts.length > 0) {
      void this.commitSessionAndCity(undefined);
    }
    const alreadyCompleted = Boolean(
      this.settings.tutorialCompleted || this.settings.onboarding?.status === 'completed',
    );
    this.onboardingUi = createInitialOnboardingUiState(false, 'S5');
    this.persistOnboardingState({
      version: 1,
      status: alreadyCompleted ? 'completed' : 'skipped',
      step: 'S5',
      updatedAt: Date.now(),
    });
    this.screen = 'HOME';
    this.render();
  }

  finishOnboardingToHome(): void {
    this.clearOnboardingArrivalTimer();
    this.audio.playSe('audio_ui_click');
    this.stopPlayTimer();
    this.inputAdapter?.detach();
    if (this.session) {
      this.session.abort('completed');
      this.session = null;
    }
    if (this.economy.activeSession) {
      this.advanceEconomyToNow();
      this.economy.endSession({ atMs: this.economy.clockMs });
    }
    const waitMs = this.economy.waitMs(this.selectedDistrictId);
    if (waitMs > 0) {
      const nowWall = Date.now();
      this.economy.advanceTime(waitMs, nowWall);
      this.lastEconomyWallMs = nowWall;
    }
    const citySnap = buildCityAchievementSnapshot(this.economy, this.paidEquipmentPurchaseCount);
    this.achievements.applyCitySnapshot(citySnap, Date.now());
    void this.commitSessionAndCity(undefined);
    this.onboardingUi = createInitialOnboardingUiState(false, 'S5');
    this.persistOnboardingState({
      version: 1,
      status: 'completed',
      step: 'S5',
      updatedAt: Date.now(),
    });
    this.screen = 'HOME';
    this.render();
  }

  restartOnboarding(): void {
    if (this.screen === 'PLAY') {
      return;
    }
    this.audio.playSe('audio_ui_click');
    this.selectedDistrictId = 'residential';
    this.difficultyPopupOpen = false;
    this.onboardingUi = createInitialOnboardingUiState(true, 'S1');
    this.persistOnboardingState({
      version: 1,
      status: 'in_progress',
      step: 'S1',
      updatedAt: Date.now(),
    });
    this.screen = 'HOME';
    this.syncBgmTrack();
    this.render();
  }

  private launchSession(
    mode: 'MAIN' | 'PRACTICE' | 'TUTORIAL',
    launchTarget: 'READY' | 'PRACTICE' | 'TUTORIAL',
    seed: number,
    preferredWordId: string | null,
  ): void {
    this.stopPlayTimer();
    this.inputAdapter?.detach();

    if (this.economy.activeSession !== null) {
      this.economy.endSession({ atMs: this.economy.clockMs });
    }
    if (this.pendingFacts.length > 0) {
      void this.commitSessionAndCity(undefined);
    }

    this.pendingFacts = [];
    this.sessionWordIds = [];
    this.mistakeWordIds.clear();
    this.lastObservedCargoCount = 0;
    this.onboardingKeyMistakeStreak = 0;
    this.lastCountdownSec = null;
    this.playFeedback = {
      mistakeFlash: false,
      mistakeLabel: null,
      mistakeSeq: 0,
      wordPopSeq: 0,
      deliveryPopSeq: 0,
      fullDeliveryFlash: false,
      midWordDeliveryAttempt: false,
      notice: null,
      imePauseReason: false,
      lastDeliveredCargoCount: 0,
      lastDeliveryBonus: null,
      lastUnlockedStampNames: [],
      lastUnlockedStampAssetIds: [],
      tutorialStampUnlocked: false,
    };

    const districtId = this.selectedDistrictId;
    this.initialStageSnapshot = this.economy.districts[districtId].stage;
    this.sessionBeforeIncomePerSecMicro = this.economy.totalIncomePerSecondMicro();
    this.sessionUnlockedAchievementIds = [];

    if (this.economy.activeSession !== null) {
      this.economy.endSession({ atMs: this.economy.clockMs });
    }

    const sessionId = `sess-${this.economy.snapshot().city_id}-${Date.now()}-${++this.eventCounter}`;
    if (mode === 'MAIN') {
      this.economy.beginSession(sessionId, districtId, 'normal', { atMs: this.economy.clockMs });
    } else if (mode === 'TUTORIAL') {
      this.economy.beginSession(sessionId, districtId, 'intro', { atMs: this.economy.clockMs });
    }

    let wordProvider: (idx: number) => Word;
    if (mode === 'TUTORIAL') {
      const tutorialWords = getTutorialWords();
      const fallbackGenerator = new CourseGenerator({
        courseId: 'relaxed',
        seed: 1,
        preferredWordId: null,
      });
      this.currentGenerator = fallbackGenerator;
      wordProvider = (idx: number) =>
        idx < tutorialWords.length
          ? tutorialWords[idx]
          : fallbackGenerator.getWordAt(idx - tutorialWords.length);
      this.currentComparisonKey = `tutorial:${WORDS_DATA.contentVersion}`;
      this.currentPlanId = 'tutorial';
    } else {
      const preferredPracticeWord =
        mode === 'PRACTICE' && preferredWordId !== null
          ? (this.dictionary.getWord(preferredWordId) ?? null)
          : null;
      this.currentGenerator = new CourseGenerator({
        courseId: this.selectedCourseId,
        seed,
        preferredWordId: preferredPracticeWord ? null : preferredWordId,
      });
      if (preferredPracticeWord) {
        const restWords: Word[] = [];
        let probeIdx = 0;
        wordProvider = (idx: number) => {
          if (idx === 0) {
            return preferredPracticeWord;
          }
          while (restWords.length < idx) {
            const candidate = this.currentGenerator!.getWordAt(probeIdx++);
            if (restWords.length === 0 && candidate.id === preferredPracticeWord.id) {
              continue;
            }
            restWords.push(candidate);
          }
          return restWords[idx - 1];
        };
      } else {
        wordProvider = (idx: number) => this.currentGenerator!.getWordAt(idx);
      }
      this.currentComparisonKey = `${this.selectedCourseId}:${GENERATOR_VERSION}:${WORDS_DATA.contentVersion}:${seed}`;
      this.currentPlanId = `${this.selectedCourseId}:${seed}`;
    }

    const matchingBest = this.recentResults.filter(
      (r) => r.comparisonKey === this.currentComparisonKey && r.completed,
    );
    const bestScore =
      matchingBest.length > 0 ? Math.max(...matchingBest.map((r) => r.score)) : null;
    const bestSpeed =
      matchingBest.length > 0 ? Math.max(...matchingBest.map((r) => r.canonicalKpm)) : null;

    this.achievements.startSession(sessionId, mode, {
      orderKey: this.currentPlanId,
      comparisonBestScore: bestScore,
      comparisonBestSpeed: bestSpeed,
      practiceQualifiedWordIds: this.dictionary.getMasteredWordIds(),
    });

    this.session = new GameSession({
      sessionId,
      courseId: this.selectedCourseId,
      districtId,
      mode,
      wordProvider,
      guideEnabled: this.settings.guideDefault,
      onFact: (fact) => this.handleSessionFact(fact),
    });

    this.session.enterInputCheck(launchTarget);
    this.inputAdapter?.detach();
    if (mode === 'PRACTICE') {
      this.session.completeInputCheck();
    }
    this.screen = 'PLAY';
    this.playHostEl = null;
    this.render();
    if (this.session.currentState !== 'INPUT_CHECK') {
      this.attachInputAdapter();
      this.focusPlayInput();
    }
  }

  private attachInputAdapter(): void {
    if (!this.session) {
      return;
    }
    const deliveryKey: DeliveryKeyOption =
      this.settings.deliveryKey === 'Space' ? 'Space' : 'Enter';
    this.inputAdapter = new InputAdapter({
      inputElement: this.playInputEl,
      session: this.session,
      deliveryKeys: [deliveryKey],
      canCommitDelivery: () =>
        !(
          this.session?.currentMode === 'TUTORIAL' &&
          this.onboardingUi.active &&
          this.onboardingUi.step === 'S4' &&
          this.session.getSnapshot().cargoCount === 1
        ),
      onKeyProcessed: (res) => {
        if (res.deadlineReached) {
          this.render();
          return;
        }
        if (res.accepted) {
          this.onboardingKeyMistakeStreak = 0;
          this.playFeedback.mistakeFlash = false;
          this.playFeedback.mistakeLabel = null;
          this.playFeedback.midWordDeliveryAttempt = false;
          this.playFeedback.notice = null;
          if (res.autoDelivered) {
            this.playFeedback.deliveryPopSeq += 1;
            this.playFeedback.lastDeliveredCargoCount = 5;
            this.playFeedback.fullDeliveryFlash = true;
            this.audio.playSe('audio_dispatch_full');
            this.scheduleFeedbackClear();
          } else if (res.wordCompleted) {
            this.playFeedback.wordPopSeq += 1;
            this.playFeedback.fullDeliveryFlash = false;
            this.audio.playSe('audio_word');
          } else {
            this.playFeedback.fullDeliveryFlash = false;
            this.audio.playSe('audio_key');
          }
          if (this.session?.currentState === 'PLAYING') {
            this.ensurePlayTimerRunning();
          }
        } else if (!res.ignored) {
          const prevCargo = this.lastObservedCargoCount;
          this.playFeedback.mistakeFlash = true;
          this.playFeedback.mistakeSeq += 1;
          this.playFeedback.mistakeLabel =
            prevCargo > 0 ? `荷崩れ！ (-${prevCargo}個)` : 'ミス！';
          this.audio.playSe('audio_mistake');
          if (this.session) {
            this.achievements.recordMidWordMistake(this.session.sessionId);
            if (this.session.currentMode === 'TUTORIAL' && this.onboardingUi.active) {
              if (prevCargo === 0) {
                this.onboardingUi.mistakeZeroCargoNoticeShown = true;
              } else {
                this.onboardingUi.collapseLessonShown = true;
                this.onboardingUi.actualCollapseNoticeShown = true;
                this.onboardingUi.singleDeliveryNoticeShown = false;
              }
              this.onboardingKeyMistakeStreak += 1;
              if (this.onboardingKeyMistakeStreak >= 4) {
                this.onboardingUi.rescueOffered = true;
              }
            }
          }
          this.scheduleFeedbackClear();
        }
        if (this.session) {
          this.lastObservedCargoCount = this.session.getSnapshot().cargoCount;
        }
        this.renderPlayInPlace();
      },
      onDeliveryAttempt: (res) => {
        if (res.delivered) {
          this.applyDeliveredFeedback(res.bonus, res.cargoCount);
        } else if (res.reason === 'mid_word') {
          this.playFeedback.midWordDeliveryAttempt = true;
          this.playFeedback.notice = 'まずこのことばを打ち切ってから配達しましょう';
          this.audio.playSe('audio_ui_click');
          this.scheduleFeedbackClear();
        } else if (res.reason === 'empty_cargo') {
          this.playFeedback.notice = '積んでいる荷物がありません';
          this.audio.playSe('audio_ui_click');
          this.scheduleFeedbackClear();
        } else if (
          res.reason === 'invalid_state' &&
          this.session?.currentMode === 'TUTORIAL' &&
          this.onboardingUi.active &&
          this.onboardingUi.step === 'S4' &&
          res.cargoCount === 1
        ) {
          this.onboardingUi.singleDeliveryNoticeShown = true;
          this.audio.playSe('audio_ui_click');
        }
        if (this.session) {
          this.lastObservedCargoCount = this.session.getSnapshot().cargoCount;
        }
        this.renderPlayInPlace();
      },
      onNotice: (msg) => {
        this.playFeedback.notice = msg;
        this.scheduleFeedbackClear();
        this.renderPlayInPlace();
      },
      onImePause: () => {
        this.playFeedback.imePauseReason = true;
      },
      onPause: () => {
        this.stopPlayTimer();
        this.render();
      },
    });
    this.inputAdapter.attach();
  }

  private scheduleFeedbackClear(): void {
    if (this.feedbackClearTimer !== null) {
      window.clearTimeout(this.feedbackClearTimer);
    }
    this.feedbackClearTimer = window.setTimeout(() => {
      this.playFeedback.mistakeFlash = false;
      this.playFeedback.mistakeLabel = null;
      this.playFeedback.fullDeliveryFlash = false;
      this.playFeedback.midWordDeliveryAttempt = false;
      this.playFeedback.notice = null;
      this.playFeedback.lastDeliveredCargoCount = 0;
      this.playFeedback.lastDeliveryBonus = null;
      this.playFeedback.lastUnlockedStampNames = [];
      this.playFeedback.lastUnlockedStampAssetIds = [];
      if (this.screen === 'PLAY') {
        this.renderPlayInPlace();
      }
    }, 1100);
  }

  private ensurePlayTimerRunning(): void {
    if (this.playTimerHandle !== null) {
      return;
    }
    this.playTimerHandle = window.setInterval(() => {
      if (!this.session || this.screen !== 'PLAY') {
        this.stopPlayTimer();
        return;
      }
      if (this.session.currentState === 'PLAYING') {
        const finished = this.session.tick();
        if (finished) {
          this.stopPlayTimer();
          this.render();
        } else {
          const snap = this.session.getSnapshot();
          if (snap.mode === 'MAIN') {
            const secLeft = Math.ceil(snap.remainingMs / 1000);
            if (secLeft >= 1 && secLeft <= 5 && secLeft !== this.lastCountdownSec) {
              this.lastCountdownSec = secLeft;
              this.audio.playSe('audio_countdown_tick');
            }
          }
          this.renderPlayInPlace();
        }
      }
    }, 100);
  }

  private stopPlayTimer(): void {
    if (this.playTimerHandle !== null) {
      window.clearInterval(this.playTimerHandle);
      this.playTimerHandle = null;
    }
  }

  private handleSessionFact(fact: ConfirmedFact): void {
    this.pendingFacts.push(fact);

    if (fact.mode === 'MAIN' || fact.mode === 'TUTORIAL') {
      if (
        fact.mode === 'TUTORIAL' &&
        (fact.type === 'WordCompleted' || fact.type === 'DeliveryCommitted')
      ) {
        this.lastEconomyWallMs = Date.now();
      } else {
        this.advanceEconomyToNow();
      }
      const econRes = this.economy.applyTypingFact(
        fact,
        {
          packagingLevel: this.economy.packagingLevel,
          materialsResearchRank: this.economy.research.materials,
          districtId: this.selectedDistrictId,
        },
        { atMs: this.economy.clockMs },
      );
      if (fact.mode === 'TUTORIAL' && econRes.applied) {
        this.onboardingUi.generatedMaterialsMicro += BigInt(econRes.generatedMicro);
      }
      if (fact.type === 'DeliveryCommitted') {
        this.playFeedback.lastDeliveryBonus = fact.bonus;
        this.playFeedback.lastDeliveredCargoCount = fact.cargoCount;
      }
    }

    if (fact.type === 'WordCompleted') {
      this.sessionWordIds.push(fact.wordId);
      if (fact.mistakes > 0) {
        this.mistakeWordIds.add(fact.wordId);
      }
      this.dictionary.markCompleted(fact.wordId);
      if (fact.mode === 'PRACTICE' && fact.mistakes === 0) {
        this.dictionary.recordCleanPractice(fact.wordId);
      }
    }

    if (fact.mode === 'TUTORIAL' && this.onboardingUi.active) {
      if (fact.type === 'WordCompleted') {
        this.onboardingUi.mistakeZeroCargoNoticeShown = false;
        if (fact.mistakes === 0) {
          this.onboardingUi.consecutiveFailedWords = 0;
          this.onboardingUi.rescueOffered = false;
          this.onboardingKeyMistakeStreak = 0;
          const resultingCargo = (this.session?.getSnapshot().cargoCount ?? 0) + 1;
          if (this.onboardingUi.step === 'S3' && resultingCargo >= 1) {
            this.onboardingUi.step = 'S4';
            this.onboardingUi.singleDeliveryNoticeShown = false;
          } else if (this.onboardingUi.step === 'S4' && resultingCargo >= 2) {
            this.onboardingUi.singleDeliveryNoticeShown = false;
            if (!this.onboardingUi.collapseLessonShown) {
              this.onboardingUi.collapseLessonShown = true;
              this.onboardingUi.collapseSampleSeq += 1;
            }
          }
        } else {
          this.onboardingUi.consecutiveFailedWords += 1;
          if (this.onboardingUi.consecutiveFailedWords >= 3) {
            this.onboardingUi.rescueOffered = true;
          }
        }
      } else if (
        fact.type === 'DeliveryCommitted' &&
        (fact.reason === 'manual' || fact.reason === 'full')
      ) {
        this.onboardingUi.lastDeliveredCargoCount = fact.cargoCount;
        this.onboardingUi.lastDeliveredBonus = fact.bonus;
        if (this.onboardingUi.step === 'S4') {
          if (fact.cargoCount === 1) {
            this.onboardingUi.singleDeliveryNoticeShown = true;
          } else if (fact.cargoCount >= 2) {
            if (!this.onboardingUi.collapseLessonShown) {
              this.onboardingUi.collapseLessonShown = true;
              this.onboardingUi.collapseSampleSeq += 1;
            }
            this.onboardingUi.deliveryInTransit = true;
            this.onboardingUi.deliveryArrived = false;
            this.inputAdapter?.detach();
            this.clearOnboardingArrivalTimer();
            const transitMs = this.settings.reduceMotion ? 150 : 760;
            this.onboardingArrivalTimer = window.setTimeout(() => {
              this.onboardingArrivalTimer = null;
              if (!this.onboardingUi.active || this.screen !== 'PLAY') {
                return;
              }
              this.handleOnboardingWagonLanded();
            }, transitMs);
          }
        }
      }
    }

    const wallNow = Date.now();
    const evalRes = this.achievements.applyFact(fact, wallNow);
    if (evalRes.newlyUnlockedAchievementIds.length > 0) {
      for (const id of evalRes.newlyUnlockedAchievementIds) {
        if (!this.sessionUnlockedAchievementIds.includes(id)) {
          this.sessionUnlockedAchievementIds.push(id);
        }
      }
      this.playFeedback.lastUnlockedStampNames = evalRes.newlyUnlockedAchievementIds.map(
        (id) => CATALOG_ACHIEVEMENTS.find((a) => a.id === id)?.name ?? id,
      );
      this.playFeedback.lastUnlockedStampAssetIds = evalRes.newlyUnlockedAchievementIds.map(
        (id) =>
          CATALOG_ACHIEVEMENTS.find((a) => a.id === id)?.stamp_asset_id ??
          `stamp_${id.toLowerCase()}`,
      );
      if (fact.type !== 'RoundFinished') {
        this.audio.playSe('audio_stamp_unlock');
      }
      this.scheduleFeedbackClear();
    }
    if (fact.mode === 'TUTORIAL' && evalRes.newlyUnlockedAchievementIds.includes('A01')) {
      this.playFeedback.tutorialStampUnlocked = true;
    }

    if (fact.type === 'RoundFinished') {
      this.advanceEconomyToNow();
      const economySummary = this.economy.endSession({ atMs: this.economy.clockMs });
      const citySnap = buildCityAchievementSnapshot(this.economy, this.paidEquipmentPurchaseCount);
      const cityEval = this.achievements.applyCitySnapshot(citySnap, wallNow);
      if (
        evalRes.newlyUnlockedAchievementIds.length > 0 ||
        cityEval.newlyUnlockedAchievementIds.length > 0 ||
        (fact.completed && this.sessionUnlockedAchievementIds.length > 0)
      ) {
        this.audio.playSe('audio_stamp_unlock');
      } else {
        this.audio.playSe('audio_round_finish');
      }

      const snap = this.session!.getSnapshot();
      const roundRecord: RoundResultRecord = {
        sessionId: fact.sessionId,
        timestamp: Date.now(),
        courseId: fact.courseId,
        comparisonKey: this.currentComparisonKey,
        planId: this.currentPlanId,
        wordIds: [...this.sessionWordIds],
        ruleVersion: fact.ruleVersion,
        completed: fact.completed,
        completedWordCount: fact.completedWordCount,
        correctKeyCount: fact.correctKeyCount,
        mistakeCount: fact.mistakeCount,
        totalCanonicalLength: fact.totalCanonicalLength,
        score: fact.score,
        canonicalKpm: snap.canonicalKpm,
        rescueUsed: fact.rescueUsed,
        guideUsed: fact.guideUsed,
      };

      this.lastMistakeWordIds = [...this.mistakeWordIds];
      void this.commitSessionAndCity(roundRecord);

      if (fact.completed) {
        const mergedNewIds = Array.from(
          new Set([
            ...this.sessionUnlockedAchievementIds,
            ...evalRes.newlyUnlockedAchievementIds,
            ...cityEval.newlyUnlockedAchievementIds,
          ]),
        );
        this.resultRevealIndex = 0;
        this.resultRevealDone = mergedNewIds.length === 0;
        this.lastResult = {
          snapshot: snap,
          evaluation: {
            ...cityEval,
            newlyUnlockedAchievementIds: mergedNewIds,
          },
          economySummary,
          districtBeforeStage: this.initialStageSnapshot,
          districtAfterStage: this.economy.districts[this.selectedDistrictId].stage,
          incomeBeforePerSecMicro: this.sessionBeforeIncomePerSecMicro,
          incomeAfterPerSecMicro: this.economy.totalIncomePerSecondMicro(),
        };
        this.inputAdapter?.detach();
        this.screen = 'RESULT';
      }
    } else if (fact.type === 'PracticeSessionEnded') {
      void this.commitSessionAndCity(undefined);
    }
  }

  private flushOnboardingDeliveryArrivalToCity(): void {
    const wallNow = Date.now();
    const waitMs = this.economy.waitMs(this.selectedDistrictId);
    if (waitMs > 0) {
      this.economy.advanceTime(waitMs, wallNow);
      this.lastEconomyWallMs = wallNow;
    }
    const citySnap = buildCityAchievementSnapshot(this.economy, this.paidEquipmentPurchaseCount);
    const cityEval = this.achievements.applyCitySnapshot(citySnap, wallNow);
    for (const id of cityEval.newlyUnlockedAchievementIds) {
      if (!this.sessionUnlockedAchievementIds.includes(id)) {
        this.sessionUnlockedAchievementIds.push(id);
      }
      const ach = CATALOG_ACHIEVEMENTS.find((a) => a.id === id);
      const stampName = ach?.name ?? id;
      const stampAssetId = ach?.stamp_asset_id ?? `stamp_${id.toLowerCase()}`;
      if (!this.playFeedback.lastUnlockedStampNames.includes(stampName)) {
        this.playFeedback.lastUnlockedStampNames.push(stampName);
      }
      if (!this.playFeedback.lastUnlockedStampAssetIds.includes(stampAssetId)) {
        this.playFeedback.lastUnlockedStampAssetIds.push(stampAssetId);
      }
    }
    if (cityEval.newlyUnlockedAchievementIds.length > 0) {
      this.audio.playSe('audio_stamp_unlock');
      this.scheduleFeedbackClear();
    }
  }

  private handleOnboardingWagonLanded(): void {
    this.onboardingUi.deliveryArrived = true;
    this.flushOnboardingDeliveryArrivalToCity();
    this.renderPlayInPlace();

    this.clearOnboardingArrivalTimer();
    const arrivalHoldMs = this.settings.reduceMotion ? 200 : 850;
    this.onboardingArrivalTimer = window.setTimeout(() => {
      this.onboardingArrivalTimer = null;
      if (!this.onboardingUi.active || this.screen !== 'PLAY') {
        return;
      }
      this.completeOnboardingDeliveryArrival();
    }, arrivalHoldMs);
  }

  private completeOnboardingDeliveryArrival(): void {
    this.onboardingUi.deliveryInTransit = false;
    this.onboardingUi.deliveryArrived = false;
    this.onboardingUi.step = 'S5';
    this.flushOnboardingDeliveryArrivalToCity();
    this.onboardingUi.unlockedStampIds = [...this.sessionUnlockedAchievementIds];
    this.renderPlayInPlace();
  }

  private async commitSessionAndCity(roundResult: RoundResultRecord | undefined): Promise<void> {
    if (this.tabLockLost) {
      return;
    }
    const factsToCommit = [...this.pendingFacts];
    this.pendingFacts = [];
    try {
      const res = await this.repository.commitTypingFacts({
        lock: this.lock,
        facts: factsToCommit,
        citySnapshot: buildCityAchievementSnapshot(this.economy, this.paidEquipmentPurchaseCount),
        roundResult,
      });
      this.lock = {
        tabId: res.metadata.ownerTabId,
        writeEpoch: res.metadata.writeEpoch,
        resetGeneration: res.metadata.resetGeneration,
      };
      const loaded = await this.repository.loadAll();
      this.unlocks = loaded.unlocks;
      this.readState = loaded.readState;
      this.recentResults = loaded.results;
      await this.persistCitySnapshot(this.nextEconomyEventId('round-city'));
      this.render();
    } catch (err) {
      if (err instanceof TabLockError) {
        this.handleTabLockLost();
      }
    }
  }

  completeInputCheck(): void {
    if (!this.session) {
      return;
    }
    this.inputAdapter?.detach();
    this.playInputEl.value = '';
    this.playFeedback.mistakeFlash = false;
    this.playFeedback.mistakeLabel = null;
    this.onboardingUi.mistakeZeroCargoNoticeShown = false;
    this.session.completeInputCheck();
    this.playFeedback.imePauseReason = false;
    this.audio.playSe('audio_round_start');
    this.render();
    this.attachInputAdapter();
    this.focusPlayInput();
  }

  cancelInputCheck(): void {
    if (!this.session) {
      return;
    }
    this.audio.playSe('audio_ui_click');
    this.session.cancelInputCheck();
    if (this.session.currentState === 'HOME') {
      if (this.economy.activeSession) {
        this.economy.endSession({ atMs: this.economy.clockMs });
      }
      this.inputAdapter?.detach();
      this.session = null;
      if (this.settings.onboarding?.status === 'in_progress') {
        this.onboardingUi = createInitialOnboardingUiState(true, 'S2');
        this.persistOnboardingState({
          version: 1,
          status: 'in_progress',
          step: 'S2',
          updatedAt: Date.now(),
        });
      } else {
        this.onboardingUi = createInitialOnboardingUiState(false, 'S5');
      }
      this.screen = 'HOME';
      this.syncBgmTrack();
    }
    this.render();
  }

  focusPlayInput(): void {
    if (
      this.session?.currentMode === 'TUTORIAL' &&
      this.onboardingUi.active &&
      this.onboardingUi.step === 'S5'
    ) {
      return;
    }
    this.playInputEl.focus({ preventScroll: true });
    window.requestAnimationFrame(() => {
      const state = this.session?.currentState;
      const isS5 =
        this.session?.currentMode === 'TUTORIAL' &&
        this.onboardingUi.active &&
        this.onboardingUi.step === 'S5';
      if (
        this.screen === 'PLAY' &&
        !isS5 &&
        (state === 'PLAYING' || state === 'READY' || state === 'TUTORIAL' || state === 'PRACTICE')
      ) {
        this.playInputEl.focus({ preventScroll: true });
      }
    });
  }

  pausePlay(): void {
    if (!this.session || (this.onboardingUi.active && this.onboardingUi.deliveryInTransit)) {
      return;
    }
    this.session.pause();
    this.stopPlayTimer();
    this.audio.playSe('audio_pause');
    this.render();
  }

  resumePlay(): void {
    if (!this.session) {
      return;
    }
    this.playFeedback.imePauseReason = false;
    this.session.resume();
    this.audio.playSe('audio_ui_click');
    if (this.session.currentState === 'PLAYING') {
      this.ensurePlayTimerRunning();
    }
    this.render();
    this.focusPlayInput();
  }

  recheckImeFromPause(): void {
    if (!this.session) {
      return;
    }
    this.audio.playSe('audio_ui_click');
    this.session.enterInputCheck();
    this.render();
  }

  skipWordFromPause(): void {
    if (!this.session) {
      return;
    }
    this.session.skipWord();
    this.achievements.markSessionSkip(this.session.sessionId);
    this.resumePlay();
  }

  quitPlayToHome(): void {
    this.clearOnboardingArrivalTimer();
    this.audio.playSe('audio_ui_click');
    this.stopPlayTimer();
    this.inputAdapter?.detach();
    this.advanceEconomyToNow();
    const wasTutorial = this.session?.currentMode === 'TUTORIAL';
    if (this.session) {
      this.session.abort('user_quit');
      this.session = null;
    }
    if (this.economy.activeSession) {
      this.economy.endSession({ atMs: this.economy.clockMs });
    }
    if (this.pendingFacts.length > 0 || wasTutorial) {
      void this.commitSessionAndCity(undefined);
    }
    if (wasTutorial && this.settings.onboarding?.status === 'in_progress') {
      this.onboardingUi = createInitialOnboardingUiState(true, 'S2');
      this.persistOnboardingState({
        version: 1,
        status: 'in_progress',
        step: 'S2',
        updatedAt: Date.now(),
      });
    } else {
      this.onboardingUi.active = false;
    }
    this.screen = 'HOME';
    this.render();
  }

  nextPracticeWord(): void {
    if (!this.session || this.session.currentMode !== 'PRACTICE') {
      return;
    }
    this.audio.playSe('audio_ui_click');
    this.session.skipWord();
    this.renderPlayInPlace();
    this.focusPlayInput();
  }

  tryMainFromPractice(): void {
    this.stopPlayTimer();
    this.inputAdapter?.detach();
    if (this.session) {
      this.session.endPractice('try_main');
      this.session = null;
    }
    if (this.settings.onboarding?.status === 'in_progress') {
      this.startTutorial();
      this.completeInputCheck();
      return;
    }
    this.startMainRound();
  }

  endPracticeToHome(): void {
    this.audio.playSe('audio_ui_click');
    this.stopPlayTimer();
    this.inputAdapter?.detach();
    if (this.session) {
      this.session.endPractice('completed');
      this.session = null;
    }
    if (this.settings.onboarding?.status === 'in_progress') {
      this.onboardingUi = createInitialOnboardingUiState(true, 'S2');
      this.persistOnboardingState({
        version: 1,
        status: 'in_progress',
        step: 'S2',
        updatedAt: Date.now(),
      });
    }
    this.screen = 'HOME';
    this.render();
  }

  private applyDeliveredFeedback(bonus: number, cargoCount: number): void {
    this.playFeedback.lastDeliveredCargoCount = cargoCount;
    this.playFeedback.lastDeliveryBonus = bonus;
    this.playFeedback.deliveryPopSeq += 1;
    this.playFeedback.fullDeliveryFlash = cargoCount >= 5;
    this.playFeedback.midWordDeliveryAttempt = false;
    this.playFeedback.notice = null;
    if (cargoCount >= 5) {
      this.audio.playSe('audio_dispatch_full');
    } else if (cargoCount >= 3) {
      this.audio.playSe('audio_dispatch_medium');
    } else {
      this.audio.playSe('audio_dispatch_small');
    }
    this.scheduleFeedbackClear();
  }

  commitManualDelivery(): void {
    if (!this.session) {
      return;
    }
    if (
      this.session.currentMode === 'TUTORIAL' &&
      this.onboardingUi.active &&
      this.onboardingUi.step === 'S4' &&
      this.session.getSnapshot().cargoCount === 1
    ) {
      this.onboardingUi.singleDeliveryNoticeShown = true;
      this.audio.playSe('audio_ui_click');
      this.renderPlayInPlace();
      this.focusPlayInput();
      return;
    }
    const res = this.session.commitDelivery();
    if (res.delivered) {
      this.applyDeliveredFeedback(res.bonus, res.cargoCount);
      this.lastObservedCargoCount = this.session.getSnapshot().cargoCount;
    }
    this.renderPlayInPlace();
    this.focusPlayInput();
  }

  // Economy Actions
  setUpgradeCategory(category: UpgradeCategory): void {
    this.audio.playSe('audio_ui_click');
    this.selectedUpgradeCategory = category;
    this.render();
  }

  setPurchaseQuantity(qty: PurchaseQuantity): void {
    this.audio.playSe('audio_ui_click');
    this.purchaseQuantity = qty;
    this.render();
  }

  buyEquipment(kind: EquipmentKind): void {
    this.advanceEconomyToNow();
    try {
      const res = this.economy.purchase(
        kind,
        this.purchaseQuantity,
        kind === 'packaging' ? null : this.selectedDistrictId,
        {
          atMs: this.economy.clockMs,
          economyEventId: this.nextEconomyEventId(`buy-${kind}`),
        },
      );
      if (res.applied) {
        this.paidEquipmentPurchaseCount += res.count;
        this.audio.playSe('audio_upgrade_buy');
        void this.persistCitySnapshot(this.nextEconomyEventId(`persist-${kind}`));
      }
    } catch {
      // Guarded in UI
    }
    this.render();
  }

  buyRailway(districtId: DistrictId): void {
    this.advanceEconomyToNow();
    try {
      const res = this.economy.buyRailway(districtId, {
        atMs: this.economy.clockMs,
        economyEventId: this.nextEconomyEventId(`rail-${districtId}`),
      });
      if (res.applied) {
        this.audio.playSe('audio_railway_synergy');
        void this.persistCitySnapshot(this.nextEconomyEventId(`persist-rail-${districtId}`));
      }
    } catch {
      // Guarded in UI
    }
    this.render();
  }

  buySynergy(synergyId: SynergyId): void {
    this.advanceEconomyToNow();
    try {
      const res = this.economy.buySynergy(synergyId, {
        atMs: this.economy.clockMs,
        economyEventId: this.nextEconomyEventId(`syn-${synergyId}`),
      });
      if (res.applied) {
        this.audio.playSe('audio_railway_synergy');
        void this.persistCitySnapshot(this.nextEconomyEventId(`persist-syn-${synergyId}`));
      }
    } catch {
      // Guarded in UI
    }
    this.render();
  }

  buyResearch(kind: ResearchId): void {
    this.advanceEconomyToNow();
    try {
      const res = this.economy.buyResearch(kind, {
        atMs: this.economy.clockMs,
        economyEventId: this.nextEconomyEventId(`res-${kind}`),
      });
      if (res.applied) {
        this.audio.playSe('audio_upgrade_buy');
        void this.persistCitySnapshot(this.nextEconomyEventId(`persist-res-${kind}`));
      }
    } catch {
      // Guarded in UI
    }
    this.render();
  }

  openDistrict(districtId: DistrictId): void {
    this.advanceEconomyToNow();
    try {
      const res = this.economy.openDistrict(districtId, {
        atMs: this.economy.clockMs,
        economyEventId: this.nextEconomyEventId(`open-${districtId}`),
      });
      if (res.applied) {
        this.audio.playSe('audio_district_open');
        void this.persistCitySnapshot(this.nextEconomyEventId(`persist-open-${districtId}`));
      }
    } catch {
      // Guarded in UI
    }
    this.render();
  }

  upgradeDistrict(districtId: DistrictId): void {
    this.advanceEconomyToNow();
    try {
      const nextStage = this.economy.districts[districtId].stage + 1;
      const res = this.economy.upgradeDistrict(districtId, {
        atMs: this.economy.clockMs,
        economyEventId: this.nextEconomyEventId(`upgrade-${districtId}-${nextStage}`),
      });
      if (res.applied !== false) {
        this.audio.playSe(res.openedDistricts.length > 0 ? 'audio_district_open' : 'audio_upgrade_buy');
        void this.persistCitySnapshot(this.nextEconomyEventId(`persist-upgrade-${districtId}-${nextStage}`));
      }
    } catch {
      // Guarded in UI
    }
    this.render();
  }

  confirmNewCity(landscape: LandscapeId): void {
    this.advanceEconomyToNow();
    try {
      const res = this.economy.startNewCity({
        confirmed: true,
        location: 'HOME',
        landscape,
        atMs: this.economy.clockMs,
        economyEventId: this.nextEconomyEventId('new-city'),
      });
      if (res.applied) {
        this.selectedDistrictId = 'residential';
        this.audio.playSe('audio_district_open');
        void this.persistCitySnapshot(this.nextEconomyEventId('persist-new-city'));
        this.screen = 'HOME';
      }
    } catch {
      // Guarded in UI
    }
    this.render();
  }

  // Handbook & Cosmetics
  pinAchievement(achievementId: string | null): void {
    this.updateSettings({ pinnedGoalAchievementId: achievementId });
  }

  markAchievementRead(achievementId: string): void {
    if (this.tabLockLost) {
      return;
    }
    this.audio.playSe('audio_ui_click');
    const key = `achievement:${achievementId}`;
    this.readState = {
      ...this.readState,
      [key]: {
        key,
        kind: 'achievement',
        targetId: achievementId,
        read: true,
        updatedAt: Date.now(),
      },
    };
    void this.repository.markAsRead({ achievementIds: [achievementId] }, this.lock).catch((err) => {
      if (err instanceof TabLockError) {
        this.handleTabLockLost();
      }
    });
    this.render();
  }

  equipTitle(titleId: string | null): void {
    this.updateSettings({ equippedTitleId: titleId });
  }

  equipFrame(frameId: string | null): void {
    this.updateSettings({ equippedFrameId: frameId });
  }

  // Settings & Data
  updateSettings(patch: Partial<Omit<ProfileSettingsRecord, 'id'>>): void {
    if (this.tabLockLost) {
      return;
    }
    this.settings = { ...this.settings, ...patch };
    this.applyAccessibilitySettings();
    this.audio.setPreferences({
      seEnabled: this.settings.volume > 0,
      bgmEnabled: this.bgmEnabled,
      volume: this.settings.volume,
    });
    this.audio.playSe('audio_ui_click');
    void this.repository.saveProfile(patch, this.lock).catch((err) => {
      if (err instanceof TabLockError) {
        this.handleTabLockLost();
      }
    });
    this.render();
  }

  setHighContrast(enabled: boolean): void {
    this.audio.playSe('audio_ui_click');
    this.highContrast = enabled;
    try {
      window.localStorage.setItem('kotobabin:highContrast', String(enabled));
    } catch {
      // Ignore storage restrictions
    }
    this.applyAccessibilitySettings();
    this.render();
  }

  testSoundEffect(): void {
    this.audio.playSe('audio_stamp_unlock');
  }

  private advanceResultReveal(): void {
    const total = this.lastResult?.evaluation.newlyUnlockedAchievementIds.length ?? 0;
    if (this.resultRevealIndex < total - 1) {
      this.resultRevealIndex += 1;
      this.audio.playSe('audio_stamp_unlock');
    } else {
      this.resultRevealDone = true;
      this.audio.playSe('audio_result_reveal');
    }
    this.render();
  }

  private skipResultReveal(): void {
    this.resultRevealDone = true;
    this.audio.playSe('audio_result_reveal');
    this.render();
  }

  private replayResultReveal(): void {
    this.resultRevealIndex = 0;
    this.resultRevealDone = false;
    this.audio.playSe('audio_stamp_unlock');
    this.render();
  }

  setBgmEnabled(enabled: boolean): void {
    this.bgmEnabled = enabled;
    try {
      window.localStorage.setItem('kotobabin:bgmEnabled', String(enabled));
    } catch {
      // Ignore storage restrictions
    }
    this.audio.setPreferences({
      seEnabled: this.settings.volume > 0,
      bgmEnabled: this.bgmEnabled,
      volume: this.settings.volume,
    });
    this.audio.playSe('audio_ui_click');
    this.syncBgmTrack();
    this.render();
  }

  setFontScale(scale: '1.0' | '1.15' | '1.3'): void {
    this.audio.playSe('audio_ui_click');
    this.fontScale = scale;
    try {
      window.localStorage.setItem('kotobabin:fontScale', scale);
    } catch {
      // Ignore storage restrictions
    }
    this.applyAccessibilitySettings();
    this.render();
  }

  exportSaveJson(): void {
    this.audio.playSe('audio_ui_click');
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: this.settings,
      city: this.economy.snapshot(),
      achievements: this.achievements.getSnapshot(),
      recentResults: this.recentResults,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kotobabin-save-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.settingsNotice = 'セーブデータを書き出しました。';
    this.render();
  }

  openResetConfirm(scope: 'records' | 'city_and_achievements' | 'settings'): void {
    this.audio.playSe('audio_ui_click');
    this.pendingResetConfirm = scope;
    this.settingsNotice = null;
    this.render();
  }

  cancelResetSave(): void {
    if (this.pendingResetConfirm === null) {
      return;
    }
    this.audio.playSe('audio_ui_click');
    this.pendingResetConfirm = null;
    this.render();
  }

  confirmResetSave(): void {
    const scope = this.pendingResetConfirm;
    if (!scope) {
      return;
    }
    this.pendingResetConfirm = null;
    this.resetSave(scope);
  }

  resetSave(scope: 'records' | 'city_and_achievements' | 'settings'): void {
    if (this.tabLockLost) {
      return;
    }
    this.pendingResetConfirm = null;
    this.audio.playSe('audio_ui_click');
    const prevTutorialCompleted = this.settings.tutorialCompleted;
    const prevOnboarding = this.settings.onboarding ? { ...this.settings.onboarding } : undefined;
    void this.repository.resetData(scope, this.lock).then(async (meta) => {
      this.lock = {
        tabId: meta.ownerTabId,
        writeEpoch: meta.writeEpoch,
        resetGeneration: meta.resetGeneration,
      };
      const loaded = await this.repository.loadAll();
      this.settings = loaded.profile;
      this.unlocks = loaded.unlocks;
      this.readState = loaded.readState;
      this.recentResults = loaded.results;
      if (scope === 'city_and_achievements') {
        this.economy = new CityEconomy(Date.now());
        this.paidEquipmentPurchaseCount = 0;
        this.achievements = new AchievementEngine();
        this.dictionary = new DictionaryTracker();
        this.settingsNotice = '街と手帳を初期化しました。';
      } else if (scope === 'settings') {
        this.fontScale = '1.0';
        this.highContrast = false;
        this.bgmEnabled = true;
        try {
          window.localStorage.removeItem('kotobabin:fontScale');
          window.localStorage.removeItem('kotobabin:highContrast');
          window.localStorage.removeItem('kotobabin:bgmEnabled');
        } catch {
          // Ignore storage restrictions
        }
        this.audio.setPreferences({
          seEnabled: this.settings.volume > 0,
          bgmEnabled: this.bgmEnabled,
          volume: this.settings.volume,
        });
        this.syncBgmTrack();
        this.applyAccessibilitySettings();
        if (prevTutorialCompleted || prevOnboarding) {
          const preserved: Partial<Omit<ProfileSettingsRecord, 'id'>> = {
            tutorialCompleted: prevTutorialCompleted,
            ...(prevOnboarding ? { onboarding: prevOnboarding } : {}),
          };
          await this.repository.saveProfile(preserved, this.lock);
          this.settings = { ...this.settings, ...preserved };
        }
        this.settingsNotice = '入力・表示・サウンドの設定を初期化しました。';
      } else {
        this.settingsNotice = '直近記録を初期化しました。';
      }
      const hasPriorActivity =
        this.recentResults.length > 0 ||
        BigInt(this.economy.snapshot().lifetime.arrived_micro) > 0n ||
        this.settings.tutorialCompleted;
      this.syncOnboardingStateFromProfile(hasPriorActivity);
      this.render();
    }).catch((err) => {
      if (err instanceof TabLockError) {
        this.handleTabLockLost();
      }
    });
  }

  dismissWelcomeBack(): void {
    this.audio.playSe('audio_ui_click');
    this.welcomeBack = null;
    this.render();
  }

  getSettings(): ProfileSettingsRecord {
    return this.settings;
  }

  getUnlocks(): Record<string, UnlockRecord> {
    return this.unlocks;
  }

  getReadState(): Record<string, ReadStateRecord> {
    return this.readState;
  }

  getRecentResults(): readonly RoundResultRecord[] {
    return this.recentResults;
  }

  getHighContrast(): boolean {
    return this.highContrast;
  }

  getFontScale(): '1.0' | '1.15' | '1.3' {
    return this.fontScale;
  }

  private getUnreadAchievementCount(): number {
    let count = 0;
    for (const id of Object.keys(this.unlocks)) {
      if (this.readState[`achievement:${id}`]?.read !== true) {
        count += 1;
      }
    }
    return count;
  }

  private getEquippedTitleName(): string | null {
    if (!this.settings.equippedTitleId) {
      return null;
    }
    const def = CATALOG_ACHIEVEMENTS.find((a) => a.title_id === this.settings.equippedTitleId);
    return def?.name ?? null;
  }

  private renderPlayInPlace(): void {
    if (!this.session || !this.playHostEl) {
      return;
    }
    const snap: SessionSnapshot = this.session.getSnapshot();
    const deliveryKey: DeliveryKeyOption =
      this.settings.deliveryKey === 'Space' ? 'Space' : 'Enter';
    if (snap.mode === 'TUTORIAL' && this.onboardingUi.active && this.onboardingUi.step === 'S5') {
      this.inputAdapter?.detach();
    }
    syncPlayScreen(
      this.playHostEl,
      {
        snapshot: snap,
        economy: this.economy,
        achievements: this.achievements,
        pinnedAchievementId: this.settings.pinnedGoalAchievementId,
        deliveryKey,
        feedback: this.playFeedback,
        onboarding: this.onboardingUi,
        onboardingInProgress: this.settings.onboarding?.status === 'in_progress',
        inputEl: this.playInputEl,
        actions: this,
      },
      this.initialStageSnapshot,
    );
  }

  render(): void {
    this.syncBgmTrack();
    this.inputAdapter?.detach();
    const shell = el('div', { className: 'kb-shell' });

    // Warnings (memory-only / tab-lock lost)
    if (this.repository.backend === 'memory') {
      shell.appendChild(
        el(
          'div',
          { className: 'kb-banner-warning', role: 'status' },
          'IndexedDB が利用できないため、メモリ保存モードで動作しています（再読み込みでデータは消えます）。',
        ),
      );
    }

    if (this.tabLockLost) {
      const reacquireBtn = el(
        'button',
        { type: 'button', className: 'kb-btn-secondary' },
        'このタブで再開する',
      );
      reacquireBtn.addEventListener('click', () => void this.reacquireTabLock());
      shell.appendChild(
        el(
          'div',
          { className: 'kb-banner-warning kb-row-between', role: 'alert' },
          el('span', {}, '別のタブで開かれたため、このタブの書き込みを停止しました。'),
          reacquireBtn,
        ),
      );
    }

    // Header
    if (this.screen === 'PLAY' && this.session) {
      const snap = this.session.getSnapshot();
      shell.appendChild(
        renderPlayHeader({
          mode: snap.mode,
          state: snap.state,
          courseId: snap.courseId,
          districtId: snap.districtId,
          onPause: () => this.pausePlay(),
        }),
      );
    } else if (this.screen === 'RESULT') {
      shell.appendChild(
        el(
          'header',
          { className: 'kb-header kb-result-header' },
          el(
            'div',
            { className: 'kb-brand' },
            el('span', {}, '配達結果レポート'),
            el('span', { className: 'kb-badge' }, '90秒お疲れさまでした！'),
          ),
          el(
            'div',
            { className: 'kb-header-stats' },
            el('span', { className: 'kb-stat-pill', 'data-testid': 'header-coins' }, `${formatCoins(this.economy.coinsMicro)} コイン`),
            (() => {
              const homeBtn = el(
                'button',
                { type: 'button', className: 'kb-btn-secondary', 'data-testid': 'result-header-home-btn' },
                el('span', {}, 'ホームへ'),
                el('kbd', { className: 'kb-kbd' }, 'H'),
              );
              homeBtn.addEventListener('click', () => this.navigate('HOME'));
              return homeBtn;
            })(),
          ),
        ),
      );
    } else {
      shell.appendChild(
        renderNormalHeader({
          currentScreen: this.screen,
          economy: this.economy,
          unreadCount: this.getUnreadAchievementCount(),
          equippedTitleName: this.getEquippedTitleName(),
          navLocked:
            this.screen === 'HOME' &&
            this.onboardingUi.active &&
            (this.onboardingUi.step === 'S1' || this.onboardingUi.step === 'S2'),
          onNavigate: (s) => this.navigate(s),
        }),
      );
    }

    // Main content
    const mainEl = el('main', { className: 'kb-main' });
    if (this.screen === 'PLAY' && this.session) {
      const host = el('div', { className: 'kb-play-host' });
      this.playHostEl = host;
      this.renderPlayInPlace();
      mainEl.appendChild(host);
    } else {
      this.playHostEl = null;
      switch (this.screen) {
        case 'HOME':
          mainEl.appendChild(
            renderHomeScreen({
              economy: this.economy,
              achievements: this.achievements,
              selectedCourseId: this.selectedCourseId,
              selectedDistrictId: this.selectedDistrictId,
              difficultyPopupOpen: this.difficultyPopupOpen,
              pinnedAchievementId: this.settings.pinnedGoalAchievementId,
              reducedMotion: this.settings.reduceMotion,
              onboarding: this.onboardingUi,
              actions: this,
            }),
          );
          break;
        case 'RESULT':
          if (this.lastResult) {
            mainEl.appendChild(
              renderResultScreen({
                result: this.lastResult,
                economy: this.economy,
                achievements: this.achievements,
                pinnedAchievementId: this.settings.pinnedGoalAchievementId,
                revealIndex: this.resultRevealIndex,
                revealDone: this.resultRevealDone,
                reducedMotion: this.settings.reduceMotion,
                actions: this,
                onAdvanceReveal: () => this.advanceResultReveal(),
                onSkipReveal: () => this.skipResultReveal(),
                onReplayReveal: () => this.replayResultReveal(),
                onRetrySameSeed: () => this.startMainRound(this.currentSeed),
                onRetryNewSeed: () => this.startMainRound(),
                onReviewMistakes: () => {
                  const firstMistakeId = this.lastMistakeWordIds[0];
                  const word = firstMistakeId ? this.dictionary.getWord(firstMistakeId) : undefined;
                  this.startPractice(word);
                },
              }),
            );
          }
          break;
        case 'UPGRADES':
          mainEl.appendChild(
            renderUpgradesScreen({
              economy: this.economy,
              selectedDistrictId: this.selectedDistrictId,
              selectedCategory: this.selectedUpgradeCategory,
              quantity: this.purchaseQuantity,
              actions: this,
            }),
          );
          break;
        case 'DISTRICT_DETAIL':
          mainEl.appendChild(
            renderDistrictDetailScreen({
              economy: this.economy,
              selectedDistrictId: this.selectedDistrictId,
              actions: this,
            }),
          );
          break;
        case 'NEW_CITY':
          mainEl.appendChild(
            renderNewCityScreen({
              economy: this.economy,
              selectedLandscape: this.selectedNewCityLandscape,
              onSelectLandscape: (ls) => {
                this.audio.playSe('audio_ui_click');
                this.selectedNewCityLandscape = ls;
                this.render();
              },
              actions: this,
            }),
          );
          break;
        case 'HANDBOOK':
          mainEl.appendChild(
            renderHandbookScreen({
              achievements: this.achievements,
              unlocks: this.unlocks,
              readState: this.readState,
              pinnedAchievementId: this.settings.pinnedGoalAchievementId,
              equippedTitleId: this.settings.equippedTitleId,
              equippedFrameId: this.settings.equippedFrameId,
              selectedFamily: this.handbookFamily,
              selectedAchievementId: this.handbookSelectedId,
              filter: this.handbookFilter,
              tab: this.handbookTab,
              revealedHiddenIds: this.revealedHiddenIds,
              onSelectFamily: (f) => {
                this.audio.playSe('audio_ui_click');
                this.handbookFamily = f;
                this.handbookSelectedId = null;
                this.render();
              },
              onSelectAchievement: (id) => {
                this.audio.playSe('audio_ui_click');
                this.handbookSelectedId = id;
                this.render();
              },
              onSetFilter: (f) => {
                this.audio.playSe('audio_ui_click');
                this.handbookFilter = f;
                this.render();
              },
              onSetTab: (t) => {
                this.audio.playSe('audio_ui_click');
                this.handbookTab = t;
                this.render();
              },
              onRevealHidden: (id) => {
                this.audio.playSe('audio_ui_click');
                this.revealedHiddenIds.add(id);
                this.render();
              },
              actions: this,
            }),
          );
          break;
        case 'DICTIONARY':
          mainEl.appendChild(
            renderDictionaryScreen({
              tracker: this.dictionary,
              state: this.dictionaryState,
              onUpdateState: (patch) => {
                this.audio.playSe('audio_ui_click');
                this.dictionaryState = { ...this.dictionaryState, ...patch };
                this.render();
              },
              onPracticeWord: (w) => this.startPractice(w),
            }),
          );
          break;
        case 'SETTINGS':
          mainEl.appendChild(
            renderSettingsScreen({
              settings: this.settings,
              bgmEnabled: this.bgmEnabled,
              highContrast: this.highContrast,
              fontScale: this.fontScale,
              storageBackend: this.repository.backend,
              pendingResetScope: this.pendingResetConfirm,
              settingsNotice: this.settingsNotice,
              actions: this,
            }),
          );
          break;
      }
    }
    shell.appendChild(mainEl);

    // Welcome-back modal
    if (this.welcomeBack && this.screen !== 'PLAY') {
      const r = this.welcomeBack.restore;
      const closeBtn = el('button', { type: 'button', className: 'kb-btn-primary' }, '受け取る');
      closeBtn.addEventListener('click', () => this.dismissWelcomeBack());

      const modal = el(
        'div',
        { className: 'kb-modal-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'おかえりなさい' },
        el(
          'div',
          { className: 'kb-card kb-modal kb-stack-md' },
          el('h2', { className: 'kb-h2' }, 'おかえりなさい'),
          el(
            'p',
            {},
            `前回の配達から ${formatDurationMs(r.wall_elapsed_ms)} 経過しました。${
              r.capped_ms > 0 ? '（オフライン上限の8時間分まで反映しています）' : ''
            }`,
          ),
          el(
            'dl',
            { className: 'kb-stat-list' },
            el('dt', {}, '到着した資材'),
            el('dd', {}, `${formatMaterials(r.arrived_micro)} 資材`),
            el('dt', {}, '店舗の売上'),
            el('dd', {}, `+${formatCoins(r.shop_coins_micro)} コイン`),
            el('dt', {}, '完成したLv'),
            el('dd', {}, `${r.completed.length}件`),
          ),
          closeBtn,
        ),
      );
      shell.appendChild(modal);
    }

    const prevMainScroll = this.mountEl.querySelector<HTMLElement>('.kb-main > *')?.scrollTop ?? 0;
    const prevLeftScroll = this.mountEl.querySelector<HTMLElement>('.kb-home-left')?.scrollTop ?? 0;

    this.mountEl.replaceChildren(shell);
    if (
      this.screen === 'PLAY' &&
      this.inputAdapter &&
      !(
        this.session?.currentMode === 'TUTORIAL' &&
        this.onboardingUi.active &&
        this.onboardingUi.step === 'S5'
      )
    ) {
      this.inputAdapter.attach();
    }

    const nextMain = this.mountEl.querySelector<HTMLElement>('.kb-main > *');
    if (nextMain && prevMainScroll > 0) {
      nextMain.scrollTop = prevMainScroll;
    }
    const nextLeft = this.mountEl.querySelector<HTMLElement>('.kb-home-left');
    if (nextLeft && prevLeftScroll > 0) {
      nextLeft.scrollTop = prevLeftScroll;
    }
  }

  private handleGlobalKeyDown(e: KeyboardEvent): void {
    this.audio.unlock();
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) {
      return;
    }

    if (this.welcomeBack && this.screen !== 'PLAY') {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        this.dismissWelcomeBack();
      }
      return;
    }

    if (this.screen === 'PLAY' && this.session) {
      const state = this.session.currentState;
      if (state === 'INPUT_CHECK') {
        if (e.key === 'a' || e.key === 'A') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          this.completeInputCheck();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.cancelInputCheck();
          return;
        }
        return;
      }
      if (state === 'PAUSED') {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          this.resumePlay();
        } else if (e.code === 'KeyR') {
          e.preventDefault();
          this.recheckImeFromPause();
        } else if (e.code === 'KeyS') {
          e.preventDefault();
          this.skipWordFromPause();
        } else if (e.code === 'KeyQ') {
          e.preventDefault();
          this.quitPlayToHome();
        }
        return;
      }
      if (this.session.currentMode === 'TUTORIAL') {
        if (
          this.onboardingUi.active &&
          this.onboardingUi.step === 'S5' &&
          (e.key === 'Enter' || e.key === 'Escape')
        ) {
          e.preventDefault();
          this.finishOnboardingToHome();
          return;
        }
        if (e.shiftKey && e.key === 'Enter') {
          e.preventDefault();
          this.skipOnboarding();
          this.startMainRound();
        }
        return;
      }
      if (this.session.currentMode === 'PRACTICE') {
        if (e.shiftKey && e.key === 'Enter') {
          e.preventDefault();
          this.tryMainFromPractice();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          this.nextPracticeWord();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.endPracticeToHome();
        }
        return;
      }
      return;
    }

    const active = document.activeElement;
    const isFormField =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement;
    if (isFormField) {
      if (e.key === 'Escape') {
        (active as HTMLElement).blur();
      }
      return;
    }

    if (this.screen === 'HOME' && this.onboardingUi.active) {
      if (e.key === 'Tab') {
        const selector =
          this.onboardingUi.step === 'S1'
            ? '.kb-coach-mark.is-step-s1 button:not(:disabled)'
            : '.kb-map-district-btn.is-onboard-target:not(:disabled), .kb-coach-mark.is-step-s2 button:not(:disabled)';
        const focusables = Array.from(this.mountEl.querySelectorAll<HTMLElement>(selector));
        if (focusables.length > 0) {
          e.preventDefault();
          const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);
          const nextIndex =
            currentIndex === -1
              ? e.shiftKey
                ? focusables.length - 1
                : 0
              : (currentIndex + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length;
          focusables[nextIndex]?.focus();
        } else {
          e.preventDefault();
        }
        return;
      }
      if (e.key === 'Enter') {
        if (
          active instanceof HTMLButtonElement &&
          (active.closest('.kb-coach-mark') || active.closest('.kb-map-district-btn'))
        ) {
          return;
        }
        e.preventDefault();
        if (this.onboardingUi.step === 'S1') {
          this.advanceOnboardingToDistrictSelect();
        }
        return;
      }
      if (e.key === ' ') {
        if (
          active instanceof HTMLButtonElement &&
          (active.closest('.kb-coach-mark') || active.closest('.kb-map-district-btn'))
        ) {
          return;
        }
        e.preventDefault();
        return;
      }
      e.preventDefault();
      return;
    }

    // Global screen navigation (1-5, Esc)
    if (e.code === 'Digit1') {
      e.preventDefault();
      this.navigate('HOME');
      return;
    }
    if (e.code === 'Digit2') {
      e.preventDefault();
      this.navigate('UPGRADES');
      return;
    }
    if (e.code === 'Digit3') {
      e.preventDefault();
      this.navigate('HANDBOOK');
      return;
    }
    if (e.code === 'Digit4') {
      e.preventDefault();
      this.navigate('DICTIONARY');
      return;
    }
    if (e.code === 'Digit5') {
      e.preventDefault();
      this.navigate('SETTINGS');
      return;
    }
    if (e.key === 'Escape') {
      if (this.screen === 'SETTINGS' && this.pendingResetConfirm !== null) {
        e.preventDefault();
        this.cancelResetSave();
        return;
      }
      if (this.screen === 'HOME' && this.difficultyPopupOpen) {
        e.preventDefault();
        this.closeDifficultyPopup();
        return;
      }
      if (this.screen === 'HOME' && !this.difficultyPopupOpen && this.onboardingUi.active) {
        e.preventDefault();
        this.skipOnboarding();
        return;
      }
      if (this.screen !== 'HOME') {
        e.preventDefault();
        this.navigate('HOME');
        return;
      }
    }

    const activeDistricts = DISTRICT_ORDER.filter((dId) => this.economy.districts[dId].open);

    if (this.screen === 'HOME') {
      if (e.key === 'Enter' && !(active instanceof HTMLButtonElement || active instanceof HTMLAnchorElement)) {
        e.preventDefault();
        if (this.difficultyPopupOpen) {
          this.startMainRound();
        } else if (this.onboardingUi.active) {
          if (this.onboardingUi.step === 'S1') {
            this.advanceOnboardingToDistrictSelect();
          }
        } else {
          this.openDifficultyPopup();
        }
      } else if (e.code === 'KeyT') {
        e.preventDefault();
        this.startTutorial();
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        this.startPractice();
      } else if (e.code === 'KeyD') {
        e.preventDefault();
        this.navigate('DISTRICT_DETAIL');
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const courses: readonly CourseId[] = ['relaxed', 'standard', 'challenge'];
        const idx = courses.indexOf(this.selectedCourseId);
        const nextIdx =
          e.key === 'ArrowDown'
            ? (idx + 1) % courses.length
            : (idx - 1 + courses.length) % courses.length;
        this.selectCourse(courses[nextIdx]);
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && activeDistricts.length > 1) {
        e.preventDefault();
        const idx = Math.max(0, activeDistricts.indexOf(this.selectedDistrictId));
        const nextIdx =
          e.key === 'ArrowRight'
            ? (idx + 1) % activeDistricts.length
            : (idx - 1 + activeDistricts.length) % activeDistricts.length;
        this.selectDistrict(activeDistricts[nextIdx]);
      }
    } else if (this.screen === 'RESULT') {
      const revealCount = this.lastResult?.evaluation.newlyUnlockedAchievementIds.length ?? 0;
      if (!this.resultRevealDone && revealCount > 0) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.advanceResultReveal();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.skipResultReveal();
        }
        return;
      }
      if (e.code === 'KeyH') {
        e.preventDefault();
        this.navigate('HOME');
      } else if (e.code === 'KeyU') {
        e.preventDefault();
        this.navigate('UPGRADES');
      }
    } else if (this.screen === 'UPGRADES') {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const cats: readonly UpgradeCategory[] = [
          'architecture',
          'packaging',
          'shops',
          'synergy',
          'railway',
          'crews',
          'research',
        ];
        const idx = cats.indexOf(this.selectedUpgradeCategory);
        const nextIdx =
          e.key === 'ArrowRight'
            ? (idx + 1) % cats.length
            : (idx - 1 + cats.length) % cats.length;
        this.setUpgradeCategory(cats[nextIdx]);
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && activeDistricts.length > 1) {
        e.preventDefault();
        const idx = Math.max(0, activeDistricts.indexOf(this.selectedDistrictId));
        const nextIdx =
          e.key === 'ArrowDown'
            ? (idx + 1) % activeDistricts.length
            : (idx - 1 + activeDistricts.length) % activeDistricts.length;
        this.selectDistrict(activeDistricts[nextIdx]);
      } else if (e.code === 'KeyQ') {
        e.preventDefault();
        const qtys: readonly PurchaseQuantity[] = [1, 10, 'max'];
        const idx = qtys.indexOf(this.purchaseQuantity);
        this.setPurchaseQuantity(qtys[(idx + 1) % qtys.length]);
      }
    } else if (this.screen === 'HANDBOOK') {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const tabs: readonly HandbookTab[] = ['stamps', 'collection'];
        const idx = tabs.indexOf(this.handbookTab);
        const nextIdx =
          e.key === 'ArrowRight'
            ? (idx + 1) % tabs.length
            : (idx - 1 + tabs.length) % tabs.length;
        this.audio.playSe('audio_ui_click');
        this.handbookTab = tabs[nextIdx];
        this.render();
      }
    } else if (this.screen === 'DICTIONARY') {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const filters = ['all', 'unfinished', 'completed', 'practicing', 'mastered'] as const;
        const idx = filters.indexOf(this.dictionaryState.status);
        const nextIdx =
          e.key === 'ArrowRight'
            ? (idx + 1) % filters.length
            : (idx - 1 + filters.length) % filters.length;
        this.audio.playSe('audio_ui_click');
        this.dictionaryState = { ...this.dictionaryState, status: filters[nextIdx], page: 0 };
        this.render();
      } else if (e.key === '/') {
        const searchEl = this.mountEl.querySelector<HTMLInputElement>('input[type="search"]');
        if (searchEl) {
          e.preventDefault();
          searchEl.focus();
        }
      }
    }
  }
}
