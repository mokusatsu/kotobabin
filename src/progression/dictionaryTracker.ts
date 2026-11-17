import legacyWordIndexData from '@spec-data/legacy_word_index_v1.json';
import { WORDS_DATA } from '@/contracts/data';
import type { CourseId, TopicId, Word } from '@/contracts/types';

export interface LegacyWordEntry {
  id: string;
  display: string;
  reading: string;
  courseId: CourseId;
  topicId: TopicId;
  canonicalLength: number;
}

interface LegacyWordIndexDataset {
  schemaVersion: string;
  dictionarySetId: string;
  words: LegacyWordEntry[];
}

const LEGACY_WORD_INDEX = legacyWordIndexData as unknown as LegacyWordIndexDataset;

export const LEGACY_240_SET_ID = LEGACY_WORD_INDEX.dictionarySetId; // 'kotobabin-ja-240-v1'
export const CURRENT_960_SET_ID = WORDS_DATA.dictionarySetId; // 'kotobabin-ja-960-v2'

export const LEGACY_240_WORD_IDS: ReadonlySet<string> = new Set(
  LEGACY_WORD_INDEX.words.map((w) => w.id),
);

export const ALL_960_WORD_IDS: ReadonlySet<string> = new Set(
  WORDS_DATA.words.map((w) => w.id),
);

export const COURSE_WORD_COUNTS: Record<CourseId, number> = {
  relaxed: WORDS_DATA.words.filter((w) => w.courseId === 'relaxed').length,
  standard: WORDS_DATA.words.filter((w) => w.courseId === 'standard').length,
  challenge: WORDS_DATA.words.filter((w) => w.courseId === 'challenge').length,
};

export const TOPIC_WORD_COUNTS: Record<TopicId, number> = {
  daily: WORDS_DATA.words.filter((w) => w.topicId === 'daily').length,
  food: WORDS_DATA.words.filter((w) => w.topicId === 'food').length,
  living: WORDS_DATA.words.filter((w) => w.topicId === 'living').length,
  town: WORDS_DATA.words.filter((w) => w.topicId === 'town').length,
  nature: WORDS_DATA.words.filter((w) => w.topicId === 'nature').length,
  people: WORDS_DATA.words.filter((w) => w.topicId === 'people').length,
};

export const CLEAN_PRACTICE_MASTERY_TARGET = 3;

export type DictionaryCollectionFilter = 'all' | 'legacy240' | CourseId;
export type DictionaryStatusFilter =
  | 'all'
  | 'unfinished'
  | 'completed'
  | 'practicing'
  | 'mastered';

export interface DictionaryFilterOptions {
  collection?: DictionaryCollectionFilter;
  topic?: 'all' | TopicId;
  status?: DictionaryStatusFilter;
  search?: string;
}

export interface DictionaryWordStatus {
  word: Word;
  completed: boolean;
  isLegacy240: boolean;
  practiceCleanCount: number;
  practiceMasteryDisplay: '0/3' | '1/3' | '2/3' | '3/3';
  practiceMastered: boolean;
}

export interface DictionarySummary {
  totalWords: number;
  completedWords: number;
  legacyTotalWords: number;
  legacyCompletedWords: number;
  masteredWords: number;
  byCourse: Record<CourseId, { completed: number; total: number }>;
  byTopic: Record<TopicId, { completed: number; total: number }>;
}

/**
 * Tracks word completion across all 960 words, legacy 240-word membership,
 * and clean-3 practice mastery (0/3 .. 3/3) without mutating source catalogs.
 */
export class DictionaryTracker {
  private readonly completedIds: Set<string>;
  private readonly practiceCleanCounts: Map<string, number>;
  private readonly wordById: Map<string, Word>;

  constructor(
    completedWordIds: Iterable<string> = [],
    practiceCleanCounts: Record<string, number> = {},
  ) {
    this.completedIds = new Set(completedWordIds);
    this.practiceCleanCounts = new Map(Object.entries(practiceCleanCounts));
    this.wordById = new Map(WORDS_DATA.words.map((w) => [w.id, w]));
  }

  getWord(wordId: string): Word | undefined {
    return this.wordById.get(wordId);
  }

  isCompleted(wordId: string): boolean {
    return this.completedIds.has(wordId);
  }

  isLegacy240(wordId: string): boolean {
    return LEGACY_240_WORD_IDS.has(wordId);
  }

  getPracticeCleanCount(wordId: string): number {
    return this.practiceCleanCounts.get(wordId) ?? 0;
  }

  isPracticeMastered(wordId: string): boolean {
    return this.getPracticeCleanCount(wordId) >= CLEAN_PRACTICE_MASTERY_TARGET;
  }

  getPracticeMasteryDisplay(wordId: string): '0/3' | '1/3' | '2/3' | '3/3' {
    const clamped = Math.min(
      CLEAN_PRACTICE_MASTERY_TARGET,
      Math.max(0, this.getPracticeCleanCount(wordId)),
    );
    return `${clamped}/3` as '0/3' | '1/3' | '2/3' | '3/3';
  }

