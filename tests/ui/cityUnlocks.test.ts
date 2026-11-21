// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { AppController } from '@/ui/appController';
import type { CityEconomy } from '@/economy/cityEconomy';
import { IndexedDbProfileRepository } from '@/progression/profileRepository';

describe('City achievement dialogs', () => {
  const originalIndexedDB = globalThis.indexedDB;
  let controller: AppController | null = null;
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });
  afterEach(() => {
    controller?.destroy();
    globalThis.indexedDB = originalIndexedDB;
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('tracks current-city arrivals and district levels on the home map', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    controller = new AppController(mount);
    await controller.init();
    controller.skipOnboarding();
    const economy = (controller as unknown as { economy: CityEconomy }).economy;
    const panel = () => mount.querySelector('[data-testid="map-next-city"]');
    const bar = () => panel()?.querySelector<HTMLElement>('[aria-label="この街に届いた資材"]');
    const districtBar = () => panel()?.querySelector<HTMLElement>('[aria-label="Lv.3以上の地区"]');
    const details = () => panel()?.querySelector<HTMLButtonElement>('button');

    expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
    expect(districtBar()?.getAttribute('aria-valuenow')).toBe('0');
    expect(mount.querySelector('[data-testid="home-city-next"]')).toBeNull();
    economy.cityArrivedMicro = 50_000n * economy.unit;
    economy.districts.residential.stage = 3;
    controller.navigate('HOME');
    expect(bar()?.getAttribute('aria-valuenow')).toBe('50000');
    expect(bar()?.querySelector<HTMLElement>('.kb-progress-fill')?.style.width).toBe('50%');
    expect(districtBar()?.getAttribute('aria-valuenow')).toBe('1');
    expect(districtBar()?.getAttribute('aria-valuemax')).toBe('6');

    economy.cityArrivedMicro = 123_456n * economy.unit;
    controller.navigate('HOME');
    expect(bar()?.getAttribute('aria-valuenow')).toBe(bar()?.getAttribute('aria-valuemax'));
    expect(bar()?.querySelector<HTMLElement>('.kb-progress-fill')?.style.width).toBe('100%');
    expect(panel()?.textContent).toContain('123,456 / 100,000 資材');
    expect(details()?.textContent).toBe('新しい街の詳細');
    details()?.click();
    expect(mount.textContent).toContain('まだ出発条件を満たしていません');

    for (const district of Object.values(economy.districts)) {
      Object.assign(district, { open: true, stage: 3, crews: 1 });
    }
    controller.navigate('HOME');
    expect(districtBar()?.querySelector<HTMLElement>('.kb-progress-fill')?.style.width).toBe('100%');
    expect(details()?.textContent).toBe('新しい街へ出発');
    mount.querySelector<HTMLButtonElement>('[data-testid="home-city-next"]')!.click();
    expect(mount.textContent).toContain('設計図 3枚');

    const save = vi.spyOn(IndexedDbProfileRepository.prototype, 'commitCityEconomy');
    mount.querySelector<HTMLButtonElement>('[data-testid="new-city-depart"]')!.click();
    await save.mock.results.at(-1)!.value;
    expect(mount.querySelector('[data-testid="home-city-number"]')?.textContent).toBe('第2の街');
    mount.querySelector<HTMLButtonElement>('[data-testid="home-city-prev"]')!.click();
    await save.mock.results.at(-1)!.value;
    expect(districtBar()?.getAttribute('aria-valuenow')).toBe('6');

    controller.destroy();
    controller = new AppController(mount);
    await controller.init();
    expect(mount.querySelector('[data-testid="home-city-number"]')?.textContent).toBe('第1の街');
    expect(districtBar()?.getAttribute('aria-valuenow')).toBe('6');
    mount.querySelector<HTMLButtonElement>('[data-testid="home-city-next"]')!.click();
    await save.mock.results.at(-1)!.value;
    expect(mount.querySelector('[data-testid="home-city-number"]')?.textContent).toBe('第2の街');
    expect(bar()?.getAttribute('aria-valuenow')).toBe('0');
  });

  it('shows new city stamps immediately after development and queues multiple equipment rewards', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    controller = new AppController(mount);
    await controller.init();
    controller.skipOnboarding();
    controller.navigate('UPGRADES');
    const economy = (controller as unknown as { economy: CityEconomy }).economy;
    economy.districts.residential.stockMicro = 1_000_000_000_000n;
    economy.coinsMicro = 1_000_000_000_000n;
    const save = vi.spyOn(IndexedDbProfileRepository.prototype, 'commitCityEconomy');
    const revealId = () => mount.querySelector('[data-testid="gacha-reveal-card"]')?.getAttribute('data-reveal-id');
    const nextStamp = () => mount.querySelector<HTMLButtonElement>('[data-testid="gacha-next-btn"]')!.click();
    const skipStamps = () => mount.querySelector<HTMLButtonElement>('[data-testid="gacha-skip-btn"]')?.click();
    controller.upgradeDistrict('residential');
    await save.mock.results.at(-1)!.value;
    await vi.waitFor(() => expect(revealId()).toBe('series-stage_residential-1'));
    nextStamp();
    expect(revealId()).toBe('series-shops_residential-1');
    nextStamp();
    expect(mount.querySelector('[data-testid="city-stamp-reveal"]')).toBeNull();
    controller.upgradeDistrict('residential');
    await vi.waitFor(() => expect(mount.querySelector('[data-testid="gacha-reveal-card"]')?.getAttribute('data-reveal-id')).toBe('I01'));
    expect(mount.querySelector('[data-testid="city-stamp-reveal"]')).not.toBeNull();
    nextStamp();
    expect(revealId()).toBe('series-stage_residential-2');
    skipStamps();
    controller.upgradeDistrict('residential');
    await vi.waitFor(() => expect(mount.querySelector('[data-testid="gacha-reveal-card"]')?.getAttribute('data-reveal-id')).toBe('I02'));
    nextStamp();
    expect(revealId()).toBe('series-stage_residential-3');
    skipStamps();
    controller.setPurchaseQuantity(10);
    controller.buyEquipment('packaging');
    await vi.waitFor(() => expect(mount.querySelector('[data-testid="gacha-reveal-card"]')?.getAttribute('data-reveal-id')).toBe('K01'));
    mount.querySelector<HTMLButtonElement>('[data-testid="gacha-next-btn"]')!.click();
    expect(mount.querySelector('[data-testid="gacha-reveal-card"]')?.getAttribute('data-reveal-id')).toBe('K02');
    nextStamp();
    expect(revealId()).toBe('series-purchases-10');
    nextStamp();
    expect(revealId()).toBe('reward_frame_red_postbox');
    expect(mount.querySelector('[data-testid="gacha-reveal-card"]')?.textContent).toContain('額縁を獲得');
    nextStamp();
    expect(mount.querySelector('[data-testid="city-stamp-reveal"]')).toBeNull();
    expect(controller.getUnlocks().K02).toBeDefined();
  });
});
