import content from '../../spec/initial/data/words.json';
import { GameSession, type Word } from '../../src/typing';
import { beginAchievementSession, createAchievementState, applyAchievementCity } from '../../src/profile/achievements';
import { comparisonKey, type RecordContext } from '../../src/profile';
import { initialCityState } from '../../src/economy';

/** Deterministic view/CPU fixture, not a claim about a user's playing speed or device. */
export function achievementViewFixture(full: boolean) {
  let state = createAchievementState();
  const context: RecordContext = { courseId: 'relaxed', planId: 'perf-plan', contentVersion: '2.0.0', generatorVersion: 'test-1', inputRuleVersion: 'romaji-1.0.0', scoringVersion: 'score-1.0.0', guideUsed: false, assisted: false };
  if (full) {
    for (const word of content.words) state.measuredProgress.words[word.id] = { completed: 12, cleanCompleted: 9, practiceCompleted: 4, practiceCleanCompleted: 3 };
    state.measuredProgress.totalCompleted = 960 * 12;
    for (let index = 0; index < 30; index++) {
      const c = { ...context, planId: `perf-plan-${index}` };
      state.measuredProgress.bestByComparison[comparisonKey(c)] = { bestScore: 3000, bestCanonicalLength: 200, growthBestScore: 3000, growthBestCanonicalLength: 200 };
      state.measuredProgress.recentRounds.push({ sessionId: `old-${index}`, wordIds: content.words.slice(0, 100).map(word => word.id), context: c, score: 3000, completedWords: 100, canonicalLength: 200, correctKeys: 220, mistakes: 3 });
    }
    state = beginAchievementSession(state, { sessionId: 'seed-session', mode: 'MAIN', context, atMs: 0 });
    const template = state.sessions['seed-session']; delete state.sessions['seed-session'];
    for (let index = 0; index < 30; index++) state.sessions[`session-${index}`] = { ...structuredClone(template), sessionId: `session-${index}`, phase: index === 29 ? 'active' : 'completed' };
  }
  const game = new GameSession({ words: [content.words[0] as Word], guideEnabled: false });
  game.input('z', 0);
  return { state, live: game.snapshot(1000), id: full ? 'session-29' : undefined };
}

export function achievementViewCases() {
  const empty = achievementViewFixture(false);
  const main = achievementViewFixture(true);
  const practice = achievementViewFixture(true);
  practice.state.sessions[practice.id!].mode = 'PRACTICE';
  practice.live.mode = 'PRACTICE';
  practice.state.measuredProgress.words[practice.live.currentWord.id].practiceCleanCompleted = 1;
  const guided = achievementViewFixture(true);
  guided.live.guideUsed = true; guided.live.skips = 1; guided.live.completedWords = 20;
  guided.live.currentCleanStreak = 0; guided.live.maxCleanStreak = 30; guided.live.correctKeys = 398; guided.live.mistakes = 21;
  guided.live.canonicalLengthSum = 396; guided.live.score = 6000;
  const city = achievementViewFixture(true);
  const world = initialCityState();
  for (const [index, district] of Object.values(world.districts).entries()) {
    district.open = true; district.stage = index % 6; district.shops = index * 3;
    district.railway = index < 3;
  }
  world.packagingLevel = 10; world.synergies = ['joint_delivery', 'tourism_service'];
  world.arrivedMicro = 12_345_678_900n; world.cityArrivedMicro = 9_876_543_210n;
  city.state = applyAchievementCity(city.state, { eventId: 'fixture-city', atMs: 100, city: world, paidEquipmentPurchase: true });
  const ended = achievementViewFixture(true);
  ended.state.sessions[ended.id!].phase = 'aborted'; ended.live.phase = 'RESULT';
  return { empty, main, practice, guided, city, ended };
}
