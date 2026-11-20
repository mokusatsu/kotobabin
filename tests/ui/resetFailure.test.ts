// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from '@/ui/appController';

const draftKey = 'kotobabin:tutorialDraft';

describe('save reset failure', () => {
  const previousIndexedDb = globalThis.indexedDB;
  let controller: AppController;

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    controller.destroy();
    vi.restoreAllMocks();
    globalThis.indexedDB = previousIndexedDb;
    window.localStorage.clear();
    document.body.replaceChildren();
  });

  it('closes the spent confirmation, reports an unverified result, and restores the correct opener', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    controller = new AppController(mount);
    await controller.init();
    controller.navigate('SETTINGS');
    const { repository } = controller as unknown as { repository: { resetData: () => Promise<unknown> } };
    const resetData = vi.spyOn(repository, 'resetData').mockRejectedValue(new Error('injected ordinary reset error'));
    const opener = () => mount.querySelector<HTMLButtonElement>('[data-testid="settings-reset-city-btn"]')!;
    const dialog = () => mount.querySelector('[data-testid="settings-reset-confirm-dialog"]');
    const notice = () => mount.querySelector('[data-testid="settings-status-banner"]');

    window.localStorage.setItem(draftKey, 'existing tutorial checkpoint');
    opener().click();
    const confirm = mount.querySelector<HTMLButtonElement>('[data-testid="settings-reset-confirm-btn"]')!;
    confirm.click();
    confirm.click();
    expect(resetData).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(notice()?.textContent).toContain('初期化の結果を確認できませんでした');
    expect(document.activeElement).toBe(opener());
    expect(window.localStorage.getItem(draftKey)).toBe('existing tutorial checkpoint');

    opener().click();
    expect(dialog()).not.toBeNull();
    expect(notice()).toBeNull();
    expect(resetData).toHaveBeenCalledTimes(1);
  });

  it('clears the tutorial checkpoint after a committed city reset even if the subsequent reload fails', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    controller = new AppController(mount);
    await controller.init();
    controller.navigate('SETTINGS');
    window.localStorage.setItem(draftKey, 'existing tutorial checkpoint');
    const { repository } = controller as unknown as { repository: { loadAll: () => Promise<unknown> } };
    const loadAll = vi.spyOn(repository, 'loadAll').mockRejectedValueOnce(new Error('injected post-commit read error'));

    controller.resetSave('city_and_achievements');

    expect(window.localStorage.getItem(draftKey)).toBe('existing tutorial checkpoint');
    await vi.waitFor(() => expect(mount.querySelector('[data-testid="settings-status-banner"]')?.textContent).toContain(
      '初期化の結果を確認できませんでした',
    ));
    expect(loadAll).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(draftKey)).toBeNull();
  });
});
