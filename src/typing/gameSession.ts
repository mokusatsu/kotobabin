import { ROMAJI_RULES } from '@/contracts/data';
import type {
  ConfirmedFact,
  CourseId,
  DeliveryCommittedFact,
  DeliveryReason,
  DistrictId,
  PracticeSessionEndedFact,
  RoundFinishedFact,
  SessionMode,
  SessionState,
  Word,
  WordCompletedFact,
} from '@/contracts/types';
import { RomajiEngine } from './romajiEngine';

export const ROUND_DURATION_MS = 90_000;
export const MAX_CARGO_COUNT = 5;

export function isScorableKey(key: string): boolean {
  return key.length === 1 && /^[a-z'-]$/i.test(key);
}

export function calculateDeliveryBonus(
  cargoBase: number,
  cargoCount: number,
): number {
  if (cargoCount <= 0 || cargoBase <= 0) {
    return 0;
  }
  return Math.floor((cargoBase * cargoCount) / MAX_CARGO_COUNT);
}

export type TutorialAction = { type: 'key'; key: string } | { type: 'skip' };

export interface TutorialSessionCheckpoint {
  sessionId: string;
  actions: TutorialAction[];
}

export interface GameSessionOptions {
  sessionId?: string;
  comparisonKey?: string;
  courseId?: CourseId;
  districtId?: DistrictId;
  mode?: SessionMode;
  initialState?: SessionState;
  words?: readonly Word[];
  wordProvider?: (index: number) => Word;
  now?: () => number;
  guideEnabled?: boolean;
  onFact?: (fact: ConfirmedFact) => void;
  tutorialCheckpoint?: TutorialSessionCheckpoint;
}

export interface KeyHandleResult {
  accepted: boolean;
  ignored: boolean;
  wordCompleted: boolean;
  autoDelivered: boolean;
  extraDelivered?: boolean;
  cargoLoaded?: boolean;
  dispatchBonus?: number;
  deadlineReached: boolean;
  guide: string;
  typed: string;
}

export interface SessionSnapshot {
  sessionId: string;
  mode: SessionMode;
  state: SessionState;
  courseId: CourseId;
  districtId: DistrictId;
  currentWord: Word;
  nextWord: Word;
  currentWordIndex: number;
  guide: string;
  typed: string;
  atWordBoundary: boolean;
  completedWordCount: number;
  correctKeyCount: number;
  mistakeCount: number;
  totalCanonicalLength: number;
  score: number;
  baseScore: number;
  deliveryBonus: number;
  cargoCount: number;
  cargoBase: number;
  pendingBonus: number;
  currentCleanStreak: number;
  wordMistakePositions: number;
  longestCleanStreak: number;
  skips: number;
  rescueUsed: boolean;
  guideEnabled: boolean;
  guideUsed: boolean;
  elapsedMs: number;
  remainingMs: number;
  accuracyRaw: number | null;
  accuracyDisplayed: string;
  canonicalKpm: number;
  canonicalKpmDisplayed: string;
}

let sessionCounter = 0;

export class GameSession {
  readonly sessionId: string;
  readonly courseId: CourseId;
  readonly districtId: DistrictId;
  readonly ruleVersion: string = ROMAJI_RULES.inputRuleVersion;

  private mode: SessionMode;
  private state: SessionState;
  private pausedFromState: SessionState | null = null;
  private inputCheckReturnState: SessionState = 'HOME';
  private launchTarget: SessionState = 'READY';

  private readonly getWord: (index: number) => Word;
  private readonly now: () => number;
  private readonly onFact?: (fact: ConfirmedFact) => void;
  private readonly emittedFacts: ConfirmedFact[] = [];
  private readonly comparisonKey?: string;
  private factSequence = 0;

  private currentWordIndex = 0;
  private currentWord: Word;
  private engine: RomajiEngine;
  private atWordBoundary = true;
  private wordMistakes = 0;
  private wordMistakePositions = 0;
  private lastMistakePosition = -1;
  private wordInputStartedAt: number | null = null;
  private wordPauseStartedAt: number | null = null;

  private completedWordCount = 0;
  private correctKeyCount = 0;
  private mistakeCount = 0;
  private totalCanonicalLength = 0;
  private baseScore = 0;
  private deliveryBonus = 0;
  private score = 0;

  private cargoCount = 0;
  private cargoBase = 0;
  private currentCleanStreak = 0;
  private cleanDeliveryBase = 0;
  private longestCleanStreak = 0;

  private skips = 0;
  private rescueUsed = false;
  private guideEnabled: boolean;
  private guideUsed: boolean;

  private activeStartMs: number | null = null;
  private accumulatedActiveMs = 0;
  private finished = false;
  private readonly tutorialActions: TutorialAction[] = [];
  private replayingTutorial = false;

  constructor(options: GameSessionOptions = {}) {
    sessionCounter += 1;
    this.comparisonKey = options.comparisonKey;
    this.sessionId = options.tutorialCheckpoint?.sessionId ?? options.sessionId ?? `session-${sessionCounter}`;
    this.courseId = options.courseId ?? 'relaxed';
    this.districtId = options.districtId ?? 'residential';
    this.mode = options.mode ?? 'MAIN';
    this.state =
      options.initialState ??
      (this.mode === 'PRACTICE'
        ? 'PRACTICE'
        : this.mode === 'TUTORIAL'
          ? 'TUTORIAL'
          : 'READY');

    if (options.wordProvider) {
      this.getWord = options.wordProvider;
    } else if (options.words && options.words.length > 0) {
      const list = options.words;
      this.getWord = (idx: number) => list[idx % list.length];
    } else {
      throw new Error('GameSession requires either words or wordProvider');
    }

    this.now = options.now ?? (() => performance.now());
    this.onFact = options.onFact;
    this.guideEnabled = options.guideEnabled ?? true;
    this.guideUsed = this.guideEnabled;

    this.currentWord = this.getWord(0);
    this.engine = new RomajiEngine(this.currentWord.reading);
    if (options.tutorialCheckpoint) {
      if (this.mode !== 'TUTORIAL') throw new Error('Only tutorial sessions can resume this checkpoint');
      this.replayingTutorial = true;
      for (const action of options.tutorialCheckpoint.actions) {
        if (action.type === 'key') this.handleKey(action.key);
        else if (action.type === 'skip') this.skipWord();
      }
      this.replayingTutorial = false;
      this.tutorialActions.push(...options.tutorialCheckpoint.actions);
    }
  }

  get facts(): readonly ConfirmedFact[] {
    return this.emittedFacts;
  }

  get currentState(): SessionState {
    return this.state;
  }

  get currentMode(): SessionMode {
    return this.mode;
  }

  getTutorialCheckpoint(): TutorialSessionCheckpoint {
    return { sessionId: this.sessionId, actions: [...this.tutorialActions] };
  }

  setGuideEnabled(enabled: boolean): void {
    this.guideEnabled = enabled;
    if (enabled) {
      this.guideUsed = true;
    }
  }

  enterInputCheck(launchTarget: SessionState = 'READY'): void {
    if (this.state === 'PAUSED') {
      this.inputCheckReturnState = 'PAUSED';
    } else {
      this.inputCheckReturnState = 'HOME';
      this.launchTarget = launchTarget;
    }
    this.state = 'INPUT_CHECK';
  }

  completeInputCheck(): void {
    if (this.state !== 'INPUT_CHECK') {
      return;
    }
    if (this.inputCheckReturnState === 'PAUSED') {
      this.state = 'PAUSED';
    } else {
      this.state = this.launchTarget;
      if (this.launchTarget === 'TUTORIAL') {
        this.mode = 'TUTORIAL';
      } else if (this.launchTarget === 'PRACTICE') {
        this.mode = 'PRACTICE';
      } else {
        this.mode = 'MAIN';
      }
    }
  }

  cancelInputCheck(): void {
    if (this.state !== 'INPUT_CHECK') {
      return;
    }
    this.state = this.inputCheckReturnState;
  }

  startRound(timestamp = this.now()): void {
    if (this.state !== 'READY') return;
    this.activeStartMs = timestamp;
    this.state = 'PLAYING';
  }

  getElapsedMs(timestamp?: number): number {
    const currentNow = timestamp ?? this.now();
    if (this.activeStartMs === null) {
      return this.accumulatedActiveMs;
    }
    return this.accumulatedActiveMs + Math.max(0, currentNow - this.activeStartMs);
  }

  getRemainingMs(timestamp?: number): number {
    if (this.mode !== 'MAIN') {
      return Infinity;
    }
    return Math.max(0, ROUND_DURATION_MS - this.getElapsedMs(timestamp));
  }

  tick(timestamp?: number): boolean {
    if (this.mode !== 'MAIN' || this.state !== 'PLAYING' || this.finished) {
      return false;
    }
    const currentNow = timestamp ?? this.now();
    const elapsed = this.getElapsedMs(currentNow);
    if (elapsed >= ROUND_DURATION_MS) {
      this.completeRoundByDeadline(currentNow);
      return true;
    }
    return false;
  }

  handleKey(key: string, timestamp?: number): KeyHandleResult {
    if (!isScorableKey(key)) {
      return {
        accepted: false,
        ignored: true,
        wordCompleted: false,
        autoDelivered: false,
        deadlineReached: false,
        guide: this.engine.guide,
        typed: this.engine.typedText,
      };
    }

    const currentNow = timestamp ?? this.now();

    if (this.state === 'READY') {
      this.activeStartMs = currentNow;
      this.state = 'PLAYING';
    } else if (
      this.state !== 'PLAYING' &&
      this.state !== 'TUTORIAL' &&
      this.state !== 'PRACTICE'
    ) {
      return {
        accepted: false,
        ignored: true,
        wordCompleted: false,
        autoDelivered: false,
        deadlineReached: false,
        guide: this.engine.guide,
        typed: this.engine.typedText,
      };
    }

    if (this.mode === 'MAIN' && this.state === 'PLAYING') {
      const elapsed = this.getElapsedMs(currentNow);
      if (elapsed >= ROUND_DURATION_MS) {
        this.completeRoundByDeadline(currentNow);
        return {
          accepted: false,
          ignored: false,
          wordCompleted: false,
          autoDelivered: false,
          deadlineReached: true,
          guide: this.engine.guide,
          typed: this.engine.typedText,
        };
      }
    }

    if (this.mode === 'TUTORIAL' && !this.replayingTutorial) {
      this.tutorialActions.push({ type: 'key', key });
    }
    this.atWordBoundary = false;
    this.wordInputStartedAt ??= currentNow;
    const stepResult = this.engine.step(key);

    if (!stepResult.accepted) {
      this.mistakeCount += 1;
      this.wordMistakes += 1;
      const position = stepResult.typed.length;
      if (position !== this.lastMistakePosition) {
        this.lastMistakePosition = position;
        this.wordMistakePositions += 1;
      }
      this.currentCleanStreak = 0;
      this.cleanDeliveryBase = 0;

      return {
        accepted: false,
        ignored: false,
        wordCompleted: false,
        autoDelivered: false,
        deadlineReached: false,
        guide: stepResult.guide,
        typed: stepResult.typed,
      };
    }

    this.correctKeyCount += 1;

    if (!stepResult.completed) {
      return {
        accepted: true,
        ignored: false,
        wordCompleted: false,
        autoDelivered: false,
        deadlineReached: false,
        guide: stepResult.guide,
        typed: stepResult.typed,
      };
    }

    // Word completed
    const completedWord = this.currentWord;
    const wordBase = 10 * completedWord.canonicalLength;
    this.completedWordCount += 1;
    this.totalCanonicalLength += completedWord.canonicalLength;
    this.baseScore += wordBase;
    this.score += wordBase;

    const cargoLoaded = this.wordMistakePositions < 2;
    const wordFact: WordCompletedFact = {
      type: 'WordCompleted',
      sessionId: this.sessionId,
      factSequence: ++this.factSequence,
      mode: this.mode,
      ruleVersion: this.ruleVersion,
      timestamp: currentNow,
      wordId: completedWord.id,
      topicId: completedWord.topicId,
      tags: [...completedWord.tags],
      canonicalLength: completedWord.canonicalLength,
      mistakes: this.wordMistakes,
      cargoLoaded,
      wordPosition: this.completedWordCount,
      inputElapsedMs: currentNow - this.wordInputStartedAt,
    };
    this.emitFact(wordFact);

    const previousBonus = this.deliveryBonus;
    if (cargoLoaded) {
      this.cargoCount += 1;
      this.cargoBase += wordBase;
    }
    const autoDelivered = this.cargoCount === MAX_CARGO_COUNT;
    if (autoDelivered) this.commitCargo('full', currentNow);

    let extraDelivered = false;
    if (this.wordMistakes === 0) {
      this.currentCleanStreak += 1;
      if (this.currentCleanStreak > this.longestCleanStreak) {
        this.longestCleanStreak = this.currentCleanStreak;
      }
      this.cleanDeliveryBase += wordBase;
      if (this.currentCleanStreak >= MAX_CARGO_COUNT) {
        this.emitDelivery('extra', 0, this.cleanDeliveryBase, currentNow);
        this.cleanDeliveryBase = 0;
        extraDelivered = true;
      }
    }

    this.advanceToNextWord();

    return {
      accepted: true,
      ignored: false,
      wordCompleted: true,
      autoDelivered,
      extraDelivered,
      cargoLoaded,
      dispatchBonus: this.deliveryBonus - previousBonus,
      deadlineReached: false,
      guide: this.engine.guide,
      typed: this.engine.typedText,
    };
  }

  pause(timestamp?: number): boolean {
    if (
      this.state === 'PAUSED' ||
      this.state === 'RESULT' ||
      this.state === 'HOME' ||
      this.state === 'INPUT_CHECK'
    ) {
      return false;
    }

    const currentNow = timestamp ?? this.now();

    if (this.mode === 'MAIN' && this.state === 'PLAYING') {
      const elapsed = this.getElapsedMs(currentNow);
      if (elapsed >= ROUND_DURATION_MS) {
        this.completeRoundByDeadline(currentNow);
        return false;
      }
      this.accumulatedActiveMs = elapsed;
      this.activeStartMs = null;
    }

    this.pausedFromState = this.state;
    this.wordPauseStartedAt = currentNow;
    this.state = 'PAUSED';
    return true;
  }

  resume(timestamp?: number): boolean {
    if (this.state !== 'PAUSED' || this.pausedFromState === null) {
      return false;
    }

    const currentNow = timestamp ?? this.now();
    const targetState = this.pausedFromState;
    this.pausedFromState = null;
    if (this.wordInputStartedAt !== null && this.wordPauseStartedAt !== null) {
      this.wordInputStartedAt += Math.max(0, currentNow - this.wordPauseStartedAt);
    }
    this.wordPauseStartedAt = null;
    this.state = targetState;

    if (targetState === 'PLAYING') {
      this.activeStartMs = currentNow;
    }
    return true;
  }

  skipWord(timestamp?: number): boolean {
    if (this.state !== 'PAUSED' && this.state !== 'TUTORIAL' && this.state !== 'PRACTICE') {
      return false;
    }

    const currentNow = timestamp ?? this.now();
    if (this.mode === 'TUTORIAL' && !this.replayingTutorial) {
      this.tutorialActions.push({ type: 'skip' });
    }
    if (this.cargoCount > 0) {
      this.commitCargo('skip', currentNow);
    }

    this.skips += 1;
    this.rescueUsed = true;
    this.currentCleanStreak = 0;
    this.cleanDeliveryBase = 0;
    this.advanceToNextWord();
    return true;
  }

  abort(endReason = 'aborted', timestamp?: number): void {
    if (this.finished) {
      return;
    }
    const currentNow = timestamp ?? this.now();
    const elapsed =
      this.mode === 'MAIN'
        ? this.state === 'PAUSED'
          ? this.accumulatedActiveMs
          : this.getElapsedMs(currentNow)
        : 0;

    if (this.mode === 'MAIN') {
      this.finished = true;
      this.activeStartMs = null;
      this.accumulatedActiveMs = elapsed;
      this.emitRoundFinished(false, currentNow, elapsed);
    } else if (this.mode === 'PRACTICE') {
      this.finished = true;
      this.emitPracticeEnded(endReason, currentNow);
    }

    this.state = 'HOME';
  }

  endPractice(endReason = 'completed', timestamp?: number): void {
    if (this.mode !== 'PRACTICE' || this.finished) {
      return;
    }
    const currentNow = timestamp ?? this.now();
    this.finished = true;
    this.emitPracticeEnded(endReason, currentNow);
  }

  getSnapshot(timestamp?: number): SessionSnapshot {
    const currentNow = timestamp ?? this.now();
    const elapsedMs =
      this.mode === 'MAIN'
        ? this.finished
          ? this.accumulatedActiveMs
          : this.getElapsedMs(currentNow)
        : 0;
    const totalKeys = this.correctKeyCount + this.mistakeCount;
    const accuracyRaw =
      totalKeys === 0 ? null : (this.correctKeyCount / totalKeys) * 100;
    const accuracyDisplayed =
      accuracyRaw === null ? '計測なし' : `${accuracyRaw.toFixed(1)}%`;
    const canonicalKpm =
      elapsedMs <= 0
        ? 0
        : (this.totalCanonicalLength / (elapsedMs / 1000)) * 60;

    return {
      sessionId: this.sessionId,
      mode: this.mode,
      state: this.state,
      courseId: this.courseId,
      districtId: this.districtId,
      currentWord: this.currentWord,
      nextWord: this.getWord(this.currentWordIndex + 1),
      currentWordIndex: this.currentWordIndex,
      guide: this.guideEnabled ? this.engine.guide : '',
      typed: this.engine.typedText,
      atWordBoundary: this.atWordBoundary,
      completedWordCount: this.completedWordCount,
      correctKeyCount: this.correctKeyCount,
      mistakeCount: this.mistakeCount,
      totalCanonicalLength: this.totalCanonicalLength,
      score: this.score,
      baseScore: this.baseScore,
      deliveryBonus: this.deliveryBonus,
      cargoCount: this.cargoCount,
      cargoBase: this.cargoBase,
      pendingBonus: calculateDeliveryBonus(this.cargoBase, this.cargoCount),
      currentCleanStreak: this.currentCleanStreak,
      wordMistakePositions: this.wordMistakePositions,
      longestCleanStreak: this.longestCleanStreak,
      skips: this.skips,
      rescueUsed: this.rescueUsed,
      guideEnabled: this.guideEnabled,
      guideUsed: this.guideUsed,
      elapsedMs,
      remainingMs:
        this.mode === 'MAIN'
          ? Math.max(0, ROUND_DURATION_MS - elapsedMs)
          : Infinity,
      accuracyRaw,
      accuracyDisplayed,
      canonicalKpm,
      canonicalKpmDisplayed: canonicalKpm.toFixed(1),
    };
  }

  private advanceToNextWord(): void {
    this.currentWordIndex += 1;
    this.currentWord = this.getWord(this.currentWordIndex);
    this.engine = new RomajiEngine(this.currentWord.reading);
    this.wordMistakes = 0;
    this.wordMistakePositions = 0;
    this.lastMistakePosition = -1;
    this.wordInputStartedAt = null;
    this.atWordBoundary = true;
  }

  private commitCargo(reason: Exclude<DeliveryReason, 'extra'>, timestamp: number): void {
    this.emitDelivery(reason, this.cargoCount, calculateDeliveryBonus(this.cargoBase, this.cargoCount), timestamp);
    this.cargoCount = 0;
    this.cargoBase = 0;
  }

  private emitDelivery(reason: DeliveryReason, cargoCount: number, bonus: number, timestamp: number): void {
    this.deliveryBonus += bonus;
    this.score += bonus;

    const fact: DeliveryCommittedFact = {
      type: 'DeliveryCommitted',
      sessionId: this.sessionId,
      factSequence: ++this.factSequence,
      mode: this.mode,
      ruleVersion: this.ruleVersion,
      timestamp,
      reason,
      cargoCount,
      bonus,
      precedingWordPosition: this.completedWordCount,
      elapsedMs: this.getElapsedMs(timestamp),
    };
    this.emitFact(fact);

  }

  private completeRoundByDeadline(timestamp: number): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.activeStartMs = null;
    this.accumulatedActiveMs = ROUND_DURATION_MS;

    if (this.cargoCount > 0) {
      this.commitCargo('deadline', timestamp);
    }

    this.emitRoundFinished(true, timestamp, ROUND_DURATION_MS);
    this.state = 'RESULT';
  }

  private emitRoundFinished(
    completed: boolean,
    timestamp: number,
    elapsedMs: number,
  ): void {
    const fact: RoundFinishedFact = {
      type: 'RoundFinished',
      sessionId: this.sessionId,
      factSequence: ++this.factSequence,
      mode: this.mode,
      ruleVersion: this.ruleVersion,
      timestamp,
      courseId: this.courseId,
      districtId: this.districtId,
      completed,
      completedWordCount: this.completedWordCount,
      correctKeyCount: this.correctKeyCount,
      mistakeCount: this.mistakeCount,
      totalCanonicalLength: this.totalCanonicalLength,
      score: this.score,
      baseScore: this.baseScore,
      deliveryBonus: this.deliveryBonus,
      longestCleanStreak: this.longestCleanStreak,
      rescueUsed: this.rescueUsed,
      skips: this.skips,
      guideUsed: this.guideUsed,
      elapsedMs,
      comparisonKey: this.comparisonKey,
    };
    this.emitFact(fact);
  }

  private emitPracticeEnded(endReason: string, timestamp: number): void {
    const fact: PracticeSessionEndedFact = {
      type: 'PracticeSessionEnded',
      sessionId: this.sessionId,
      factSequence: ++this.factSequence,
      mode: this.mode,
      ruleVersion: this.ruleVersion,
      timestamp,
      maxCleanStreak: this.longestCleanStreak,
      endReason,
    };
    this.emitFact(fact);
  }

  private emitFact(fact: ConfirmedFact): void {
    this.emittedFacts.push(fact);
    if (!this.replayingTutorial) this.onFact?.(fact);
  }
}
