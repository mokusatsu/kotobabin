import type { SessionMode } from '../typing';

export interface GameStageOptions {
  mode: SessionMode;
  destinationLabel: string;
  sceneHtml?: string;
  goalHtml?: string;
  cityHtml?: string;
  saveState?: string;
}
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Stable semantic shell only. Confirmed input, facts and scene animation remain separate controllers. */
export function gameStageShell(options: GameStageOptions): string {
  return `<main id="main" class="game-page typing-game-stage" data-mode="${options.mode}" data-ipad-exclude>
    ${options.sceneHtml ?? '<div id="delivery-scene" class="delivery-scene" aria-hidden="true"></div>'}
    <div class="game-topline"><div class="clock">${options.mode === 'MAIN' ? '<span>のこり</span><strong id="time-left">90</strong><span>秒</span>' : '<strong class="untimed-clock">時間制限なし</strong>'}</div><div class="score"><span>確定得点</span><strong id="score">0</strong><span>点</span></div></div>
    <div class="time-track" aria-hidden="true"><div id="time-bar"></div></div>
    <div class="cargo-area warehouse-cargo"><span class="cargo-caption">まとめ便 <strong id="cargo-count">0</strong> / 5</span><div class="cargo-slots" id="cargo-slots" aria-hidden="true"></div></div>
    <div class="game-workspace">
      <div class="game-main-column typing-console">
        <section class="typing-card" aria-labelledby="prompt-word">
          <h1 id="prompt-word" class="prompt-word"></h1><p id="prompt-reading" class="prompt-reading"></p><div id="romaji-guide" class="romaji-guide" aria-hidden="true"></div>
          <div class="typing-entry-row"><label class="typing-input-label" for="game-input">キーボード入力<span id="input-indicator">入力できます</span></label><input id="game-input" class="typing-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="input-instructions" aria-label="ローマ字を入力"><p id="input-instructions" class="sr-only">表示されたことばを半角ローマ字で入力してください。語の境目にSpaceで配達できます。Escapeで一時停止します。</p><button id="deliver-button" class="button button-primary deliver-button" data-action="deliver"><kbd>Space</kbd><span id="deliver-label">次のことばを完成させよう</span></button></div>
        </section>
        <div class="console-context"><p id="word-stage" class="word-stage game-route">${escape(options.destinationLabel)}ゆき · 最初の一打ではじまります</p><p id="game-message" class="game-message" role="status" aria-live="polite"></p><div class="play-bottom"><span id="completed-count">完成 0語</span><button class="text-button" data-action="guide">ローマ字ガイド <span id="guide-status">ON</span></button></div></div>
      </div>
      <aside class="game-sidebar game-inspector" aria-label="配達の情報"><div class="game-sidebar-primary"><div class="delivery-area"><p id="continue-hint" class="continue-hint"></p><p id="risk-hint" class="risk-hint"></p></div><section id="tutorial-status" class="tutorial-status" hidden aria-live="polite"></section><div id="practice-actions" class="practice-actions" hidden></div></div><div class="game-sidebar-details"><div id="game-goal-slot">${options.goalHtml ?? ''}</div><div class="play-city-strip">${options.cityHtml ?? ''}<div class="play-city-values" id="play-city-values"></div></div><p class="save-status" data-save-status data-save-state="${escape(options.saveState ?? 'saved')}"></p></div></aside>
    </div>
    <div class="paused-layer" id="paused-layer" hidden></div>
  </main>`;
}
