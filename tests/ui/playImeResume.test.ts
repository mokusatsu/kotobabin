// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from '@/ui/appController';
import { passStartGate } from './startHelpers';

describe('IME interruption during timed play', () => {
  let app: AppController | undefined;

  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    app?.destroy();
    document.body.replaceChildren();
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('pauses without scoring composition and resumes the same partially typed word', async () => {
    const mount = document.body.appendChild(document.createElement('div'));
    const controller = new AppController(mount);
    app = controller;
    await controller.init();
    controller.startMainRound(123);
    await passStartGate(mount);

    const session = controller['session']!;
    const original = session.getSnapshot();
    const keys = original.guide;
    expect(keys.length).toBeGreaterThan(1);
    const input = () => mount.querySelector<HTMLInputElement>('input.kb-hidden-input')!;
    const type = (key: string) => input().dispatchEvent(new KeyboardEvent('keydown', {
      key, bubbles: true, cancelable: true,
    }));
    input().focus();
    type(keys[0]!);
    const partial = session.getSnapshot();
    expect(partial.correctKeyCount).toBe(original.correctKeyCount + 1);

    const composingInput = input();
    composingInput.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    composingInput.dispatchEvent(new InputEvent('input', {
      data: 'あ', inputType: 'insertCompositionText', isComposing: true, bubbles: true,
    }));
    composingInput.dispatchEvent(new CompositionEvent('compositionend', { data: 'あ', bubbles: true }));

    expect(mount.textContent).toContain('日本語入力（IME）が検出されたため一時停止しました');
    expect(mount.querySelector('[data-testid="play-word-ja"]')).toBeNull();
    expect(session.getSnapshot()).toMatchObject({
      state: 'PAUSED',
      score: partial.score,
      correctKeyCount: partial.correctKeyCount,
      mistakeCount: partial.mistakeCount,
      typed: partial.typed,
      currentWordIndex: partial.currentWordIndex,
    });

    const quit = Array.from(mount.querySelectorAll('button')).find((button) => button.textContent?.startsWith('ホームへ戻る'))!;
    quit.focus();
    expect(document.activeElement).toBe(quit);
    const keyDown = (key: string, repeat = false) =>
      quit.dispatchEvent(new KeyboardEvent('keydown', { key, repeat, bubbles: true, cancelable: true }));
    expect(keyDown('Enter', true)).toBe(false);
    expect(keyDown('Enter')).toBe(true);
    expect(keyDown(' ')).toBe(true);
    expect(session.currentState).toBe('PAUSED');

    const resume = Array.from(mount.querySelectorAll('button')).find((button) => button.textContent?.startsWith('再開する'));
    expect(resume).toBeDefined();
    resume!.click();
    await vi.waitFor(() => expect(document.activeElement).toBe(input()));
    expect(session.getSnapshot()).toMatchObject({
      state: 'PLAYING',
      currentWord: original.currentWord,
      typed: partial.typed,
    });
    for (const key of keys.slice(1)) type(key);
    expect(session.getSnapshot().completedWordCount).toBe(original.completedWordCount + 1);
  }, 12_000);
});
