import { expect, test } from 'vitest';
import { initialCityState } from '../../src/economy';
import { renderDistrictMap } from '../../src/ui/district-map';

test('the initial district is empty, with a real active plan and no premature building or rail', () => {
  const city = initialCityState();
  const before = structuredClone(city);
  const markup = renderDistrictMap(city, 'residential');
  expect(markup).toContain('viewBox="0 0 1200 760"');
  expect(markup).toContain('city_plot/city_plot_empty.webp');
  expect(markup).toContain('data-plan-target="1"');
  expect(markup).not.toContain('city_stage/city_residential_s1.webp');
  expect(markup).not.toContain('dm-train');
  expect(markup).toContain('空き区画 · 建築計画');
  expect(city).toEqual(before);
});

test('committed district and global equipment states have separate visual footprints and exact counts', () => {
  const city = initialCityState();
  Object.assign(city.districts.residential, { stage: 3, shops: 37, crews: 12, railway: true, plan: null });
  city.packagingLevel = 9; city.research.materials = 4; city.research.logistics = 2;
  city.synergies = ['joint_delivery'];
  const markup = renderDistrictMap(city, 'residential', { selectedFeature: 'shops' });
  expect(markup).toContain('city_residential_s3.webp');
  expect(markup).toContain('shop_scene/shop_residential.webp');
  expect(markup).toContain('店舗 37軒');
  expect(markup).toContain('data-crews="12"');
  expect(markup).toContain('dm-train');
  expect(markup).toContain('data-level="9"');
  expect(markup).toContain('data-materials="4"');
  expect(markup).toContain('data-synergy-id="joint_delivery" data-owned="true"');
  expect(markup).toMatch(/selected[^>]+data-action="district-feature" data-feature="shops"[^>]+aria-pressed="true"/);
  expect(markup.match(/data-action="district-feature"/g)).toHaveLength(7);
});

test('missing district art stays an explicitly identified schematic instead of an empty developed district', () => {
  const city = initialCityState();
  city.districts.harbor.stage = 5; city.districts.harbor.open = true;
  const markup = renderDistrictMap(city, 'harbor');
  expect(markup).toContain('data-art-kind="schematic"');
  expect(markup).toContain('地区外観は模式図');
  expect(markup).toContain('港');
  expect(markup).toContain('dm-water');
  expect(markup).toContain('data-world-x="1190"');
  expect(markup).not.toContain('city_stage/city_harbor_s5.webp');
});
