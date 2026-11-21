// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbProfileRepository } from '@/progression/profileRepository';
import { AppController } from '@/ui/appController';

describe('periodic city autosave', () => {
  let controller: AppController | null = null;

  afterEach(() => {
    controller?.destroy();
    controller = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('applies the first autosave of a reloaded page to the same city', async () => {
    // Leave IndexedDB task scheduling and DOM timeouts real.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const commit = vi.spyOn(IndexedDbProfileRepository.prototype, 'commitCityEconomy');
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    controller = new AppController(mount);
    await controller.init();
    vi.advanceTimersByTime(15_000);
    expect(commit).toHaveBeenCalledTimes(1);
    await expect(commit.mock.results[0]?.value).resolves.toMatchObject({ applied: true });
    controller.destroy();

    controller = new AppController(mount);
    await controller.init();
    vi.advanceTimersByTime(15_000);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[1]?.[0].cityId).toBe(commit.mock.calls[0]?.[0].cityId);
    await expect(commit.mock.results[1]?.value).resolves.toMatchObject({ applied: true });
  });
});
