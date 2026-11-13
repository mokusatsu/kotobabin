import catalog from '../../spec/initial/data/achievement_catalog.json';
import type { AchievementView } from '../profile/achievements';
import { stampArtwork } from './handbook';

export type ResultStagePhase = 'score' | 'sealed' | 'reveal' | 'summary';
export type ResultStageAction = 'retry' | 'new-round' | 'home' | 'handbook' | 'review' | 'details';
export interface ResultStageState {
  readonly queue: readonly string[];
  readonly phase: ResultStagePhase;
  readonly index: number;
  readonly animating: boolean;
  readonly reducedMotion: boolean;
}
export interface ResultStageScore {
  score: number;
  baseScore: number;
  bonusScore: number;
  completedWords: number;
  accuracy: number | null;
  canonicalKpm: number | null;
  courseName: string;
  assisted: boolean;
  guideUsed: boolean;
}
export interface ResultStageOptions {
  result: ResultStageScore;
  /** Already committed by the achievement engine, in actual acquisition order. */
  newAchievementIds: readonly string[];
  reducedMotion: boolean;
  hasReview?: boolean;
  /** In-memory presentation continuation, never a save-data or award mutation. */
  resumeState?: ResultStageState;
  onStateChange?(state: ResultStageState): void;
  renderStamp?: (id: string) => string;
  onAction(action: ResultStageAction): void;
  /** Presentation/audio only. Never award, save, or mark rewards read here. */
  onPresentationEvent?(phase: ResultStagePhase, achievementId?: string): void;
}
export interface ResultStageController { snapshot(): ResultStageState; destroy(): void }
const definitions = new Map(catalog.achievements.map(a => [a.id, a]));
const esc = (value: string) => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]!);
const number = (value: number) => value.toLocaleString('ja-JP');

/** This queue contains presentation state only; no award or profile state is modified. */
export function createResultStage(ids: readonly string[], reducedMotion = false, resumeState?: ResultStageState): ResultStageState {
  const queue = [...new Set(ids)];
  if (queue.some(id => !definitions.has(id))) throw new Error('Result presentation requires known confirmed achievement IDs');
  if (resumeState) {
    if (resumeState.queue.length !== queue.length || resumeState.queue.some((id, index) => id !== queue[index])
      || !['score','sealed','reveal','summary'].includes(resumeState.phase) || !Number.isInteger(resumeState.index)
      || resumeState.index < 0 || (queue.length > 0 && resumeState.index >= queue.length)
      || (queue.length === 0 && ['sealed','reveal'].includes(resumeState.phase))) throw new Error('Result continuation must match the original confirmed award queue');
    return { ...resumeState, queue, reducedMotion, animating: false, phase: reducedMotion && resumeState.phase === 'sealed' ? 'reveal' : resumeState.phase };
  }
  return { queue, phase: 'score', index: 0, animating: !reducedMotion, reducedMotion };
}
export function advanceResultStage(state: ResultStageState): ResultStageState {
  if (state.phase === 'summary') return state;
  if (state.phase === 'score') return state.queue.length
    ? { ...state, phase: state.reducedMotion ? 'reveal' : 'sealed', animating: !state.reducedMotion }
    : { ...state, phase: 'summary', animating: false };
  if (state.phase === 'sealed') return { ...state, phase: 'reveal', animating: !state.reducedMotion };
  if (state.index + 1 < state.queue.length) return { ...state, index: state.index + 1, phase: state.reducedMotion ? 'reveal' : 'sealed', animating: !state.reducedMotion };
  return { ...state, phase: 'summary', animating: false };
}
/** A timer finishing a visual never advances the queue or creates an award. */
export function finishResultAnimation(state: ResultStageState): ResultStageState {
  return state.animating ? { ...state, animating: false } : state;
}
export function skipResultAnimation(state: ResultStageState): ResultStageState {
  return state.phase === 'sealed' ? { ...state, phase: 'reveal', animating: false } : finishResultAnimation(state);
}
export function skipAllResultStage(state: ResultStageState): ResultStageState {
  return state.phase === 'summary' ? state : { ...state, phase: 'summary', animating: false };
}

