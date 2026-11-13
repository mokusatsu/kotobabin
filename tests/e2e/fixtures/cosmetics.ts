/** Test-only source-aware fixture. Ownership comes from canonical typing facts and city reducer,
 * never manually inserted unlocks/rewards. The UI then exercises real persisted choices. */
import content from '../../../spec/initial/data/words.json';
import { initialCityState } from '../../../src/economy';
import { GameSession, type Word, type CourseId } from '../../../src/typing';
import { createAchievementState, beginAchievementSession, applyAchievementFacts, applyAchievementCity, applyAchievementAction, validateAchievementState, type RecordContext } from '../../../src/profile/achievements';
import { createProfileDocument, validateProfileDocument } from '../../../src/profile/repository';
const words = content.words as Word[];
const context = (courseId: CourseId = 'relaxed', guideUsed = true): RecordContext => ({ courseId, guideUsed, assisted: false, planId: `cosmetic-fixture-${courseId}`, contentVersion: '2.0.0', generatorVersion: 'cosmetic-fixture-1', inputRuleVersion: 'romaji-1.0.0', scoringVersion: 'score-1' });
export function cosmeticsFixture(fontScale: 100 | 125 | 150, equip = true) {
  let state = createAchievementState(); const fixed = context(); const practice = new GameSession({ words: [words[0]], mode: 'PRACTICE', sessionId: 'cosmetic-practice-fixture' });
  state = beginAchievementSession(state, { sessionId: practice.sessionId, mode: 'PRACTICE', context: fixed, atMs: 0 });
  const order = [...content.collectionSets['kotobabin-ja-240-v1'], ...content.collectionSets['kotobabin-ja-960-v2'].filter(id => !content.collectionSets['kotobabin-ja-240-v1'].includes(id))];
  for (const id of order) {
    practice.nextPracticeWord(0, words.find(w => w.id === id)!);
    for (const key of practice.snapshot(0).remainingGuide) practice.input(key, 0);
    state = applyAchievementFacts(state, practice.drainEvents(), fixed);
  }
  for (const word of words.slice(0, 5)) for (let repeat = 0; repeat < 2; repeat++) {
    practice.nextPracticeWord(0, word); for (const key of practice.snapshot(0).remainingGuide) practice.input(key, 0);
    state = applyAchievementFacts(state, practice.drainEvents(), fixed);
  }
  practice.endPractice(0); state = applyAchievementFacts(state, practice.drainEvents(), fixed);
  const courses: CourseId[] = ['relaxed', 'standard', 'challenge'];
  for (let index = 0; index < 10; index++) {
    const course = courses[index % 3]; const c = context(course, false); const word = words.find(w => w.courseId === course && w.canonicalLength >= 6)!;
    const main = new GameSession({ words: [word], sessionId: `cosmetic-main-fixture-${index}`, guideEnabled: false });
    state = beginAchievementSession(state, { sessionId: main.sessionId, mode: 'MAIN', context: c, atMs: 0 });
    for (let n = 1; n <= 50; n++) {
      for (const key of main.snapshot(0).remainingGuide) main.input(key, 0);
      if (n === 2 || n === 6) main.deliver(0);
      state = applyAchievementFacts(state, main.drainEvents(), c);
    }
    main.tick(90000); state = applyAchievementFacts(state, main.drainEvents(), c);
  }
  const city = initialCityState();
  for (const district of Object.values(city.districts)) { district.stage = 5; district.open = true; district.shops = 10; district.railway = true; }
  city.packagingLevel = 10; city.arrivedMicro = city.cityArrivedMicro = 100000000000n; city.citiesRestarted = 1; city.synergies = ['joint_delivery', 'sorting_network', 'tourism_service'];
  state = applyAchievementCity(state, { city, eventId: 'cosmetic-city-fixture', atMs: 90000, paidEquipmentPurchase: true, researchPurchased: true });
  if (Object.keys(state.unlocks).length !== 72 || !validateAchievementState(state)) throw new Error('Canonical cosmetics fixture failed');
  if (equip) for (const [slot, id] of [['titleId', 'title_a01'], ['frameId', 'reward_total_08_frame'], ['ornamentId', 'reward_total_08_ornament'], ['homeBackgroundId', 'reward_total_36_background']] as const) state = applyAchievementAction(state, { type: 'equip', slot, id });
  const profile = createProfileDocument(); profile.settings.fontScale = fontScale; profile.tutorialSeen = true; profile.extensions.achievements = state;
  if (!validateProfileDocument(profile)) throw new Error('Cosmetics profile boundary failed');
  return profile;
}
