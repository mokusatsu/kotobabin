// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbProfileRepository, ResetGenerationError } from '@/progression/profileRepository';
import { AppController } from '@/ui/appController';

describe('ordinary round persistence', () => {
  let controller: AppController | null = null;
  let observer: IndexedDbProfileRepository | null = null;

  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
    window.localStorage.clear();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });

  afterEach(() => {
    controller?.destroy();
    controller = null;
    observer?.close();
    observer = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function finishRound(): Promise<{ app: AppController; mount: HTMLElement }> {
    let gameTimeMs = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => gameTimeMs);
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const app = new AppController(mount);
    controller = app;
    await app.init();
    app.startMainRound(123);
    app.completeInputCheck();
    vi.advanceTimersByTime(3000);
    const input = mount.querySelector<HTMLInputElement>('input.kb-hidden-input')!;
    const prompt = mount.querySelector('.kb-prompt-roman')?.textContent?.trim() ?? '';
    expect(prompt).not.toBe('');
    for (const key of prompt) input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    gameTimeMs = 91_000;
    vi.advanceTimersByTime(100);
    return { app, mount };
  }

  it.each([false, true])('retries the exact round once with no double counting (already committed: %s)', async (alreadyCommitted) => {
    const original = IndexedDbProfileRepository.prototype.commitTypingFacts;
    const commit = vi.spyOn(IndexedDbProfileRepository.prototype, 'commitTypingFacts')
      .mockImplementationOnce(async function (this: IndexedDbProfileRepository, params) {
        if (alreadyCommitted) await original.call(this, params);
        throw new Error('temporary storage failure');
      });
    const { app, mount } = await finishRound();
    expect(commit.mock.calls[0]?.[0].roundResult?.completed).toBe(true);
    expect(commit.mock.calls[0]?.[0].roundResult?.completedWordCount).toBe(1);
    await vi.waitFor(() => expect(app.getRecentResults()).toHaveLength(1));
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[1]?.[0]).toBe(commit.mock.calls[0]?.[0]);
    expect(mount.querySelector('[data-testid="round-save-warning"]')).toBeNull();

    observer = new IndexedDbProfileRepository();
    await observer.init();
    const saved = await observer.loadAll();
    expect(saved.results).toEqual([commit.mock.calls[0]?.[0].roundResult]);
    expect(saved.achievementProgress.completedRounds).toBe(1);
    const last = (commit.mock.calls[0]?.[0].facts ?? []).at(-1)!;
    expect(saved.factCursors[last.sessionId]).toBe(last.factSequence);
  });

  it.each([
    { error: new Error('persistent storage failure'), attempts: 2 },
    { error: new ResetGenerationError('records reset after round'), attempts: 1 },
  ])('reports a failed save after $attempts attempt(s)', async ({ error, attempts }) => {
    const commit = vi.spyOn(IndexedDbProfileRepository.prototype, 'commitTypingFacts')
      .mockRejectedValue(error);
    const { app, mount } = await finishRound();
    await vi.waitFor(() => expect(mount.querySelector('[data-testid="round-save-warning"]')).not.toBeNull());
    expect(commit).toHaveBeenCalledTimes(attempts);
    expect(app.getRecentResults()).toHaveLength(0);
  });
});
