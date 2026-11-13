import type { SessionSnapshot } from '../typing';

type LayoutSnapshot = Pick<SessionSnapshot, 'mode' | 'completedWords' | 'awaitingWordChoice' | 'tutorialDelivered' | 'tutorialFallbackAvailable' | 'phase'>;
interface Panel { id: string; label: string; element: HTMLElement }
interface Layout {
  workspace: HTMLElement;
  panels: Panel[];
  selected: number;
  choiceToken: string;
  phase: LayoutSnapshot['phase'] | null;
  goalNote: HTMLElement;
  shortcut: HTMLElement;
  expanded: boolean;
  show(index: number, expanded?: boolean): void;
  destroy(): void;
}
const layouts = new WeakMap<HTMLElement, Layout>();

/** Install after the initial game wrappers are built, before attaching/focusing input.
 * The typing input never moves here. Right-side information has explicit pages,
 * rather than being clipped or placed in a scrolling sub-window.
 */
export function installGameLayout(root: HTMLElement): () => void {
  layouts.get(root)?.destroy();
  const workspace = root.querySelector<HTMLElement>('.game-workspace');
  const sidebar = root.querySelector<HTMLElement>('.game-sidebar');
  const mainColumn = root.querySelector<HTMLElement>('.game-main-column');
  if (!workspace || !sidebar || !mainColumn) return () => {};
  const consoleStage = Boolean(root.querySelector('.typing-game-stage'));
  const abort = new AbortController();
  const panels: Panel[] = [];
  const addPanel = (id: string, label: string, selectors: string[]) => {
    const element = document.createElement('section');
    element.className = 'game-side-panel';
    element.id = `game-panel-${id}`;
    element.dataset.gamePanel = id;
    element.setAttribute('role', 'region');
    element.setAttribute('aria-label', label);
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node) element.append(node);
    }
    if (!element.childElementCount) return;
    panels.push({ id, label, element });
  };
  addPanel('delivery', '配達', ['.delivery-area']);
  const mode = root.querySelector<HTMLElement>('.game-page')?.dataset.mode;
  if (mode !== 'MAIN') addPanel('mode', mode === 'TUTORIAL' ? '導入の案内' : '練習の操作', ['#tutorial-status', '#practice-actions']);
  else for (const selector of ['#tutorial-status', '#practice-actions']) {
    const node = root.querySelector(selector);
    if (node) panels[0]?.element.append(node);
  }
  if (consoleStage && mode !== 'MAIN') {
    const notes = document.createElement('div'); notes.className = 'game-mode-notes';
    const element = document.createElement('section'); element.className = 'game-side-panel'; element.id = 'game-panel-mode-notes'; element.dataset.gamePanel = 'mode-notes'; element.setAttribute('aria-label', '遊び方の案内'); element.append(notes);
    panels.push({ id: 'mode-notes', label: '遊び方の案内', element });
  }
  addPanel('goal', '今回の目標', ['#game-goal-slot']);
  addPanel('city', '街へのお届け', ['.play-city-strip']);
  addPanel('save', '保存の状態', ['[data-save-status]']);
  const message = root.querySelector<HTMLElement>('#game-message');
  if (message && !consoleStage) mainColumn.insertBefore(message, mainColumn.querySelector('.play-bottom'));
  const cargo = root.querySelector<HTMLElement>('.cargo-area');
  if (cargo && !consoleStage) sidebar.append(cargo);
  const shortcut = document.createElement('span');
  shortcut.className = 'game-delivery-shortcut';
  shortcut.textContent = `配達 ${root.querySelector('.deliver-button kbd')?.textContent ?? 'Space'}`;
  root.querySelector('.typing-entry-row')?.append(shortcut);
  root.querySelector('.game-sidebar-primary')?.remove();
  root.querySelector('.game-sidebar-details')?.remove();
  const toolbar = document.createElement('nav');
  toolbar.className = 'game-panel-controls';
  toolbar.setAttribute('aria-label', '配達画面の情報を切り替える');
  toolbar.innerHTML = '<button type="button" class="game-panel-step" data-game-panel-step="-1" aria-label="前の表示">←</button><strong class="game-panel-label" aria-live="polite"></strong><button type="button" class="game-panel-step" data-game-panel-step="1" aria-label="次の表示">→</button>';
  const panelBody = document.createElement('div');
  panelBody.className = 'game-panel-body';
  for (const panel of panels) panelBody.append(panel.element);
  if (consoleStage && mode === 'PRACTICE') {
    const progress = document.createElement('div'); progress.className = 'game-practice-progress-hud'; sidebar.append(progress);
  }
  sidebar.append(toolbar, panelBody);
  const goalNote = document.createElement('p');
  goalNote.className = 'game-goal-empty';
  goalNote.textContent = '配達手帳で、挑戦したい切手を目標に選べます。';
  panels.find(panel => panel.id === 'goal')?.element.append(goalNote);
  const previous = toolbar.querySelector<HTMLButtonElement>('[data-game-panel-step="-1"]')!;
  const next = toolbar.querySelector<HTMLButtonElement>('[data-game-panel-step="1"]')!;
  const label = toolbar.querySelector<HTMLElement>('.game-panel-label')!;
  const input = root.querySelector<HTMLInputElement>('#game-input');
  const cue = document.createElement('span');
  cue.id = 'game-panel-shortcuts';
  cue.className = 'game-panel-shortcuts';
  cue.textContent = 'PageUp / PageDown';
  toolbar.insertBefore(cue, toolbar.lastElementChild);
  const describedBy = input?.getAttribute('aria-describedby');
  if (input) input.setAttribute('aria-describedby', [describedBy, cue.id].filter(Boolean).join(' '));
  const layout: Layout = {
    workspace, panels, selected: 0, choiceToken: '', phase: null, goalNote, shortcut, expanded: true,
    show(index, expanded = true) {
      layout.expanded = expanded;
      panelBody.hidden = consoleStage && !expanded;
      layout.selected = Math.max(0, Math.min(panels.length - 1, index));
      panels.forEach((panel, i) => { panel.element.hidden = i !== layout.selected; });
      const panel = panels[layout.selected];
      if (!panel) return;
      label.textContent = `${panel.label} ${layout.selected + 1}/${panels.length}`;
      previous.disabled = layout.selected === 0 && (!consoleStage || !expanded);
      previous.textContent = consoleStage && layout.selected === 0 && expanded ? '×' : '←';
      if (consoleStage && layout.selected === 0 && expanded) previous.setAttribute('aria-label', '情報を閉じる');
      next.disabled = layout.selected === panels.length - 1;
      previous.setAttribute('aria-controls', panel.element.id);
      next.setAttribute('aria-controls', panel.element.id);
      if (panels[layout.selected - 1]) previous.setAttribute('aria-label', `前の表示：${panels[layout.selected - 1].label}`);
      if (consoleStage && mode === 'PRACTICE' && !expanded) next.setAttribute('aria-label', '練習の操作を開く');
      else if (panels[layout.selected + 1]) next.setAttribute('aria-label', `次の表示：${panels[layout.selected + 1].label}`);
    },
    destroy() {
      abort.abort();
      if (input) { if (describedBy === null) input.removeAttribute('aria-describedby'); else input.setAttribute('aria-describedby', describedBy ?? ''); }
      if (layouts.get(root) === layout) layouts.delete(root);
    },
  };
  toolbar.addEventListener('pointerdown', event => {
    // Pointer paging must not steal the physical keyboard's confirmed input focus.
    if ((event.target as Element).closest('button') && document.activeElement === root.querySelector('#game-input')) event.preventDefault();
  }, { signal: abort.signal });
  toolbar.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-game-panel-step]');
    if (button && !button.disabled) {
      const step = Number(button.dataset.gamePanelStep);
      if (consoleStage && step === -1 && layout.selected === 0 && layout.expanded) layout.show(0, false);
      else layout.show(consoleStage && mode === 'PRACTICE' && !layout.expanded && step === 1 ? layout.selected : layout.selected + step);
    }
  }, { signal: abort.signal });
  input?.addEventListener('keydown', event => {
    if (!event.isTrusted || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat
      || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || document.activeElement !== input) return;
    const step = event.key === 'PageDown' ? 1 : event.key === 'PageUp' ? -1 : 0;
    if (!step) return;
    // Information paging never leaves confirmed typing focus or mutates the session.
    event.preventDefault();
    if (consoleStage && step === -1 && layout.selected === 0 && layout.expanded) layout.show(0, false);
    else layout.show(consoleStage && mode === 'PRACTICE' && !layout.expanded && step === 1 ? layout.selected : layout.selected + step);
  }, { signal: abort.signal });
  layouts.set(root, layout);
  const pinnedGoal = Boolean(root.querySelector('#game-goal-slot [data-goal-kind="pinned"]'));
  layout.show(mode === 'MAIN' ? (pinnedGoal ? panels.findIndex(panel => panel.id === 'goal') : 0) : panels.findIndex(panel => panel.id === 'mode'), !(consoleStage && ((mode === 'MAIN' && !pinnedGoal) || mode === 'PRACTICE')));
  return layout.destroy;
}

