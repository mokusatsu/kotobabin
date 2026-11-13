import { expect, test } from 'vitest';
import { gameStageShell } from '../../src/ui/game-stage';

const required = ['prompt-word', 'prompt-reading', 'romaji-guide', 'game-input', 'input-indicator', 'cargo-count', 'cargo-slots', 'deliver-button', 'deliver-label', 'continue-hint', 'risk-hint', 'game-message', 'practice-actions', 'tutorial-status', 'game-goal-slot', 'play-city-values', 'paused-layer', 'score', 'completed-count', 'guide-status', 'time-bar'];
test('every game controller has one stable semantic target in every shell mode', () => {
  for (const mode of ['MAIN', 'PRACTICE', 'TUTORIAL'] as const) {
    const html = gameStageShell({ mode, destinationLabel: '住宅地' });
    for (const id of required) expect(html.match(new RegExp(`id="${id}"`, 'g')), `${mode}: ${id}`).toHaveLength(1);
    expect(html).toContain('class="game-page typing-game-stage"');
    expect(html).toContain('data-ipad-exclude');
    expect(html).toContain('aria-labelledby="prompt-word"');
    expect(html).toContain('aria-describedby="input-instructions"');
    expect(html.match(/id="time-left"/g)?.length ?? 0).toBe(mode === 'MAIN' ? 1 : 0);
  }
});
test('the scene and engine-rendered goal remain distinct from the native input surface', () => {
  const html = gameStageShell({ mode: 'MAIN', destinationLabel: '<住宅地>', sceneHtml: '<div id="delivery-scene">scene</div>', goalHtml: '<div data-goal-kind="pinned">goal</div>' });
  expect(html.match(/id="delivery-scene"/g)).toHaveLength(1);
  expect(html).toContain('&lt;住宅地&gt;');
  expect(html).toContain('data-goal-kind="pinned"');
  expect(html.indexOf('id="delivery-scene"')).toBeLessThan(html.indexOf('class="game-workspace"'));
  expect(html).not.toContain('autofocus');
});
