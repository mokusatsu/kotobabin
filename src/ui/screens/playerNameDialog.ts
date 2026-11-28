import { MAX_PLAYER_NAME_LENGTH } from '@/progression/playerRegistry';
import { el } from '../utils/dom';

export function openPlayerNameDialog(currentName: string, save: (name: string) => Promise<void>, restoreFocus: () => void): void {
  if (document.querySelector('.kb-player-dialog[open]')) return;
  const dialog = el('dialog', { className: 'kb-player-dialog', 'aria-labelledby': 'kb-edit-player-title', 'data-testid': 'player-name-dialog' });
  const input = el('input', {
    id: 'kb-edit-player-name', type: 'text', maxlength: MAX_PLAYER_NAME_LENGTH,
    autocomplete: 'off', autofocus: true, 'aria-describedby': 'kb-edit-player-status',
  });
  input.value = currentName;
  const status = el('p', { id: 'kb-edit-player-status', className: 'kb-player-status kb-small', role: 'status' });
  const cancel = el('button', { type: 'button', className: 'kb-btn-secondary' }, 'キャンセル');
  const submit = el('button', { type: 'submit', className: 'kb-btn-primary' }, '保存');
  const form = el('form', { className: 'kb-player-form' },
    el('div', { className: 'kb-stack-xs' }, el('label', { for: input.id }, 'プレイヤー名'), input),
    el('div', { className: 'kb-row-wrap kb-player-name-actions' }, cancel, submit),
  );
  dialog.append(el('section', { className: 'kb-card kb-stack-md' },
    el('h2', { id: 'kb-edit-player-title', className: 'kb-h2' }, '名前を変更'), form, status,
  ));
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', (event) => { if (submit.disabled) event.preventDefault(); });
  dialog.addEventListener('close', () => {
    dialog.remove();
    restoreFocus();
  });
  input.addEventListener('input', () => {
    status.textContent = '';
    input.removeAttribute('aria-invalid');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const name = input.value.trim();
    if (!name) {
      status.textContent = '名前を入力してください。';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    for (const control of [input, cancel, submit]) control.disabled = true;
    try {
      await save(name);
      dialog.close();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'ConstraintError') {
        status.textContent = '同じ名前のプレイヤーがいます。別の名前を入力してください。';
        input.setAttribute('aria-invalid', 'true');
      } else {
        status.textContent = '名前を保存できませんでした。もう一度お試しください。';
      }
      for (const control of [input, cancel, submit]) control.disabled = false;
      input.focus();
    }
  });
  document.body.append(dialog);
  dialog.showModal();
  input.select();
}
