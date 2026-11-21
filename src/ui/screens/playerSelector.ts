import type { LocalPlayer } from '@/progression/playerRegistry';
import { renderPlayerName } from '../components/playerName';
import { assetImg, el } from '../utils/dom';

interface PlayerSelectorProps {
  players: readonly LocalPlayer[];
  onChoose: (player: LocalPlayer) => Promise<void>;
  onAdd: (name: string) => Promise<void>;
  onClose?: () => void;
  readPlayerSummary: (player: LocalPlayer) => Promise<{ stampCount: number; titleName: string | null }>;
}

export function renderPlayerSelector(props: PlayerSelectorProps): HTMLElement {
  const { players, onChoose, onAdd, onClose, readPlayerSummary } = props;
  const name = el('input', { id: 'kb-new-player-name', type: 'text', maxlength: 20, required: true, autocomplete: 'off' });
  const status = el('p', { className: 'kb-player-status kb-small', role: 'status' });
  const screen = el('section', { className: 'kb-card kb-stack-md', 'aria-labelledby': 'kb-player-selector-title', 'data-testid': 'player-selector' });
  const back = onClose ? el('button', { type: 'button', className: 'kb-btn-secondary' }, '戻る') : null;
  if (back && onClose) back.addEventListener('click', onClose);
  const choices = players.map((player) => {
    const nameId = `kb-player-name-${player.id}`;
    const summary = el('span', { id: `kb-player-achievements-${player.id}`, className: 'kb-player-achievements kb-small' }, '切手を確認中');
    const identity = renderPlayerName(player.name, null, nameId);
    const button = el('button', {
      type: 'button', className: 'kb-btn-secondary kb-player-choice', 'data-player-id': player.id,
      'aria-labelledby': nameId, 'aria-describedby': summary.id,
    }, identity, summary);
    void readPlayerSummary(player).then(
      ({ stampCount, titleName }) => {
        if (titleName) {
          identity.replaceWith(renderPlayerName(player.name, titleName, nameId));
          button.setAttribute('aria-describedby', `${nameId}-title ${summary.id}`);
        }
        summary.textContent = `切手 ${stampCount}枚`;
      },
      () => { summary.textContent = '切手の枚数を表示できません'; },
    );
    button.addEventListener('click', () => void run(() => onChoose(player), button));
    return button;
  });
  const submit = el('button', { type: 'submit', className: 'kb-btn-primary' }, '追加する');
  const controls = [...choices, name, submit, ...(back ? [back] : [])];
  const form = el(
    'form',
    { className: 'kb-player-form' },
    el('div', { className: 'kb-stack-xs' }, el('label', { for: name.id }, '新しいプレイヤーの名前'), name),
    submit,
  );

  let busy = false;
  async function run(action: () => Promise<void>, trigger: HTMLElement): Promise<void> {
    if (busy) return;
    busy = true;
    status.textContent = '';
    screen.setAttribute('aria-busy', 'true');
    for (const control of controls) control.disabled = true;
    try {
      await action();
    } catch {
      status.textContent = 'プレイヤーの操作を完了できませんでした。もう一度お試しください。';
    } finally {
      busy = false;
      screen.removeAttribute('aria-busy');
      for (const control of controls) control.disabled = false;
      if (screen.isConnected) trigger.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = name.value.trim();
    if (!value) {
      status.textContent = '名前を入力してください。';
      name.focus();
      return;
    }
    if (players.some((player) => player.name === value)) {
      status.textContent = '同じ名前のプレイヤーがいます。別の名前を入力してください。';
      name.focus();
      return;
    }
    void run(() => onAdd(value), name);
  });
  if (!onClose) screen.append(el('div', { className: 'kb-brand' }, assetImg('./assets/brand/brand_mark.svg', '', { decorative: true, width: 36, height: 36 }), 'ことば便'));
  screen.append(
    el(
      'div', { className: 'kb-row-between' },
      el(onClose ? 'h2' : 'h1', { className: 'kb-h2', id: 'kb-player-selector-title' }, 'プレイヤーを選ぶ'),
      back,
    ),
    el('div', { className: 'kb-player-choices' }, ...choices),
    form,
    status,
  );
  return screen;
}
