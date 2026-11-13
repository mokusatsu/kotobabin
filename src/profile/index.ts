import content from '../../spec/initial/data/words.json';
import type { CourseId, SessionFact, SessionMode, Word } from '../typing';
export type { CourseId, SessionMode } from '../typing';
export type CollectionSetId = keyof typeof content.collectionSets;
export type CatalogueWord = Word & Omit<(typeof content.words)[number], keyof Word>;
// The canonical JSON is checked by the repository's content validator.
const catalogue = content.words as CatalogueWord[];

export interface WordProgress {
  completed: number;
  cleanCompleted: number;
  practiceCompleted: number;
  practiceCleanCompleted: number;
}

/** Captured at READY. Guide usage is sticky for the duration of a round. */
export interface RecordContext {
  courseId: CourseId;
  planId: string;
  contentVersion: string;
  generatorVersion: string;
  inputRuleVersion: string;
  scoringVersion: string;
  guideUsed: boolean;
  assisted: boolean;
}

export interface RoundRecord {
  sessionId: string;
  wordIds: string[];
  context: RecordContext;
  score: number;
  completedWords: number;
  canonicalLength: number;
  correctKeys: number;
  mistakes: number;
}

export interface RecordBest {
  bestScore: number;
  bestCanonicalLength: number;
  /** Separate eligible comparisons for D04/D05 require ten completed words. */
  growthBestScore: number | null;
  growthBestCanonicalLength: number | null;
}

export interface ProfileProgress {
  words: Record<string, WordProgress>;
  totalCompleted: number;
  factCursors: Record<string, number>;
  recentRounds: RoundRecord[];
  bestByComparison: Record<string, RecordBest>;
}

/** Projections of confirmed GameSession facts; not DOM or rendering events. */
export type ProfileFact = {
  sessionId: string;
  factSequence: number;
  mode: SessionMode;
} & (
  | { type: 'WordCompleted'; wordId: string; mistakes: number }
  | { type: 'RoundFinished'; completed: boolean; record: RoundRecord }
  | { type: 'Other' }
);

export function createProfileProgress(): ProfileProgress {
  return { words: {}, totalCompleted: 0, factCursors: {}, recentRounds: [], bestByComparison: {} };
}

export function comparisonKey(context: RecordContext): string {
  return JSON.stringify([
    context.courseId, context.planId, context.contentVersion, context.generatorVersion,
    context.inputRuleVersion, context.scoringVersion, context.guideUsed, context.assisted,
  ]);
}

/** Apply an ordered complete stream. Replays are ignored; gaps must be recovered first.
 * The caller persists returned state and cursor in the same transaction.
 */
export function applyProfileFact(state: ProfileProgress, fact: ProfileFact): ProfileProgress {
  const cursor = state.factCursors[fact.sessionId] ?? 0;
  if (fact.factSequence <= cursor) return state;
  if (fact.factSequence !== cursor + 1) throw new Error('Confirmed fact stream has a gap');
  const next: ProfileProgress = {
    ...state, factCursors: { ...state.factCursors, [fact.sessionId]: fact.factSequence },
  };
  if (fact.type === 'WordCompleted') {
    const previous = state.words[fact.wordId] ?? {
      completed: 0, cleanCompleted: 0, practiceCompleted: 0, practiceCleanCompleted: 0,
    };
    const clean = fact.mistakes === 0 ? 1 : 0;
    const practice = fact.mode === 'PRACTICE' ? 1 : 0;
    next.words = { ...state.words, [fact.wordId]: {
      completed: previous.completed + 1,
      cleanCompleted: previous.cleanCompleted + clean,
      practiceCompleted: previous.practiceCompleted + practice,
      practiceCleanCompleted: previous.practiceCleanCompleted + practice * clean,
    } };
    next.totalCompleted = state.totalCompleted + 1;
  } else if (fact.type === 'RoundFinished' && fact.mode === 'MAIN' && fact.completed) {
    const record = { ...fact.record, wordIds: [...fact.record.wordIds], context: { ...fact.record.context } };
    const key = comparisonKey(record.context);
    const previous = state.bestByComparison[key];
    const eligibleGrowth = !record.context.assisted && record.completedWords >= 10;
    next.recentRounds = [...state.recentRounds, record].slice(-30);
    next.bestByComparison = { ...state.bestByComparison, [key]: {
      bestScore: Math.max(previous?.bestScore ?? 0, record.score),
      bestCanonicalLength: Math.max(previous?.bestCanonicalLength ?? 0, record.canonicalLength),
      growthBestScore: eligibleGrowth
        ? Math.max(previous?.growthBestScore ?? 0, record.score) : previous?.growthBestScore ?? null,
      growthBestCanonicalLength: eligibleGrowth
        ? Math.max(previous?.growthBestCanonicalLength ?? 0, record.canonicalLength)
        : previous?.growthBestCanonicalLength ?? null,
    } };
  }
  return next;
}

