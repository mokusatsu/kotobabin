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
  if (screen === 'home') return `<aside class="cosmetic-gallery cosmetic-home-gallery" aria-label="装着中の飾り：${esc([frame?.name, ornament?.name, background?.name].filter(Boolean).join('、'))}" data-cosmetic-gallery="home">${frame ? `<div class="cosmetic-home-frame">${image(frame.asset_refs[0], 'cosmetic-frame', frame.name)}<span>${esc(frame.name)}<br><img class="reward-check" src="${import.meta.env.BASE_URL}assets/ui_icon/ui_check.svg" alt="">装着中</span></div>` : ''}${ornament || background ? `<div class="cosmetic-home-scenes">${ornament ? image(ornament.asset_refs[0], 'cosmetic-home-ornament', ornament.name) : ''}${background ? image(background.asset_refs[0], 'cosmetic-home-background', background.name) : ''}</div>` : ''}</aside>`;
  return `<aside class="cosmetic-gallery" aria-label="装着中の飾り" data-cosmetic-gallery="${screen}">${frame || ornament ? `<div class="cosmetic-framed-display">${frame ? image(frame.asset_refs[0], 'cosmetic-frame', frame.name) : ''}${ornament ? image(ornament.asset_refs[0], 'cosmetic-ornament', ornament.name) : '<span class="cosmetic-frame-note">装着中の額縁</span>'}</div>` : ''}${background ? image(background.asset_refs[0], 'cosmetic-home-background', background.name) : ''}</aside>`;
}

/** Viewing page sets are unrelated to equipment and to the count of rewards owned. */
export function rewardFamilyPages(rewardId: string): string[] {
  const reward = catalog.rewards.find(item => item.id === rewardId);
  if (!reward) return [];
  if (reward.kind === 'foil_board') return [reward.id.split('_')[2].toUpperCase()];
  if (reward.id === 'reward_first_collection_board') return 'ABCDEFGH'.split('');
  if (reward.kind === 'album' || reward.id === 'reward_complete_72_board') return 'ABCDEFGHIJKL'.split('');
  return [];
}
function equippedFrame(state: AchievementState): string | undefined {
  return catalog.rewards.find(r => r.id === state.equipped.frameId && r.kind === 'frame' && state.rewards[r.id])?.asset_refs[0];
}
function framedContent(content: string, state: AchievementState): string {
  const frame = equippedFrame(state);
  return frame ? `<div class="reward-framed-content"><div class="reward-frame-window">${content}</div>${image(frame, 'reward-selected-frame')}</div>` : content;
}
export function rewardDetail(rewardId: string, state: AchievementState, views: readonly AchievementView[], page: number, renderStamp: (view: AchievementView) => string, writable: boolean): string {
  const reward = catalog.rewards.find(item => item.id === rewardId);
  if (!reward) return '';
  const owned = Boolean(state.rewards[reward.id]); const slot = rewardSlotForKind[reward.kind];
  const equipped = Boolean(slot && state.equipped[slot] === reward.id);
  const pages = rewardFamilyPages(rewardId); const pageIndex = Math.max(0, Math.min(pages.length - 1, page));
  const familyId = pages[pageIndex];
  const family = catalog.families.find(f => f.id === familyId);
  const allFamily = views.filter(view => view.familyId === familyId);
  const complete = allFamily.length === 6 && allFamily.every(view => view.earned);
  const navigation = pages.length > 1 ? `<nav class="reward-album-navigation" aria-label="アルバムの系統ページ"><button class="button" data-action="reward-page" data-reward-page="${pageIndex - 1}" ${pageIndex === 0 ? 'disabled' : ''}>← 前の系統</button><span role="status">${pageIndex + 1} / ${pages.length}ページ · ${familyId}系統</span><button class="button" data-action="reward-page" data-reward-page="${pageIndex + 1}" ${pageIndex === pages.length - 1 ? 'disabled' : ''}>次の系統 →</button></nav>` : '';
  const cover = framedContent(rewardThumbnail(rewardId, state), state);
  const body = family ? `<div class="reward-view-cover">${cover}</div>${navigation}<div class="reward-family-heading"><img class="reward-family-emblem" src="${asset('family_' + familyId.toLowerCase())}" alt=""><h3>${esc(family.name)} · ${allFamily.filter(v => v.earned).length}/6枚</h3>${complete ? `<img class="reward-check" src="${import.meta.env.BASE_URL}assets/ui_icon/ui_check.svg" alt=""><span>6枚完成・箔押し</span>` : '<span>収集中</span>'}</div><div class="reward-board-cards" data-page-children data-family-board="${familyId}" data-family-foil="${complete}">${allFamily.map(view => {
    const hidden = view.hidden && !view.hiddenRevealed && !view.earned;
    return `<article class="reward-board-card"><button class="reward-stamp-select" data-action="achievement-select" data-achievement-id="${view.id}" aria-label="${esc(hidden ? 'ひみつの切手' : view.name)}の詳細">${renderStamp(view)}<strong>${esc(hidden ? 'ひみつの切手' : view.name)}</strong></button></article>`;
  }).join('')}</div>${navigation}` : `<div class="reward-view-art">${cover}</div>`;
  return `<section class="reward-view" data-page-children data-preview-reward="${reward.id}"><div class="reward-view-heading" data-page-children><h2 id="reward-view-title">${esc(reward.name)}</h2><p>${owned ? '獲得済み' : '未獲得のプレビュー'} · ${equipped ? '装着中' : '鑑賞中'}。鑑賞しても装着は変わりません。</p><button class="button" data-action="reward-close">コレクションへ戻る</button></div>${body}<div class="reward-view-actions" data-page-children><p>${esc(reward.trigger)}</p>${owned && slot ? `<button class="button" data-action="reward-equip" data-equip-slot="${slot}" data-reward-id="${reward.id}" ${!writable ? 'disabled' : ''}>${equipped ? '装着を外す' : '装着する'}</button>` : !slot ? '<p>いつでも眺める鑑賞物です。装着の操作は必要ありません。</p>' : '<p>獲得すると装着できます。</p>'}<button class="button" data-action="reward-close">コレクションへ戻る</button></div></section>`;
}
