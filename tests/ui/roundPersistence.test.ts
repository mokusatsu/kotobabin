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

  async function finishRound(wordCount = 1): Promise<{ app: AppController; mount: HTMLElement }> {
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
    for (let i = 0; i < wordCount; i++) {
      const prompt = mount.querySelector('.kb-prompt-roman')?.textContent?.trim() ?? '';
      expect(prompt).not.toBe('');
      for (const key of prompt) input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    gameTimeMs = 91_000;
    vi.advanceTimersByTime(100);
    return { app, mount };
  }

  function resultButton(mount: HTMLElement, label: string): HTMLButtonElement {
    const button = [...mount.querySelectorAll('button')].find((b) => b.textContent?.includes(label));
    expect(button).toBeDefined();
    return button!;
  }

  it('waits for the result commit before same-order replay comparison', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = IndexedDbProfileRepository.prototype.commitTypingFacts;
    vi.spyOn(IndexedDbProfileRepository.prototype, 'commitTypingFacts')
      .mockImplementationOnce(async function (this: IndexedDbProfileRepository, params) {
        await gate;
        return original.call(this, params);
      });
    const { app, mount } = await finishRound(10);
    resultButton(mount, '演出をスキップ').click();
    resultButton(mount, '同じ問題でもう一度').click();
    expect(resultButton(mount, '記録を確認中').disabled).toBe(true);
    release();
    await vi.waitFor(() => expect(app['currentSessionContext']?.comparisonBestScore).toBe(app.getRecentResults()[0]?.score));
    expect(app.getRecentResults()[0]?.completedWordCount).toBe(10);
  });

  it('does not wait for the separate city transaction once the typing record is available', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = IndexedDbProfileRepository.prototype.commitCityEconomy;
    const city = vi.spyOn(IndexedDbProfileRepository.prototype, 'commitCityEconomy')
      .mockImplementation(async function (this: IndexedDbProfileRepository, params) {
        if (params.economyEventId.startsWith('round-city:')) await gate;
        return original.call(this, params);
      });
    try {
      const { app, mount } = await finishRound(10);
      resultButton(mount, '演出をスキップ').click();
      resultButton(mount, '同じ問題でもう一度').click();
      await vi.waitFor(() => expect(mount.querySelector('input.kb-hidden-input')).not.toBeNull());
      expect(city.mock.calls.some(([params]) => params.economyEventId.startsWith('round-city:'))).toBe(true);
      expect(app.getRecentResults()[0]?.completedWordCount).toBe(10);
      expect(app['currentSessionContext']?.comparisonBestScore).toBe(app.getRecentResults()[0]?.score);
    } finally {
      release();
    }
  });

  it('does not launch a deferred replay after navigation', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = IndexedDbProfileRepository.prototype.commitTypingFacts;
    vi.spyOn(IndexedDbProfileRepository.prototype, 'commitTypingFacts')
      .mockImplementationOnce(async function (this: IndexedDbProfileRepository, params) {
        await gate;
        return original.call(this, params);
      });
    const { app, mount } = await finishRound();
    resultButton(mount, '演出をスキップ').click();
    resultButton(mount, '同じ問題でもう一度').click();
    app.navigate('HOME');
    release();
    await vi.waitFor(() => expect(app.getRecentResults()).toHaveLength(1));
    expect(app['screen']).toBe('HOME');
  });

  it('keeps the result visible when a pending replay save fails twice', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const commit = vi.spyOn(IndexedDbProfileRepository.prototype, 'commitTypingFacts')
      .mockImplementation(async () => {
        await gate;
        throw new Error('persistent storage failure');
      });
    const { app, mount } = await finishRound(10);
    resultButton(mount, '演出をスキップ').click();
    resultButton(mount, '同じ問題でもう一度').click();
    release();
    await vi.waitFor(() => expect(mount.querySelector('[data-testid="round-save-warning"]')).not.toBeNull());
    const fallback = resultButton(mount, '保存済みの記録で同じ問題を始める');
    expect(commit).toHaveBeenCalledTimes(2);
    expect(app.getRecentResults()).toHaveLength(0);
    fallback.click();
    expect(mount.querySelector('input.kb-hidden-input')).not.toBeNull();
    expect(app['currentSessionContext']?.comparisonBestScore).toBeNull();
  });

  it('offers an explicit replay after storage remains pending, without auto-launch', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const original = IndexedDbProfileRepository.prototype.commitTypingFacts;
    vi.spyOn(IndexedDbProfileRepository.prototype, 'commitTypingFacts')
      .mockImplementationOnce(async function (this: IndexedDbProfileRepository, params) {
        await gate;
        return original.call(this, params);
      });
    const { mount } = await finishRound();
    const timeout = vi.spyOn(window, 'setTimeout');
    resultButton(mount, '演出をスキップ').click();
    resultButton(mount, '同じ問題でもう一度').click();
    const expireReplay = timeout.mock.calls.find(([, delay]) => delay === 2500)?.[0];
    expect(expireReplay).toBeTypeOf('function');
    (expireReplay as () => void)();
    const fallback = resultButton(mount, '保存済みの記録で同じ問題を始める');
    expect(fallback.disabled).toBe(false);
    release();
    await vi.waitFor(() => expect(controller?.getRecentResults()).toHaveLength(1));
    resultButton(mount, '保存済みの記録で同じ問題を始める').click();
    expect(mount.querySelector('input.kb-hidden-input')).not.toBeNull();
  });

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
