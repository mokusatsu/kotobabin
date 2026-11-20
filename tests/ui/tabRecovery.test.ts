// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbProfileRepository } from '@/progression/profileRepository';
import { AppController } from '@/ui/appController';

describe('returning to a tab that lost ownership', () => {
  let controller: AppController | null = null;
  let newOwner: IndexedDbProfileRepository | null = null;

  afterEach(() => {
    controller?.destroy();
    controller = null;
    newOwner?.close();
    newOwner = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reopens saved data without letting the stale controller overwrite it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const reload = vi.spyOn(window.history, 'go').mockImplementation(() => undefined);
    const commit = vi.spyOn(IndexedDbProfileRepository.prototype, 'commitCityEconomy');
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    controller = new AppController(mount);
    await controller.init();

    vi.advanceTimersByTime(15_000);
    await expect(commit.mock.results[0]?.value).resolves.toMatchObject({ applied: true });

    newOwner = new IndexedDbProfileRepository();
    const { writeEpoch, resetGeneration } = await newOwner.init('new-owner');
    window.dispatchEvent(new StorageEvent('storage', { key: 'kotobabin-active-tab', newValue: 'new-owner' }));

    const previousCity = (await newOwner.loadAll()).city!;
    const newCity = {
      ...previousCity,
      state: { ...previousCity.state, coins_micro: '76000000' },
      revision: previousCity.revision + 100_000,
    };
    await newOwner.commitCityEconomy({
      lock: { tabId: 'new-owner', writeEpoch, resetGeneration },
      cityId: newCity.cityId,
      economyEventId: 'new-owner-save',
      cityRecord: newCity,
    });

    await controller.reacquireTabLock();
    vi.advanceTimersByTime(15_000);
    await commit.mock.results[2]?.value;

    const saved = await newOwner.loadAll();
    expect(saved.city).toEqual(newCity);
    expect(saved.metadata.ownerTabId).toBe('new-owner');
    expect(commit).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledWith(0);
  });
});
