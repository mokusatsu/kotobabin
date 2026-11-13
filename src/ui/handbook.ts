import catalog from '../../spec/initial/data/achievement_catalog.json';
import type { AchievementState, AchievementView, EquipmentSlot } from '../profile/achievements';

export type HandbookFilter = 'all' | 'locked' | 'earned';
export type HandbookTab = 'stamps' | 'rewards' | 'history';
const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const availableStampArt = new Set(['stamp_a01', 'stamp_a02', 'stamp_a03', 'stamp_a04', 'stamp_a05', 'stamp_a06', 'stamp_b01', 'stamp_b02', 'stamp_b03', 'stamp_b04', 'stamp_b05', 'stamp_b06']);
const scopes: Record<string, string> = { '全': 'すべての遊び方', '練': '練習・復習', '便': '本編の完走', '通常': '通常の便', '街': '街づくり' };
const date = (atMs: number) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(atMs));
const definition = (id: string) => catalog.achievements.find(achievement => achievement.id === id)!;
const hidden = (view: AchievementView) => view.hidden && !view.hiddenRevealed && !view.earned;
const visibleName = (view: AchievementView) => hidden(view) ? 'ひみつの切手' : view.name;
export const achievementStatus = (view: AchievementView) => view.earned ? 'earned' : view.ineligible ? 'ineligible' : view.provisional ? 'provisional' : 'locked';
const statusText = (view: AchievementView) => view.earned ? '獲得' : view.ineligible ? '今回は対象外' : view.provisional ? '完走で確定' : '未解除';