export function practiceQualifiedWordIds(state: ProfileProgress): string[] {
  return Object.keys(state.words).filter(id => state.words[id].practiceCleanCompleted >= 3).sort();
}

export function collectionProgress(state: ProfileProgress, collectionSet: CollectionSetId) {
  const ids = content.collectionSets[collectionSet];
  const completed = ids.filter(id => (state.words[id]?.completed ?? 0) > 0).length;
  return { completed, total: ids.length };
}

export interface CatalogueFilter {
  query?: string;
  courseId?: CourseId;
  topicId?: string;
  collectionSet?: CollectionSetId;
  uncompleted?: boolean;
  practicing?: boolean;
  practiceQualified?: boolean;
}

/** Uses the fixed catalogue order so next-word navigation stays deterministic. */
export function filterCatalogue(state: ProfileProgress, filter: CatalogueFilter = {}): CatalogueWord[] {
  const selectedIds = filter.collectionSet ? new Set(content.collectionSets[filter.collectionSet]) : null;
  const query = filter.query?.trim();
  return catalogue.filter(word => {
    const progress = state.words[word.id];
    const qualified = (progress?.practiceCleanCompleted ?? 0) >= 3;
    return (!query || word.display.includes(query) || word.reading.includes(query))
      && (!filter.courseId || word.courseId === filter.courseId)
      && (!filter.topicId || word.topicId === filter.topicId)
      && (!selectedIds || selectedIds.has(word.id))
      && (!filter.uncompleted || !progress?.completed)
      && (!filter.practicing || ((progress?.practiceCompleted ?? 0) > 0 && !qualified))
      && (!filter.practiceQualified || qualified);
  });
}

export interface WordAttempt {
  wordId: string;
  wordPosition: number;
  mistakes: number;
}

/** Includes unfinished attempts; repeated words combine mistakes and keep first position. */
export function reviewWordIds(attempts: readonly WordAttempt[]): string[] {
  const combined = new Map<string, { mistakes: number; position: number }>();
  for (const attempt of attempts) {
    if (attempt.mistakes === 0) continue;
    const previous = combined.get(attempt.wordId);
    combined.set(attempt.wordId, {
      mistakes: (previous?.mistakes ?? 0) + attempt.mistakes,
      position: Math.min(previous?.position ?? attempt.wordPosition, attempt.wordPosition),
    });
  }
  return [...combined.entries()]
    .sort((a, b) => b[1].mistakes - a[1].mistakes || a[1].position - b[1].position)
    .slice(0, 10).map(([id]) => id);
}

/** Bridge for the canonical engine. Pass every fact in sequence, including deliveries.
 * context must contain the final sticky guide/assistance flags at RoundFinished.
 */
export function applySessionFact(
  state: ProfileProgress, fact: SessionFact, context: RecordContext,
): ProfileProgress {
  const base = { sessionId: fact.sessionId, factSequence: fact.factSequence, mode: fact.mode };
  if (fact.type === 'WordCompleted') {
    return applyProfileFact(state, { ...base, type: fact.type, wordId: fact.wordId, mistakes: fact.mistakes });
  }
  if (fact.type === 'RoundFinished') {
    const result = fact.result;
    return applyProfileFact(state, { ...base, type: fact.type, completed: fact.completed, record: {
      sessionId: fact.sessionId, wordIds: [...result.wordIds],
      context: { ...context, guideUsed: context.guideUsed || result.guideUsed || fact.guideUsed, assisted: context.assisted || result.skips > 0 },
      score: result.score, completedWords: result.completedWords,
      canonicalLength: result.canonicalLengthSum, correctKeys: result.correctKeys, mistakes: result.mistakes,
    } });
  }
  return applyProfileFact(state, { ...base, type: 'Other' });
}

export * from './repository';

export * from './achievements';
