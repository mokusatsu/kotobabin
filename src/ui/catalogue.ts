import { collectionProgress, filterCatalogue, type CatalogueFilter, type CatalogueWord, type ProfileProgress } from '../profile';

export const courseNames = { relaxed: 'ゆったり', standard: 'ふつう', challenge: '挑戦' } as const;
const topics = { daily: 'くらし', food: '食べもの', living: '生きもの', town: 'まちと道具', nature: '自然と季節', people: '人とことば' };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const cataloguePageSize = 30;

export function catalogueShell(progress: ProfileProgress): string {
  const collections = [
    ['すべて', 'kotobabin-ja-960-v2'], ['ゆったり', 'kotobabin-ja-relaxed-v2'],
    ['ふつう', 'kotobabin-ja-standard-v2'], ['挑戦', 'kotobabin-ja-challenge-v2'],
    ['初版240語', 'kotobabin-ja-240-v1'],
  ] as const;
  return `<main id="main" class="catalogue-page"><div class="section-heading"><div><p class="eyebrow">THE WORD COLLECTION</p><h1>ことば図鑑</h1><p>気になることばを選んで、いつでも練習できます。</p></div><button class="text-button" data-action="catalogue-back">戻る →</button></div><div class="collection-counts">${collections.map(([label, id]) => { const value = collectionProgress(progress, id); return `<div><span>${label}</span><strong>${value.completed}<small> / ${value.total}語</small></strong></div>`; }).join('')}</div><section class="catalogue-filters" aria-label="ことばの絞り込み"><label>ことば・読みで検索<input type="search" id="catalogue-query" placeholder="例：ねこ" autocomplete="off"></label><label>集合<select id="catalogue-set"><option value="">すべての960語</option><option value="kotobabin-ja-240-v1">初版240語</option><option value="kotobabin-ja-relaxed-v2">ゆったり240語</option><option value="kotobabin-ja-standard-v2">ふつう300語</option><option value="kotobabin-ja-challenge-v2">挑戦420語</option></select></label><label>分類<select id="catalogue-topic"><option value="">すべての分類</option>${Object.entries(topics).map(([id, name]) => `<option value="${id}">${name}</option>`).join('')}</select></label><label>状態<select id="catalogue-state"><option value="">すべて</option><option value="uncompleted">未完成</option><option value="practicing">練習中</option><option value="practiceQualified">練習で無誤打3回</option></select></label></section><div class="catalogue-list-heading"><p id="catalogue-count" role="status"></p><button class="button" data-action="practice-filtered">表示中のことばを練習</button></div><div id="catalogue-results"></div><nav class="catalogue-pagination" aria-label="図鑑のページ"><button class="button" data-action="catalogue-prev">前のページ</button><span id="catalogue-page-label"></span><button class="button" data-action="catalogue-next">次のページ</button></nav><p class="save-status" data-save-status></p></main>`;
}

export function catalogueRows(words: readonly CatalogueWord[], progress: ProfileProgress, page: number): string {
  const shown = words.slice(page * cataloguePageSize, (page + 1) * cataloguePageSize);
  if (!shown.length) return '<p class="catalogue-empty">当てはまることばはありません。絞り込みを変えてみましょう。</p>';
  return `<ul class="word-list">${shown.map(word => {
    const record = progress.words[word.id];
    return `<li><div><strong>${escape(word.display)}</strong><span>${escape(word.reading)}</span></div><span class="word-course">${courseNames[word.courseId]}</span><span class="word-state">${record?.completed ? '完成済み' : '未完成'}<small>練習 無誤打 ${Math.min(3, record?.practiceCleanCompleted ?? 0)} / 3</small></span><button class="button" data-action="practice-word" data-word-id="${word.id}" aria-label="${escape(word.display)}を練習">練習する →</button></li>`;
  }).join('')}</ul>`;
}

export function catalogueFilter(root: HTMLElement): CatalogueFilter {
  const value = (id: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value ?? '';
  const collectionSet = value('catalogue-set') as CatalogueFilter['collectionSet'];
  const state = value('catalogue-state');
  return {
    query: value('catalogue-query'), collectionSet: collectionSet || undefined, topicId: value('catalogue-topic') || undefined,
    uncompleted: state === 'uncompleted', practicing: state === 'practicing', practiceQualified: state === 'practiceQualified',
  };
}
export { filterCatalogue };