/** Call before the existing choice-focus routine, after mode controls are patched. */
export function refreshGameLayout(root: HTMLElement, snapshot: LayoutSnapshot): void {
  const layout = layouts.get(root);
  if (!layout || !layout.workspace.isConnected) return;
  layout.shortcut.textContent = `配達 ${root.querySelector('.deliver-button kbd')?.textContent ?? 'Space'}`;
  const notes = root.querySelector<HTMLElement>('.game-mode-notes');
  if (notes) {
    const paragraphs = [...root.querySelectorAll<HTMLElement>(snapshot.mode === 'PRACTICE' ? '#practice-actions > p:not(:first-child)' : '#tutorial-status p')];
    if (paragraphs.length) notes.replaceChildren(...paragraphs);
  }
  const practiceProgress = root.querySelector<HTMLElement>('#practice-actions > #practice-progress');
  if (practiceProgress) root.querySelector('.game-practice-progress-hud')?.replaceChildren(practiceProgress);
  const pinnedGoal = Boolean(root.querySelector('#game-goal-slot [data-goal-kind="pinned"]'));
  layout.goalNote.hidden = Boolean(root.querySelector('#game-goal-slot')?.textContent?.trim());
  if (snapshot.mode === 'MAIN' && pinnedGoal && layout.phase === 'PAUSED' && (snapshot.phase === 'READY' || snapshot.phase === 'PLAYING')) {
    const goalPanel = layout.panels.findIndex(panel => panel.id === 'goal');
    if (goalPanel >= 0) layout.show(goalPanel);
  }
  layout.phase = snapshot.phase;
  const choice = snapshot.mode !== 'MAIN' && (snapshot.awaitingWordChoice || snapshot.tutorialDelivered || snapshot.tutorialFallbackAvailable);
  const token = choice ? `${snapshot.mode}:${snapshot.completedWords}:${snapshot.awaitingWordChoice}:${snapshot.tutorialDelivered}:${snapshot.tutorialFallbackAvailable}` : '';
  if (token && token !== layout.choiceToken && snapshot.phase !== 'PAUSED') {
    const modePanel = layout.panels.findIndex(panel => panel.id === 'mode');
    if (modePanel >= 0) layout.show(modePanel);
  }
  if (!token && layout.choiceToken && snapshot.mode === 'PRACTICE' && root.querySelector('.typing-game-stage')) {
    const modePanel = layout.panels.findIndex(panel => panel.id === 'mode');
    if (modePanel >= 0) layout.show(modePanel, false);
  }
  layout.choiceToken = token;
}
