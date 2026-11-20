import { expect, vi } from 'vitest';

export async function passStartGate(mount: HTMLElement): Promise<void> {
  expect(mount.querySelector('.kb-input-check-box')).toBeNull();
  expect(mount.querySelector('.kb-input-start-key')?.textContent).toBe('F');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', bubbles: true }));
  expect(mount.querySelector('[data-testid="start-countdown"]')?.textContent).toBe('3');
  await vi.waitFor(() => expect(mount.querySelector('[data-testid="start-countdown"]')).toBeNull(), { timeout: 7000, interval: 25 });
}
