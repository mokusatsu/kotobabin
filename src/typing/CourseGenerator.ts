import type { CourseId, DifficultyBand, Word } from './types';
export const GENERATOR_VERSION = 'bag-mulberry32-1.0.0';
const pattern: DifficultyBand[] = ['easy', 'medium', 'medium', 'hard', 'easy'];
export interface CoursePlan {
  generatorVersion: string;
  contentVersion: string;
  seed: number;
  courseId: CourseId;
  preferredWordId: string | null;
  id: string;
}
/** Deterministic independent bags. Gameplay outcomes never affect this generator. */
export class CourseGenerator {
  readonly plan: CoursePlan;
  readonly wordIds: string[] = [];
  private position = 0;
  private randomState: number;
  private readonly pools: Record<DifficultyBand, Word[]> = { easy: [], medium: [], hard: [] };
  private readonly bags: Record<DifficultyBand, Word[]> = { easy: [], medium: [], hard: [] };
  private readonly last: Partial<Record<DifficultyBand, string>> = {};
  private readonly preferred: Word | undefined;
  private readonly preferredPosition: number | undefined;
  constructor(words: Word[], options: { seed: number; courseId: CourseId; preferredWordId?: string | null }) {
    const seed = options.seed >>> 0;
    this.randomState = seed;
    const preferredWordId = options.preferredWordId ?? null;
    this.plan = { generatorVersion: GENERATOR_VERSION, contentVersion: '2.0.0', seed, courseId: options.courseId, preferredWordId,
      id: `${GENERATOR_VERSION}:2.0.0:${options.courseId}:${seed}:${preferredWordId ?? '-'}` };
    for (const word of [...words].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
      if (word.courseId === options.courseId) this.pools[word.difficultyBand].push(word);
    }
    for (const band of ['easy', 'medium', 'hard'] as const) {
      if (!this.pools[band].length) throw new Error(`Course has no ${band} words`);
    }
    if (preferredWordId) {
      this.preferred = words.find((word) => word.id === preferredWordId && word.courseId === options.courseId);
      if (!this.preferred) throw new Error('Preferred word must belong to this course');
      const positions = pattern.flatMap((band, index) => band === this.preferred!.difficultyBand ? [index] : []);
      this.preferredPosition = positions[Math.floor(this.random() * positions.length)];
      this.refill(this.preferred.difficultyBand);
      this.bags[this.preferred.difficultyBand] = this.bags[this.preferred.difficultyBand].filter((word) => word.id !== preferredWordId);
    }
  }
  private random(): number {
    let value = this.randomState += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
  private refill(band: DifficultyBand): void {
    const bag = [...this.pools[band]];
    for (let index = bag.length - 1; index > 0; index--) {
      const swap = Math.floor(this.random() * (index + 1));
      [bag[index], bag[swap]] = [bag[swap], bag[index]];
    }
    if (bag.length > 1 && bag[bag.length - 1].id === this.last[band]) {
      [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    this.bags[band] = bag;
  }
  next(): Word {
    const band = pattern[this.position % pattern.length];
    let word: Word;
    if (this.position === this.preferredPosition && this.preferred) word = this.preferred;
    else {
      if (!this.bags[band].length) this.refill(band);
      word = this.bags[band].pop()!;
    }
    this.last[band] = word.id;
    this.position++;
    this.wordIds.push(word.id);
    return word;
  }
}
