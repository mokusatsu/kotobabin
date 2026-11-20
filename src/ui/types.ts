import type { CourseId, DistrictId, LandscapeId, ResearchId, SynergyId, Word } from '@/contracts/types';
import type { EquipmentKind, PurchaseQuantity, RestoreResult, SessionSummary } from '@/economy/cityEconomy';
import type { SessionSnapshot } from '@/typing/gameSession';
import type { EvaluationResult, UnlockRecord } from '@/progression/achievementEngine';
import type {
  OnboardingReceipt,
  OnboardingStateRecord,
  OnboardingStatus,
  OnboardingStep,
  ProfileSettingsRecord,
  ReadStateRecord,
  RoundResultRecord,
} from '@/progression/profileRepository';

export type { OnboardingReceipt, OnboardingStateRecord, OnboardingStatus, OnboardingStep };

export type AppScreen =
  | 'HOME'
  | 'PLAY'
  | 'RESULT'
  | 'UPGRADES'
  | 'DISTRICT_DETAIL'
  | 'NEW_CITY'
  | 'HANDBOOK'
  | 'DICTIONARY'
  | 'SETTINGS';

export type UpgradeCategory =
  | 'architecture'
  | 'packaging'
  | 'crews'
  | 'shops'
  | 'railway'
  | 'synergy'
  | 'research';

export interface PlayUiFeedback {
  mistakeFlash: boolean;
  mistakeLabel: string | null;
  mistakeSeq: number;
  wordPopSeq: number;
  deliveryPopSeq: number;
  fullDeliveryFlash: boolean;
  midWordDeliveryAttempt: boolean;
  notice: string | null;
  imePauseReason: boolean;
  lastDeliveredCargoCount: number;
  lastDeliveryBonus: number | null;
  lastUnlockedStampNames: string[];
  lastUnlockedStampAssetIds: string[];
  tutorialStampUnlocked: boolean;
}

export interface OnboardingUiState {
  active: boolean;
  step: OnboardingStep;
  lockedDistrictNotice: string | null;
  collapseLessonShown: boolean;
  collapseSampleSeq: number;
  mistakeZeroCargoNoticeShown: boolean;
  actualCollapseNoticeShown: boolean;
  singleDeliveryNoticeShown: boolean;
  consecutiveFailedWords: number;
  rescueOffered: boolean;
  generatedMaterialsMicro: bigint;
  lastDeliveredCargoCount: number;
  lastDeliveredBonus: number;
  deliveryInTransit: boolean;
  deliveryArrived: boolean;
  saveFailed: boolean;
  upgradeTargetSelected: boolean;
  stampRevealIndex: number;
  receipt: OnboardingReceipt | null;
}

export interface LastResultContext {
  snapshot: SessionSnapshot;
  evaluation: EvaluationResult;
  economySummary: SessionSummary | null;
  districtBeforeStage: number;
  districtAfterStage: number;
  incomeBeforePerSecMicro: bigint;
  incomeAfterPerSecMicro: bigint;
}

export interface WelcomeBackModalState {
  restore: RestoreResult;
}

export interface UIControllerActions {
  navigate(screen: AppScreen): void;
  selectCourse(courseId: CourseId): void;
  selectDistrict(districtId: DistrictId): void;
  selectAndOpenDifficultyPopup(districtId: DistrictId): void;
  openDifficultyPopup(): void;
  closeDifficultyPopup(): void;
  startMainRoundWithCourse(courseId: CourseId): void;
  startMainRound(): void;
  startPractice(preferredWord?: Word): void;
  startTutorial(): void;
  advanceOnboardingToDistrictSelect(): void;
  skipOnboarding(): void;
  beginOnboardingConstruction(): void;
  advanceOnboardingStampReveal(): void;
  retryOnboardingArrival(): void;
  advanceOnboardingToEquipment(): void;
  finishOnboardingEquipment(): void;
  finishOnboardingToHome(): void;
  restartOnboarding(): void;
  resumePlay(): void;
  pausePlay(): void;
  recheckImeFromPause(): void;
  skipWordFromPause(): void;
  quitPlayToHome(): void;
  nextPracticeWord(): void;
  tryMainFromPractice(): void;
  endPracticeToHome(): void;
  commitManualDelivery(): void;
  focusPlayInput(): void;
  completeInputCheck(): void;
  cancelInputCheck(): void;
  setUpgradeCategory(category: UpgradeCategory): void;
  setPurchaseQuantity(qty: PurchaseQuantity): void;
  buyEquipment(kind: EquipmentKind): void;
  buyRailway(districtId: DistrictId): void;
  buySynergy(synergyId: SynergyId): void;
  buyResearch(kind: ResearchId): void;
  openDistrict(districtId: DistrictId): void;
  upgradeDistrict(districtId: DistrictId): void;
  confirmNewCity(landscape: LandscapeId): void;
  pinAchievement(achievementId: string | null): void;
  markAchievementRead(achievementId: string): void;
  equipTitle(titleId: string | null): void;
  equipFrame(frameId: string | null): void;
  updateSettings(patch: Partial<Omit<ProfileSettingsRecord, 'id'>>): void;
  setHighContrast(enabled: boolean): void;
  setBgmEnabled(enabled: boolean): void;
  setFontScale(scale: '1.0' | '1.15' | '1.3'): void;
  testSoundEffect(): void;
  exportSaveJson(): void;
  openResetConfirm(scope: 'records' | 'city_and_achievements' | 'settings'): void;
  confirmResetSave(): void;
  cancelResetSave(): void;
  resetSave(scope: 'records' | 'city_and_achievements' | 'settings'): void;
  reacquireTabLock(): void;
  dismissWelcomeBack(): void;
  getSettings(): ProfileSettingsRecord;
  getUnlocks(): Record<string, UnlockRecord>;
  getReadState(): Record<string, ReadStateRecord>;
  getRecentResults(): readonly RoundResultRecord[];
  getHighContrast(): boolean;
  getFontScale(): '1.0' | '1.15' | '1.3';
}
