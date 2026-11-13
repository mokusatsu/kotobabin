import { describe, expect, it } from 'vitest';
import { createAchievementState, getAchievementViews } from '../../src/profile/achievements';
import { rewardCollection } from '../../src/ui/handbook';
import { equippedDecoration, rewardAssetPaths, rewardThumbnail } from '../../src/ui/reward-art';
import catalog from '../../spec/initial/data/achievement_catalog.json';
import manifest from '../../spec/initial/data/visual_resource_manifest.json';

describe('reward presentation', () => {
  it('uses exact manifest exports for all reward references without a production placeholder', () => {
    for (const reward of catalog.rewards) for (const id of reward.asset_refs) {
      const source = manifest.assets.find(a => a.id === id)!;
      expect('assets/' + rewardAssetPaths[id]).toBe(source.runtime_exports[0]);
    }
    const state = createAchievementState(); const html = rewardCollection(state, getAchievementViews(state), true);
    expect(html).not.toContain('制作中');
    expect(html).toContain('reward_frame_leaf.svg');
    expect(html).toContain('reward_collection_stamp_art.webp');
    expect(html).toContain('data-equip-slot="homeBackgroundId"');
    expect(html).not.toMatch(/data-equip-slot="(?:postcardId|boardId|albumId)"/);
    expect(rewardThumbnail('reward_total_24_thanks', state)).toContain('一語ずつ届けてくれて、ありがとう。24枚');
  });
  it('only applies owned choices and never applies the home panel to the handbook or as an ornament', () => {
    const state = createAchievementState();
    state.equipped = { titleId: null, frameId: 'reward_total_08_frame', ornamentId: 'reward_total_08_ornament', homeBackgroundId: 'reward_total_36_background' };
    expect(equippedDecoration(state, 'home')).toBe('');
    for (const id of Object.values(state.equipped)) if (id) state.rewards[id] = { acquiredAtMs: 1, evidenceEventId: 'confirmed' };
    const home = equippedDecoration(state, 'home'); const handbook = equippedDecoration(state, 'handbook');
    expect(home).toContain('reward_evening_panel.webp'); expect(home).toContain('reward_tree_ornament.svg'); expect(home).toContain('reward_frame_leaf.svg');
    expect(handbook).not.toContain('reward_evening_panel.webp'); expect(handbook).toContain('reward_tree_ornament.svg');
    state.equipped.ornamentId = 'reward_total_36_background'; state.equipped.homeBackgroundId = null;
    expect(equippedDecoration(state, 'home')).not.toContain('reward_evening_panel');
  });
});
