import { CourseGenerator } from './CourseGenerator';
import { RomajiEngine } from './RomajiEngine';
import type { SessionMode, Word } from './types';

export type SessionPhase = 'READY' | 'PLAYING' | 'PAUSED' | 'RESULT';
export type DeliveryReason = 'manual' | 'full' | 'deadline' | 'skip';
interface FactBase {
  sessionId: string;
  factSequence: number;
  eventId: string;
  mode: SessionMode;
  inputRuleVersion: 'romaji-1.0.0';
  confirmedAtMs: number;
}
export interface CompletedWord {
  wordId: string;
  topicId: string;
  tags: string[];
  canonicalLength: number;
  mistakes: number;
  acceptedKeys: number;
  clean: boolean;
  position: number;
  completedAtMs: number;
}
type FactPayload = (
  | ({ type: 'WordCompleted' } & CompletedWord)
  | { type: 'DeliveryCommitted'; reason: DeliveryReason; cargoCount: number; bonus: number; position: number; cargoWordIds: string[] }
  | { type: 'WordSkipped'; wordId: string; position: number }
  | { type: 'RoundFinished'; completed: boolean; result: SessionSnapshot }
);
export type SessionFact = FactBase & FactPayload;
export interface SessionSnapshot {
  phase: SessionPhase;
  mode: SessionMode;
  currentWord: Word;
  acceptedInput: string;
  remainingGuide: string;
  guide: string;
  score: number;
  baseScore: number;
  bonusScore: number;
  cargoCount: number;
  cargoValue: number;
  pendingBonus: number;
  nextBonus: number;
  correctKeys: number;
  mistakes: number;
  completedWords: number;
  completedHistory: CompletedWord[];
  wordIds: string[];
  remainingMs: number | null;
  elapsedMs: number;
  accuracy: number | null;
  canonicalKpm: number | null;
  canonicalLengthSum: number;
  wordStarted: boolean;
  wordHasMistake: boolean;
  wordMistakes: number;
  skips: number;
  maxCleanStreak: number;
  message: string;
}

/** Applies only confirmed input operations. Rendering and persistence never award points. */
export class GameSession {
  readonly mode: SessionMode;
  readonly sessionId: string;
  private phase: SessionPhase = 'READY';
  private returnPhase: 'READY' | 'PLAYING' = 'READY';
  private readonly nextWord: () => Word;
  private word: Word;
  private engine: RomajiEngine;
  private readonly history: CompletedWord[] = [];
  private readonly wordIds: string[] = [];
  private readonly cargo: { wordId: string; value: number }[] = [];
  private readonly facts: SessionFact[] = [];
  private factSequence = 0;
  private startedAtMs = 0;
  private accumulatedMs = 0;
  private baseScore = 0;
  private bonusScore = 0;
  private correctKeys = 0;
  private mistakes = 0;
  private wordMistakes = 0;
  private wordStarted = false;
  private skips = 0;
  private cleanStreak = 0;
  private maxCleanStreak = 0;
  private canonicalLengthSum = 0;
  private message = '';

  constructor(options: { words?: Word[]; generator?: CourseGenerator; mode?: SessionMode; sessionId?: string }) {
    this.mode = options.mode ?? 'MAIN';
    this.sessionId = options.sessionId ?? crypto.randomUUID();
    if (options.generator) this.nextWord = () => options.generator!.next();
    else {
      const words = options.words;
      if (!words?.length) throw new Error('GameSession needs a generator or at least one word');
      let index = 0;
      this.nextWord = () => words[index++ % words.length];
    }
    this.word = this.nextWord();
    this.wordIds.push(this.word.id);
    this.engine = new RomajiEngine(this.word.reading);
  }

  private elapsed(nowMs: number): number {
    const raw = this.accumulatedMs + (this.phase === 'PLAYING' ? Math.max(0, nowMs - this.startedAtMs) : 0);
    return this.mode === 'MAIN' ? Math.min(raw, 90_000) : raw;
  }
  private cargoValue(): number { return this.cargo.reduce((sum, item) => sum + item.value, 0); }
  private pendingBonus(): number { return Math.floor(this.cargoValue() * this.cargo.length / 5); }
  private emit(fact: FactPayload, nowMs: number): void {
    const factSequence = ++this.factSequence;
    this.facts.push({ ...fact, sessionId: this.sessionId, factSequence, eventId: `${this.sessionId}:${factSequence}`,
      mode: this.mode, inputRuleVersion: 'romaji-1.0.0', confirmedAtMs: nowMs } as SessionFact);
  }
  private deadline(nowMs: number): boolean {
    if (this.phase === 'PLAYING' && this.mode === 'MAIN' && this.elapsed(nowMs) >= 90_000) {
      this.finish(nowMs, true);
      return true;
    }
    return this.phase === 'RESULT';
  }
  private commitDelivery(reason: DeliveryReason, nowMs: number): void {
    if (!this.cargo.length) return;
    const bonus = this.pendingBonus();
    this.bonusScore += bonus;
    this.emit({ type: 'DeliveryCommitted', reason, cargoCount: this.cargo.length, bonus,
      position: this.history.length + this.skips, cargoWordIds: this.cargo.map((item) => item.wordId) }, nowMs);
    this.cargo.length = 0;
    this.message = reason === 'deadline' ? '最後の荷物を届けました' : `${bonus}点のボーナスを届けました`;
  }
  private advanceWord(): void {
    this.word = this.nextWord();
    this.wordIds.push(this.word.id);
    this.engine = new RomajiEngine(this.word.reading);
    this.wordStarted = false;
    this.wordMistakes = 0;
  }

