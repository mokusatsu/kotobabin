import { describe, expect, it } from 'vitest';
import content from '../../spec/initial/data/words.json';
import type { Word } from '../../src/typing';
import { getAchievementViews } from '../../src/profile/achievements';
import { achievementViewCases } from './achievement-view-fixtures';

// Exact complete-output oracles captured from the unoptimized implementation at
// be5ceec, before changing aggregation. Includes all72 rows and the full F04 list.
const originalOutputHashes = {
  empty: 'eedaf5e92f11308fdea6e9f150645b187677bc6c3eaa6981c80085b6ce12f931',
  main: '7977cea87b88691a2bd9369ed919790b8f52fb779c1695a18a7d9d1a02c1c34b',
  practice: '111e90a093741a931e9886c00e920e092355bdb2ff62af3e50376cc02d0a9b47',
  guided: '59122893105c75ab7b82874097b54d3262b417fcdd4c94179e176d3e081e3da4',
  city: '2c5750ce8ea38fb2b644c94fe556e13d853148c4b1982671a2a5f78d0ef5e859',
  ended: 'd329df8a8ed1d8edc0c32d45f4e8a5819fa2b4eada1818a89542109f13cebf7a',
};
function deepFreeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const nested of Object.values(value)) deepFreeze(nested);
  Object.freeze(value);
}

describe('achievement view aggregation equivalence', () => {
  for (const name of Object.keys(originalOutputHashes) as (keyof typeof originalOutputHashes)[]) {
    it(`preserves every original field and display string for ${name}`, async () => {
      const { state, live, id } = achievementViewCases()[name];
      const views = getAchievementViews(state, live, id);
      expect(views).toHaveLength(72);
      const digest = await crypto.subtle.digest('SHA-256', new globalThis.TextEncoder().encode(JSON.stringify(views)));
      expect(Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')).toBe(originalOutputHashes[name]);
    });
  }

  it('keeps per-achievement district, collection, accuracy and normal/practice streak metrics separate', () => {
    const { state, live, id } = achievementViewCases().city;
    state.bestNormalStreak = 10; state.bestPracticeStreak = 7;
    state.bestAccuracies.C01 = 90.1; state.bestAccuracies.C02 = 94.99;
    const views = getAchievementViews(state, live, id);
    const metric = (achievement: string, key: string) => views.find(view => view.id === achievement)!.progress.find(line => line.key === key)!.current;
    expect(metric('I03', 'qualified_district_count')).toBe(5);
    expect(metric('I05', 'qualified_district_count')).toBe(3);
    expect(metric('I06', 'qualified_district_count')).toBe(1);
    expect(metric('L04', 'fixed_set_completed_words')).toBe(240);
    expect(metric('L05', 'fixed_set_completed_words')).toBe(300);
    expect(metric('L06', 'fixed_set_completed_words')).toBe(420);
    expect(metric('C04', 'historical_best_clean_streak')).toBe(10);
    expect(metric('F05', 'historical_best_clean_streak')).toBe(7);
    expect(metric('C01', 'best_eligible_accuracy')).toBe(90.1);
    expect(metric('C02', 'best_eligible_accuracy')).toBe(94.9);
  });

  it('refreshes guide, skip, current streak and attained maximum when the same live object changes', () => {
    const { state, live, id } = achievementViewCases().main;
    live.completedWords = 20; live.correctKeys = 80; live.mistakes = 0;
    live.currentCleanStreak = 10; live.maxCleanStreak = 30;
    let views = getAchievementViews(state, live, id);
    expect(views.find(view => view.id === 'C04')!.provisional).toBe(true);
    expect(views.find(view => view.id === 'H05')!.provisional).toBe(true);
    live.guideUsed = true; live.skips = 1; live.currentCleanStreak = 0;
    views = getAchievementViews(state, live, id);
    expect(views.find(view => view.id === 'H05')!.ineligible).toBe(true);
    expect(views.find(view => view.id === 'C04')!.provisional).toBe(false);
    expect(views.find(view => view.id === 'C04')!.progress.find(line => line.key === 'current_clean_streak')!.current).toBe(0);
    expect(views.find(view => view.id === 'C04')!.progress.find(line => line.key === 'session_max_clean_streak')!.current).toBe(30);
  });

  it('reads fresh practice counts and the current word without a state-identity cache', () => {
    const { state, live, id } = achievementViewCases().practice;
    const count = () => getAchievementViews(state, live, id).find(view => view.id === 'F02')!.progress[0].current;
    expect(count()).toBe(1);
    state.measuredProgress.words[live.currentWord.id].practiceCleanCompleted = 2;
    expect(count()).toBe(2);
    live.currentWord = content.words.find(word => word.id !== live.currentWord.id)! as Word;
    expect(count()).toBe(3);
  });

  it('accepts deeply frozen snapshots and neither mutates nor exposes nested session state', () => {
    const { state, live, id } = achievementViewCases().main;
    const original = structuredClone(state);
    deepFreeze(state); deepFreeze(live);
    const views = getAchievementViews(state, live, id);
    views[0].progress[0].current = 123456;
    expect(state).toEqual(original);
    expect(getAchievementViews(state, live, id)[0].progress[0].current).toBe(original.measuredProgress.totalCompleted);
  });
});
