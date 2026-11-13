import type { AchievementProgressLine, AchievementView } from '../profile/achievements';

export const recommendationFamilies = [['A', 'B', 'C', 'D'], ['E', 'G', 'L'], ['F']] as const;
export interface GoalRecommendation { achievement: AchievementView; progress: AchievementProgressLine }

/** A view-only suggestion for a main delivery. Eligibility and counters come from the engine. */
export function recommendDeliveryGoal(views: readonly AchievementView[]): GoalRecommendation | null {
  for (const families of [...recommendationFamilies, null]) {
    for (const achievement of views) {
      if ((families && !(families as readonly string[]).includes(achievement.familyId)) || achievement.earned || achievement.ineligible
        || achievement.scope === '練' || achievement.scope === '街' || achievement.hidden) continue;
      const numeric = achievement.progress.filter(line => line.target !== null && line.target > 0);
      const progress = numeric.find(line => line.current < line.target!) ?? numeric[0];
      if (progress) return { achievement, progress };
    }
  }
  return null;
}
