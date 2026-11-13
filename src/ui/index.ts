import './reward-art.css';
import { equippedDecoration } from './reward-art';
import { AudioPlayer } from '../audio/AudioPlayer';
import { GameAudio, renderAudioStatus } from './audio';
import wordsData from '../../spec/initial/data/words.json';
import { CourseGenerator, GameSession, InputAdapter, type Word, type SessionMode } from '../typing';
import type { AppRuntime, AppSettings } from '../app/runtime';
import { parseProfileBackup, type RecordContext } from '../profile';
import { catalogueShell, catalogueRows, catalogueFilter, filterCatalogue, cataloguePageSize } from './catalogue';
import { settingsContent } from './settings';
import { resetConfirmation, restoreConfirmation, type ResetScope } from './profile';
import { getAchievementViews, type EquipmentSlot } from '../profile/achievements';
import { gameStageShell } from './game-stage';
import { DeliverySceneController } from './delivery-scene';
import { renderDistrictMap, installDistrictMap, animateDistrictEntry, type DistrictMapFeature } from './district-map';
import { mountResultStage, type ResultStageController, type ResultStageState } from './result-stage';
import { installIPadPagination } from './ipad-layout';
import { installGameLayout, refreshGameLayout } from './game-layout';
import { handbookShell, familyNavigation, achievementCards, achievementDetail, goalStrip, recommendations, rewardCollection, achievementHistory, newAchievementSummary, handbookCatalog, type HandbookFilter, type HandbookTab } from './handbook';
import { CityEconomy, type CityState, type DistrictId, type CityCommand, type EquipmentKind } from '../economy';
import { homeTown, districtName, destinationOptions, balanceStrip, cityShell, districtDetail, equipmentShell, purchaseCard, specialEquipment, districtEquipmentSummary, restartContent, districtFigure, resultEconomy, formatMicro, type EquipmentTab, type PurchaseQuantity } from './city';

type CourseId = 'relaxed' | 'standard' | 'challenge';
type Snapshot = ReturnType<GameSession['snapshot']>;
const courses: { id: CourseId; name: string; description: string; count: number }[] = [
  { id: 'relaxed', name: 'ゆったり', description: '短いことば', count: 240 },
  { id: 'standard', name: 'ふつう', description: '小さいっ・ーも', count: 300 },
  { id: 'challenge', name: '挑戦', description: '短い文', count: 420 },
];
const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
const esc = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const number = (value: number) => value.toLocaleString('ja-JP');
const envelope = '<svg viewBox="0 0 40 32" fill="none" aria-hidden="true"><rect x="2" y="3" width="36" height="26" rx="2" stroke="currentColor" stroke-width="2"/><path d="m3 5 17 13L37 5" stroke="currentColor" stroke-width="2"/></svg>';