const envelope = '<svg class="result-stage-envelope" viewBox="0 0 360 260" aria-hidden="true"><path class="envelope-shadow" d="M28 65h304v176H28z"/><path class="envelope-paper" d="M25 45h310v180H25z"/><path class="envelope-fold" d="m25 45 155 112L335 45"/><path class="envelope-front" d="m25 225 116-101m194 101L219 124"/><circle class="envelope-seal" cx="180" cy="152" r="25"/><path class="envelope-seal-mark" d="m165 147 15 12 15-12m-30 18h30"/></svg>';
function defaultStamp(id: string): string {
  const a = definitions.get(id)!;
  const view: AchievementView = { id, name:a.name, condition:a.condition, familyId:a.family_id, scope:a.scope, hidden:a.hidden, hiddenHint:a.hidden_hint, hiddenRevealed:true, earned:true, unread:true, provisional:false, ineligible:false, eligibleModes:'', progress:[] };
  return stampArtwork(view);
}
function awardArtwork(id: string, render?: (id: string) => string): string {
  const markup = (render ?? defaultStamp)(id);
  // The handbook's unfinished-art placeholder contains an internal asset code.
  // Keep the truthful unfinished-art notice here, without presenting that code as a reward.
  return markup.includes('stamp-placeholder')
    ? '<div class="result-stage-unfinished-art"><span class="result-stage-postal-emblem" aria-hidden="true">✉</span><span>切手の絵柄は制作中</span></div>'
    : markup;
}
function metrics(result: ResultStageScore): string {
  return `<dl class="result-stage-metrics"><div><dt>完成したことば</dt><dd>${number(result.completedWords)}<small>語</small></dd></div><div><dt>正確率</dt><dd>${result.accuracy === null ? '計測なし' : `${result.accuracy.toFixed(1)}<small>%</small>`}</dd></div><div><dt>基準打鍵 / 分</dt><dd>${result.canonicalKpm === null ? '計測なし' : result.canonicalKpm.toFixed(1)}</dd></div></dl>`;
}
function scoreValue(result: ResultStageScore): string {
  return `<p class="result-stage-value"><strong>${number(result.score)}</strong><span>点</span></p><p class="result-stage-breakdown">完成点 ${number(result.baseScore)} ＋ 配達ボーナス ${number(result.bonusScore)}</p>`;
}

/** Inspectable markup, with no timers, randomness, storage or animation callbacks. */
export function renderResultStage(state: ResultStageState, options: ResultStageOptions): string {
  const result = options.result;
  let body = '';
  let actions = '';
  let announcement = '';
  if (state.phase === 'score') {
    announcement = `90秒の配達が完了しました。${number(result.score)}点。新しい切手は${state.queue.length}枚です。`;
    body = `<div class="result-stage-score-scene"><p class="result-stage-kicker">90秒の配達、完了。</p><h1 id="result-stage-title">ことばが、届きました。</h1>${scoreValue(result)}${metrics(result)}<p class="result-stage-new-count">${state.queue.length ? `新しい切手が <strong>${state.queue.length}枚</strong> 届いています。` : '今回は、新しい切手の獲得はありません。'}</p></div>`;
    actions = `<button type="button" class="result-stage-primary" data-result-command="advance">${state.queue.length ? '届いた切手を見る' : '今回の配達を振り返る'} <span aria-hidden="true">→</span></button>`;
  } else if (state.phase === 'sealed') {
    announcement = `新しい切手、${state.index + 1}枚目。封筒を開いて確かめましょう。`;
    body = `<div class="result-stage-sealed-scene"><p class="result-stage-kicker">新しい切手 ${state.index + 1} / ${state.queue.length}</p><h1 id="result-stage-title">あなたに、一枚のお届け。</h1><div class="result-stage-envelope-display">${envelope}</div><p>できたことが、切手になりました。</p></div>`;
    actions = '<button type="button" class="result-stage-primary" data-result-command="advance">封筒を開く <span aria-hidden="true">→</span></button>';
  } else if (state.phase === 'reveal') {
    const a = definitions.get(state.queue[state.index])!;
    announcement = `新しい切手「${a.name}」を獲得。${a.condition}。同じ名前の称号も獲得しました。`;
    body = `<div class="result-stage-reveal-scene" data-result-award="${a.id}"><div class="result-stage-art-display"><div class="result-stage-rays" aria-hidden="true"></div><div class="result-stage-stamp">${awardArtwork(a.id, options.renderStamp)}</div></div><div class="result-stage-award-copy"><p class="result-stage-kicker">新しい切手 ${state.index + 1} / ${state.queue.length}</p><h1 id="result-stage-title">${esc(a.name)}</h1><p class="result-stage-award-condition">${esc(a.condition)}</p><div class="result-stage-earned-label"><span>切手を獲得</span><span>称号「${esc(a.name)}」を獲得</span></div><p class="result-stage-retained">配達の成果として、すでに確定しています。</p></div></div>`;
    actions = `<button type="button" class="result-stage-primary" data-result-command="advance">${state.index + 1 < state.queue.length ? '次の切手へ' : '結果をまとめる'} <span aria-hidden="true">→</span></button>`;
  } else {
    announcement = `今回の配達は${number(result.score)}点。新しく獲得した切手は${state.queue.length}枚です。`;
    const preview = state.queue.slice(0, 3).map(id => `<div class="result-stage-mini-stamp" aria-hidden="true">${awardArtwork(id, options.renderStamp)}</div>`).join('');
    body = `<div class="result-stage-summary-scene"><div><p class="result-stage-kicker">今回の配達</p><h1 id="result-stage-title">また、ひとつ先へ。</h1>${scoreValue(result)}${metrics(result)}</div><div class="result-stage-collection"><p>新しく集まった切手</p><strong class="result-stage-collection-count">${state.queue.length}<small>枚</small></strong>${preview ? `<div class="result-stage-stamp-preview">${preview}</div>` : '<p>次の一語から、また届けよう。</p>'}<p>${state.queue.length ? '切手と称号は、配達手帳で確かめられます。' : '獲得条件と進捗は、配達手帳で確かめられます。'}</p></div></div>`;
    actions = '<button type="button" class="result-stage-primary" data-result-action="retry">同じ問題でもう一度</button><button type="button" data-result-action="new-round">別の問題で配達</button><button type="button" data-result-action="handbook">配達手帳を見る</button><button type="button" data-result-action="details">詳しい配達記録</button>' + (options.hasReview ? '<button type="button" data-result-action="review">まちがえたことばを復習</button>' : '');
  }
  return `<section class="result-stage" data-result-phase="${state.phase}" data-animating="${state.animating}" data-reduced-motion="${state.reducedMotion}" aria-labelledby="result-stage-title"><header class="result-stage-topbar"><p>ことば便 <span>${esc(result.courseName)} · ${result.assisted ? '救済あり' : '通常'} · ${result.guideUsed ? 'ガイド表示あり' : 'ガイド表示なし'}</span></p><button type="button" data-result-action="home">ホームへ</button></header><div class="result-stage-scene">${body}</div><footer class="result-stage-bottom"><div class="result-stage-actions">${actions}${state.phase !== 'summary' ? '<button type="button" class="result-stage-skip" data-result-command="skip-all">すべての演出を省略 <kbd>S</kbd></button>' : ''}</div><p class="result-stage-key-help">${state.phase === 'summary' ? 'Space / Enter：選んだ操作を決定' : 'Space / Enter：次へ　 Esc：今の動きを省略　 S：すべて省略'}</p></footer><p class="sr-only" role="status" aria-live="polite" aria-atomic="true">${esc(announcement)}</p></section>`;
}

