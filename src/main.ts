import './ui/styles/tokens.css';
import './ui/styles/main.css';
import { addPlayer, DEFAULT_PLAYER, listPlayers, playerStorageKey, renamePlayer, type LocalPlayer } from './progression/playerRegistry';
import { IndexedDbProfileRepository, PROFILE_DB_NAME } from './progression/profileRepository';
import { AppController } from './ui/appController';
import { renderPlayerSelector } from './ui/screens/playerSelector';
import { el } from './ui/utils/dom';

async function boot(mountEl: HTMLElement): Promise<void> {
  let players = [DEFAULT_PLAYER];
  const historyState = { ...window.history.state };
  const pendingPlayerId = historyState.kotobabinPlayerSwitch;
  if (pendingPlayerId !== undefined) {
    delete historyState.kotobabinPlayerSwitch;
    window.history.replaceState(historyState, '');
  }

  function showSelector(
    host: HTMLElement,
    choose: (player: LocalPlayer) => Promise<void>,
    options: { close?: () => void; playersChanged?: () => void; focusId?: number } = {},
  ): void {
    const screen = renderPlayerSelector({
      players,
      onChoose: choose,
      onAdd: async (name) => {
        const added = await addPlayer(name);
        players = await listPlayers();
        options.playersChanged?.();
        showSelector(host, choose, { ...options, focusId: added.id });
      },
      onClose: options.close,
      readPlayerSummary: (player) => new IndexedDbProfileRepository({
        dbName: playerStorageKey(PROFILE_DB_NAME, player.id),
      }).readPlayerSummary(),
    });
    host.replaceChildren(screen);
    if (options.focusId !== undefined) screen.querySelector<HTMLElement>(`[data-player-id="${options.focusId}"]`)?.focus();
  }

  function openSelector(activePlayer: LocalPlayer, save: () => Promise<void>, onClose: () => void, playersChanged: () => void): void {
    if (document.querySelector('.kb-player-dialog[open]')) return;
    const dialog = el('dialog', { className: 'kb-player-dialog', 'aria-labelledby': 'kb-player-selector-title' });
    const close = () => dialog.close();
    dialog.addEventListener('close', () => {
      dialog.remove();
      onClose();
    });
    dialog.addEventListener('cancel', (event) => {
      if (dialog.querySelector('[aria-busy="true"]')) event.preventDefault();
    });
    showSelector(dialog, async (player) => {
      if (player.id === activePlayer.id) {
        close();
        return;
      }
      await save();
      window.history.replaceState({ ...window.history.state, kotobabinPlayerSwitch: player.id }, '');
      window.location.reload();
    }, { close, playersChanged });
    document.body.append(dialog);
    dialog.showModal();
  }

  const launch = async (player: LocalPlayer, requirePersistent: boolean) => {
    const activePlayer = { ...player };
    const controller = new AppController(mountEl, {
      player: activePlayer,
      rename: async (name) => {
        const renamed = await renamePlayer(activePlayer.id, name);
        activePlayer.name = renamed.name;
        players = players.map((entry) => entry.id === renamed.id ? renamed : entry);
      },
      hasMultiplePlayers: () => players.length > 1,
      openSelector: (save, close, playersChanged) => openSelector(activePlayer, save, close, playersChanged),
      requirePersistent,
    });
    try {
      await controller.init();
    } catch (err) {
      controller.destroy();
      throw err;
    }
  };

  try {
    if (typeof indexedDB !== 'undefined') players = await listPlayers();
    const pendingPlayer = players.find((player) => player.id === pendingPlayerId);
    if (pendingPlayer) {
      await launch(pendingPlayer, true);
      return;
    }
    if (players.length === 1) {
      await launch(players[0], false);
      return;
    }

    const screen = el('main', { className: 'kb-player-selector' });
    showSelector(screen, (player) => launch(player, true));
    mountEl.replaceChildren(screen);
  } catch {
    const retry = el('button', { type: 'button', className: 'kb-btn-secondary' }, '再読み込み');
    retry.addEventListener('click', () => window.location.reload());
    mountEl.replaceChildren(el(
      'main', { className: 'kb-player-selector' },
      el('section', { className: 'kb-card kb-stack-sm' },
        el('p', { role: 'alert' }, '保存データを読み込めませんでした。'), retry),
    ));
  }
}

const mountEl = document.getElementById('app');
if (mountEl) void boot(mountEl);
