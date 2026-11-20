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
