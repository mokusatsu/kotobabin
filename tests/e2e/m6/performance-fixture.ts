import content from '../../../spec/initial/data/words.json';
import { GameSession, type Word } from '../../../src/typing';
import { createProfileDocument, validateProfileDocument } from '../../../src/profile/repository';
import type { RecordContext } from '../../../src/profile';
import { beginAchievementSession, createAchievementState, applyAchievementFacts } from '../../../src/profile/achievements';

/** Isolated CI benchmark data, never a real player's speed/records or an earned-award injection. */
export function performanceProfile() {
  const words = content.words as Word[];
  const context = (courseId: RecordContext['courseId'], planId: string): RecordContext => ({ courseId, planId,
    contentVersion: '2.0.0', generatorVersion: 'qa-performance-fixture', inputRuleVersion: 'romaji-1.0.0', scoringVersion: 'score-1.0.0', guideUsed: false, assisted: false });
  let state = createAchievementState(); const practiceContext = context('relaxed', 'qa-populate-960');
  const practice = new GameSession({ words: [words[0]], mode: 'PRACTICE', sessionId: 'qa-perf-practice', guideEnabled: false });
  state = beginAchievementSession(state, { sessionId: practice.sessionId, mode: 'PRACTICE', context: practiceContext, atMs: 0 });
  words.forEach((word, index) => {
    if (index) practice.nextPracticeWord(0, word);
    for (let repeat = 0; repeat < 3; repeat++) {
      if (repeat) practice.repeatWord(0);
      for (const key of practice.snapshot(0).remainingGuide) practice.input(key, 0);
    }
  });
  practice.endPractice(0); state = applyAchievementFacts(state, practice.drainEvents(), practiceContext);
  for (let index = 0; index < 30; index++) {
    const courseId = (['relaxed', 'standard', 'challenge'] as const)[index % 3]; const word = words.find(item => item.courseId === courseId && item.canonicalLength >= 6)!;
    const roundContext = context(courseId, `qa-history-${index}`);
    const round = new GameSession({ words: [word], sessionId: `qa-perf-round-${index}`, guideEnabled: false });
    state = beginAchievementSession(state, { sessionId: round.sessionId, mode: 'MAIN', context: roundContext, atMs: 0 });
    for (let completed = 0; completed < 50; completed++) for (const key of round.snapshot(0).remainingGuide) round.input(key, 0);
    round.tick(90000); state = applyAchievementFacts(state, round.drainEvents(), roundContext);
  }
  const profile = createProfileDocument(); profile.progress = structuredClone(state.measuredProgress); profile.extensions.achievements = state;
  if (!validateProfileDocument(profile)) throw new Error('Performance fixture must satisfy the unmodified current-profile validator');
  if (Object.keys(profile.progress.words).length !== 960 || profile.progress.recentRounds.length !== 30) throw new Error('Incomplete benchmark population');
  return profile;
}
