import type { SessionSnapshot } from '../typing';

type LayoutSnapshot = Pick<SessionSnapshot, 'mode' | 'completedWords' | 'awaitingWordChoice' | 'tutorialDelivered' | 'tutorialFallbackAvailable' | 'phase'>;
interface Panel { id: string; label: string; element: HTMLElement }
interface Layout {
  workspace: HTMLElement;
  panels: Panel[];
  selected: number;
  choiceToken: string;
  goalNote: HTMLElement;
  shortcut: HTMLElement;
  show(index: number): void;
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
  addPanel('goal', '今回の目標', ['#game-goal-slot']);
  addPanel('city', '街へのお届け', ['.play-city-strip']);
  addPanel('save', '保存の状態', ['[data-save-status]']);
  const message = root.querySelector<HTMLElement>('#game-message');
  if (message) mainColumn.insertBefore(message, mainColumn.querySelector('.play-bottom'));
  const cargo = root.querySelector<HTMLElement>('.cargo-area');
  if (cargo) sidebar.append(cargo);
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
  sidebar.append(toolbar, panelBody);
  const goalNote = document.createElement('p');
  goalNote.className = 'game-goal-empty';
  goalNote.textContent = '配達手帳で、挑戦したい切手を目標に選べます。';
  panels.find(panel => panel.id === 'goal')?.element.append(goalNote);
  const previous = toolbar.querySelector<HTMLButtonElement>('[data-game-panel-step="-1"]')!;
  const next = toolbar.querySelector<HTMLButtonElement>('[data-game-panel-step="1"]')!;
  const label = toolbar.querySelector<HTMLElement>('.game-panel-label')!;
  const layout: Layout = {
    workspace, panels, selected: 0, choiceToken: '', goalNote, shortcut,
    show(index) {
      layout.selected = Math.max(0, Math.min(panels.length - 1, index));
      panels.forEach((panel, i) => { panel.element.hidden = i !== layout.selected; });
      const panel = panels[layout.selected];
      if (!panel) return;
      label.textContent = `${panel.label} ${layout.selected + 1}/${panels.length}`;
      previous.disabled = layout.selected === 0;
      next.disabled = layout.selected === panels.length - 1;
      previous.setAttribute('aria-controls', panel.element.id);
      next.setAttribute('aria-controls', panel.element.id);
      if (panels[layout.selected - 1]) previous.setAttribute('aria-label', `前の表示：${panels[layout.selected - 1].label}`);
      if (panels[layout.selected + 1]) next.setAttribute('aria-label', `次の表示：${panels[layout.selected + 1].label}`);
    },
    destroy() { abort.abort(); if (layouts.get(root) === layout) layouts.delete(root); },
  };
  toolbar.addEventListener('pointerdown', event => {
    // Pointer paging must not steal the physical keyboard's confirmed input focus.
    if ((event.target as Element).closest('button') && document.activeElement === root.querySelector('#game-input')) event.preventDefault();
  }, { signal: abort.signal });
  toolbar.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-game-panel-step]');
    if (button && !button.disabled) layout.show(layout.selected + Number(button.dataset.gamePanelStep));
  }, { signal: abort.signal });
  layouts.set(root, layout);
  layout.show(mode === 'MAIN' ? 0 : panels.findIndex(panel => panel.id === 'mode'));
  return layout.destroy;
}

/** Call before the existing choice-focus routine, after mode controls are patched. */
export function refreshGameLayout(root: HTMLElement, snapshot: LayoutSnapshot): void {
  const layout = layouts.get(root);
  if (!layout || !layout.workspace.isConnected) return;
  layout.shortcut.textContent = `配達 ${root.querySelector('.deliver-button kbd')?.textContent ?? 'Space'}`;
  layout.goalNote.hidden = Boolean(root.querySelector('#game-goal-slot')?.textContent?.trim());
  const choice = snapshot.mode !== 'MAIN' && (snapshot.awaitingWordChoice || snapshot.tutorialDelivered || snapshot.tutorialFallbackAvailable);
  const token = choice ? `${snapshot.mode}:${snapshot.completedWords}:${snapshot.awaitingWordChoice}:${snapshot.tutorialDelivered}:${snapshot.tutorialFallbackAvailable}` : '';
  if (token && token !== layout.choiceToken && snapshot.phase !== 'PAUSED') {
    const modePanel = layout.panels.findIndex(panel => panel.id === 'mode');
    if (modePanel >= 0) layout.show(modePanel);
  }
  layout.choiceToken = token;
}
