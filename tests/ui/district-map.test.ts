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

test('every developed district uses its distinct registered stage artwork instead of an empty plot', () => {
  const city = initialCityState();
  for (const id of ['residential', 'market', 'workshop', 'park', 'station', 'harbor']) {
    city.districts[id].open = true;
    for (let stage = 1; stage <= 5; stage++) {
      city.districts[id].stage = stage;
      const markup = renderDistrictMap(city, id);
      expect(markup).toContain(`city_stage/city_${id}_s${stage}.webp`);
      expect(markup).not.toContain('city_plot/city_plot_empty.webp');
      expect(markup).not.toContain('data-art-kind="schematic"');
    }
  }
});

test('every equipment unit changes visible rack geometry after representative sprites reach their cap', () => {
  const city = initialCityState();
  city.districts.residential.stage = 5; city.districts.residential.shops = 27; city.districts.residential.crews = 17; city.packagingLevel = 22;
  const before = renderDistrictMap(city, 'residential');
  city.districts.residential.shops++; city.districts.residential.crews++; city.packagingLevel++;
  const after = renderDistrictMap(city, 'residential');
  for (const feature of ['shops', 'crews', 'packaging']) {
    const geometry = new RegExp(`data-capacity-feature="${feature}"[\\s\\S]*?dm-rack-filled" width="([^"]+)"`);
    expect(Number(after.match(geometry)![1])).toBeGreaterThan(Number(before.match(geometry)![1]));
  }
});
