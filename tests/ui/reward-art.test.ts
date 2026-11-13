import { describe, expect, it } from 'vitest';
import { createAchievementState, getAchievementViews } from '../../src/profile/achievements';
import { rewardCollection } from '../../src/ui/handbook';
import { equippedDecoration, rewardAssetPaths, rewardDetail, rewardFamilyPages, rewardThumbnail } from '../../src/ui/reward-art';
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


it('keeps any-48 memorial, first-collection eight pages, and twelve-family completion distinct', () => {
  const state = createAchievementState(); const views = getAchievementViews(state);
  expect(rewardFamilyPages('reward_total_48_board')).toEqual([]);
  expect(rewardFamilyPages('reward_first_collection_board')).toEqual('ABCDEFGH'.split(''));
  expect(rewardFamilyPages('reward_complete_72_board')).toEqual('ABCDEFGHIJKL'.split(''));
  expect(rewardFamilyPages('reward_total_24_album')).toEqual('ABCDEFGHIJKL'.split(''));
  expect(rewardFamilyPages('reward_total_60_album')).toEqual('ABCDEFGHIJKL'.split(''));
  const before = structuredClone(state);
  const html = rewardDetail('reward_complete_72_board', state, views, 11, view => `<div data-test-stamp="${view.id}"></div>`, true);
  expect(html).toContain('12 / 12ページ'); expect(html).toContain('data-family-board="L"');
  expect(html.match(/data-test-stamp=/g)).toHaveLength(6); expect(html).toContain('data-family-foil="false"');
  expect(html).not.toContain('data-action="reward-equip"'); expect(html).toContain('未獲得のプレビュー');
  expect(state).toEqual(before);
  for (const view of views.filter(v => v.familyId === 'A')) view.earned = true;
  expect(rewardDetail('reward_family_a_foil_board', state, views, 0, () => '', true)).toContain('data-family-foil="true"');
  expect(rewardDetail('reward_total_48_board', state, views, 0, () => '', true)).not.toContain('data-family-board=');
});
