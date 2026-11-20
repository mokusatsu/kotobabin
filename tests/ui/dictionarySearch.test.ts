// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppController } from '@/ui/appController';

describe('dictionary search', () => {
  let controller: AppController | null = null;

  afterEach(() => {
    controller?.destroy();
    controller = null;
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('keeps the same input through typing and only searches committed IME text', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    controller = new AppController(mount);
    await controller.init();
    controller.navigate('DICTIONARY');

    const input = mount.querySelector<HTMLInputElement>('input[type="search"]')!;
    const results = () => mount.querySelector('.kb-dict-scroll')?.textContent;
    const firstWord = mount.querySelector('.kb-word-display')!.textContent!;
    const initialResults = results();
    input.focus();

    input.dispatchEvent(new CompositionEvent('compositionstart'));
    input.value = '候補入力中の文字列';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    expect(document.activeElement).toBe(input);
    expect(results()).toBe(initialResults);

    input.value = firstWord;
    input.dispatchEvent(new CompositionEvent('compositionend', { data: firstWord }));
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(mount.querySelector('input[type="search"]') === input).toBe(true);
    expect(document.activeElement === input).toBe(true);
    expect(results()).toContain(firstWord);
    expect(results()).not.toBe(initialResults);

    input.value = '一致しない文字列 xyz';
    input.setSelectionRange(2, 2);
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(document.activeElement === input).toBe(true);
    expect(input.selectionStart).toBe(2);
    expect(results()).toContain('条件に一致することばがありません。');

    controller.navigate('HOME');
    controller.navigate('DICTIONARY');
    expect(mount.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe('一致しない文字列 xyz');
    expect(results()).toContain('条件に一致することばがありません。');
  });
});
