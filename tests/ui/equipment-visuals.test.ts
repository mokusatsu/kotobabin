import { expect, test } from 'vitest';
import catalogue from '../../spec/initial/data/equipment_catalog.json';
import { equipmentVisualTier, shopOverlayArtwork, vehicleArtworkId } from '../../src/ui/equipment-visuals';

test('every road/railway appearance and shop overlay matches the independent canonical catalogue', () => {
  for (const entry of catalogue.crew_levels) {
    expect(equipmentVisualTier(entry.count)).toBe(entry.visual_tier);
    for (const orientation of ['front', 'rear'] as const) {
      expect(entry.asset_refs).toContain(vehicleArtworkId(entry.count, false, orientation));
      expect(entry.railway_override_assets).toContain(vehicleArtworkId(entry.count, true, orientation));
    }
  }
  for (const entry of catalogue.shop_levels) {
    expect(equipmentVisualTier(entry.count)).toBe(entry.visual_tier);
    expect(shopOverlayArtwork(entry.count)).toEqual(entry.overlay_asset_refs);
  }
});
