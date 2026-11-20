import { getEquippedStampFrameAsset } from '@/progression/stampFrameCatalog';

export function getRewardPreviewAsset(reward: {
  id: string;
  kind: string;
  asset_refs?: readonly string[];
}): string {
  const refs = reward.asset_refs ?? [];
  if (reward.kind === 'postcard') {
    const assetId = refs[0] ?? reward.id;
    if (assetId === 'reward_celebration_postcard') {
      return './assets/milestone_raster/reward_celebration_postcard.webp';
    }
    return `./assets/postcard/${assetId}.webp`;
  }
  if (reward.kind === 'foil_board') {
    const familyRef = refs.find((r) => r.startsWith('family_'));
    return familyRef
      ? `./assets/family_emblem/${familyRef}.svg`
      : './assets/shared_frame/board_foil.svg';
  }
  if (reward.kind === 'frame') {
    const stampFrame = getEquippedStampFrameAsset(reward.id);
    if (stampFrame?.endsWith('.png')) return stampFrame;
    const frameRef = refs[0];
    return frameRef
      ? `./assets/milestone_svg/${frameRef}.svg`
      : './assets/shared_frame/stamp_frame.svg';
  }
  if (reward.kind === 'ornament') {
    const ornamentRef = refs[0];
    return ornamentRef
      ? `./assets/milestone_svg/${ornamentRef}.svg`
      : './assets/shared_frame/board_foil.svg';
  }
  if (reward.kind === 'album' || reward.kind === 'memorial_board') {
    const emblemRef = refs.find((r) => r.startsWith('reward_'));
    return emblemRef
      ? `./assets/milestone_svg/${emblemRef}.svg`
      : './assets/shared_frame/board_foil.svg';
  }
  if (reward.kind === 'memorial_stamp' || reward.kind === 'home_panel') {
    const rasterRef = refs[0];
    return rasterRef
      ? `./assets/milestone_raster/${rasterRef}.webp`
      : './assets/shared_frame/memorial_frame.svg';
  }
  if (reward.kind === 'dom_text') {
    return './assets/milestone_svg/reward_album_24_emblem.svg';
  }
  return './assets/shared_frame/board_foil.svg';
}
