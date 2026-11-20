import catalog from '@spec-data/stamp_frame_catalog.json';

interface StampFrameSpec {
  name: string;
  filename: string;
  description: string;
  rewardId: string;
  stampCount?: number;
}

export const STAMP_FRAME_GROUPS: readonly { name: string; frames: readonly StampFrameSpec[] }[] = catalog.groups;
export const STAMP_FRAMES = STAMP_FRAME_GROUPS.flatMap(({ frames }) => frames);
export const STAMP_COUNT_FRAMES = STAMP_FRAMES.filter(
  (frame): frame is StampFrameSpec & { stampCount: number } => frame.stampCount !== undefined,
);

export function getEquippedStampFrameAsset(rewardId: string): string | undefined {
  const frame = STAMP_FRAMES.find((entry) => entry.rewardId === rewardId);
  return frame ? `./${catalog.imageDirectory.replace(/^public\//, '')}${frame.filename}` : undefined;
}
