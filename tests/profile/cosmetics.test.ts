import { describe, expect, it } from 'vitest';
import { applyAchievementAction, createAchievementState, type EquipmentSlot, validateAchievementState } from '../../src/profile/achievements';
import { createProfileDocument, parseProfileBackup } from '../../src/profile/repository';

function ownedState() {
  const state = createAchievementState();
  for (const id of ['reward_total_08_frame', 'reward_total_08_ornament', 'reward_total_36_background', 'reward_total_24_album', 'reward_family_a_postcard']) state.rewards[id] = { acquiredAtMs: 1, evidenceEventId: 'confirmed-reward' };
  return state;
}
describe('four independent cosmetic choices', () => {
  it('starts with none, equips independently and clears only the chosen slot without changing facts', () => {
    const original = ownedState();
    expect(original.equipped).toEqual({ titleId: null, frameId: null, ornamentId: null, homeBackgroundId: null });
    let next = applyAchievementAction(original, { type: 'equip', slot: 'frameId', id: 'reward_total_08_frame' });
    next = applyAchievementAction(next, { type: 'equip', slot: 'ornamentId', id: 'reward_total_08_ornament' });
    next = applyAchievementAction(next, { type: 'equip', slot: 'homeBackgroundId', id: 'reward_total_36_background' });
    next = applyAchievementAction(next, { type: 'equip', slot: 'frameId', id: null });
    expect(next.equipped).toEqual({ titleId: null, frameId: null, ornamentId: 'reward_total_08_ornament', homeBackgroundId: 'reward_total_36_background' });
    expect({ ...next, equipped: original.equipped }).toEqual(original);
    expect(validateAchievementState(next)).toBe(true);
    expect(() => applyAchievementAction(next, { type: 'equip', slot: 'ornamentId', id: 'reward_total_36_background' })).toThrow('slot');
    expect(() => applyAchievementAction(next, { type: 'equip', slot: 'homeBackgroundId', id: 'reward_total_08_ornament' })).toThrow('slot');
    expect(() => applyAchievementAction(next, { type: 'equip', slot: 'frameId', id: 'reward_total_16_frame' })).toThrow('owned');
    expect(() => applyAchievementAction(next, { type: 'equip', slot: 'albumId' as EquipmentSlot, id: null })).toThrow('slot');
  });
  it('round-trips current-format backups with or without the optional background without deleting saved viewing choices', () => {
    const state = ownedState();
    delete state.equipped.homeBackgroundId;
    state.equipped.postcardId = 'reward_family_a_postcard';
    state.equipped.boardId = null;
    state.equipped.albumId = 'reward_total_24_album';
    state.equipped.ornamentId = 'reward_total_36_background';
    const profile = createProfileDocument(); profile.extensions.achievements = state;
    expect(parseProfileBackup(JSON.stringify(profile))).toEqual(profile);
    const next = applyAchievementAction(state, { type: 'equip', slot: 'homeBackgroundId', id: 'reward_total_36_background' });
    expect(next.equipped.postcardId).toBe(state.equipped.postcardId);
    expect(next.equipped.albumId).toBe(state.equipped.albumId);
    expect(next.equipped.ornamentId).toBe(state.equipped.ornamentId);
    profile.extensions.achievements = next;
    expect(parseProfileBackup(JSON.stringify(profile))).toEqual(profile);
    next.equipped.homeBackgroundId = 'reward_total_24_album';
    expect(validateAchievementState(next)).toBe(false);
    expect(() => parseProfileBackup(profile)).toThrow();
  });
});
