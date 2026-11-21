// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from '@/ui/appController';

function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

describe('home difficulty dialog keyboard interaction', () => {
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

  it('captures focus, keeps shortcuts out, and restores focus on dismiss and home refresh', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    controller = new AppController(mount);
    await controller.init();
    mount.querySelector<HTMLButtonElement>('[data-testid="onboarding-skip-btn"]')!.click();

    const district = () =>
      mount.querySelector<HTMLButtonElement>('.kb-map-district-btn[data-district-id="residential"]')!;
    const popup = () =>
      mount.querySelector<HTMLElement>('[data-testid="difficulty-popup"]');
    district().click();
    await Promise.resolve();
    const modal = popup()!;
    expect.soft(modal.contains(document.activeElement)).toBe(true);

    press(document.activeElement ?? document.body, 'j', { code: 'KeyJ' });
    expect(popup() === modal).toBe(true);
    press(window, 'j', { code: 'KeyJ' });
    expect(popup() === modal).toBe(true);

    const buttons = modal.querySelectorAll<HTMLButtonElement>('button');
    const firstButton = buttons[0]!;
    const lastButton = buttons[buttons.length - 1]!;
    firstButton.focus();
    press(firstButton, 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(lastButton);
    press(lastButton, 'Tab');
    expect(document.activeElement).toBe(firstButton);

    press(firstButton, 'Escape');
    expect(popup()).toBeNull();
    expect(document.activeElement).toBe(district());
    controller.render();
    expect(document.activeElement).toBe(district());

    district().click();
    await Promise.resolve();
    popup()!.click();
    expect(popup()).toBeNull();
    expect(document.activeElement).toBe(district());
  });
});