  input(key: string, nowMs: number): SessionSnapshot {
    if (!/^[A-Za-z'-]$/.test(key) || this.phase === 'PAUSED' || this.deadline(nowMs)) return this.snapshot(nowMs);
    if (this.phase === 'READY') {
      this.phase = 'PLAYING';
      this.startedAtMs = nowMs;
    }
    this.wordStarted = true;
    const result = this.engine.input(key);
    if (!result.accepted) {
      this.mistakes++;
      this.wordMistakes++;
      this.cleanStreak = 0;
      const lost = this.pendingBonus();
      this.cargo.length = 0;
      this.message = lost ? `追加ボーナス${lost}点はなくなりました。完成点は残ります` : '入力済みの文字はそのまま。続きを打とう';
    } else {
      this.correctKeys++;
      this.message = '';
      if (result.completed) {
        const canonicalLength = this.engine.canonicalLength;
        const completion: CompletedWord = { wordId: this.word.id, topicId: this.word.topicId, tags: [...this.word.tags], canonicalLength,
          mistakes: this.wordMistakes, acceptedKeys: this.engine.acceptedInput.length, clean: this.wordMistakes === 0,
          position: this.history.length + this.skips + 1, completedAtMs: this.elapsed(nowMs) };
        this.baseScore += canonicalLength * 10;
        this.canonicalLengthSum += canonicalLength;
        this.history.push(completion);
        this.emit({ type: 'WordCompleted', ...completion }, nowMs);
        if (completion.clean) {
          this.cleanStreak++;
          this.maxCleanStreak = Math.max(this.maxCleanStreak, this.cleanStreak);
          this.cargo.push({ wordId: this.word.id, value: canonicalLength * 10 });
          if (this.cargo.length === 5) this.commitDelivery('full', nowMs);
        }
        this.advanceWord();
      }
    }
    return this.snapshot(nowMs);
  }

  deliver(nowMs: number): SessionSnapshot {
    if (this.phase === 'PAUSED' || this.deadline(nowMs)) return this.snapshot(nowMs);
    if (this.wordStarted) this.message = 'このことばを完成すると届けられます';
    else if (!this.cargo.length) this.message = '次のことばを完成させよう';
    else this.commitDelivery('manual', nowMs);
    return this.snapshot(nowMs);
  }

  tick(nowMs: number): SessionSnapshot {
    this.deadline(nowMs);
    return this.snapshot(nowMs);
  }

  pause(nowMs: number): SessionSnapshot {
    if (this.phase === 'PAUSED' || this.deadline(nowMs)) return this.snapshot(nowMs);
    this.returnPhase = this.phase as 'READY' | 'PLAYING';
    this.accumulatedMs = this.elapsed(nowMs);
    this.phase = 'PAUSED';
    return this.snapshot(nowMs);
  }

  /** The caller confirms focus before resuming; this operation never types a key. */
  resume(nowMs: number): SessionSnapshot {
    if (this.phase === 'PAUSED') {
      this.phase = this.returnPhase;
      this.startedAtMs = nowMs;
    }
    return this.snapshot(nowMs);
  }

  /** Only call after the pause UI has explained rescue-record consequences. */
  skip(nowMs: number): SessionSnapshot {
    if (this.phase !== 'PAUSED') return this.snapshot(nowMs);
    this.commitDelivery('skip', nowMs);
    this.skips++;
    this.cleanStreak = 0;
    this.emit({ type: 'WordSkipped', wordId: this.word.id, position: this.history.length + this.skips }, nowMs);
    this.advanceWord();
    return this.snapshot(nowMs);
  }

  /** Call only after explicit confirmation for an unfinished round. */
  finish(nowMs: number, completed = false): SessionSnapshot {
    if (this.phase === 'RESULT') return this.snapshot(nowMs);
    this.accumulatedMs = this.elapsed(nowMs);
    if (completed) this.commitDelivery('deadline', nowMs);
    this.phase = 'RESULT';
    const result = this.snapshot(nowMs);
    this.emit({ type: 'RoundFinished', completed, result }, nowMs);
    return result;
  }

  snapshot(nowMs: number): SessionSnapshot {
    const elapsedMs = this.elapsed(nowMs);
    const denominator = this.correctKeys + this.mistakes;
    const cargoValue = this.cargoValue();
    return { phase: this.phase, mode: this.mode, currentWord: this.word, acceptedInput: this.engine.acceptedInput,
      remainingGuide: this.engine.remainingGuide, guide: this.engine.guide,
      score: this.baseScore + this.bonusScore, baseScore: this.baseScore, bonusScore: this.bonusScore,
      cargoCount: this.cargo.length, cargoValue, pendingBonus: this.pendingBonus(),
      nextBonus: Math.floor((cargoValue + this.engine.canonicalLength * 10) * (this.cargo.length + 1) / 5),
      correctKeys: this.correctKeys, mistakes: this.mistakes, completedWords: this.history.length,
      completedHistory: this.history.map((item) => ({ ...item, tags: [...item.tags] })), wordIds: [...this.wordIds],
      remainingMs: this.mode === 'MAIN' ? Math.max(0, 90_000 - elapsedMs) : null, elapsedMs,
      accuracy: denominator ? this.correctKeys / denominator * 100 : null,
      canonicalKpm: elapsedMs > 0 ? this.canonicalLengthSum / (elapsedMs / 1000) * 60 : null,
      canonicalLengthSum: this.canonicalLengthSum, wordStarted: this.wordStarted, wordHasMistake: this.wordMistakes > 0,
      wordMistakes: this.wordMistakes, skips: this.skips, maxCleanStreak: this.maxCleanStreak, message: this.message };
  }

  drainEvents(): SessionFact[] { return this.facts.splice(0); }
}
