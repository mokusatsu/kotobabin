export type ResetScope = 'settings' | 'records' | 'collection';

export function profileControls(): string {
  return `<details class="profile-management"><summary>保存データの管理</summary><p>削除する範囲は、次の画面で確認できます。</p><button type="button" class="button" data-action="profile-reset" data-scope="records">自己記録を削除</button><button type="button" class="button" data-action="profile-reset" data-scope="collection">街・実績・収集を削除</button><button type="button" class="button" data-action="profile-reset" data-scope="settings">設定を戻す</button><label class="backup-file-label">保存データの控えを読み込む<input type="file" id="profile-backup-file" accept="application/json,.json"></label><p id="backup-import-status" role="status"></p></details>`;
}

export function resetConfirmation(scope: ResetScope, active: boolean): string {
  const title = scope === 'settings' ? '設定を初期値へ戻しますか？' : scope === 'records' ? '自己記録を削除しますか？' : '街・実績・収集を削除しますか？';
  const detail = scope === 'settings'
    ? '<p>文字サイズ、配達キー、ガイドなどの設定を初期値へ戻します。</p><p>導入の完了状態、自己記録、切手、図鑑、街の進捗は残ります。</p>'
    : scope === 'records'
      ? '<p>自己記録と、実績で成長を比べるための履歴を削除します。</p><p>解除済みの切手と報酬、図鑑と練習成果、街、設定は残ります。</p>'
      : '<p>街の資源・建物・設備・建築計画・研究・設計図、切手・称号・アルバム・装飾、図鑑の完成履歴・練習資格、実績の進捗と成長比較用の履歴を削除します。</p><p>表示用の自己記録と設定は残ります。削除前の記録から、実績や資材を作り直すことはありません。</p><p>研究や切手を引き継ぐ「新しい街への再出発」とは別の操作です。</p>';
  return `<form method="dialog"><h2>${title}</h2>${detail}${active ? '<p>今の配達や練習を途中終了してから操作します。未配達の追加点は確定しません。</p>' : ''}<p>削除した範囲は、この操作では元に戻せません。</p><button type="button" class="button button-primary" data-action="cancel-profile-operation" autofocus>取り消す</button><button type="button" class="button danger-button" data-action="confirm-profile-reset" data-scope="${scope}">${scope === 'settings' ? '設定を初期値へ戻す' : '説明した範囲を削除する'}</button><p class="profile-operation-status" role="status"></p></form>`;
}

export interface BackupPreview { completedWords: number; collectedWords: number; records: number; fontScale: number; guide: boolean }
export function restoreConfirmation(fileName: string, preview: BackupPreview, active: boolean): string {
  const safeName = fileName.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
  return `<form method="dialog"><h2>保存データの控えから復元しますか？</h2><p>選んだ控え：<strong>${safeName}</strong></p><dl class="backup-preview"><div><dt>完成したことばの累計</dt><dd>${preview.completedWords.toLocaleString('ja-JP')}語</dd></div><div><dt>図鑑の完成語</dt><dd>${preview.collectedWords}/960語</dd></div><div><dt>最近の配達記録</dt><dd>${preview.records}便</dd></div><div><dt>文字サイズ・ガイド</dt><dd>${preview.fontScale}% · ${preview.guide ? '表示' : '非表示'}</dd></div></dl><p>現在の保存データを、選んだ控えの内容で置き換えます。控えの後に進んだ分は含まれません。</p>${active ? '<p>今の配達や練習は、未配達の追加点を加えずに途中終了します。</p>' : ''}<button type="button" class="button" data-action="export-data">現在の控えを書き出す</button><button type="button" class="button button-primary" data-action="cancel-profile-operation" autofocus>取り消す</button><button type="button" class="button danger-button" data-action="confirm-profile-restore">この控えで復元する</button><p class="profile-operation-status" role="status"></p></form>`;
}