export function stampArtwork(view: AchievementView, small = false): string {
  const id = definition(view.id).stamp_asset_id;
  if (hidden(view)) return `<div class="stamp-placeholder stamp-secret ${small ? 'small' : ''}"><img src="${asset('ui_icon/ui_question.svg')}" alt=""><span>ひみつ</span></div>`;
  if (!availableStampArt.has(id)) return `<div class="stamp-placeholder ${small ? 'small' : ''}" aria-label="${escape(view.name)}の絵柄は制作中"><strong>${view.id}</strong><span>絵柄は制作中</span></div>`;
  return `<div class="stamp-art ${view.earned ? 'earned' : 'unearned'} ${small ? 'small' : ''}"><img class="stamp-picture" src="${asset(`achievement_stamp/${id}.webp`)}" alt="${escape(view.name)}の切手絵柄"><img class="stamp-frame" src="${asset('shared_frame/stamp_frame.svg')}" alt=""></div>`;
}
export function handbookShell(): string {
  return `<main id="main" class="handbook-page" data-paginate="配達手帳"><div class="handbook-title-panel"><p class="eyebrow">YOUR DELIVERY HANDBOOK</p><h1>配達手帳</h1><p>できたことを、切手にして残そう。</p></div><div class="handbook-summary" data-ipad-fixed><strong id="handbook-count"></strong><span id="handbook-unread"></span><span class="save-status" data-save-status></span><button class="text-button" data-action="handbook-back">戻る →</button></div><p class="handbook-series-info">第1集 A〜Hの48枚 · 第2集 I〜Lの24枚</p><div id="handbook-target" data-page-children></div><nav class="handbook-tabs" data-ipad-fixed aria-label="手帳の見方"><button class="button" data-action="handbook-tab" data-tab="stamps">切手と目標</button><button class="button" data-action="handbook-tab" data-tab="rewards">コレクション</button><button class="button" data-action="handbook-tab" data-tab="history">獲得の履歴</button></nav><div id="handbook-suggestions" data-page-children></div><section id="handbook-stamps"><div class="handbook-filters"><fieldset><legend>表示する切手</legend><div class="setting-options"><label><input type="radio" name="achievement-filter" value="all" checked> すべて</label><label><input type="radio" name="achievement-filter" value="locked"> 未解除</label><label><input type="radio" name="achievement-filter" value="earned"> 獲得済み</label></div></fieldset><label>対象の遊び方<select id="achievement-scope"><option value="">すべて</option><option value="全">すべての遊び方</option><option value="練">練習・復習</option><option value="便">本編の完走</option><option value="通常">通常の便</option><option value="街">街づくり</option></select></label></div><div class="handbook-layout" data-page-children><nav id="handbook-families" data-page-children aria-label="実績の12系統"></nav><section id="handbook-cards" data-page-children aria-label="系統の6枚"></section><aside id="achievement-detail" data-page-children aria-label="選択した実績の詳細"></aside></div></section><section id="handbook-rewards" data-page-children hidden></section><section id="handbook-history" data-page-children hidden></section></main>`;
}
export function familyNavigation(views: readonly AchievementView[], selected: string): string {
  return catalog.families.map(family => {
    const earned = views.filter(view => view.familyId === family.id && view.earned).length;
    return `<button class="button ${family.id === selected ? 'selected' : ''}" data-action="achievement-family" data-family-id="${family.id}" ${family.id === selected ? 'aria-current="true"' : ''}><span>${family.id} ${family.name}</span><strong>${earned}/6</strong></button>`;
  }).join('');
}
export function progressLines(view: AchievementView): string {
  if (hidden(view)) return `<p class="achievement-hint">${escape(view.hiddenHint ?? '遊びながら見つけてみましょう。')}</p>`;
  return `<div class="achievement-progress" data-page-children>${view.progress.map(line => `<div><p>${escape(line.displayText)}</p>${line.target !== null && line.target > 0 ? `<progress value="${Math.min(1, Math.max(0, line.current / line.target))}" max="1" aria-label="${escape(line.label)}の進捗"></progress>` : ''}</div>`).join('')}</div>`;
}
export function achievementCards(views: readonly AchievementView[], state: AchievementState, family: string, selectedId: string, filter: HandbookFilter, scope = ''): string {
  const cards = views.filter(view => view.familyId === family && (!scope || view.scope === scope) && (filter === 'all' || (filter === 'earned' ? view.earned : !view.earned)));
  if (!cards.length) return '<p class="handbook-empty">この系統に、表示する切手はありません。</p>';
  return `<div class="achievement-card-grid" data-page-children>${cards.map(view => `<article class="achievement-card ${view.id === selectedId ? 'selected' : ''}" data-state="${achievementStatus(view)}" data-achievement-id="${view.id}"><button class="achievement-select" data-action="achievement-select" data-achievement-id="${view.id}" aria-label="${escape(visibleName(view))}の詳細">${stampArtwork(view)}<span class="achievement-badges"><span>${statusText(view)}</span>${view.unread ? '<span class="unread-mark">未読</span>' : ''}${state.targetId === view.id ? '<span class="target-mark">目標</span>' : ''}</span><strong>${escape(visibleName(view))}</strong><span class="achievement-scope">${scopes[view.scope] ?? escape(view.eligibleModes)}</span><span class="achievement-open-hint">詳細を見る →</span></button><p class="achievement-condition">${escape(hidden(view) ? view.hiddenHint ?? '条件を見つけよう' : view.condition)}</p>${progressLines(view)}</article>`).join('')}</div>`;
}
export function achievementDetail(view: AchievementView, state: AchievementState, writable: boolean): string {
  const family = catalog.families.find(item => item.id === view.familyId)!;
  const familyOwned = Object.keys(state.unlocks).filter(id => id.startsWith(view.familyId)).length;
  const target = state.targetId === view.id;
  const acquisition = state.unlocks[view.id];
  return `<section class="paper-card achievement-detail-card" data-page-children data-state="${achievementStatus(view)}"><p>${view.familyId} ${family.name}</p>${stampArtwork(view)}<h2>${escape(visibleName(view))}</h2><p class="achievement-detail-state">${statusText(view)}${view.unread ? ' · 未読' : ''}</p><p class="achievement-scope">対象：${scopes[view.scope] ?? escape(view.eligibleModes)}</p>${hidden(view) ? `<p>${escape(view.hiddenHint ?? '')}</p><button class="button" data-action="achievement-reveal" data-achievement-id="${view.id}" ${!writable ? 'disabled' : ''}>条件を見る</button><p>条件を見ても不利益はありません。</p>` : `<p class="achievement-detail-condition">${escape(view.condition)}</p>${progressLines(view)}<p class="achievement-confirmation">${escape(definition(view.id).confirm_event)}</p>${view.ineligible ? `<p class="achievement-ineligible">この遊び方・この回では、表示された条件の対象外です。過去に獲得した切手は残ります。</p>` : ''}`}<p>報酬：切手と同名の称号${hidden(view) ? '' : `「${escape(view.name)}」`}</p>${acquisition ? `<p>獲得 ${date(acquisition.acquiredAtMs)}（日本時間）</p>` : ''}<button class="button ${target ? '' : 'button-primary'}" data-action="achievement-target" data-achievement-id="${view.id}" ${!writable || (view.earned && !target) ? 'disabled' : ''}>${target ? '目標から外す' : view.earned ? '獲得済み' : '今回の目標にする'}</button>${target ? '<p>今回の目標に設定中</p>' : ''}<div class="family-reward-preview"><h3>この系統の報酬</h3><p>${escape(family.postcard_name)} · ${familyOwned >= 3 ? '獲得済み' : `この系統であと${3 - familyOwned}枚`}</p><p>${escape(family.foil_board_name)} · ${familyOwned}/6枚</p></div></section>`;
}
export function goalStrip(views: readonly AchievementView[], state: AchievementState): string {
  const view = views.find(item => item.id === state.targetId);
  if (!view) return '';
  return `<div class="goal-strip" id="goal-strip"><span class="target-mark">今回の目標</span><strong>${escape(visibleName(view))}</strong><span>${view.earned ? '目標達成 · 獲得済み' : view.ineligible ? '今回は対象外' : view.provisional ? '現在は条件内 · 完走時に判定' : view.progress[0] ? escape(view.progress[0].displayText) : '進捗を記録しています'}</span></div>`;
}
export function recommendations(views: readonly AchievementView[]): string {
  const choices = [ ['A', 'B', 'C', 'D'], ['E', 'G', 'L'], ['F'] ].flatMap(families => {
    const candidate = views.find(view => !view.earned && families.includes(view.familyId)); return candidate ? [candidate] : [];
  });
  if (!choices.length && views.some(view => !view.earned)) return '';
  if (!choices.length) return '<section class="handbook-complete"><h2>72枚の切手がそろいました。</h2><p>配達の記録とコレクションを、いつでも見返せます。</p></section>';
  return `<section class="handbook-suggestions" data-page-children><h2>次の楽しみを探す</h2><div data-page-children>${choices.map(view => `<button class="button" data-action="achievement-select" data-achievement-id="${view.id}"><strong>${escape(visibleName(view))}</strong><span>${escape(hidden(view) ? view.hiddenHint ?? '' : view.condition)}</span></button>`).join('')}</div><p>目標を選ばなくても、すべての実績は同じように進みます。</p></section>`;
}
const slotForKind: Record<string, EquipmentSlot | undefined> = { postcard: 'postcardId', foil_board: 'boardId', memorial_board: 'boardId', frame: 'frameId', ornament: 'ornamentId', home_panel: 'ornamentId', album: 'albumId' };
export function rewardCollection(state: AchievementState, views: readonly AchievementView[], writable: boolean): string {
  const titles = views.filter(view => view.earned);
  const slots: [EquipmentSlot, string][] = [['frameId', '額縁'], ['postcardId', '絵葉書'], ['boardId', '台紙'], ['ornamentId', '飾り'], ['albumId', 'アルバム']];
  return `<div class="collection-heading" data-page-children><h2>コレクション</h2><p>すべて装飾の報酬です。得点・資材・設備の能力は変わりません。</p><p>新しい称号や額縁を、自動で装着することはありません。</p></div><section class="paper-card reward-equipment" data-page-children><h3>表示する称号</h3><label>称号<select data-equip-slot="titleId" ${!writable ? 'disabled' : ''}><option value="">表示しない</option>${titles.map(view => { const id = definition(view.id).title_id; return `<option value="${id}" ${state.equipped.titleId === id ? 'selected' : ''}>${escape(view.name)}</option>`; }).join('')}</select></label>${slots.map(([slot, name]) => `<label>${name}<select data-equip-slot="${slot}" ${!writable ? 'disabled' : ''}><option value="">表示しない</option>${catalog.rewards.filter(reward => slotForKind[reward.kind] === slot && state.rewards[reward.id]).map(reward => `<option value="${reward.id}" ${state.equipped[slot] === reward.id ? 'selected' : ''}>${escape(reward.name)}</option>`).join('')}</select></label>`).join('')}</section><div class="reward-grid" data-page-children>${catalog.rewards.map(reward => {
    const owned = Boolean(state.rewards[reward.id]); const slot = slotForKind[reward.kind]; const equipped = slot && state.equipped[slot] === reward.id;
    return `<article class="paper-card reward-card" data-page-children data-reward-id="${reward.id}" data-owned="${owned}"><span>${owned ? '獲得' : '未獲得'}${equipped ? ' · 装着中' : ''}${state.unreadRewards.includes(reward.id) ? ' · 未読' : ''}</span><h3>${escape(reward.name)}</h3><p>${escape(reward.trigger)}</p><p>${reward.id === 'reward_family_a_postcard' ? `<img class="reward-postcard" src="${asset('postcard/postcard_a.webp')}" alt="郵便局の絵葉書">` : reward.kind === 'dom_text' ? 'ここまで配達を重ねてくださって、ありがとうございます。' : '図柄は制作中です。名前と獲得状態は保存されています。'}</p>${owned && slot ? `<button class="button" data-action="reward-equip" data-equip-slot="${slot}" data-reward-id="${reward.id}" ${!writable ? 'disabled' : ''}>${equipped ? '装着を外す' : '表示に使う'}</button>` : ''}</article>`;
  }).join('')}</div>`;
}
export function achievementHistory(state: AchievementState, views: readonly AchievementView[]): string {
  const ordered = Object.entries(state.unlocks).sort((a, b) => b[1].acquiredAtMs - a[1].acquiredAtMs || a[0].localeCompare(b[0]));
  return `<h2>獲得の履歴</h2>${ordered.length ? `<ol class="achievement-history" data-page-children>${ordered.map(([id, record]) => { const view = views.find(item => item.id === id)!; return `<li><time>${date(record.acquiredAtMs)}（日本時間）</time><button class="text-button" data-action="achievement-select" data-achievement-id="${id}">${escape(view.name)}</button><p>${escape(view.condition)} · ${scopes[view.scope] ?? escape(view.eligibleModes)}</p><p>獲得：切手・称号${state.unreadAchievements.includes(id) ? ' · 未読' : ''}</p></li>`; }).join('')}</ol>` : '<p>できたことが、ここに記録されていきます。</p>'}`;
}
export function newAchievementSummary(ids: readonly string[], views: readonly AchievementView[], source: string): string {
  const fresh = ids.map(id => views.find(view => view.id === id)).filter((view): view is AchievementView => Boolean(view));
  if (!fresh.length) return '';
  return `<section id="${source.includes('練習') ? 'practice-new-achievements' : 'result-new-achievements'}" class="new-achievements"><h2>${source}切手を${fresh.length}枚獲得</h2><div>${fresh.slice(0, 3).map(view => `<button class="new-stamp" data-action="achievement-open" data-achievement-id="${view.id}">${stampArtwork(view, true)}<strong>${escape(view.name)}</strong></button>`).join('')}</div>${fresh.length > 3 ? `<p>ほか${fresh.length - 3}枚</p>` : ''}<button class="button" data-action="handbook">配達手帳で見る</button></section>`;
}
export { catalog as handbookCatalog };
