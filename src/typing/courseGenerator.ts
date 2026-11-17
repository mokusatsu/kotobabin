import { WORDS_DATA } from '@/contracts/data';
import type { CourseId, DifficultyBand, Word } from '@/contracts/types';

export const GENERATOR_VERSION = '1.0.0';
export const WAVE_PATTERN: readonly DifficultyBand[] = [
  'easy',
  'medium',
  'medium',
  'hard',
  'easy',
];

export interface CoursePlan {
  generatorVersion: string;
  contentVersion: string;
  courseId: CourseId;
  seed: number;
  preferredWordId: string | null;
}

/**
 * Deterministic 32-bit seeded PRNG (Mulberry32).
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithRng<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

const BAND_SLOTS_IN_WAVE: Record<DifficultyBand, readonly number[]> = {
  easy: [0, 4],
  medium: [1, 2],
  hard: [3],
};

export interface CourseGeneratorOptions {
  courseId: CourseId;
  seed: number;
  preferredWordId?: string | null;
  words?: readonly Word[];
}

export class CourseGenerator {
  readonly plan: CoursePlan;

  private readonly rng: () => number;
  private readonly pools: Record<DifficultyBand, Word[]>;
  private readonly bags: Record<DifficultyBand, Word[]> = {
    easy: [],
    medium: [],
    hard: [],
  };
  private readonly lastDrawnByBand: Record<DifficultyBand, string | null> = {
    easy: null,
    medium: null,
    hard: null,
  };
  private readonly generated: Word[] = [];
  private readonly preferredSlot: number | null = null;
  private readonly preferredWord: Word | null = null;

  constructor(options: CourseGeneratorOptions) {
    const {
      courseId,
      seed,
      preferredWordId = null,
      words = WORDS_DATA.words,
    } = options;

    this.plan = {
      generatorVersion: GENERATOR_VERSION,
      contentVersion: WORDS_DATA.contentVersion,
      courseId,
      seed,
      preferredWordId,
    };

    this.rng = createSeededRng(seed);

    const courseWords = words.filter((w) => w.courseId === courseId);
    this.pools = {
      easy: courseWords.filter((w) => w.difficultyBand === 'easy'),
      medium: courseWords.filter((w) => w.difficultyBand === 'medium'),
      hard: courseWords.filter((w) => w.difficultyBand === 'hard'),
    };

    if (preferredWordId !== null) {
      const target = courseWords.find((w) => w.id === preferredWordId);
      if (!target) {
        throw new Error(
          `Preferred word "${preferredWordId}" not found in course "${courseId}"`,
        );
      }
      this.preferredWord = target;
      const slots = BAND_SLOTS_IN_WAVE[target.difficultyBand];
      this.preferredSlot = slots[Math.floor(this.rng() * slots.length)];
    }

    this.refillBag('easy', this.preferredWord?.id ?? null);
    this.refillBag('medium', this.preferredWord?.id ?? null);
    this.refillBag('hard', this.preferredWord?.id ?? null);
  }

  getWordAt(index: number): Word {
    while (this.generated.length <= index) {
      const nextIdx = this.generated.length;
      if (this.preferredWord && this.preferredSlot === nextIdx) {
        this.lastDrawnByBand[this.preferredWord.difficultyBand] =
          this.preferredWord.id;
        this.generated.push(this.preferredWord);
        continue;
      }

      const band = WAVE_PATTERN[nextIdx % WAVE_PATTERN.length];
      const word = this.drawFromBand(band);
      this.generated.push(word);
    }
    return this.generated[index];
  }

  peekWords(count: number, startIndex = 0): Word[] {
    const result: Word[] = [];
    for (let i = 0; i < count; i++) {
      result.push(this.getWordAt(startIndex + i));
    }
    return result;
  }

  private refillBag(band: DifficultyBand, excludeId: string | null): void {
    const source = this.pools[band];
    if (source.length === 0) {
      throw new Error(
        `No words available for course "${this.plan.courseId}" band "${band}"`,
      );
    }
    const filtered =
      excludeId && source.length > 1
        ? source.filter((w) => w.id !== excludeId)
        : source;
    const shuffled = shuffleWithRng(filtered, this.rng);

    const lastId = this.lastDrawnByBand[band];
    if (lastId && shuffled.length > 1 && shuffled[0].id === lastId) {
      const swapIdx = shuffled.findIndex((w) => w.id !== lastId);
      if (swapIdx > 0) {
        const tmp = shuffled[0];
        shuffled[0] = shuffled[swapIdx];
        shuffled[swapIdx] = tmp;
      }
    }

    this.bags[band] = shuffled;
  }

  private drawFromBand(band: DifficultyBand): Word {
    if (this.bags[band].length === 0) {
      this.refillBag(band, null);
    }
    const word = this.bags[band].shift()!;
    this.lastDrawnByBand[band] = word.id;
    return word;
  }
}

export function getTutorialIds(): readonly string[] {
  return WORDS_DATA.tutorialIds;
}

export function getPrototypeIds(): readonly string[] {
  return WORDS_DATA.prototypeIds;
}

export function getTutorialWords(words: readonly Word[] = WORDS_DATA.words): Word[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  return WORDS_DATA.tutorialIds
    .map((id) => byId.get(id))
    .filter((w): w is Word => w !== undefined);
}

export function getPrototypeWords(
  words: readonly Word[] = WORDS_DATA.words,
): Word[] {
  const byId = new Map(words.map((w) => [w.id, w]));
  return WORDS_DATA.prototypeIds
    .map((id) => byId.get(id))
    .filter((w): w is Word => w !== undefined);
}
