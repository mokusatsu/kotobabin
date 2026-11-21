// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from '@/ui/appController';

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

describe('save reset confirmation', () => {
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

  it('starts on cancel and restores each opener without processing global navigation', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    controller = new AppController(mount);
    await controller.init();
    controller.navigate('SETTINGS');
    const confirm = vi.spyOn(controller, 'confirmResetSave').mockImplementation(() => {});
    const popup = () => mount.querySelector('[data-testid="settings-reset-confirm-dialog"]');

    for (const scope of ['records', 'settings', 'city']) {
      const opener = () => mount.querySelector<HTMLButtonElement>(`[data-testid="settings-reset-${scope}-btn"]`)!;
      opener().click();
      await Promise.resolve();
      const cancelButton = mount.querySelector<HTMLButtonElement>('[data-testid="settings-reset-cancel-btn"]')!;
      const confirmButton = mount.querySelector<HTMLButtonElement>('[data-testid="settings-reset-confirm-btn"]')!;
      expect.soft(document.activeElement === cancelButton).toBe(true);
      if (scope === 'records') {
        expect(popup()?.textContent).toContain('同じ条件で得点や速さを比べるための履歴を削除');
        expect(popup()?.textContent).toContain('獲得した切手と報酬');
      }
      if (scope === 'city') {
        expect(popup()?.textContent).toContain('直近記録は残ります');
      }

      press(document.activeElement ?? document.body, 'h', { code: 'KeyH' });
      expect(popup()).not.toBeNull();
      press(window, 'j', { code: 'KeyJ' });
      expect(popup()).not.toBeNull();

      press(cancelButton, 'Tab', { shiftKey: true });
      expect(document.activeElement).toBe(confirmButton);
      press(confirmButton, 'Tab');
      expect(document.activeElement).toBe(cancelButton);

      press(cancelButton, 'Escape');
      expect(popup()).toBeNull();
      expect(document.activeElement).toBe(opener());
    }
    expect(confirm).not.toHaveBeenCalled();
  });
});
