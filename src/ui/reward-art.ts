import catalog from '../../spec/initial/data/achievement_catalog.json';
import type { AchievementState, AchievementView, EquipmentSlot } from '../profile/achievements';

// Explicit export paths derived from manifest asset_refs; the production manifest is not bundled.
export const rewardAssetPaths: Readonly<Record<string, string>> = {
  "family_a": "family_emblem/family_a.svg",
  "postcard_a": "postcard/postcard_a.webp",
  "family_b": "family_emblem/family_b.svg",
  "postcard_b": "postcard/postcard_b.webp",
  "family_c": "family_emblem/family_c.svg",
  "postcard_c": "postcard/postcard_c.webp",
  "family_d": "family_emblem/family_d.svg",
  "postcard_d": "postcard/postcard_d.webp",
  "family_e": "family_emblem/family_e.svg",
  "postcard_e": "postcard/postcard_e.webp",
  "family_f": "family_emblem/family_f.svg",
  "postcard_f": "postcard/postcard_f.webp",
  "family_g": "family_emblem/family_g.svg",
  "postcard_g": "postcard/postcard_g.webp",
  "family_h": "family_emblem/family_h.svg",
  "postcard_h": "postcard/postcard_h.webp",
  "family_i": "family_emblem/family_i.svg",
  "postcard_i": "postcard/postcard_i.webp",
  "family_j": "family_emblem/family_j.svg",
  "postcard_j": "postcard/postcard_j.webp",
  "family_k": "family_emblem/family_k.svg",
  "postcard_k": "postcard/postcard_k.webp",
  "family_l": "family_emblem/family_l.svg",
  "postcard_l": "postcard/postcard_l.webp",
  "reward_frame_leaf": "milestone_svg/reward_frame_leaf.svg",
  "reward_tree_ornament": "milestone_svg/reward_tree_ornament.svg",
  "reward_frame_plaza": "milestone_svg/reward_frame_plaza.svg",
  "reward_fountain_ornament": "milestone_svg/reward_fountain_ornament.svg",
  "reward_album_24_emblem": "milestone_svg/reward_album_24_emblem.svg",
  "reward_celebration_postcard": "milestone_raster/reward_celebration_postcard.webp",
  "reward_evening_panel": "milestone_raster/reward_evening_panel.webp",
  "reward_frame_sunset": "milestone_svg/reward_frame_sunset.svg",
  "reward_board_48_emblem": "milestone_svg/reward_board_48_emblem.svg",
  "reward_first_collection_emblem": "milestone_svg/reward_first_collection_emblem.svg",
  "reward_first_collection_stamp_art": "milestone_raster/reward_first_collection_stamp_art.webp",
  "reward_frame_journey": "milestone_svg/reward_frame_journey.svg",
  "reward_expanded_album_emblem": "milestone_svg/reward_expanded_album_emblem.svg",
  "reward_complete_72_emblem": "milestone_svg/reward_complete_72_emblem.svg",
  "reward_collection_stamp_art": "milestone_raster/reward_collection_stamp_art.webp",
  "memorial_frame": "shared_frame/memorial_frame.svg",
  "board_base": "shared_frame/board_base.svg",
  "board_foil": "shared_frame/board_foil.svg",
  "album_base": "shared_frame/album_base.svg"
};
export const rewardSlotForKind: Readonly<Record<string, EquipmentSlot | undefined>> = {
  frame: 'frameId', ornament: 'ornamentId', home_panel: 'homeBackgroundId',
};
const esc = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const asset = (id: string) => `${import.meta.env.BASE_URL}assets/${rewardAssetPaths[id]}`;
const image = (id: string, className = '', alt = '') => `<img class="${className}" src="${asset(id)}" alt="${esc(alt)}" data-reward-asset="${id}">`;
export function rewardThumbnail(rewardId: string, state: AchievementState): string {
  const reward = catalog.rewards.find(item => item.id === rewardId);
  if (!reward) return '';
  const refs = reward.asset_refs;
  if (reward.kind === 'dom_text') return '<p>一語ずつ届けてくれて、ありがとう。24枚の切手が集まりました。</p>';
  if (reward.kind === 'postcard') return image(refs[0], 'reward-postcard', reward.name);
  if (reward.kind === 'home_panel') return image(refs[0], 'reward-evening-panel', reward.name);
  if (reward.kind === 'ornament') return image(refs[0], 'reward-ornament', reward.name);
  if (reward.kind === 'frame') return `<div class="reward-frame-sample">${image(refs[0], 'reward-frame-layer', reward.name)}<span>額縁の内側</span></div>`;
  if (reward.kind === 'memorial_stamp') return `<div class="reward-memorial-stamp">${image(refs[0], 'reward-memorial-art', reward.name)}${image('memorial_frame', 'reward-memorial-frame')}</div>`;
  const emblem = refs.find(id => id.startsWith('family_') || id.endsWith('_emblem'))!;
  const family = emblem.startsWith('family_') ? emblem.slice(-1).toUpperCase() : null;
  const complete = family ? catalog.achievements.filter(a => a.family_id === family).every(a => state.unlocks[a.id]) : Boolean(state.rewards[reward.id]);
  return `<div class="reward-cover" data-board-thumbnail><div class="reward-cover-art">${image(refs[0], 'reward-cover-base')}${image(emblem, 'reward-cover-emblem', reward.name)}${family && complete ? image('board_foil', 'reward-cover-foil') : ''}</div><span>${family ? `${family}系統 ${complete ? '6枚完成・箔押し' : '収集中'}` : esc(reward.name)}</span></div>`;
}

/** Dedicated gallery only. Never inserted into maps, play, practice or tutorial. */
export function equippedDecoration(state: AchievementState, screen: 'home' | 'handbook'): string {
  const ownedChoice = (slot: EquipmentSlot, kind: string) => catalog.rewards.find(r => r.id === state.equipped[slot] && r.kind === kind && state.rewards[r.id]);
  const frame = ownedChoice('frameId', 'frame');
  const ornament = ownedChoice('ornamentId', 'ornament');
  const background = screen === 'home' ? ownedChoice('homeBackgroundId', 'home_panel') : undefined;
  if (!frame && !ornament && !background) return '';
  return `<aside class="cosmetic-gallery" aria-label="装着中の飾り" data-cosmetic-gallery="${screen}">${frame || ornament ? `<div class="cosmetic-framed-display">${frame ? image(frame.asset_refs[0], 'cosmetic-frame', frame.name) : ''}${ornament ? image(ornament.asset_refs[0], 'cosmetic-ornament', ornament.name) : '<span class="cosmetic-frame-note">配達の記念</span>'}</div>` : ''}${background ? image(background.asset_refs[0], 'cosmetic-home-background', background.name) : ''}</aside>`;
}
