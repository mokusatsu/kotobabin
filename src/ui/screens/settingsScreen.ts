import type { ProfileSettingsRecord } from '@/progression/profileRepository';
import type { UIControllerActions } from '../types';
import { el } from '../utils/dom';
import { mountBlockingDialog } from '../utils/blockingDialog';

export interface SettingsScreenProps {
  settings: ProfileSettingsRecord;
  bgmEnabled: boolean;
  highContrast: boolean;
  fontScale: '1.0' | '1.15' | '1.3';
  storageBackend: 'indexeddb' | 'memory';
  pendingResetScope: 'records' | 'city_and_achievements' | 'settings' | null;
  settingsNotice: string | null;
  actions: UIControllerActions;
}

const RESET_CONFIRM_COPY: Record<
  'records' | 'city_and_achievements' | 'settings',
  { title: string; body: string; confirmLabel: string }
> = {
  records: {
    title: '直近記録を初期化しますか？',
    body: '保存されている直近リザルト（履歴）を削除します。街のレベル・資材・手帳・各種設定は残ります。',
    confirmLabel: '記録を初期化する',
  },
  city_and_achievements: {
    title: '街と手帳を初期化しますか？',
    body: '街のレベル・資材・設備・配達手帳・直近記録を初期状態に戻します（各種設定とチュートリアル完了状態は残ります）。',
    confirmLabel: '街と手帳を初期化する',
  },
  settings: {
    title: '設定を初期化しますか？',
    body: '文字サイズ・コントラスト・ローマ字ガイド・手動配達キー・BGM/効果音設定を初期値に戻します。街と手帳のデータは残ります。',
    confirmLabel: '設定を初期化する',
  },
};