  markCompleted(wordId: string): boolean {
    if (!this.wordById.has(wordId)) {
      return false;
    }
    const sizeBefore = this.completedIds.size;
    this.completedIds.add(wordId);
    return this.completedIds.size > sizeBefore;
  }

  recordCleanPractice(wordId: string): number {
    const next = this.getPracticeCleanCount(wordId) + 1;
    this.practiceCleanCounts.set(wordId, next);
    return next;
  }

  getWordStatus(wordId: string): DictionaryWordStatus | undefined {
    const word = this.wordById.get(wordId);
    if (!word) {
      return undefined;
    }
    const practiceCleanCount = this.getPracticeCleanCount(wordId);
    return {
      word,
      completed: this.completedIds.has(wordId),
      isLegacy240: LEGACY_240_WORD_IDS.has(wordId),
      practiceCleanCount,
      practiceMasteryDisplay: this.getPracticeMasteryDisplay(wordId),
      practiceMastered: practiceCleanCount >= CLEAN_PRACTICE_MASTERY_TARGET,
    };
  }

  filterWords(options: DictionaryFilterOptions = {}): DictionaryWordStatus[] {
    const {
      collection = 'all',
      topic = 'all',
      status = 'all',
      search = '',
    } = options;
    const normalizedQuery = search.trim().toLowerCase();

    const results: DictionaryWordStatus[] = [];
    for (const word of WORDS_DATA.words) {
      if (collection === 'legacy240' && !LEGACY_240_WORD_IDS.has(word.id)) {
        continue;
      }
      if (
        (collection === 'relaxed' ||
          collection === 'standard' ||
          collection === 'challenge') &&
        word.courseId !== collection
      ) {
        continue;
      }
      if (topic !== 'all' && word.topicId !== topic) {
        continue;
      }

      const completed = this.completedIds.has(word.id);
      const cleanCount = this.getPracticeCleanCount(word.id);
      const mastered = cleanCount >= CLEAN_PRACTICE_MASTERY_TARGET;

      if (status === 'unfinished' && completed) {
        continue;
      }
      if (status === 'completed' && !completed) {
        continue;
      }
      if (status === 'practicing' && (cleanCount === 0 || mastered)) {
        continue;
      }
      if (status === 'mastered' && !mastered) {
        continue;
      }

      if (normalizedQuery.length > 0) {
        const matchesDisplay = word.display.toLowerCase().includes(normalizedQuery);
        const matchesReading = word.reading.toLowerCase().includes(normalizedQuery);
        const matchesId = word.id.toLowerCase().includes(normalizedQuery);
        if (!matchesDisplay && !matchesReading && !matchesId) {
          continue;
        }
      }

      results.push({
        word,
        completed,
        isLegacy240: LEGACY_240_WORD_IDS.has(word.id),
        practiceCleanCount: cleanCount,
        practiceMasteryDisplay: this.getPracticeMasteryDisplay(word.id),
        practiceMastered: mastered,
      });
    }

    return results;
  }

  getMasteredWordIds(): string[] {
    const mastered: string[] = [];
    for (const [wordId, count] of this.practiceCleanCounts.entries()) {
      if (count >= CLEAN_PRACTICE_MASTERY_TARGET) {
        mastered.push(wordId);
      }
    }
    return mastered;
  }

  getSummary(): DictionarySummary {
    const byCourse: Record<CourseId, { completed: number; total: number }> = {
      relaxed: { completed: 0, total: COURSE_WORD_COUNTS.relaxed },
      standard: { completed: 0, total: COURSE_WORD_COUNTS.standard },
      challenge: { completed: 0, total: COURSE_WORD_COUNTS.challenge },
    };
    const byTopic: Record<TopicId, { completed: number; total: number }> = {
      daily: { completed: 0, total: TOPIC_WORD_COUNTS.daily },
      food: { completed: 0, total: TOPIC_WORD_COUNTS.food },
      living: { completed: 0, total: TOPIC_WORD_COUNTS.living },
      town: { completed: 0, total: TOPIC_WORD_COUNTS.town },
      nature: { completed: 0, total: TOPIC_WORD_COUNTS.nature },
      people: { completed: 0, total: TOPIC_WORD_COUNTS.people },
    };

    let completedWords = 0;
    let legacyCompletedWords = 0;
    let masteredWords = 0;

    for (const word of WORDS_DATA.words) {
      if (this.completedIds.has(word.id)) {
        completedWords += 1;
        byCourse[word.courseId].completed += 1;
        byTopic[word.topicId].completed += 1;
        if (LEGACY_240_WORD_IDS.has(word.id)) {
          legacyCompletedWords += 1;
        }
      }
      if (this.isPracticeMastered(word.id)) {
        masteredWords += 1;
      }
    }

    return {
      totalWords: WORDS_DATA.words.length,
      completedWords,
      legacyTotalWords: LEGACY_240_WORD_IDS.size,
      legacyCompletedWords,
      masteredWords,
      byCourse,
      byTopic,
    };
  }
}
