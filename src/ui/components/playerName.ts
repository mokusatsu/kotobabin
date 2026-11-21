import { el } from '../utils/dom';

export function renderPlayerName(name: string, title: string | null, nameId?: string): HTMLElement {
  return el('span', { className: 'kb-player-identity' },
    title ? el('span', { className: 'kb-title-chip', id: nameId ? `${nameId}-title` : undefined }, title) : null,
    el('span', { className: 'kb-player-name', id: nameId }, name),
  );
}
