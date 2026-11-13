import content from '../../spec/initial/data/words.json';
import { InputAdapter, type CourseId, type SessionSnapshot, type Word } from '../typing';
import { GAME_PARAMETERS } from '../config/game-parameters';
import { comparisonExport, createComparison, factSummary, type Comparison, type DevConditions, type DevEvent } from './comparison';
import './style.css';

const words = content.words as Word[];
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = (id: string) => element<HTMLInputElement>(id);
const text = (id: string, value: string) => { element(id).textContent = value; };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
element('dev-word').innerHTML = words.map(word => `<option value="${escape(word.id)}">${escape(word.display)} · ${escape(word.reading)} · ${escape(word.id)}</option>`).join('');
const dog = words.find(word => word.reading === 'いぬ');
if (dog) (element<HTMLSelectElement>('dev-word')).value = dog.id;
element('dev-parameters').innerHTML = GAME_PARAMETERS.map(parameter => `<article><strong>${parameter.name}</strong><code>${parameter.id}</code><p>${parameter.initial} · ${parameter.range}</p><p>${parameter.binding}</p></article>`).join('');
let comparison: Comparison;
let adapter: InputAdapter | undefined;
let checkAdapter: InputAdapter | undefined;
let needsCheck = false, checkPassed = false;
let clockValue = 0, clockAnchor = 0, running = false;
let factPage = 0, parameterPage = 0;
const gameInput = input('dev-input');
const now = () => running ? clockValue + performance.now() - clockAnchor : clockValue;
function stopClock(at = now()) { clockValue = at; running = false; }
function snapshot() { return comparison.session.snapshot(now()); }
function consume() { comparison.facts.push(...comparison.session.drainEvents()); }
function readConditions(): DevConditions {
  const mode = (element<HTMLSelectElement>('dev-word-mode')).value;
  const rawRates = input('dev-rates').value.split(',').map(value => value.trim());
  if (rawRates.some(value => !value)) throw new Error('荷物数係数をカンマ区切りで入力してください。');
  return { courseId: (element<HTMLSelectElement>('dev-course')).value as CourseId,
    wordId: mode === 'fixed' ? element<HTMLSelectElement>('dev-word').value : null,
    ...(mode === 'custom' ? { customWord: { display: input('dev-custom-display').value, reading: input('dev-custom-reading').value } } : {}),
    seed: Number(input('dev-seed').value), cargoCount: Number(input('dev-cargo').value), remainingMs: Number(input('dev-remaining').value),
    imePaused: input('dev-ime').checked, event: element<HTMLSelectElement>('dev-event').value as DevEvent,
    rules: { roundDurationMs: Number(input('dev-duration').value), pointPerCanonicalKey: Number(input('dev-point').value), maxCargo: Number(input('dev-max-cargo').value),
      cargoRateNumerators: rawRates.map(Number), cargoRateDenominator: Number(input('dev-denominator').value), reviewWordLimit: Number(input('dev-review-limit').value) } };
}
function checkInput() {
  element('dev-input-check').hidden = !needsCheck;
  if (!needsCheck || checkAdapter) return;
  checkAdapter = new InputAdapter(input('dev-check-input'), {
    onCharacter: key => { checkPassed = key === 'a'; text('dev-check-status', checkPassed ? '半角aを確認しました。入力を再開できます。' : '半角aを入力してください。'); paint(); },
    onDeliver: () => {}, onPause: () => {}, onInputCheckRequired: () => { checkPassed = false; paint(); },
  });
}
function pause(reason = '停止', at = now()) {
  if (!comparison || !running) return;
  comparison.operations.push(`停止 ${reason} @${at}`); comparison.session.pause(at); stopClock(at); consume(); text('dev-status', `${reason}。条件を変更する場合は比較を作り直してください。`); paint();
}
function prepare() {
  if (running) return;
  try {
    const next = createComparison(words, readConditions());
    adapter?.destroy(); checkAdapter?.destroy(); checkAdapter = undefined;
    comparison = next; stopClock(next.nowMs); factPage = 0; needsCheck = next.imePaused; checkPassed = false;
    adapter = new InputAdapter(gameInput, {
      now,
      onCharacter: (key, at) => { comparison.operations.push(`実入力 ${key} @${at}`); comparison.session.input(key, at); consume(); paint(); },
      onDeliver: at => { comparison.operations.push(`実配達 @${at}`); comparison.session.deliver(at); consume(); paint(); },
      onPause: (reason, at) => pause(reason, at),
      onInputCheckRequired: () => { needsCheck = true; checkPassed = false; checkInput(); },
    });
    checkInput();
    text('dev-status', '比較を作り直しました。準備操作と事実は「事実と書き出し」で確認できます。');
    paint();
  } catch (error) { text('dev-status', error instanceof Error ? error.message : '比較条件を確認してください。'); }
}
function paintFacts(state: SessionSnapshot) {
  const count = Math.max(1, Math.ceil(comparison.facts.length / 3));
  factPage = Math.min(factPage, count - 1);
  element('dev-facts').innerHTML = comparison.facts.slice(factPage * 3, factPage * 3 + 3).map(fact => `<li>${escape(factSummary(fact))}</li>`).join('') || '<li>まだ確定した事実はありません。</li>';
  text('dev-facts-page', `${factPage + 1} / ${count}`);
  element<HTMLButtonElement>('dev-facts-prev').disabled = factPage === 0;
  element<HTMLButtonElement>('dev-facts-next').disabled = factPage === count - 1;
  text('dev-plan', comparison.planId); text('dev-sequence', `出題列（末尾3語）: ${state.wordIds.slice(-3).join(' → ')}`);
  text('dev-preparation', `準備操作${comparison.operations.length}件。すべての操作・事実は開発比較JSONに含まれます。`);
}
function paint() {
  if (!comparison) return;
  const state = snapshot();
  if (state.phase === 'RESULT') stopClock();
  element<HTMLFieldSetElement>('dev-editing').disabled = running;
  element<HTMLButtonElement>('dev-apply').disabled = running;
  element<HTMLButtonElement>('dev-resume').disabled = running || state.phase === 'RESULT' || (needsCheck && !checkPassed);
  element<HTMLButtonElement>('dev-pause').disabled = !running;
  gameInput.disabled = !running;
  element('dev-input-label').hidden = needsCheck;
  element('dev-input-check').hidden = !needsCheck;
  text('dev-phase', running ? state.phase : `${state.phase} · 調整可能`);
  text('dev-session-label', '開発専用・保存なし');
  text('dev-word-display', state.currentWord.display); element('dev-word-display').dataset.wordId = state.currentWord.id;
  text('dev-reading', state.currentWord.reading); text('dev-guide', state.remainingGuide);
  text('dev-score', String(state.score)); text('dev-base', String(state.baseScore)); text('dev-bonus', String(state.bonusScore));
  text('dev-cargo-state', `${state.cargoCount} / ${comparison.rules.maxCargo}`); text('dev-time', String(Math.ceil(state.remainingMs ?? 0)));
  text('dev-counts', `${state.completedWords} / ${state.mistakes}`); text('dev-message', state.message);
  element('dev-stage').dataset.sessionId = state.wordIds.length ? comparison.session.sessionId : '';
  element('dev-stage').dataset.phase = state.phase;
  paintFacts(state);
}
element('dev-form').addEventListener('submit', event => { event.preventDefault(); prepare(); });
element('dev-pause').addEventListener('click', () => pause());
element('dev-resume').addEventListener('click', () => {
  if (running || snapshot().phase === 'RESULT' || (needsCheck && !checkPassed)) return;
  needsCheck = false; checkAdapter?.destroy(); checkAdapter = undefined; adapter?.resetAfterInputCheck();
  clockAnchor = performance.now(); running = true; comparison.session.resume(now()); paint(); gameInput.focus({ preventScroll: true });
});
element('dev-word-mode').addEventListener('change', () => {
  const mode = element<HTMLSelectElement>('dev-word-mode').value;
  element('dev-word-field').hidden = mode !== 'fixed';
  document.querySelectorAll<HTMLElement>('[data-custom]').forEach(field => { field.hidden = mode !== 'custom'; });
});
input('dev-max-cargo').addEventListener('change', () => {
  const maximum = Number(input('dev-max-cargo').value);
  if (Number.isInteger(maximum) && maximum >= 3 && maximum <= 5) {
    input('dev-rates').value = Array.from({ length: maximum }, (_, index) => index + 1).join(','); input('dev-denominator').value = String(maximum); input('dev-cargo').max = String(maximum);
    if (Number(input('dev-cargo').value) > maximum) input('dev-cargo').value = String(maximum);
  }
});
input('dev-duration').addEventListener('change', () => {
  const duration = Number(input('dev-duration').value);
  input('dev-remaining').max = input('dev-duration').value;
  if (duration >= 60_000 && duration <= 120_000 && Number(input('dev-remaining').value) > duration) input('dev-remaining').value = String(duration);
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-left-tab]')) button.addEventListener('click', () => {
  pause();
  const selected = button.dataset.leftTab!;
  document.querySelectorAll<HTMLButtonElement>('[data-left-tab]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  document.querySelectorAll<HTMLElement>('[data-left-panel]').forEach(panel => { panel.hidden = panel.dataset.leftPanel !== selected; });
  element('dev-catalog').hidden = selected !== 'catalog'; element('dev-form').hidden = selected === 'catalog'; element('dev-stage').hidden = selected === 'catalog'; element('dev-app').dataset.catalog = String(selected === 'catalog');
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-right-tab]')) button.addEventListener('click', () => {
  pause();
  document.querySelectorAll<HTMLButtonElement>('[data-right-tab]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  document.querySelectorAll<HTMLElement>('[data-right-panel]').forEach(panel => { panel.hidden = panel.dataset.rightPanel !== button.dataset.rightTab; });
});
element('dev-facts-prev').addEventListener('click', () => { factPage--; paint(); });
element('dev-facts-next').addEventListener('click', () => { factPage++; paint(); });
element('dev-export').addEventListener('click', () => {
  pause();
  const url = URL.createObjectURL(new Blob([JSON.stringify(comparisonExport(comparison, snapshot()), null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'kotobabin-development-comparison.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
});
function paintParameters() {
  document.querySelectorAll<HTMLElement>('#dev-parameters > article').forEach((card, index) => { card.hidden = Math.floor(index / 7) !== parameterPage; });
  element<HTMLButtonElement>('dev-parameters-prev').disabled = parameterPage === 0;
  element<HTMLButtonElement>('dev-parameters-next').disabled = parameterPage === 1;
  text('dev-parameters-page', `${parameterPage + 1} / 2`);
}
element('dev-parameters-prev').addEventListener('click', () => { parameterPage = 0; paintParameters(); });
element('dev-parameters-next').addEventListener('click', () => { parameterPage = 1; paintParameters(); });
paintParameters();
const timer = setInterval(() => { if (running) { comparison.session.tick(adapter?.deadlineTime(now()) ?? now()); consume(); paint(); } }, 80);
window.addEventListener('pagehide', () => { clearInterval(timer); adapter?.destroy(); checkAdapter?.destroy(); });
prepare();
