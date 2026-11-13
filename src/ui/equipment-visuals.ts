import config from '../../spec/initial/data/economy_config.json';

export type VehicleOrientation = 'front' | 'rear';
const roadVehicles = ['cart', 'van', 'box_van', 'truck'] as const;
/** Appearance milestones share the economy's canonical 10/25/50 boundaries. */
export function equipmentVisualTier(value: number): number {
  return value === 0 ? 0 : 1 + config.equipment.milestones.filter(mark => value >= mark).length;
}
export function vehicleArtworkId(crews: number, railway: boolean, orientation: VehicleOrientation): string {
  const kind = railway ? 'train' : roadVehicles[Math.max(0, equipmentVisualTier(crews) - 1)];
  return `vehicle_${kind}_${orientation}`;
}
export function shopOverlayArtwork(count: number): readonly string[] {
  return ['shop_canopy', 'shop_banner', 'shop_signboard'].slice(0, Math.max(0, equipmentVisualTier(count) - 1));
}
