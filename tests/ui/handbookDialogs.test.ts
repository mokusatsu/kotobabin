// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppController } from '@/ui/appController';

describe('handbook stamp detail keyboard interaction', () => {
  let controller: AppController | null = null;

  afterEach(() => {
    controller?.destroy();
    controller = null;
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('owns Escape and navigation keys while open, then restores focus to the stamp', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    controller = new AppController(mount);
    await controller.init();
    controller.navigate('HANDBOOK');

    const first = mount.querySelector<HTMLButtonElement>('[data-stamp-id]')!;
    const stampId = first.dataset.stampId!;
    first.focus();
    first.click();
    await Promise.resolve();

    const dialog = mount.querySelector<HTMLDialogElement>('dialog.kb-stamp-dialog')!;
    const closeButton = dialog.querySelector<HTMLButtonElement>('.kb-stamp-dialog-close')!;
    closeButton.focus();

    closeButton.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'h', code: 'KeyH', bubbles: true, cancelable: true,
    }));
    expect(mount.querySelector('dialog.kb-stamp-dialog')).toBe(dialog);

    closeButton.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, cancelable: true,
    }));
    expect(mount.querySelector('dialog.kb-stamp-dialog')).toBeNull();
    expect(mount.querySelector('.kb-grid-handbook')).not.toBeNull();
    expect(document.activeElement?.getAttribute('data-stamp-id')).toBe(stampId);
  });
});
