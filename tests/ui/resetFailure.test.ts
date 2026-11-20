// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from '@/ui/appController';

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

    opener().click();
    const confirm = mount.querySelector<HTMLButtonElement>('[data-testid="settings-reset-confirm-btn"]')!;
    confirm.click();
    confirm.click();
    expect(resetData).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(dialog()).toBeNull());
    expect(notice()?.textContent).toContain('初期化の結果を確認できませんでした');
    expect(document.activeElement).toBe(opener());

    opener().click();
    expect(dialog()).not.toBeNull();
    expect(notice()).toBeNull();
    expect(resetData).toHaveBeenCalledTimes(1);
  });
});