export function renderSettingsScreen(props: SettingsScreenProps): HTMLElement {
  const { settings, bgmEnabled, highContrast, fontScale, storageBackend, pendingResetScope, settingsNotice, actions } =
    props;

  const toggleRow = (label: string, checked: boolean, onChange: (val: boolean) => void): HTMLElement => {
    const input = el('input', { type: 'checkbox', checked }) as HTMLInputElement;
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    return el('label', { className: 'kb-toggle-row' }, el('span', {}, label), input);
  };

  const fontScaleGroup = el(
    'div',
    { className: 'kb-row-gap', role: 'group', 'aria-label': '文字サイズ倍率' },
    ...(['1.0', '1.15', '1.3'] as const).map((s) => {
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-pill-btn${fontScale === s ? ' is-selected' : ''}`,
        },
        s === '1.0' ? '標準 (1.0)' : s === '1.15' ? '少し大きめ (1.15)' : '大きめ (1.3)',
      );
      btn.addEventListener('click', () => actions.setFontScale(s));
      return btn;
    }),
  );

  const deliveryKeyGroup = el(
    'div',
    { className: 'kb-row-gap', role: 'group', 'aria-label': '配達キー' },
    ...(['Space', 'Enter'] as const).map((k) => {
      const btn = el(
        'button',
        {
          type: 'button',
          className: `kb-pill-btn${settings.deliveryKey === k ? ' is-selected' : ''}`,
        },
        el('kbd', { className: 'kb-kbd' }, k),
      );
      btn.addEventListener('click', () => actions.updateSettings({ deliveryKey: k }));
      return btn;
    }),
  );

  const exportBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary', 'data-testid': 'settings-export-btn' },
    'セーブデータを書き出す (JSON)',
  );
  exportBtn.addEventListener('click', () => actions.exportSaveJson());

  const resetRecordsBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary', 'data-testid': 'settings-reset-records-btn' },
    '直近記録のみ初期化',
  );
  resetRecordsBtn.addEventListener('click', () => actions.openResetConfirm('records'));

  const resetSettingsBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary', 'data-testid': 'settings-reset-settings-btn' },
    '設定を初期化',
  );
  resetSettingsBtn.addEventListener('click', () => actions.openResetConfirm('settings'));

  const resetCityBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary kb-accent', 'data-testid': 'settings-reset-city-btn' },
    '街と手帳を初期化',
  );
  resetCityBtn.addEventListener('click', () => actions.openResetConfirm('city_and_achievements'));

  const testSeBtn = el(
    'button',
    {
      type: 'button',
      className: 'kb-btn-secondary',
      disabled: settings.volume <= 0,
    },
    '効果音テスト',
  );
  testSeBtn.addEventListener('click', () => actions.testSoundEffect());

  const restartOnboardingBtn = el(
    'button',
    {
      type: 'button',
      className: 'kb-btn-secondary',
      'data-testid': 'settings-restart-onboarding-btn',
    },
    'チュートリアル（案内）を最初から見る',
  );
  restartOnboardingBtn.addEventListener('click', () => actions.restartOnboarding());

  const grid = el(
    'div',
    { className: 'kb-settings-grid' },
    el(
      'section',
      { className: 'kb-card kb-stack-sm' },
      el('h2', { className: 'kb-h2' }, '入力・表示の設定'),
      toggleRow('ローマ字ガイドを表示する', settings.guideDefault, (v) => actions.updateSettings({ guideDefault: v })),
      toggleRow('高コントラスト表示', highContrast, (v) => actions.setHighContrast(v)),
      toggleRow('アニメーションを減らす（動きを控える）', settings.reduceMotion, (v) =>
        actions.updateSettings({ reduceMotion: v }),
      ),
      el('div', { className: 'kb-stack-xs' }, el('strong', {}, '文字サイズ倍率'), fontScaleGroup),
      el('div', { className: 'kb-stack-xs' }, el('strong', {}, '手動配達キー'), deliveryKeyGroup),
      el(
        'div',
        { className: 'kb-play-paper kb-settings-preview' },
        el('div', { className: 'kb-small kb-secondary' }, 'お題カード表示プレビュー'),
        el('div', { className: 'kb-prompt-ja' }, '切手'),
        el('div', { className: 'kb-prompt-reading' }, 'きって'),
        settings.guideDefault
          ? el(
              'div',
              { className: 'kb-prompt-roman' },
              el('span', { className: 'kb-roman-typed' }, 'ki'),
              el('span', { className: 'kb-roman-next' }, 't'),
              el('span', {}, 'te'),
            )
          : el('div', { className: 'kb-small kb-secondary' }, '（ローマ字ガイド非表示中）'),
      ),
    ),
    el(
      'div',
      { className: 'kb-stack-md' },
      el(
        'section',
        { className: 'kb-card kb-stack-sm' },
        el('h2', { className: 'kb-h2' }, 'サウンド設定'),
        toggleRow('効果音 (SE) を鳴らす', settings.volume > 0, (v) => actions.updateSettings({ volume: v ? 0.7 : 0 })),
        toggleRow('BGM を鳴らす', bgmEnabled, (v) => actions.setBgmEnabled(v)),
        el('div', { className: 'kb-row-between' }, el('span', { className: 'kb-small kb-secondary' }, '音量や鳴り方を試せます'), testSeBtn),
      ),
      el(
        'section',
        { className: 'kb-card kb-stack-sm' },
        el('h3', { className: 'kb-h3' }, 'データ保存状態'),
        el(
          'p',
          { className: 'kb-small' },
          storageBackend === 'indexeddb'
            ? 'IndexedDB (v4) に自動保存されています。'
            : '現在メモリ保存のみで動作中です（再読み込みするとデータは失われます）。',
        ),
        settingsNotice
          ? el(
              'div',
              {
                className: 'kb-banner-info kb-small',
                role: 'status',
                'aria-live': 'polite',
                'data-testid': 'settings-status-banner',
              },
              settingsNotice,
            )
          : null,
        el('div', { className: 'kb-row-wrap' }, exportBtn, resetRecordsBtn, resetSettingsBtn, resetCityBtn),
        el('div', { className: 'kb-row-wrap' }, restartOnboardingBtn),
      ),
    ),
  );

  let confirmModal: HTMLElement | null = null;
  if (pendingResetScope) {
    const copy = RESET_CONFIRM_COPY[pendingResetScope];
    const cancelBtn = el(
      'button',
      {
        type: 'button',
        className: 'kb-btn-secondary',
        'data-testid': 'settings-reset-cancel-btn',
      },
      el('span', {}, 'キャンセル'), el('kbd', { className: 'kb-kbd' }, 'Esc'),
    );
    cancelBtn.addEventListener('click', () => actions.cancelResetSave());

    const confirmBtn = el(
      'button',
      {
        type: 'button',
        className: 'kb-btn-danger',
        'data-testid': 'settings-reset-confirm-btn',
      },
      copy.confirmLabel,
    );
    confirmBtn.addEventListener('click', () => actions.confirmResetSave());

    const dialog = el(
      'dialog',
      {
        className: 'kb-modal-backdrop kb-blocking-dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'kb-reset-confirm-title',
        'aria-describedby': 'kb-reset-confirm-description',
        'data-testid': 'settings-reset-confirm-dialog',
      },
      el(
        'div',
        { className: 'kb-modal kb-card kb-stack-sm' },
        el('h2', { id: 'kb-reset-confirm-title', className: 'kb-h2' }, copy.title),
        el('p', { id: 'kb-reset-confirm-description', className: 'kb-small' }, copy.body),
        el('div', { className: 'kb-row-end kb-row-gap' }, cancelBtn, confirmBtn),
      ),
    );
    mountBlockingDialog(dialog, {
      focusOrder: [cancelBtn, confirmBtn],
      initialFocus: cancelBtn,
      onDismiss: () => actions.cancelResetSave(),
    });
    confirmModal = dialog;
  }

  return el('div', { className: 'kb-settings-screen' }, grid, confirmModal);
}