/** Mount in a dedicated empty main/host, outside ordinary article pagination. */
export function mountResultStage(container: HTMLElement, options: ResultStageOptions): ResultStageController {
  const reduced = options.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state = createResultStage(options.newAchievementIds, reduced, options.resumeState);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  const abort = new AbortController();
  container.classList.add('result-stage-host');
  container.setAttribute('data-ipad-exclude', '');
  const draw = () => {
    if (destroyed) return;
    clearTimeout(timer);
    container.innerHTML = renderResultStage(state, options);
    options.onStateChange?.(structuredClone(state));
    const primary = container.querySelector<HTMLButtonElement>('[data-result-command="advance"], [data-result-action="retry"]');
    primary?.focus({preventScroll:true});
    try { options.onPresentationEvent?.(state.phase, state.phase === 'reveal' ? state.queue[state.index] : undefined); } catch { /* Optional audio cannot gate presentation. */ }
    if (state.animating) timer = setTimeout(() => {
      state = finishResultAnimation(state);
      options.onStateChange?.(structuredClone(state));
      container.querySelector<HTMLElement>('.result-stage')?.setAttribute('data-animating', 'false');
    }, 850);
  };
  const change = (next: ResultStageState) => {
    if (next === state) return;
    if (next.phase === state.phase && next.index === state.index) {
      state = next; clearTimeout(timer);
      options.onStateChange?.(structuredClone(state));
      container.querySelector<HTMLElement>('.result-stage')?.setAttribute('data-animating', String(next.animating));
    } else { state = next; draw(); }
  };
  container.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!button || !container.contains(button)) return;
    const command = button.dataset.resultCommand;
    if (command === 'advance') change(advanceResultStage(state));
    else if (command === 'skip-all') change(skipAllResultStage(state));
    else if (button.dataset.resultAction) options.onAction(button.dataset.resultAction as ResultStageAction);
    event.stopPropagation();
  }, {signal:abort.signal});
  document.addEventListener('keydown', event => {
    const target = event.target as Element | null;
    const active = document.activeElement;
    if (destroyed || event.defaultPrevented || event.isComposing || event.keyCode === 229
      || event.ctrlKey || event.altKey || event.metaKey || document.querySelector('dialog[open]')
      || target?.closest('input,textarea,select,[contenteditable="true"]')
      || (active !== document.body && active !== document.documentElement && (!active || !container.contains(active)))) return;
    if (event.repeat) {
      if (['Enter', ' ', 'Escape', 's', 'S'].includes(event.key)) {event.preventDefault();event.stopPropagation();}
      return;
    }
    if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();change(skipResultAnimation(state));}
    else if (event.key.toLowerCase() === 's') {event.preventDefault();event.stopPropagation();change(skipAllResultStage(state));}
    else if (event.key === 'Enter' || event.key === ' ') {
      const button = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!button || button.dataset.resultCommand === 'advance') {event.preventDefault();event.stopPropagation();change(advanceResultStage(state));}
    }
  }, {signal:abort.signal,capture:true});
  draw();
  return {
    snapshot: () => structuredClone(state),
    destroy() {destroyed = true;clearTimeout(timer);abort.abort();container.classList.remove('result-stage-host');container.removeAttribute('data-ipad-exclude');},
  };
}