/** Views only consume session snapshots; scores and input progress belong to GameSession. */
export function mountApp(root: HTMLElement, runtime: AppRuntime): () => void {
  let selectedCourse: CourseId = 'relaxed';
  let seed = newSeed();
  let session: GameSession | undefined;
  let gameInput: InputAdapter | undefined;
  let deliveryScene: DeliverySceneController | undefined;
  let processingDeliveryFacts = false;
  let disposeGameLayout: (() => void) | undefined;
  let screen: 'home' | 'check' | 'game' | 'result' | 'catalogue' | 'city' | 'equipment' | 'handbook' = 'home';
  let launchTarget: { mode: SessionMode; wordIds?: string[]; preferredWordId?: string | null } = { mode: 'MAIN' };
  let sessionContext: RecordContext | undefined;
  let mainPreferredWordId: string | null = null;
  let catalogueOrigin: 'home' | 'result' | 'game' = 'home';
  let cataloguePage = 0;
  let practiceFilter: ReturnType<typeof catalogueFilter> = {};
  let practiceWordIds: string[] = [];
  let mapObserver: ResizeObserver | undefined;
  let lastResult: Snapshot | undefined;
  let lastChoiceFocus = '';
  let cityOrigin: 'home' | 'result' = 'home';
  let selectedDistrict: DistrictId = runtime.destination;
  let sessionDestination: DistrictId = runtime.destination;
  let sessionCityAtStart: CityState | undefined;
  let equipmentTab: EquipmentTab = 'packaging';
  let purchaseQuantity: PurchaseQuantity = 1;
  let selectedSpecialId: string | undefined;
  let resultStage: ResultStageController | undefined;
  let resultStageState: ResultStageState | undefined;
  let resultStageSessionId = '';
  function releaseScreenPresentation() { deliveryScene?.detach(); document.querySelectorAll('.world-transition-ghost').forEach(element => element.remove()); if (resultStage) { resultStageState = resultStage.snapshot(); resultStage.destroy(); resultStage = undefined; } }
  let displayedPurchaseQuote: ReturnType<CityEconomy['quotePurchase']> | undefined;
  let purchaseStructureKey = '';
  let returnNoticeDismissed = false;
  let pendingBackupText: string | null = null;
  let profileOperationPending = false;
  let handbookOrigin: 'home' | 'game' | 'result' | 'catalogue' | 'city' | 'equipment' = 'home';
  let handbookFamily = 'A';
  let selectedAchievementId = 'A01';
  let handbookFilter: HandbookFilter = 'all';
  let handbookScope = '';
  let handbookTab: HandbookTab = 'stamps';
  let sessionUnlocksAtStart = new Set(Object.keys(runtime.achievements.unlocks));
  let knownUnlocks = new Set(Object.keys(runtime.achievements.unlocks));
  const practiceAwardCarry = new Set<string>();
  const livePending = new Set<string>();
  let lastLiveNoticeAt = -Infinity;
  let liveNoticeTimer: ReturnType<typeof setTimeout> | undefined;
  let inputConfirmed = false;
  let checkPassed = false;
  let rechecking = false;
  let pending: { key: string; at: number } | undefined;
  let composing = false;
  let suppressBlur = false;
  let lastMistakes = 0;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  const viewMarkup = new WeakMap<HTMLElement, string>();
  const abort = new AbortController();
  const on = (target: EventTarget, type: string, handler: EventListener) => target.addEventListener(type, handler, { signal: abort.signal });
  const audio = new GameAudio(new AudioPlayer({ onStatusChange: () => updateAudioStatus() }));
  const course = () => courses.find((item) => item.id === selectedCourse)!;
  const state = () => session!.snapshot(performance.now());
  function renderMarkup(element: HTMLElement, markup: string) {
    if (viewMarkup.get(element) === markup) return;
    const active = document.activeElement as HTMLElement | null;
    const contained = Boolean(active && element.contains(active));
    const action = contained ? active?.dataset.action : undefined;
    const equipSlot = contained ? active?.dataset.equipSlot : undefined;
    const wordId = active?.dataset.wordId;
    const matches = (candidate: HTMLElement) => candidate.dataset.action === action && candidate.dataset.equipSlot === equipSlot && candidate.dataset.wordId === wordId;
    const selector = equipSlot ? '[data-equip-slot]' : '[data-action]';
    const ordinal = action || equipSlot ? [...element.querySelectorAll<HTMLElement>(selector)].filter(matches).indexOf(active!) : -1;
    element.innerHTML = markup;
    viewMarkup.set(element, markup);
    ipadLayout.refresh();
    if ((action || equipSlot) && ordinal >= 0) {
      const next = [...element.querySelectorAll<HTMLElement>(selector)].filter(matches)[ordinal];
      if (next) { suppressBlur = true; next.focus({ preventScroll: true }); suppressBlur = false; }
    }
  }
  function newSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]!; }
  function brand() { return `<a class="brand" href="#" data-action="home" aria-label="ことば便 ホーム"><span class="brand-stamp">${envelope}</span><span>ことば便<small>KOTOBABIN</small></span><span class="postmark" aria-hidden="true">∿<br>∿</span></a>`; }
  function header(game = false) {
    const mode = session?.mode;
    const location = mode === 'PRACTICE' ? 'ことばの練習' : mode === 'TUTORIAL' ? 'はじめの配達' : `${course().name} ／ ${districtName(sessionDestination)}へ`;
    return `<header class="site-header">${brand()}<button class="button button-small nav-menu-button" data-action="navigation-menu">画面移動 <kbd>F2</kbd></button>${game ? `<span class="route-label" data-route-original="${esc(location)}">${location}</span><button class="button button-small pause-button" data-action="pause">一時停止 <kbd>Esc</kbd></button>` : `<span class="equipped-title" data-equipped-title hidden></span><nav aria-label="メイン"><button class="nav-button ${screen === 'home' ? 'nav-current' : ''}" data-action="home">ホーム</button><button class="nav-button ${screen === 'city' ? 'nav-current' : ''}" data-action="city">街の開発</button><button class="nav-button ${screen === 'equipment' ? 'nav-current' : ''}" data-action="equipment">街の設備</button><button class="nav-button ${screen === 'handbook' ? 'nav-current' : ''}" data-action="handbook">配達手帳 <span data-unread-count>${runtime.achievements.unreadAchievements.length || ''}</span></button><button class="nav-button ${screen === 'catalogue' ? 'nav-current' : ''}" data-action="catalogue">ことば図鑑</button><button class="nav-button" data-action="settings">設定</button><button class="nav-button" data-action="help">遊び方</button></nav>`}${ownershipStatus()}</header>`;
  }
  function ownershipStatus() { return `<aside id="ownership-status" class="ownership-warning" data-ownership="${runtime.status.writable ? 'owner' : 'readonly'}" ${runtime.status.writable ? 'hidden' : ''}><p>別のタブで操作中 · このタブは閲覧のみです。</p><div data-ownership-action><button class="button" data-action="takeover">ここで続ける</button></div></aside>`; }
  function footer() { return `<footer class="site-footer"><span>F2 画面移動 · Esc 戻る</span><span>試作版 · タイピング配達</span></footer>`; }
  function renderHome() {
    releaseScreenPresentation();
    audio.leaveSession();
    disposeGameLayout?.(); disposeGameLayout = undefined;
    gameInput?.destroy(); gameInput = undefined; mapObserver?.disconnect();
    screen = 'home'; session = undefined; pending = undefined;
    root.innerHTML = `${header()}<main id="main" class="home-layout game-stage world-stage" data-ipad-exclude aria-label="街の全体マップ"><div class="home-city-slot">${homeTown(runtime.city, runtime.destination)}</div><aside class="home-intro world-command-dock"><p class="eyebrow">ことばの配達便</p><h1>配達に出かけよう</h1><fieldset class="course-picker"><legend>コース <span class="dock-key-hint">1 / 2 / 3</span></legend><div class="course-options">${courses.map((item, index) => `<label class="course-option"><input type="radio" name="course" value="${item.id}" ${item.id === selectedCourse ? 'checked' : ''}><span><strong>${index + 1} ${item.name}</strong><small>${item.description}</small></span></label>`).join('')}</div></fieldset><div class="destination"><label for="home-destination">届け先</label><select id="home-destination" class="destination-select">${destinationOptions(runtime.city, runtime.destination)}</select></div><button class="button button-primary start-button" data-action="start" ${window.innerWidth < 768 ? 'disabled' : ''}>${envelope} 配達をはじめる</button><p class="keyboard-note">${window.innerWidth < 768 ? '本編には幅768px以上の画面と物理キーボードが必要です' : '半角ローマ字 · 90秒'}</p><button class="text-button" data-action="catalogue">ことばの練習</button><span class="save-status" data-save-status data-save-state="${runtime.status.storage}"></span></aside><div class="home-city-balance" id="city-balance-strip">${balanceStrip(runtime.city)}</div><div class="home-goal-slot" id="home-goal-slot">${goalStrip(achievementViews(), runtime.achievements)}</div>${practiceAwardCarry.size ? `<p class="practice-awards-hud" id="practice-awards-summary">練習で切手${practiceAwardCarry.size}枚獲得 <button class="text-button" data-action="handbook">手帳へ</button></p>` : ''}<div class="home-cosmetic-slot" data-cosmetic-slot="home"></div><p class="world-map-help">地区を選んで拡大 <kbd>Tab</kbd> 選択 <kbd>Enter</kbd> 決定 <kbd>F2</kbd> メニュー</p></main>${footer()}`;
    beginHomeMapObservation(); updateStorageStatus(); showReturnNotice(); updateAchievementDisplays(); practiceAwardCarry.clear(); focusScreen('[data-action="start"]');
  }
  function beginHomeMapObservation() {
    // The world is a persistent game stage; never replace it with a webpage list.
    mapObserver?.disconnect();
    const map = root.querySelector<HTMLElement>('.town-map');
    if (map) map.hidden = false;
  }
  function updateAudioStatus() { renderAudioStatus(root, runtime.settings.sound, audio.status); }
  function applySettings() {
    audio.configure(runtime.settings); updateAudioStatus();
    root.style.setProperty('--font-scale', String(runtime.settings.fontScale / 100));
    document.body.dataset.reducedMotion = String(runtime.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
    deliveryScene?.setReducedMotion(document.body.dataset.reducedMotion === 'true');
    if (screen === 'home') beginHomeMapObservation();
    ipadLayout.refresh();
  }
  function updateStorageStatus() {
    root.querySelectorAll<HTMLElement>('[data-save-status]').forEach(element => { element.textContent = runtime.status.message; element.dataset.saveState = runtime.status.storage; });
    const save = root.querySelector<HTMLElement>('[data-save-status]'); if (save) save.id = 'save-status';
    const warning = root.querySelector<HTMLElement>('#ownership-status');
    if (warning) { warning.hidden = runtime.status.writable; warning.dataset.ownership = runtime.status.writable ? 'owner' : 'readonly'; }
    if (!runtime.status.writable && screen === 'game' && state().phase !== 'PAUSED') pause();
    syncOwnershipActions();
  }
  function syncOwnershipActions() {
    const paused = screen === 'game' && session && state().phase === 'PAUSED';
    const aside = root.querySelector<HTMLElement>('[data-ownership-action]');
    const inside = root.querySelector<HTMLElement>('#paused-ownership');
    const markup = '<button class="button" data-action="takeover">ここで続ける</button>';
    if (aside) renderMarkup(aside, paused ? '' : markup);
    const insideMarkup = paused && !runtime.status.writable ? `<p>別のタブで操作中です。ここで続ける場合は、操作するタブを切り替えてください。</p>${markup}` : '';
    if (inside) renderMarkup(inside, insideMarkup);
    const warning = root.querySelector<HTMLElement>('#ownership-status'); if (warning) { warning.inert = Boolean(paused); warning.hidden = runtime.status.writable || Boolean(paused); }
  }
  function commitFacts(snapshot: Snapshot) {
    if (!session || !sessionContext) return;
    const facts = session.drainEvents();
    sessionContext = { ...sessionContext, guideUsed: snapshot.guideUsed, assisted: snapshot.skips > 0 };
    processingDeliveryFacts = true;
    try {
      if (facts.length) runtime.applyFacts(facts, sessionContext);
      deliveryScene?.observe(session.sessionId, facts, snapshot, runtime.city);
    } finally { processingDeliveryFacts = false; }
    audio.observe(session.sessionId, snapshot, facts);
    if (snapshot.phase === 'RESULT') runtime.endSession(session.sessionId);
  }
  function mutate(snapshot: Snapshot) { commitFacts(snapshot); updateGame(snapshot); }
  function closeCurrent(reason: 'home' | 'main' | 'replaced' | 'exit' = 'home') {
    if (!session || state().phase === 'RESULT') return;
    const snapshot = session.mode === 'PRACTICE' ? session.endPractice(performance.now(), reason) : session.finish(performance.now(), false);
    commitFacts(snapshot);
  }
  function confirmReplacement(next: () => void) {
    if (!session || state().phase === 'RESULT') { next(); return; }
    pause();
    const dialog = document.createElement('dialog'); dialog.className = 'help-dialog paper-card';
    dialog.innerHTML = '<form method="dialog"><h2>今の配達を終えて移動しますか？</h2><p>完成したことばと確定済みの成果は残ります。未配達の追加点と通常の便の仮達成は確定しません。</p><button class="button button-primary" value="continue" autofocus>今の配達に戻る</button><button class="button" value="end">終了して移動する</button></form>';
    const paused = root.querySelector<HTMLElement>('#paused-layer:not([hidden])');
    if (paused) { paused.inert = true; paused.setAttribute('aria-hidden', 'true'); }
    root.append(dialog); dialog.showModal();
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'end'; dialog.remove();
      if (paused?.isConnected) { paused.inert = false; paused.removeAttribute('aria-hidden'); }
      if (confirmed) { closeCurrent('replaced'); next(); }
      else paused?.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus({ preventScroll: true });
    }, { once: true });
  }
  function launch() {
    if (!runtime.status.writable || runtime.cityBusy) { updateStorageStatus(); return; }
    if (launchTarget.mode === 'MAIN' && window.innerWidth < 768) { renderHome(); return; }
    if (!inputConfirmed) { rechecking = false; renderCheck(); return; }
    const mode = launchTarget.mode;
    const chosenIds = launchTarget.wordIds ?? wordsData.tutorialIds;
    if (mode === 'MAIN') {
      mainPreferredWordId = launchTarget.preferredWordId ?? null;
      const generator = new CourseGenerator(wordsData.words as Word[], { seed, courseId: selectedCourse, preferredWordId: mainPreferredWordId });
      const candidate = new GameSession({ generator, mode, guideEnabled: runtime.settings.guide });
      sessionContext = { courseId: selectedCourse, planId: generator.plan.id, contentVersion: generator.plan.contentVersion, generatorVersion: generator.plan.generatorVersion, inputRuleVersion: 'romaji-1.0.0', scoringVersion: 'score-1.0.0', guideUsed: runtime.settings.guide, assisted: false };
      if (!runtime.beginSession(candidate.sessionId, mode, runtime.destination, sessionContext)) return;
      session = candidate;
    } else {
      const words = chosenIds.map(id => wordsData.words.find(word => word.id === id)!).filter(Boolean) as Word[];
      const candidate = new GameSession({ words, mode, guideEnabled: runtime.settings.guide });
      sessionContext = { courseId: words[0].courseId, planId: `${mode}:${chosenIds.join(',')}`, contentVersion: wordsData.contentVersion, generatorVersion: 'fixed-word-list-1.0.0', inputRuleVersion: 'romaji-1.0.0', scoringVersion: 'score-1.0.0', guideUsed: runtime.settings.guide, assisted: false };
      if (!runtime.beginSession(candidate.sessionId, mode, runtime.destination, sessionContext)) return;
      session = candidate;
      practiceWordIds = [...chosenIds];
    }
    resultStageState = undefined; resultStageSessionId = '';
    sessionUnlocksAtStart = new Set(Object.keys(runtime.achievements.unlocks));
    sessionDestination = runtime.destination; sessionCityAtStart = structuredClone(runtime.city);
    audio.beginSession(session.sessionId, state()); audio.resumeFromGesture();
    lastMistakes = 0; lastChoiceFocus = ''; renderGame(); focusInput();
  }
  function startMain(preferredWordId: string | null = null) {
    closeCurrent('main');
    if (preferredWordId) selectedCourse = wordsData.words.find(word => word.id === preferredWordId)!.courseId as CourseId;
    seed = newSeed(); launchTarget = { mode: 'MAIN', preferredWordId }; launch();
  }
  function startPractice(ids: string[]) {
    if (!ids.length) return;
    confirmReplacement(() => { launchTarget = { mode: 'PRACTICE', wordIds: ids }; launch(); });
  }
  function renderCatalogue() {
    releaseScreenPresentation();
    disposeGameLayout?.(); disposeGameLayout = undefined;
    gameInput?.destroy(); gameInput = undefined; mapObserver?.disconnect(); screen = 'catalogue'; cataloguePage = 0;
    root.innerHTML = `${header()}${catalogueShell(runtime.profile)}${footer()}`;
    updateCatalogue(); updateStorageStatus(); focusScreen();
  }
  function updateCatalogue() {
    const filter = catalogueFilter(root);
    const words = filterCatalogue(runtime.profile, filter);
    const totalPages = Math.max(1, Math.ceil(words.length / cataloguePageSize));
    cataloguePage = Math.min(cataloguePage, totalPages - 1);
    root.querySelector('#catalogue-results')!.innerHTML = catalogueRows(words, runtime.profile, cataloguePage);
    root.querySelector('#catalogue-count')!.textContent = `${words.length}語が見つかりました`;
    root.querySelector('#catalogue-page-label')!.textContent = `${cataloguePage + 1} / ${totalPages}`;
    root.querySelector<HTMLButtonElement>('[data-action="catalogue-prev"]')!.disabled = cataloguePage === 0;
    root.querySelector<HTMLButtonElement>('[data-action="catalogue-next"]')!.disabled = cataloguePage + 1 >= totalPages;
    root.querySelector<HTMLButtonElement>('[data-action="practice-filtered"]')!.disabled = !words.length;
  }
  function focusScreen(selector = 'main h1') {
    const element = root.querySelector<HTMLElement>(selector); if (!element) return;
    if (!element.matches('button, input, select, a')) element.tabIndex = -1;
    element.focus({ preventScroll: true });
  }
  function openNavigationMenu() {
    const existing = root.querySelector<HTMLDialogElement>('.navigation-dialog'); if (existing) { existing.close(); return; }
    if (root.querySelector('dialog[open]')) return;
    pause();
    const dialog = document.createElement('dialog'); dialog.className = 'paper-card navigation-dialog';
    const choices = [['home', 'ホーム'], ['city', '街の開発'], ['equipment', '街の設備'], ['handbook', '配達手帳'], ['catalogue', 'ことば図鑑'], ['settings', '設定'], ['help', '遊び方']];
    dialog.innerHTML = `<h2>画面を移動する</h2><p>上下キーで選び、Enterで移動。Escで戻れます。</p><nav aria-label="画面の移動">${choices.map(([action, label], index) => `<button type="button" class="button" data-action="${action}" data-navigation="true" ${index === 0 ? 'autofocus' : ''}>${label}</button>`).join('')}</nav><button type="button" class="text-button" data-action="close-navigation">閉じる</button>`;
    root.append(dialog); dialog.showModal(); dialog.addEventListener('close', () => dialog.remove(), { once: true });
  }
  function navigateBack() {
    if (screen === 'game') { pause(); return; }
    if (screen === 'handbook') { returnFromHandbook(); return; }
    if (screen === 'check') { if (rechecking && session) renderGame(); else renderHome(); return; }
    if (screen === 'catalogue') { if (catalogueOrigin === 'game' && session) renderGame(); else if (catalogueOrigin === 'result' && lastResult) renderResult(lastResult); else renderHome(); return; }
    if (screen === 'city' || screen === 'equipment') { if (cityOrigin === 'result' && lastResult) renderResult(lastResult); else renderHome(); return; }
    if (screen === 'result') renderHome();
  }
  function achievementViews() {
    return getAchievementViews(runtime.achievements, session?.snapshot(performance.now()), session?.sessionId);
  }
  function openHandbook() {
    releaseScreenPresentation();
    if (screen !== 'handbook') {
      handbookOrigin = screen === 'check' ? (rechecking ? 'game' : 'home') : screen;
      if (screen === 'game') pause();
    }
    disposeGameLayout?.(); disposeGameLayout = undefined;
    gameInput?.destroy(); gameInput = undefined; mapObserver?.disconnect(); screen = 'handbook';
    root.innerHTML = `${header()}${handbookShell()}${footer()}`;
    root.querySelectorAll<HTMLInputElement>('[name="achievement-filter"]').forEach(input => { input.checked = input.value === handbookFilter; });
    root.querySelector<HTMLSelectElement>('#achievement-scope')!.value = handbookScope;
    updateHandbook(); updateStorageStatus(); markSelectedRead(); focusScreen();
  }
  function revealHandbookElement(selector: string) {
    const element = root.querySelector<HTMLElement>(selector); if (!element) return;
    if (!element.matches('button, input, select, a')) element.tabIndex = -1;
    void ipadLayout.reveal(element);
  }
  function revealSelectedAchievement() { revealHandbookElement('#achievement-detail h2'); }
  function markSelectedRead() {
    if (runtime.status.writable && runtime.achievements.unreadAchievements.includes(selectedAchievementId)) runtime.achievementAction({ type: 'read', achievementIds: [selectedAchievementId] });
  }
  function updateHandbook() {
    if (screen !== 'handbook') return;
    const views = achievementViews(); const ledger = runtime.achievements;
    root.querySelector<HTMLElement>('#handbook-count')!.textContent = `${Object.keys(ledger.unlocks).length}/72枚`;
    root.querySelector<HTMLElement>('#handbook-unread')!.textContent = ledger.unreadAchievements.length ? `未読 ${ledger.unreadAchievements.length}枚` : '未読なし';
    renderMarkup(root.querySelector<HTMLElement>('#handbook-target')!, goalStrip(views, ledger));
    root.querySelectorAll<HTMLButtonElement>('[data-action="handbook-tab"]').forEach(button => { button.classList.toggle('selected', button.dataset.tab === handbookTab); button.setAttribute('aria-pressed', String(button.dataset.tab === handbookTab)); });
    for (const tab of ['stamps', 'rewards', 'history'] as const) { const panel = root.querySelector<HTMLElement>(`#handbook-${tab}`)!; panel.hidden = handbookTab !== tab; panel.toggleAttribute('data-ipad-exclude', handbookTab !== tab); }
    const suggestions = root.querySelector<HTMLElement>('#handbook-suggestions')!; suggestions.hidden = handbookTab !== 'stamps'; suggestions.toggleAttribute('data-ipad-exclude', handbookTab !== 'stamps');
    if (handbookTab === 'stamps') {
      renderMarkup(suggestions, recommendations(views));
      renderMarkup(root.querySelector<HTMLElement>('#handbook-families')!, familyNavigation(views, handbookFamily));
      renderMarkup(root.querySelector<HTMLElement>('#handbook-cards')!, achievementCards(views, ledger, handbookFamily, selectedAchievementId, handbookFilter, handbookScope));
      const selected = views.find(view => view.id === selectedAchievementId)!;
      renderMarkup(root.querySelector<HTMLElement>('#achievement-detail')!, achievementDetail(selected, ledger, runtime.status.writable));
    } else if (handbookTab === 'rewards') renderMarkup(root.querySelector<HTMLElement>('#handbook-rewards')!, rewardCollection(ledger, views, runtime.status.writable));
    else renderMarkup(root.querySelector<HTMLElement>('#handbook-history')!, achievementHistory(ledger, views));
    const decoration = root.querySelector<HTMLElement>('[data-cosmetic-slot="handbook"]');
    if (decoration) renderMarkup(decoration, equippedDecoration(ledger, 'handbook'));
    updateStorageStatus();
  }
  function returnFromHandbook() {
    if (handbookOrigin === 'game' && session) renderGame();
    else if (handbookOrigin === 'result' && lastResult) renderResult(lastResult);
    else if (handbookOrigin === 'catalogue') renderCatalogue();
    else if (handbookOrigin === 'city') openCityPage();
    else if (handbookOrigin === 'equipment') renderEquipment();
    else renderHome();
  }
  function resultAchievements() {
    const views = achievementViews();
    const current = Object.keys(runtime.achievements.unlocks).filter(id => !sessionUnlocksAtStart.has(id) && !practiceAwardCarry.has(id));
    return newAchievementSummary(current, views, '今回の便で') + newAchievementSummary([...practiceAwardCarry], views, '練習で');
  }
  function updateAchievementDisplays() {
    const ledger = runtime.achievements;
    root.querySelectorAll<HTMLElement>('[data-unread-count]').forEach(element => { const text = ledger.unreadAchievements.length ? `未読${ledger.unreadAchievements.length}` : ''; if (element.textContent !== text) element.textContent = text; });
    const views = achievementViews();
    for (const id of ['home-goal-slot', 'game-goal-slot', 'result-goal-slot']) { const element = root.querySelector<HTMLElement>(`#${id}`); if (element) renderMarkup(element, goalStrip(views, ledger, { recommend: id === 'game-goal-slot' })); }
    root.querySelectorAll<HTMLElement>('[data-cosmetic-slot]').forEach(element => {
      const destination = element.dataset.cosmeticSlot;
      if (destination === 'home' || destination === 'handbook') renderMarkup(element, equippedDecoration(ledger, destination));
    });
    const title = handbookCatalog.achievements.find(definition => definition.title_id === ledger.equipped.titleId)?.name ?? '';
    root.querySelectorAll<HTMLElement>('[data-equipped-title]').forEach(element => { element.textContent = title; element.hidden = !title; });
    const result = root.querySelector<HTMLElement>('#result-achievements-slot'); if (result) renderMarkup(result, resultAchievements());
    if (screen === 'handbook') updateHandbook();
  }
  function refreshAchievementState() {
    const owned = new Set(Object.keys(runtime.achievements.unlocks));
    const fresh = [...owned].filter(id => !knownUnlocks.has(id)); knownUnlocks = owned;
    if (!profileOperationPending) {
      if (session?.mode === 'PRACTICE') for (const id of fresh) practiceAwardCarry.add(id);
      if (runtime.achievements.notificationMode === 'live' && performance.now() - lastLiveNoticeAt >= 10000) for (const id of fresh) livePending.add(id);
    } else { livePending.clear(); practiceAwardCarry.clear(); }
    updateAchievementDisplays();
  }
  function maybeShowLiveNotice(snapshot: Snapshot) {
    if (runtime.achievements.notificationMode !== 'live' || snapshot.phase === 'PAUSED' || snapshot.wordStarted || !livePending.size || performance.now() - lastLiveNoticeAt < 10000) return;
    const count = livePending.size; livePending.clear(); lastLiveNoticeAt = performance.now();
    root.querySelector('.achievement-live')?.remove();
    const notice = document.createElement('aside'); notice.className = 'achievement-live'; notice.setAttribute('role', 'status'); notice.setAttribute('aria-label', `切手を${count}枚獲得しました`); notice.textContent = `切手 +${count}枚`;
    const route = root.querySelector<HTMLElement>('.site-header .route-label');
    if (route) { route.textContent = ''; route.append(notice); } else root.append(notice);
    clearTimeout(liveNoticeTimer); liveNoticeTimer = setTimeout(() => {
      if (route?.isConnected && route.contains(notice)) route.textContent = route.dataset.routeOriginal ?? '';
      else notice.remove();
    }, 1200);
  }
  function openSettings() {
    if (screen === 'game') pause();
    const dialog = document.createElement('dialog'); dialog.className = 'settings-dialog paper-card';
    dialog.innerHTML = settingsContent(runtime.settings, runtime.achievements.notificationMode, audio.status); root.append(dialog); dialog.showModal(); updateStorageStatus();
    dialog.addEventListener('change', event => {
      if (!runtime.status.writable) return;
      const input = event.target as HTMLInputElement;
      if (input.name === 'sound') { runtime.updateSettings({ sound: input.checked }); applySettings(); if (input.checked && event.isTrusted) audio.retryFromGesture(); return; }
      if (['audio-master', 'audio-effects', 'audio-music'].includes(input.name)) {
        const channel = input.name.slice(6) as keyof AppSettings['audioVolume'];
        runtime.updateSettings({ audioVolume: { ...runtime.settings.audioVolume, [channel]: Number(input.value) / 100 } }); applySettings(); return;
      }
      if (input.name === 'achievement-notifications') { runtime.achievementAction({ type: 'notifications', mode: input.value as 'live' | 'result' }); return; }
      if (!['fontScale', 'guide', 'reducedMotion', 'deliveryKeys'].includes(input.name)) return; const patch: Partial<AppSettings> = {};
      if (input.name === 'fontScale') patch.fontScale = Number(input.value) as AppSettings['fontScale'];
      if (input.name === 'guide') patch.guide = input.checked;
      if (input.name === 'reducedMotion') patch.reducedMotion = input.checked;
      if (input.name === 'deliveryKeys') patch.deliveryKeys = input.value === 'both' ? ['Space', 'Enter'] : [input.value as 'Space' | 'Enter'];
      runtime.updateSettings(patch); applySettings();
      if (session && state().phase !== 'RESULT' && patch.guide !== undefined) mutate(session.setGuideEnabled(patch.guide, performance.now()));
    });
    dialog.addEventListener('close', () => { dialog.remove(); if (screen === 'game' && session) { gameInput?.destroy(); attachGameInput(); updateGame(state()); } }, { once: true });
  }
  function openResetConfirmation(scope: ResetScope) {
    if (!runtime.status.writable || runtime.cityBusy || profileOperationPending) return;
    const dialog = document.createElement('dialog'); dialog.className = 'paper-card profile-confirm-dialog';
    dialog.innerHTML = resetConfirmation(scope, Boolean(session && state().phase !== 'RESULT'));
    root.append(dialog); dialog.showModal(); dialog.addEventListener('close', () => dialog.remove(), { once: true });
  }
  async function readBackupFile(input: HTMLInputElement) {
    const file = input.files?.[0]; input.value = '';
    if (!file || !runtime.status.writable || runtime.cityBusy || profileOperationPending) return;
    const status = root.querySelector<HTMLElement>('#backup-import-status');
    try {
      const text = await file.text(); const document = parseProfileBackup(text);
      pendingBackupText = text;
      const dialog = window.document.createElement('dialog'); dialog.className = 'paper-card profile-confirm-dialog';
      dialog.innerHTML = restoreConfirmation(file.name, { completedWords: document.progress.totalCompleted, collectedWords: Object.values(document.progress.words).filter(word => word.completed > 0).length, records: document.progress.recentRounds.length, fontScale: document.settings.fontScale, guide: document.settings.guide }, Boolean(session && state().phase !== 'RESULT'));
      root.append(dialog); dialog.showModal(); dialog.addEventListener('close', () => dialog.remove(), { once: true });
      if (status) status.textContent = '';
    } catch { pendingBackupText = null; if (status) status.textContent = 'この控えの形式や内容を確認できませんでした。現在の保存データは変更していません。'; }
  }
  async function performProfileReplacement(kind: 'reset' | 'restore', scope?: ResetScope) {
    if (!runtime.status.writable || runtime.cityBusy || profileOperationPending || (kind === 'restore' && pendingBackupText === null)) return;
    const backup = pendingBackupText; profileOperationPending = true;
    root.querySelectorAll<HTMLButtonElement>('.profile-confirm-dialog button').forEach(button => { button.disabled = true; });
    disposeGameLayout?.(); disposeGameLayout = undefined;
    gameInput?.destroy(); gameInput = undefined;
    closeCurrent('replaced'); session = undefined; sessionContext = undefined; lastResult = undefined; screen = 'home';
    inputConfirmed = false; lastChoiceFocus = '';
    try {
      if (kind === 'reset') await runtime.resetProfile(scope!); else await runtime.restoreProfile(backup!);
      root.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog => dialog.close()); renderHome();
      showProfileNotice(kind === 'restore' ? '選んだ控えの内容で復元しました。' : scope === 'settings' ? '設定を初期値へ戻しました。' : scope === 'records' ? '自己記録を削除しました。切手や街の進捗は残っています。' : '街・実績・収集を削除し、新しい計測を始めました。');
    } catch {
      root.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog => dialog.close()); renderHome();
      showProfileNotice('操作を完了できませんでした。保存の状態を確認してください。');
    } finally { pendingBackupText = null; profileOperationPending = false; }
  }
  function showProfileNotice(text: string) {
    const notice = document.createElement('p'); notice.className = 'profile-operation-notice'; notice.id = 'profile-operation-notice'; notice.setAttribute('role', 'status'); notice.textContent = text;
    root.querySelector('main')?.prepend(notice);
  }
  function downloadBackup() {
    const blob = new Blob([runtime.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'kotobabin-backup.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    const message = root.querySelector<HTMLElement>('#recovery-status'); if (message) message.textContent = '保存データの控えを書き出しました。';
  }
  function ownershipConfirmation(): Promise<boolean> {
    const dialog = document.createElement('dialog'); dialog.className = 'help-dialog paper-card'; dialog.dataset.role = 'ownership-confirm';
    dialog.innerHTML = '<form method="dialog"><h2>今の便を終了して、このタブで続けますか？</h2><p>確定済みの成果は残ります。未配達の追加点は確定しません。今の便は途中終了となり、次は新しい便として始めます。</p><button type="button" class="button button-primary" data-action="cancel-ownership" autofocus>取り消して今の画面へ</button><button type="button" class="button" data-action="confirm-ownership">今の便を終了してここで続ける</button></form>';
    root.append(dialog); dialog.showModal();
    return new Promise(resolve => { dialog.addEventListener('close', () => { const confirmed = dialog.returnValue === 'confirm'; dialog.remove(); resolve(confirmed); }, { once: true }); });
  }
  async function takeOver() {
    const unfinished = Boolean(session && state().phase !== 'RESULT');
    if (unfinished && !await ownershipConfirmation()) return;
    try {
      await runtime.takeOver();
      if (unfinished) { closeCurrent('replaced'); renderHome(); }
      updateStorageStatus();
    } catch {
      updateStorageStatus();
      const dialog = document.createElement('dialog'); dialog.className = 'help-dialog paper-card';
      dialog.innerHTML = '<form method="dialog"><h2>未保存の進捗があります。</h2><p>この画面の未保存の進捗を控えに残し、保存済みの最新状態で続けますか？今の配達は終了します。</p><button class="button button-primary" value="cancel" autofocus>今の画面に戻る</button><button class="button" value="restore">控えを書き出して、最新の状態で続ける</button></form>';
      root.append(dialog); dialog.showModal();
      dialog.addEventListener('close', () => {
        const confirmed = dialog.returnValue === 'restore'; dialog.remove(); if (!confirmed) return;
        downloadBackup();
        void runtime.takeOver({ discardUnsaved: true }).then(() => { if (unfinished) closeCurrent('replaced'); renderHome(); }).catch(updateStorageStatus);
      }, { once: true });
    }
  }
  type CityAction = CityCommand extends infer Command ? Command extends CityCommand ? Omit<Command, 'cityId' | 'economyEventId' | 'atMs'> : never : never;
  function cityWritable() { return runtime.status.writable && !runtime.cityBusy && runtime.city.activeSession === null; }
  function rememberCityOrigin() { if (screen !== 'city' && screen !== 'equipment') cityOrigin = screen === 'result' ? 'result' : 'home'; }
  function openCityPage(id = selectedDistrict) {
    const world = root.querySelector<HTMLElement>('.world-stage');
    const source = world?.querySelector<SVGGraphicsElement>(`[data-world-district-id="${id}"]`)?.getBoundingClientRect();
    const reduced = runtime.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const canvas = world?.querySelector<HTMLElement>('.town-map');
    const worldBounds = canvas?.getBoundingClientRect();
    const worldSvg = canvas?.querySelector('svg');
    const ghost = worldSvg && source && !reduced ? document.createElement('div') : undefined;
    if (ghost && worldSvg) { ghost.className = 'canonical-map world-transition-ghost'; ghost.append(worldSvg.cloneNode(true)); }
    rememberCityOrigin();
    confirmReplacement(() => {
      releaseScreenPresentation(); selectedDistrict = id; disposeGameLayout?.(); disposeGameLayout = undefined; gameInput?.destroy(); gameInput = undefined; mapObserver?.disconnect(); screen = 'city';
      root.innerHTML = `${header()}${cityShell(runtime.city, selectedDistrict)}${footer()}`; updateCityViews(); updateStorageStatus(); focusScreen();
      const map = root.querySelector<HTMLElement>('.district-map');
      if (map && source) animateDistrictEntry(map, source, reduced);
      if (ghost && worldBounds) {
        ghost.inert = true; ghost.setAttribute('aria-hidden', 'true'); ghost.removeAttribute('id');
        ghost.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
        Object.assign(ghost.style, { position: 'fixed', left: `${worldBounds.left}px`, top: `${worldBounds.top}px`, width: `${worldBounds.width}px`, height: `${worldBounds.height}px`, pointerEvents: 'none', zIndex: '1000' });
        document.body.append(ghost);
        const fade = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360, easing: 'ease-out' });
        void fade.finished.catch(() => {}).finally(() => ghost.remove());
      }
    });
  }
  function openEquipmentPage() {
    rememberCityOrigin();
    confirmReplacement(renderEquipment);
  }
  function renderEquipment() {
    releaseScreenPresentation();
    disposeGameLayout?.(); disposeGameLayout = undefined;
    gameInput?.destroy(); gameInput = undefined; mapObserver?.disconnect(); screen = 'equipment';
    purchaseStructureKey = '';
    root.innerHTML = `${header()}${equipmentShell(runtime.city, selectedDistrict, equipmentTab, purchaseQuantity)}${footer()}`;
    updateCityViews(); updateStorageStatus(); focusScreen();
  }
  function updateCityViews() {
    const city = runtime.city;
    if (!processingDeliveryFacts) deliveryScene?.updateCity(city);
    if (screen === 'city' || screen === 'equipment') {
      const map = root.querySelector<HTMLElement>('#district-map-slot');
      if (map) renderMarkup(map, renderDistrictMap(city, selectedDistrict, { selectedFeature: screen === 'city' ? 'plan' : equipmentTab }));
      const stage = root.querySelector<HTMLElement>('#city-stage-district-state');
      if (stage) stage.textContent = `${districtName(selectedDistrict)} · 段階 ${city.districts[selectedDistrict].stage}/5`;
      const summary = root.querySelector<HTMLElement>('#equipment-district-summary');
      if (summary) renderMarkup(summary, districtEquipmentSummary(city, selectedDistrict));
    }
    const balance = root.querySelector<HTMLElement>('#city-balance-strip');
    if (balance) {
      // Keep the resource row stable while its numbers advance in real time.
      const template = document.createElement('template'); template.innerHTML = balanceStrip(city);
      for (const id of ['city-coin', 'city-income', 'city-warehouse']) { const current = balance.querySelector(`#${id}`); const next = template.content.querySelector(`#${id}`); if (current && next && current.textContent !== next.textContent) current.textContent = next.textContent; }
    }
    if (screen === 'home') {
      const town = root.querySelector<HTMLElement>('.home-city-slot'); if (town) renderMarkup(town, homeTown(city, runtime.destination));
      const destination = root.querySelector<HTMLSelectElement>('#home-destination'); if (destination) { renderMarkup(destination, destinationOptions(city, runtime.destination)); destination.disabled = !runtime.status.writable || runtime.cityBusy; }
      beginHomeMapObservation();
      const start = root.querySelector<HTMLButtonElement>('[data-action="start"]'); if (start) start.disabled = window.innerWidth < 768 || runtime.cityBusy || !runtime.status.writable;
    } else if (screen === 'city') {
      const detail = root.querySelector<HTMLElement>('#district-detail'); if (detail) renderMarkup(detail, districtDetail(city, selectedDistrict, cityWritable()));
    } else if (screen === 'equipment') {
      const content = root.querySelector<HTMLElement>('#equipment-content')!;
      if (equipmentTab === 'packaging' || equipmentTab === 'crews' || equipmentTab === 'shops') {
        const kind = equipmentTab;
        displayedPurchaseQuote = new CityEconomy(structuredClone(city)).quotePurchase(kind, purchaseQuantity, selectedDistrict);
        const current = kind === 'packaging' ? city.packagingLevel : city.districts[selectedDistrict][kind];
        const key = `${city.cityId}:${kind}:${selectedDistrict}:${current}`;
        const markup = purchaseCard(city, selectedDistrict, kind, purchaseQuantity, cityWritable());
        if (purchaseStructureKey !== key) { renderMarkup(content, markup); purchaseStructureKey = key; }
        else patchPurchaseCard(content, markup);
      } else { displayedPurchaseQuote = undefined; renderMarkup(content, specialEquipment(city, selectedDistrict, equipmentTab, cityWritable(), selectedSpecialId)); }
      renderMarkup(root.querySelector<HTMLElement>('#equipment-district-summary')!, districtEquipmentSummary(city, selectedDistrict));
      root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.equipment-controls input, .equipment-controls select').forEach(input => { input.disabled = runtime.cityBusy; });
    } else if (screen === 'game') updatePlayCity();
    root.querySelectorAll<HTMLButtonElement>('[data-action="new-city"]').forEach(button => { button.disabled = runtime.cityBusy || !runtime.status.writable; });
    const restart = root.querySelector<HTMLButtonElement>('[data-action="confirm-city-restart"]'); if (restart) restart.disabled = !cityWritable() || !new CityEconomy(structuredClone(city)).newCityPreview().eligible;
  }
  function patchPurchaseCard(container: HTMLElement, markup: string) {
    const template = document.createElement('template'); template.innerHTML = markup;
    const ids = ['purchase-current', 'purchase-after', 'purchase-before-effect', 'purchase-after-effect', 'purchase-count', 'purchase-cost', 'purchase-balance', 'purchase-reason', 'purchase-queue', 'purchase-wait'];
    for (const id of ids) {
      const current = container.querySelector<HTMLElement>(`#${id}`); const next = template.content.querySelector<HTMLElement>(`#${id}`);
      if (current && next && current.textContent !== next.textContent) current.textContent = next.textContent;
    }
    const current = container.querySelector<HTMLButtonElement>('[data-action="city-purchase"]'); const next = template.content.querySelector<HTMLButtonElement>('[data-action="city-purchase"]');
    if (current && next) { current.disabled = next.disabled; if (current.textContent !== next.textContent) current.textContent = next.textContent; }
  }
  async function runCityCommand(action: CityAction): Promise<boolean> {
    if (!cityWritable()) return false;
    const focusedAction = (document.activeElement as HTMLElement | null)?.dataset.action;
    const command = { ...action, cityId: runtime.city.cityId, economyEventId: crypto.randomUUID() } as CityCommand;
    const message = root.querySelector<HTMLElement>('.restart-dialog #restart-status') ?? root.querySelector<HTMLElement>('#city-command-status');
    if (message) message.textContent = '処理しています。';
    try {
      await runtime.cityCommand(command);
      if (message?.isConnected) message.textContent = '街に反映しました。';
      updateCityViews();
      if (focusedAction && document.activeElement === document.body) {
        const next = root.querySelector<HTMLButtonElement>(`button[data-action="${focusedAction}"]:not(:disabled)`) ?? root.querySelector<HTMLButtonElement>('.dm-feature[aria-pressed="true"]');
        next?.focus({ preventScroll: true });
      }
      return true;
    } catch (error) {
      if (message?.isConnected) message.textContent = error instanceof Error && error.message.includes('Purchase quote changed') ? '残高が変わり、購入数量を更新しました。表示内容を確認して、もう一度購入してください。' : '操作を完了できませんでした。現在の条件と保存の状態を確認して、もう一度お試しください。';
      updateCityViews(); return false;
    }
  }
  function purchaseEquipment() {
    const quote = displayedPurchaseQuote;
    if (!quote || !quote.count || !['packaging', 'crews', 'shops'].includes(equipmentTab)) return;
    void runCityCommand({ type: 'purchase', kind: equipmentTab as EquipmentKind, districtId: selectedDistrict, quantity: purchaseQuantity, expectedCount: quote.count, expectedTotalCostMicro: quote.totalCostMicro.toString() });
  }
  function showNewCity() {
    if (!cityWritable()) return;
    const dialog = document.createElement('dialog'); dialog.className = 'settings-dialog paper-card restart-dialog';
    dialog.innerHTML = restartContent(runtime.city, cityWritable()); root.append(dialog); dialog.showModal();
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
  }
  function confirmNewCity() {
    const dialog = root.querySelector<HTMLDialogElement>('.restart-dialog'); if (!dialog || !cityWritable()) return;
    const landscape = dialog.querySelector<HTMLSelectElement>('#restart-landscape')!.value;
    void runCityCommand({ type: 'startNewCity', confirmed: true, location: cityOrigin === 'result' ? 'RESULT' : 'HOME', landscape }).then(applied => { if (applied) { dialog.close(); selectedDistrict = runtime.destination; renderHome(); } });
  }
  function updatePlayCity() {
    const element = root.querySelector<HTMLElement>('#play-city-values'); if (!element || !sessionCityAtStart) return;
    const city = runtime.city; const district = city.districts[sessionDestination];
    renderMarkup(element, `<p>届け先 <strong>${districtName(sessionDestination)}</strong></p><p>今回作った資材 ${formatMicro(city.generatedMicro - sessionCityAtStart.generatedMicro)}</p><p>${district.plan ? `開発予約 ${formatMicro(district.plan.reservedMicro)} / ${formatMicro(district.plan.requiredMicro)}` : `地区段階 ${district.stage}/5`}</p><p>輸送待ち ${formatMicro(district.queueMicro)}</p>`);
  }
  function showReturnNotice() {
    const summary = runtime.returnSummary;
    if (returnNoticeDismissed || !summary || (summary.arrivedMicro === 0n && summary.shopCoinsMicro === 0n && !summary.completed.length)) return;
    const notice = document.createElement('aside'); notice.className = 'paper-card return-card'; notice.id = 'return-card'; notice.setAttribute('role', 'status');
    notice.innerHTML = `<h2>おかえりなさい。</h2><p>留守の間に ${formatMicro(summary.arrivedMicro)}資材が到着 · ${formatMicro(summary.shopCoinsMicro)}コイン</p>${summary.completed.length ? `<p>${summary.completed.map(item => `${districtName(item.districtId)} 段階${item.stage}が完成`).join('、')}</p>` : ''}<p>適用 ${Math.floor(summary.creditedMs / 1000)}秒（最大8時間）· 街に反映済み</p><button class="button" data-action="dismiss-return">街へ戻る</button>`;
    root.querySelector('main')?.prepend(notice);
  }
  function renderCheck() {
    releaseScreenPresentation();
    disposeGameLayout?.(); disposeGameLayout = undefined;
    gameInput?.destroy(); gameInput = undefined;
    screen = 'check'; checkPassed = false; pending = undefined;
    root.innerHTML = `${header()}<main id="main" class="centered-page" data-paginate="入力確認"><section class="paper-card input-check" data-page-children><p class="eyebrow">BEFORE WE GO</p><h1>キーボードを準備しましょう。</h1><p>IMEをオフにして、<strong>半角英字の a</strong> を1回入力してください。<br>確認の入力は、得点に数えません。</p><div class="check-field-group" data-ipad-fixed><label class="check-label" for="game-input">入力の確認</label><input id="game-input" class="check-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="check-status"><p id="check-status" role="status">半角英字で a を入力してください</p></div><button class="button button-primary" data-ipad-fixed data-action="confirm" disabled>${rechecking ? '一時停止へ戻る' : '準備できました →'}</button><button class="text-button" data-ipad-fixed data-action="check-back">戻る</button></section></main>${footer()}`;
    focusInput();
  }
  function renderGame() {
    releaseScreenPresentation();
    disposeGameLayout?.(); disposeGameLayout = undefined;
    gameInput?.destroy(); gameInput = undefined;
    screen = 'game';
    const city = runtime.city;
    if (!deliveryScene || deliveryScene.view().destination !== sessionDestination || deliveryScene.view().cityId !== city.cityId) deliveryScene = new DeliverySceneController(city, sessionDestination);
    deliveryScene.setReducedMotion(runtime.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
    root.innerHTML = `${header(true)}${gameStageShell({ mode: session!.mode, destinationLabel: districtName(sessionDestination), sceneHtml: deliveryScene.render(), goalHtml: goalStrip(achievementViews(), runtime.achievements, { recommend: true }), cityHtml: districtFigure(sessionCityAtStart!, sessionDestination), saveState: runtime.status.storage })}${footer()}`;
    deliveryScene.attach(root);
    disposeGameLayout = installGameLayout(root);
    attachGameInput();
    updateGame(state()); updateStorageStatus();
  }
  function updateGame(snapshot: Snapshot) {
    if (screen !== 'game') return;
    if (snapshot.phase === 'RESULT') { if (snapshot.mode === 'MAIN') renderResult(snapshot); return; }
    const set = (id: string, value: string) => { const el = root.querySelector<HTMLElement>(`#${id}`); if (el && el.textContent !== value) el.textContent = value; };
    set('time-left', String(Math.ceil((snapshot.remainingMs ?? 90000) / 1000)));
    set('score', number(snapshot.score));
    set('word-stage', snapshot.mode === 'PRACTICE' && snapshot.awaitingWordChoice ? '完成したことば' : snapshot.phase === 'READY' ? '最初の一打で、配達がはじまります' : snapshot.wordStarted ? 'このことばを、届けよう' : '次のことば');
    set('prompt-word', snapshot.currentWord.display);
    set('prompt-reading', snapshot.currentWord.reading);
    const guide = root.querySelector<HTMLElement>('#romaji-guide')!;
    const nextGuide = `<span class="accepted">${esc(snapshot.acceptedInput)}</span>${snapshot.remainingGuide ? `<span class="next-key">${esc(snapshot.remainingGuide.slice(0, 1))}</span><span>${esc(snapshot.remainingGuide.slice(1))}</span>` : ''}`;
    renderMarkup(guide, nextGuide);
    guide.style.visibility = snapshot.guideEnabled ? 'visible' : 'hidden';
    set('guide-status', snapshot.guideEnabled ? 'ON' : 'OFF');
    set('cargo-count', String(snapshot.cargoCount));
    const slots = root.querySelector<HTMLElement>('#cargo-slots')!;
    const slotMarkup = Array.from({ length: 5 }, (_, index) => `<span class="cargo-slot ${index < snapshot.cargoCount ? 'filled' : ''}">${index < snapshot.cargoCount ? `<img src="${asset('cargo/cargo_parcel.webp')}" alt="">` : ''}</span>`).join('');
    renderMarkup(slots, slotMarkup);
    const canDeliver = (!snapshot.wordStarted || snapshot.awaitingWordChoice) && snapshot.cargoCount > 0;
    root.querySelector<HTMLButtonElement>('#deliver-button')!.disabled = !canDeliver;
    set('deliver-label', canDeliver ? `いま届ける +${number(snapshot.pendingBonus)}点` : snapshot.wordStarted ? 'このことばを完成すると届けられます' : '次のことばを完成させよう');
    set('continue-hint', snapshot.mode === 'PRACTICE' && snapshot.awaitingWordChoice ? 'もう一度、または次のことばを選ぼう' : canDeliver ? 'または、打ち始めて続ける' : '無誤打で完成すると、荷物がひとつ増えます');
    set('risk-hint', snapshot.mode === 'PRACTICE' && snapshot.awaitingWordChoice ? (canDeliver ? '持っている荷物を、上の配達ボタンで届けることもできます。' : '完成したことばと練習の成果は、練習を終了しても残ります。') : canDeliver ? `次も無誤打で完成して届ければ +${number(snapshot.nextBonus)}点 ／ ミスで失う追加点 ${number(snapshot.pendingBonus)}点。完成点は残ります。` : '荷物が5個になると、自動で配達します。');
    set('completed-count', `完成 ${snapshot.completedWords}語`);
    set('game-message', snapshot.message);
    updateModeControls(snapshot);
    updateAchievementDisplays(); maybeShowLiveNotice(snapshot);
    updatePlayCity();
    root.querySelector<HTMLElement>('#time-bar')!.style.width = `${Math.max(0, (snapshot.remainingMs ?? 90000) / 900)}%`;
    if (snapshot.mistakes > lastMistakes) {
      guide.classList.add('mistake');
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => guide.classList.remove('mistake'), 180);
    }
    lastMistakes = snapshot.mistakes;
    const overlay = root.querySelector<HTMLElement>('#paused-layer')!;
    if (snapshot.phase === 'PAUSED' && overlay.hidden) {
      overlay.hidden = false;
      isolatePausedContent(true);
      overlay.innerHTML = `<section class="paper-card pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><p class="eyebrow">TAKE YOUR TIME</p><h1 id="pause-title">ひと休みしましょう。</h1><div id="paused-ownership"></div><p>時計と入力は止まっています。<br>準備ができたら、続きをどうぞ。</p><button class="button button-primary" data-action="resume">配達を再開する</button><button class="button" data-action="settings">設定</button><button class="button" data-action="recheck">半角入力を確認する</button><button class="button" data-action="skip">このことばを飛ばす</button>${snapshot.mode === 'TUTORIAL' ? '<button class="button" data-action="tutorial-skip">導入を飛ばして本編へ</button>' : ''}${snapshot.mode === 'PRACTICE' ? '<button class="button" data-action="equipment">練習を終了して設備を見る</button>' : ''}<button class="button" data-action="handbook">配達手帳</button><button class="button" data-action="catalogue">ことば図鑑</button><p>停止中も、街の輸送と営業は実時間で進みます。</p><button class="text-button" data-action="quit">${snapshot.mode === 'PRACTICE' ? '練習を終える' : 'ホームへ戻る'}</button></section>`;
      root.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus({ preventScroll: true });
    } else if (snapshot.phase !== 'PAUSED') { overlay.hidden = true; isolatePausedContent(false); }
    syncOwnershipActions();
    const resume = root.querySelector<HTMLButtonElement>('[data-action="resume"]'); if (resume) resume.disabled = !runtime.status.writable || (snapshot.mode === 'MAIN' && window.innerWidth < 768);
  }
  function renderResult(snapshot: Snapshot) {
    releaseScreenPresentation(); disposeGameLayout?.(); disposeGameLayout = undefined;
    gameInput?.destroy(); gameInput = undefined; mapObserver?.disconnect();
    screen = 'result'; lastResult = snapshot;
    const sessionId = session?.sessionId ?? resultStageSessionId;
    const fresh = Object.keys(runtime.achievements.unlocks).filter(id => !sessionUnlocksAtStart.has(id) && !practiceAwardCarry.has(id));
    const ids = resultStageSessionId === sessionId && resultStageState ? resultStageState.queue : fresh;
    if (resultStageSessionId !== sessionId) { resultStageState = undefined; resultStageSessionId = sessionId; }
    root.innerHTML = `${header()}<main id="main" class="result-page" data-ipad-exclude></main>${footer()}`;
    resultStage = mountResultStage(root.querySelector<HTMLElement>('#main')!, {
      result: { score: snapshot.score, baseScore: snapshot.baseScore, bonusScore: snapshot.bonusScore, completedWords: snapshot.completedWords, accuracy: snapshot.accuracy, canonicalKpm: snapshot.canonicalKpm, courseName: `${course().name} · ${districtName(sessionDestination)}ゆき`, assisted: snapshot.skips > 0, guideUsed: snapshot.guideUsed },
      newAchievementIds: ids, reducedMotion: runtime.settings.reducedMotion, resumeState: resultStageState, inputGuardMs: resultStageState ? 0 : 300,
      hasReview: reviewIds(snapshot).length > 0,
      onStateChange: next => { resultStageState = next; updateStorageStatus(); },
      onAction: action => {
        if (action === 'retry') { launchTarget = { mode: 'MAIN', preferredWordId: mainPreferredWordId }; launch(); }
        else if (action === 'new-round') { seed = newSeed(); launchTarget = { mode: 'MAIN' }; launch(); }
        else if (action === 'navigation') openNavigationMenu();
        else if (action === 'home') renderHome();
        else if (action === 'handbook') openHandbook();
        else if (action === 'review') { practiceFilter = {}; startPractice(reviewIds(snapshot)); }
        else if (action === 'details') showResultDetails(snapshot);
      },
    });
    updateStorageStatus(); updateAchievementDisplays();
  }
  function showResultDetails(snapshot: Snapshot) {
    const dialog = document.createElement('dialog'); dialog.className = 'paper-card result-detail-dialog';
    dialog.innerHTML = `<form method="dialog"><h2>詳しい配達記録</h2><p>完成点 ${number(snapshot.baseScore)} ＋ 配達ボーナス ${number(snapshot.bonusScore)} = ${number(snapshot.score)}点</p><p>正解打鍵 ${snapshot.correctKeys} / 誤打 ${snapshot.mistakes} · 完成 ${snapshot.completedWords}語</p><div id="result-economy">${session ? resultEconomy(runtime.city, session.sessionId) : ''}</div><div id="result-achievements-slot">${resultAchievements()}</div><p class="save-status" data-save-status></p><button type="button" class="button" data-action="close-result-details">結果へ戻る</button></form>`;
    root.append(dialog); dialog.showModal(); updateStorageStatus();
    dialog.addEventListener('close', () => { dialog.remove(); root.querySelector<HTMLButtonElement>('[data-result-action="details"]')?.focus({ preventScroll: true }); }, { once: true });
  }
  function reviewIds(snapshot: Snapshot) { return snapshot.reviewWordIds; }
  function updateModeControls(snapshot: Snapshot) {
    const tutorial = root.querySelector<HTMLElement>('#tutorial-status')!;
    tutorial.hidden = snapshot.mode !== 'TUTORIAL';
    tutorial.dataset.delivered = String(snapshot.tutorialDelivered);
    if (snapshot.mode === 'TUTORIAL') {
      const markup = `<div><strong>${snapshot.tutorialDelivered ? 'はじめての配達、できました。' : snapshot.cargoCount > 0 ? '荷物ができました。語の境目で届けてみましょう。' : 'まずは、ひとつのことばから。'}</strong><p>${snapshot.tutorialDelivered ? 'できたことが、切手になります。次は90秒の配達へ。' : `無誤打で完成すると荷物がひとつ増えます。${runtime.settings.deliveryKeys.join(' または ')}で配達できます。まちがえても続きを打てます。`}</p></div>${snapshot.tutorialDelivered ? '<button class="button button-primary" data-action="tutorial-main">90秒の配達へ →</button>' : '<button class="text-button" data-action="tutorial-skip">導入を飛ばして本編へ</button>'}<div id="tutorial-fallback" ${snapshot.tutorialFallbackAvailable ? '' : 'hidden'}><p>あせらなくても大丈夫。自分に合うほうを選べます。</p><button class="button" data-action="tutorial-skip">そのまま本編へ</button><button class="button" data-action="tutorial-practice">ゆっくり練習する</button></div>`;
      renderMarkup(tutorial, markup);
    }
    const practice = root.querySelector<HTMLElement>('#practice-actions')!;
    practice.hidden = snapshot.mode !== 'PRACTICE';
    if (snapshot.mode === 'PRACTICE') {
      const clean = Math.min(3, runtime.profile.words[snapshot.currentWord.id]?.practiceCleanCompleted ?? 0);
      const markup = `<p id="practice-progress">このことばの練習 · 無誤打 <strong>${clean}/3</strong></p><p>${snapshot.awaitingWordChoice ? '完成しました。もう一度でも、次のことばでも。' : '途中で次のことばへ進むと、現在の連続成功は途切れます。'}</p><div>${snapshot.awaitingWordChoice ? '<button class="button button-primary" data-action="repeat-word">もう一度</button>' : ''}<button class="button" data-action="next-practice-word">次のことば</button><button class="button" data-action="practice-main" ${window.innerWidth < 768 ? 'disabled' : ''}>このことばを本編で試す</button>${window.innerWidth < 768 ? '<p>本編には幅768px以上の画面と物理キーボードが必要です。</p>' : ''}<button class="text-button" data-action="practice-end">練習を終える</button><button class="text-button" data-action="read-aloud">ことばを読み上げる</button></div>`;
      renderMarkup(practice, markup);
      root.querySelector<HTMLElement>('#input-indicator')!.textContent = snapshot.awaitingWordChoice ? '完成しました' : '入力できます';
    }
    root.querySelectorAll<HTMLElement>('.deliver-button kbd').forEach(element => { element.textContent = runtime.settings.deliveryKeys.join(' / '); });
    root.querySelector<HTMLElement>('#input-instructions')!.textContent = `表示されたことばを半角ローマ字で入力してください。語の境目に${runtime.settings.deliveryKeys.join('または')}で配達できます。Escapeで一時停止します。`;
    refreshGameLayout(root, snapshot);
    focusNewChoice(snapshot);
  }
  function choiceTarget(snapshot: Snapshot): string | undefined {
    if (snapshot.mode === 'PRACTICE' && snapshot.awaitingWordChoice) return '[data-action="repeat-word"]';
    if (snapshot.mode === 'TUTORIAL' && snapshot.tutorialDelivered) return '[data-action="tutorial-main"]';
    if (snapshot.mode === 'TUTORIAL' && snapshot.tutorialFallbackAvailable) return '#tutorial-fallback [data-action="tutorial-skip"]';
    return undefined;
  }
  function focusNewChoice(snapshot: Snapshot, force = false) {
    if (snapshot.phase === 'PAUSED') { lastChoiceFocus = ''; return; }
    const selector = choiceTarget(snapshot);
    const key = selector ? `${selector}:${snapshot.completedWords}` : '';
    if (selector && (force || key !== lastChoiceFocus)) {
      suppressBlur = true;
      root.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true });
      suppressBlur = false;
    }
    lastChoiceFocus = key;
  }
  function redrawPause() {
    root.querySelector<HTMLElement>('#paused-layer')!.hidden = true;
    updateGame(state());
  }
  function showQuit() {
    const overlay = root.querySelector<HTMLElement>('#paused-layer')!;
    overlay.innerHTML = '<section class="paper-card pause-card" role="dialog" aria-modal="true" aria-labelledby="quit-title"><h2 id="quit-title">配達を途中で終了しますか？</h2><p>完成したことばと確定済みの成果は残ります。未配達の追加点と通常の便の仮達成は確定しません。</p><button class="button button-primary" data-action="cancel-quit">配達を続ける</button><button class="button" data-action="confirm-quit">終了してホームへ</button></section>';
    root.querySelector<HTMLButtonElement>('[data-action="cancel-quit"]')?.focus({ preventScroll: true });
  }
  function showSkip() {
    const snapshot = state();
    const overlay = root.querySelector<HTMLElement>('#paused-layer')!;
    overlay.innerHTML = `<section class="paper-card pause-card" role="dialog" aria-modal="true" aria-labelledby="skip-title"><h2 id="skip-title">このことばを飛ばしますか？</h2><p>${snapshot.mode === 'MAIN' ? 'この便は救済ありの記録になります。完成したことばと確定済みの成果は残ります。通常の自己記録とは別に記録します。' : '途中のことばは完成に数えず、現在の連続成功は途切れます。完成済みの成果は残ります。'}</p><p>持っている荷物の追加点を届けて、次のことばへ進みます。</p><button class="button button-primary" data-action="cancel-quit">今のことばに戻る</button><button class="button" data-action="confirm-skip">説明を確認して飛ばす</button></section>`;
    root.querySelector<HTMLButtonElement>('[data-action="cancel-quit"]')?.focus({ preventScroll: true });
  }
  function chooseNextPracticeWord() {
    const current = state();
    const allowed = new Set(filterCatalogue(runtime.profile, practiceFilter).map(word => word.id));
    const candidates = practiceWordIds.filter(id => allowed.has(id));
    const position = practiceWordIds.indexOf(current.currentWord.id);
    const nextId = [...practiceWordIds.slice(position + 1), ...practiceWordIds.slice(0, position + 1)].find(id => allowed.has(id));
    if (!nextId || !candidates.length) {
      root.querySelector<HTMLElement>('#game-message')!.textContent = 'この一覧のことばをすべて完成しました。図鑑で別のことばを選べます。'; return;
    }
    const next = wordsData.words.find(word => word.id === nextId)! as Word;
    mutate(session!.nextPracticeWord(performance.now(), next)); focusInput();
  }
  function attachGameInput() {
    const input = root.querySelector<HTMLInputElement>('#game-input')!;
    gameInput = new InputAdapter(input, {
      onCharacter: (key, at) => { if (screen === 'game' && session && !root.querySelector('dialog[open]') && runtime.status.writable) { if (state().phase !== 'PAUSED') audio.resumeFromGesture(); mutate(session.input(key, at)); } },
      onDeliver: (at) => { if (screen === 'game' && session && !root.querySelector('dialog[open]') && runtime.status.writable) { if (state().phase !== 'PAUSED') audio.resumeFromGesture(); mutate(session.deliver(at)); } },
      onPause: (reason, at) => {
        if (screen !== 'game' || !session || suppressBlur) return;
        if (reason === 'blur' && session.mode !== 'MAIN' && (state().awaitingWordChoice || state().tutorialDelivered)) {
          queueMicrotask(() => { const focusedChoice = root.querySelector('#practice-actions')?.contains(document.activeElement) || root.querySelector('#tutorial-status')?.contains(document.activeElement); if (screen === 'game' && session && (!document.hasFocus() || !focusedChoice)) mutate(session.pause(at)); });
        } else mutate(session.pause(at));
      },
      deliveryKeys: runtime.settings.deliveryKeys,
      onInputCheckRequired: () => { inputConfirmed = false; },
    });
  }
  function isolatePausedContent(paused: boolean) {
    const elements = [...root.querySelectorAll<HTMLElement>('.site-header, .site-footer, .game-page > :not(#paused-layer):not(#ownership-status)')];
    for (const element of elements) { element.inert = paused; if (paused) element.setAttribute('aria-hidden', 'true'); else element.removeAttribute('aria-hidden'); }
  }
  function focusInput() { suppressBlur = true; root.querySelector<HTMLInputElement>('#game-input')?.focus({ preventScroll: true }); suppressBlur = false; }
  function pause() { if (screen === 'game' && session) mutate(session.pause(performance.now())); }
  function help() {
    const dialog = document.createElement('dialog');
    dialog.className = 'help-dialog paper-card';
    dialog.innerHTML = `<form method="dialog"><p class="eyebrow">HOW TO PLAY</p><h2>ことばを打って、届けよう。</h2><ol><li><strong>読みをローマ字で入力。</strong><br>別の正しいつづりでも入力できます。</li><li><strong>無誤打で完成すると、荷物に。</strong><br>まちがえても、完成したことばの得点は残ります。</li><li><strong>語の境目にSpaceで配達。</strong><br>荷物をためるほど追加点が増え、5個で自動配達します。次の語でミスすると、未配達の追加点を失います。</li></ol><p>90秒が過ぎたら、残った荷物も自動で配達。<br>途中のことばは完成点に数えません。</p><button class="button button-primary">わかりました</button></form>`;
    root.append(dialog); dialog.showModal();
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
  }
  on(root, 'change', event => {
    const target = event.target as HTMLInputElement;
    if (target.name === 'achievement-filter') { handbookFilter = target.value as HandbookFilter; updateHandbook(); }
    if (target.id === 'achievement-scope') { handbookScope = target.value; updateHandbook(); }
    if (target.dataset.equipSlot) { runtime.achievementAction({ type: 'equip', slot: target.dataset.equipSlot as EquipmentSlot, id: target.value || null }); updateHandbook(); }
    if (target.id === 'profile-backup-file') { void readBackupFile(target); return; }
    if (target.name === 'course') selectedCourse = target.value as CourseId;
    if (target.id === 'home-destination' && !runtime.cityBusy) runtime.selectDestination(target.value);
    if (target.id === 'special-equipment-item') { selectedSpecialId = target.value; updateCityViews(); }
    if (target.id === 'equipment-district') { selectedDistrict = target.value; purchaseStructureKey = ''; updateCityViews(); }
    if (target.name === 'purchase-quantity') { purchaseQuantity = target.value === 'max' ? 'max' : Number(target.value) as 1 | 10; updateCityViews(); }
    if (['catalogue-set', 'catalogue-topic', 'catalogue-state'].includes(target.id)) { cataloguePage = 0; updateCatalogue(); }
  });
  on(root, 'input', event => {
    const input = event.target as HTMLInputElement;
    if (['audio-master', 'audio-effects', 'audio-music'].includes(input.name)) { const channel = input.name.slice(6); const output = root.querySelector<HTMLOutputElement>(`[data-audio-volume="${channel}"]`); if (output) output.textContent = `${input.value}%`; input.setAttribute('aria-valuetext', `${input.value}%`); }
    if ((event.target as HTMLElement).id === 'catalogue-query') { cataloguePage = 0; updateCatalogue(); } });
  // Keep native input focus until an intended pointer action is handled. Otherwise
  // the adapter's blur pause can make the target inert before its click arrives.
  on(root, 'pointerdown', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (screen === 'game' && target && document.activeElement === root.querySelector('#game-input')) event.preventDefault();
  });
  on(root, 'click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    if (event.isTrusted) { if (screen !== 'game' || state().phase !== 'PAUSED') audio.resumeFromGesture(); else audio.gesture(); }
    event.preventDefault();
    if (target.dataset.navigation) root.querySelector<HTMLDialogElement>('.navigation-dialog')?.close();
    if ((!runtime.status.writable || runtime.cityBusy) && (target.dataset.action?.startsWith('city-') || target.dataset.action === 'confirm-city-restart')) return;
    if (!runtime.status.writable && ['deliver', 'guide', 'confirm-skip', 'repeat-word', 'next-practice-word', 'practice-main', 'tutorial-main', 'tutorial-skip', 'confirm-quit'].includes(target.dataset.action ?? '')) return;
    switch (target.dataset.action) {
      case 'start': seed = newSeed(); launchTarget = { mode: runtime.settings.tutorialSeen ? 'MAIN' : 'TUTORIAL' }; launch(); break;
      case 'home': if (screen === 'game' && !target.dataset.navigation) { pause(); break; } confirmReplacement(renderHome); break;
      case 'navigation-menu': openNavigationMenu(); break;
      case 'close-navigation': root.querySelector<HTMLDialogElement>('.navigation-dialog')?.close(); break;
      case 'help': help(); break;
      case 'handbook': openHandbook(); break;
      case 'achievement-open': selectedAchievementId = target.dataset.achievementId!; handbookFamily = selectedAchievementId[0]; openHandbook(); revealSelectedAchievement(); break;
      case 'handbook-back': returnFromHandbook(); break;
      case 'handbook-tab': handbookTab = target.dataset.tab as HandbookTab; updateHandbook(); if (handbookTab === 'rewards') runtime.achievementAction({ type: 'read', achievementIds: [], rewardKeys: [...runtime.achievements.unreadRewards] }); else if (handbookTab === 'history') runtime.achievementAction({ type: 'read', achievementIds: [...runtime.achievements.unreadAchievements] }); break;
      case 'achievement-family': handbookFamily = target.dataset.familyId!; selectedAchievementId = `${handbookFamily}01`; updateHandbook(); markSelectedRead(); revealHandbookElement('#handbook-cards .achievement-select'); break;
      case 'achievement-select': selectedAchievementId = target.dataset.achievementId!; handbookFamily = selectedAchievementId[0]; handbookTab = 'stamps'; updateHandbook(); markSelectedRead(); revealSelectedAchievement(); break;
      case 'achievement-target': runtime.achievementAction({ type: 'target', id: runtime.achievements.targetId === target.dataset.achievementId ? null : target.dataset.achievementId! }); updateHandbook(); break;
      case 'achievement-reveal': runtime.achievementAction({ type: 'reveal', id: target.dataset.achievementId! }); updateHandbook(); revealHandbookElement('#achievement-detail .achievement-detail-condition'); break;
      case 'reward-equip': { const slot = target.dataset.equipSlot as EquipmentSlot; const id = target.dataset.rewardId!; runtime.achievementAction({ type: 'equip', slot, id: runtime.achievements.equipped[slot] === id ? null : id }); updateHandbook(); break; }
      case 'settings': openSettings(); break;
      case 'enable-audio': if (event.isTrusted) audio.retryFromGesture(); break;
      case 'profile-reset': openResetConfirmation(target.dataset.scope as ResetScope); break;
      case 'cancel-profile-operation': root.querySelector<HTMLDialogElement>('.profile-confirm-dialog')?.close(); pendingBackupText = null; break;
      case 'confirm-profile-reset': void performProfileReplacement('reset', target.dataset.scope as ResetScope); break;
      case 'confirm-profile-restore': void performProfileReplacement('restore'); break;
      case 'close-settings': root.querySelector<HTMLDialogElement>('.settings-dialog')?.close(); break;
      case 'confirm': if (checkPassed) { inputConfirmed = true; if (rechecking) { renderGame(); updateGame(state()); } else launch(); } break;
      case 'check-back': if (rechecking) { renderGame(); updateGame(state()); } else renderHome(); break;
      case 'pause': pause(); break;
      case 'resume': {
        if (!runtime.status.writable) { updateStorageStatus(); break; }
        if (session!.mode === 'MAIN' && window.innerWidth < 768) break;
        if (!inputConfirmed) { rechecking = true; renderCheck(); break; }
        if (event.isTrusted) audio.resumeFromGesture();
        isolatePausedContent(false); root.querySelector<HTMLElement>('#paused-layer')!.hidden = true; focusInput();
        if (document.activeElement === root.querySelector('#game-input')) mutate(session!.resume(performance.now())); break;
      }
      case 'recheck': rechecking = true; renderCheck(); break;
      case 'deliver': { const snapshot = session!.deliver(performance.now()); mutate(snapshot); if (choiceTarget(snapshot)) focusNewChoice(snapshot, true); else focusInput(); break; }
      case 'guide': { const enabled = !state().guideEnabled; runtime.updateSettings({ guide: enabled }); mutate(session!.setGuideEnabled(enabled, performance.now())); break; }
      case 'retry': launchTarget = { mode: 'MAIN', preferredWordId: mainPreferredWordId }; launch(); break;
      case 'new-round': seed = newSeed(); launchTarget = { mode: 'MAIN' }; launch(); break;
      case 'quit': showQuit(); break;
      case 'cancel-quit': redrawPause(); break;
      case 'confirm-quit': closeCurrent('home'); renderHome(); break;
      case 'skip': showSkip(); break;
      case 'confirm-skip': if (session!.mode === 'PRACTICE') chooseNextPracticeWord(); else mutate(session!.skip(performance.now())); redrawPause(); break;
      case 'catalogue': {
        if (screen === 'catalogue') break;
        catalogueOrigin = screen === 'game' || (screen === 'check' && rechecking) ? 'game' : screen === 'result' ? 'result' : 'home';
        if (catalogueOrigin === 'game') pause(); renderCatalogue(); break;
      }
      case 'catalogue-back': if (catalogueOrigin === 'game' && session) renderGame(); else if (catalogueOrigin === 'result' && lastResult) renderResult(lastResult); else renderHome(); break;
      case 'catalogue-prev': cataloguePage--; updateCatalogue(); break;
      case 'catalogue-next': cataloguePage++; updateCatalogue(); break;
      case 'practice-word': {
        practiceFilter = catalogueFilter(root); const ids = filterCatalogue(runtime.profile, practiceFilter).map(word => word.id);
        const index = ids.indexOf(target.dataset.wordId!); startPractice([...ids.slice(index), ...ids.slice(0, index)]); break;
      }
      case 'practice-filtered': practiceFilter = catalogueFilter(root); startPractice(filterCatalogue(runtime.profile, practiceFilter).map(word => word.id)); break;
      case 'repeat-word': mutate(session!.repeatWord(performance.now())); focusInput(); break;
      case 'next-practice-word': chooseNextPracticeWord(); break;
      case 'practice-main': startMain(state().currentWord.id); break;
      case 'practice-end': closeCurrent('home'); renderHome(); break;
      case 'review': if (lastResult) { practiceFilter = {}; startPractice(reviewIds(lastResult)); } break;
      case 'tutorial-main': runtime.updateSettings({ tutorialSeen: true }); startMain(); break;
      case 'tutorial-skip': runtime.updateSettings({ tutorialSeen: true }); startMain(); break;
      case 'tutorial-practice': { const wordId = state().currentWord.id; closeCurrent('replaced'); launchTarget = { mode: 'PRACTICE', wordIds: [wordId] }; launch(); break; }
      case 'city': openCityPage(); break;
      case 'equipment': openEquipmentPage(); break;
      case 'world-map': renderHome(); break;
      case 'district-feature': { const feature = target.dataset.feature as DistrictMapFeature; selectedDistrict = target.dataset.districtId!; if (feature === 'plan') openCityPage(selectedDistrict); else { equipmentTab = feature; selectedSpecialId = undefined; renderEquipment(); focusScreen(`.district-map [data-feature="${feature}"]`); } break; }
      case 'close-result-details': root.querySelector<HTMLDialogElement>('.result-detail-dialog')?.close(); break;
      case 'city-district': selectedDistrict = target.dataset.districtId!; openCityPage(selectedDistrict); break;
      case 'city-back': if (cityOrigin === 'result' && lastResult) renderResult(lastResult); else renderHome(); break;
      case 'choose-destination': if (!runtime.cityBusy) { runtime.selectDestination(target.dataset.districtId!); renderHome(); } break;
      case 'equipment-kind': equipmentTab = target.dataset.kind as EquipmentTab; renderEquipment(); break;
      case 'city-purchase': purchaseEquipment(); break;
      case 'city-start-plan': void runCityCommand({ type: 'startPlan', districtId: target.dataset.districtId! }); break;
      case 'city-pause-plan': void runCityCommand({ type: 'pausePlan', districtId: target.dataset.districtId! }); break;
      case 'city-resume-plan': void runCityCommand({ type: 'resumePlan', districtId: target.dataset.districtId! }); break;
      case 'city-open-district': void runCityCommand({ type: 'openDistrict', districtId: target.dataset.districtId! }); break;
      case 'city-buy-railway': void runCityCommand({ type: 'buyRailway', districtId: target.dataset.districtId! }); break;
      case 'city-buy-synergy': void runCityCommand({ type: 'buySynergy', synergyId: target.dataset.synergyId! }); break;
      case 'city-buy-research': void runCityCommand({ type: 'buyResearch', kind: target.dataset.researchKind as 'materials' | 'logistics' | 'commerce' }); break;
      case 'new-city': showNewCity(); break;
      case 'confirm-city-restart': confirmNewCity(); break;
      case 'dismiss-return': returnNoticeDismissed = true; root.querySelector('#return-card')?.remove(); break;
      case 'read-aloud': { if ('speechSynthesis' in window) { speechSynthesis.cancel(); const speech = new SpeechSynthesisUtterance(state().currentWord.reading); speech.lang = 'ja-JP'; speechSynthesis.speak(speech); } break; }
      case 'takeover': void takeOver(); break;
      case 'confirm-ownership': root.querySelector<HTMLDialogElement>('[data-role="ownership-confirm"]')?.close('confirm'); break;
      case 'cancel-ownership': root.querySelector<HTMLDialogElement>('[data-role="ownership-confirm"]')?.close('cancel'); break;
      case 'export-data': downloadBackup(); break;
      case 'retry-save': void runtime.retrySave().then(updateStorageStatus).catch(updateStorageStatus); break;
    }
  });
  on(document, 'keydown', (raw) => {
    const event = raw as KeyboardEvent;
    if (event.defaultPrevented) return;
    if (event.target instanceof Node && !root.contains(event.target) && event.target !== document.body && event.target !== document.documentElement) return;
    if (event.isTrusted && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && event.keyCode !== 229) {
      if (event.key === 'F2' && !event.shiftKey) { event.preventDefault(); openNavigationMenu(); return; }
      const menu = root.querySelector<HTMLDialogElement>('.navigation-dialog[open]');
      if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const items = [...menu.querySelectorAll<HTMLButtonElement>('button')]; const index = items.indexOf(document.activeElement as HTMLButtonElement); const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; items[next]?.focus({ preventScroll: true }); return;
      }
      if (!root.querySelector('dialog[open]') && event.key === 'Escape') { event.preventDefault(); navigateBack(); return; }
      const tile = (event.target as HTMLElement).closest<HTMLButtonElement>('.world-stage .map-label');
      if (tile && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
        const here = tile.getBoundingClientRect(); const x = here.x + here.width / 2, y = here.y + here.height / 2;
        const next = [...root.querySelectorAll<HTMLButtonElement>('.world-stage .map-label')].filter(candidate => candidate !== tile).map(candidate => {
          const r = candidate.getBoundingClientRect(); const dx = r.x + r.width / 2 - x, dy = r.y + r.height / 2 - y;
          const forward = dx * direction[0] + dy * direction[1]; const cross = Math.abs(dx * direction[1] - dy * direction[0]);
          return { candidate, distance: forward > 0 ? forward + cross * 3 : Infinity };
        }).sort((a, b) => a.distance - b.distance).find(item => Number.isFinite(item.distance));
        event.preventDefault(); next?.candidate.focus({ preventScroll: true }); return;
      }
      const editing = (event.target as HTMLElement).closest('select, textarea, input[type=text], input[type=search], input[type=file]');
      if (screen === 'home' && !editing && ['1', '2', '3'].includes(event.key)) { event.preventDefault(); selectedCourse = courses[Number(event.key) - 1].id; const radio = root.querySelector<HTMLInputElement>(`input[name="course"][value="${selectedCourse}"]`); if (radio) { radio.checked = true; radio.focus({ preventScroll: true }); } return; }
    }
  });
  on(root, 'keydown', (raw) => {
    const event = raw as KeyboardEvent;
    const modal = root.querySelector<HTMLElement>('#paused-layer:not([hidden])');
    if (modal && !root.querySelector('dialog[open]') && event.key === 'Tab') {
      const buttons = [...modal.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus({ preventScroll: true }); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus({ preventScroll: true }); }
      return;
    }
    if (!event.isTrusted || screen !== 'check') return;
    if ((event.target as HTMLElement).id !== 'game-input') return;
    if (event.isComposing || event.key === 'Process' || event.keyCode === 229) { pending = undefined; return; }
    if (event.repeat) { event.preventDefault(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) { pending = undefined; return; }
    if (event.key === 'Escape') { event.preventDefault(); return; }
    if (/^[a-zA-Z'-]$/.test(event.key)) { pending = { key: event.key, at: performance.now() }; (event.target as HTMLInputElement).value = ''; }
    else pending = undefined;
  });
  on(root, 'keyup', (raw) => {
    const event = raw as KeyboardEvent;
    if (screen === 'check' && (event.target as HTMLElement).id === 'game-input' && pending && event.key.toLowerCase() === pending.key.toLowerCase()) { pending = undefined; }
  });
  on(root, 'beforeinput', (raw) => {
    const event = raw as InputEvent;
    if (screen === 'check' && (event.target as HTMLElement).id === 'game-input' && (event.isComposing || event.inputType !== 'insertText')) { pending = undefined; if (!event.isComposing) event.preventDefault(); }
  });
  on(root, 'input', (raw) => {
    const event = raw as InputEvent;
    const input = event.target as HTMLInputElement;
    if (input.id !== 'game-input' || screen !== 'check') return;
    const value = input.value;
    input.value = '';
    const confirmed = pending && event.isTrusted && !event.isComposing && !composing && event.inputType === 'insertText' && value.length === 1 && value.toLowerCase() === pending.key.toLowerCase();
    const operation = pending; pending = undefined;
    if (!confirmed || !operation) { checkPassed = false; const confirm = root.querySelector<HTMLButtonElement>('[data-action="confirm"]'); if (confirm) confirm.disabled = true; const el = root.querySelector('#check-status'); if (el) el.textContent = 'IMEをオフにして、半角英字の a を入力してください'; return; }
    if (screen === 'check') {
      if (value.toLowerCase() === 'a') { checkPassed = true; root.querySelector('#check-status')!.textContent = '半角入力を確認できました。'; root.querySelector<HTMLButtonElement>('[data-action="confirm"]')!.disabled = false; }
    }
  });
  on(root, 'compositionstart', () => { if (screen !== 'check') return; checkPassed = false; const confirm = root.querySelector<HTMLButtonElement>('[data-action="confirm"]'); if (confirm) confirm.disabled = true; composing = true; pending = undefined; inputConfirmed = false; pause(); });
  on(root, 'compositionend', () => { if (screen !== 'check') return; composing = false; pending = undefined; });
  on(root, 'paste', (event) => { if (screen === 'check' && (event.target as HTMLElement).id === 'game-input') { event.preventDefault(); pending = undefined; } });
  on(root, 'drop', (event) => { if (screen === 'check' && (event.target as HTMLElement).id === 'game-input') { event.preventDefault(); pending = undefined; } });
  on(window, 'resize', () => { if (screen === 'home') { const button = root.querySelector<HTMLButtonElement>('[data-action="start"]'); if (button) button.disabled = window.innerWidth < 768; const note = root.querySelector<HTMLElement>('.keyboard-note'); if (note) note.textContent = window.innerWidth < 768 ? '本編には幅768px以上の画面と物理キーボードが必要です' : '半角ローマ字で入力 · 90秒でひと便'; beginHomeMapObservation(); } else if (screen === 'game' && session?.mode === 'MAIN' && window.innerWidth < 768) { pause(); const title = root.querySelector<HTMLElement>('#pause-title'); if (title) title.textContent = '幅768px以上に画面を広げてください。'; } });
  on(window, 'blur', () => { pending = undefined; audio.pause(); });
  on(document, 'visibilitychange', () => { if (document.hidden) pending = undefined; audio.visibility(document.hidden); });
  const interval = setInterval(() => { if (screen === 'game' && session) mutate(session.tick(gameInput?.deadlineTime(performance.now()) ?? performance.now())); }, 80);
  const disposeDistrictMap = installDistrictMap(root);
  const ipadLayout = installIPadPagination(root);
  const unsubscribe = runtime.subscribe(() => { applySettings(); updateStorageStatus(); updateCityViews(); refreshAchievementState(); });
  applySettings(); renderHome();
  return () => { releaseScreenPresentation(); disposeDistrictMap(); audio.dispose(); disposeGameLayout?.(); ipadLayout.destroy(); gameInput?.destroy(); mapObserver?.disconnect(); unsubscribe(); abort.abort(); clearInterval(interval); clearTimeout(feedbackTimer); clearTimeout(liveNoticeTimer); root.innerHTML = ''; };
}
