import wordsData from '../../spec/initial/data/words.json';
import { CourseGenerator, GameSession, InputAdapter, type Word, type SessionMode } from '../typing';
import type { AppRuntime, AppSettings } from '../app/runtime';
import type { RecordContext } from '../profile';
import { catalogueShell, catalogueRows, catalogueFilter, filterCatalogue, cataloguePageSize } from './catalogue';
import { settingsContent } from './settings';

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
  let screen: 'home' | 'check' | 'game' | 'result' | 'catalogue' = 'home';
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
  let inputConfirmed = false;
  let checkPassed = false;
  let rechecking = false;
  let pending: { key: string; at: number } | undefined;
  let composing = false;
  let suppressBlur = false;
  let lastMistakes = 0;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const on = (target: EventTarget, type: string, handler: EventListener) => target.addEventListener(type, handler, { signal: abort.signal });
  const course = () => courses.find((item) => item.id === selectedCourse)!;
  const state = () => session!.snapshot(performance.now());
  function newSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]!; }
  function brand() { return `<a class="brand" href="#" data-action="home" aria-label="ことば便 ホーム"><span class="brand-stamp">${envelope}</span><span>ことば便<small>KOTOBABIN</small></span><span class="postmark" aria-hidden="true">∿<br>∿</span></a>`; }
  function header(game = false) {
    const mode = session?.mode;
    const location = mode === 'PRACTICE' ? 'ことばの練習' : mode === 'TUTORIAL' ? 'はじめの配達' : `${course().name} ／ 住宅地へ`;
    return `<header class="site-header">${brand()}${game ? `<span class="route-label">${location}</span><button class="button button-small pause-button" data-action="pause">一時停止 <kbd>Esc</kbd></button>` : `<nav aria-label="メイン"><button class="nav-button ${screen === 'home' ? 'nav-current' : ''}" data-action="home">ホーム</button><button class="nav-button ${screen === 'catalogue' ? 'nav-current' : ''}" data-action="catalogue">ことば図鑑</button><button class="nav-button" data-action="settings">設定</button><button class="nav-button" data-action="help">遊び方</button></nav>`}</header>`;
  }
  function footer() { return `<footer class="site-footer"><span>ひとつずつ、ことばを届けよう。</span><span>試作版 · タイピング配達</span></footer><aside id="ownership-status" class="ownership-warning" data-ownership="${runtime.status.writable ? 'owner' : 'readonly'}" ${runtime.status.writable ? 'hidden' : ''}><p>別のタブで操作中です。このタブは閲覧できます。</p><div data-ownership-action><button class="button" data-action="takeover">ここで続ける</button></div></aside>`; }
  function renderHome() {
    gameInput?.destroy(); gameInput = undefined; mapObserver?.disconnect();
    screen = 'home'; session = undefined; pending = undefined;
    root.innerHTML = `${header()}<main id="main" class="home-layout"><section class="home-intro"><p class="eyebrow">A LITTLE JOURNEY WITH WORDS</p><h1>届けたことばが、<br>街を育てる。</h1><p class="intro-copy">ひとつのことばを、ひとつの荷物に。<br>90秒の配達へ出かけませんか。</p><fieldset class="course-picker"><legend>今日のコース</legend><div class="course-options">${courses.map((item) => `<label class="course-option"><input type="radio" name="course" value="${item.id}" ${item.id === selectedCourse ? 'checked' : ''}><span><strong>${item.name}</strong><small>${item.description}</small></span></label>`).join('')}</div></fieldset><div class="destination"><span>届け先</span><strong>住宅地</strong><span class="destination-tag">最初の街</span></div><button class="button button-primary start-button" data-action="start" ${window.innerWidth < 768 ? 'disabled' : ''}>${envelope} 配達をはじめる <span aria-hidden="true">→</span></button><p class="keyboard-note">${window.innerWidth < 768 ? '本編には幅768px以上の画面と物理キーボードが必要です' : '半角ローマ字で入力 · 90秒でひと便'}</p><div class="home-subactions"><button class="text-button" data-action="catalogue">ゆっくり練習する →</button><button class="text-button" data-action="help">遊び方を読む</button></div></section><section class="town-panel" aria-labelledby="town-heading"><div class="town-heading"><div><p class="eyebrow">YOUR TOWN</p><h2 id="town-heading">川沿いの街</h2></div><span class="opened-label">開通 <strong>1</strong> / 6</span></div><div class="town-map"><img class="terrain" src="${asset('terrain/terrain_riverside.webp')}" alt="川と山に囲まれた、水彩の小さな街の地形"><div class="map-paper-wash"></div><svg class="delivery-routes" viewBox="0 0 800 560" aria-hidden="true"><path d="M394 310 Q260 330 195 180"/><circle cx="394" cy="310" r="7"/><circle cx="195" cy="180" r="7"/></svg><img class="city-hub" src="${asset('city_shared/city_hub.webp')}" alt="中央集配所"><div class="map-label residential"><span class="map-dot"></span><strong>住宅地</strong><small>段階 0 / 5</small></div><div class="map-label locked market"><span aria-hidden="true">◇</span>商店街<small>段階合計2で開通</small></div><div class="map-label locked workshop"><span aria-hidden="true">◇</span>工房街<small>段階合計4で開通</small></div><div class="map-label locked park"><span aria-hidden="true">◇</span>公園通り<small>段階合計7で開通</small></div><div class="map-label locked station"><span aria-hidden="true">◇</span>駅前<small>段階合計11で開通</small></div><div class="map-label locked harbor"><span aria-hidden="true">◇</span>港町<small>段階合計16で開通</small></div><span class="map-caption">ことばから、はじまる街。</span></div>${districtList()}<div class="development-note"><span class="plan-icon" aria-hidden="true">01</span><div><strong>住宅地に、最初の灯りを。</strong><p>最初の建築に必要な資材は30。</p></div><span class="plan-label">はじめの一歩</span></div></section><aside class="welcome-note"><span class="note-number">POST 01</span><p><strong>まちがえても、完成したことばの得点は残ります。</strong><br>ゆっくりでも大丈夫。自分のペースで届けましょう。</p><span class="save-status" data-save-status data-save-state="${runtime.status.storage}"></span></aside></main>${footer()}`;
    beginHomeMapObservation(); updateStorageStatus();
  }
  function districtList() {
    const districts = [['住宅地', 0], ['商店街', 2], ['工房街', 4], ['公園通り', 7], ['駅前', 11], ['港町', 16]] as const;
    return `<section class="compact-town" hidden aria-label="地区一覧"><div class="selected-district"><img src="${asset('city_shared/city_hub.webp')}" alt="中央集配所"><div><p>今回の届け先</p><h3>住宅地</h3><p>段階 0 / 5 · はじめの建築へ</p></div></div><ul>${districts.map(([name, threshold]) => `<li><button class="district-list-button ${threshold === 0 ? 'selected' : ''}" data-action="district-info" data-district="${name}" data-threshold="${threshold}" ${threshold === 0 ? 'aria-current="true"' : ''}><strong>${name}</strong><span>${threshold === 0 ? '開通済み · 選択中' : `未開通 · 段階合計${threshold}が必要`}</span></button></li>`).join('')}</ul></section>`;
  }
  function beginHomeMapObservation() {
    const map = root.querySelector<HTMLElement>('.town-map');
    const compact = root.querySelector<HTMLElement>('.compact-town');
    const panel = root.querySelector<HTMLElement>('.town-panel');
    if (!map || !compact || !panel) return;
    const update = () => { const small = (panel.clientWidth - 24) / (runtime.settings.fontScale / 100) < 800; map.hidden = small; compact.hidden = !small; };
    mapObserver?.disconnect(); mapObserver = new ResizeObserver(update); mapObserver.observe(panel); update();
  }
  function applySettings() {
    root.style.setProperty('--font-scale', String(runtime.settings.fontScale / 100));
    document.body.dataset.reducedMotion = String(runtime.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (screen === 'home') beginHomeMapObservation();
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
    if (aside && aside.innerHTML !== (paused ? '' : markup)) aside.innerHTML = paused ? '' : markup;
    const insideMarkup = paused && !runtime.status.writable ? `<p>別のタブで操作中です。ここで続ける場合は、操作するタブを切り替えてください。</p>${markup}` : '';
    if (inside && inside.innerHTML !== insideMarkup) inside.innerHTML = insideMarkup;
    const warning = root.querySelector<HTMLElement>('#ownership-status'); if (warning) warning.inert = Boolean(paused);
  }
  function commitFacts(snapshot: Snapshot) {
    if (!session || !sessionContext) return;
    const facts = session.drainEvents();
    sessionContext = { ...sessionContext, guideUsed: snapshot.guideUsed, assisted: snapshot.skips > 0 };
    if (facts.length) runtime.applyFacts(facts, sessionContext);
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
    root.append(dialog); dialog.showModal();
    dialog.addEventListener('close', () => { const confirmed = dialog.returnValue === 'end'; dialog.remove(); if (confirmed) { closeCurrent('replaced'); next(); } }, { once: true });
  }
  function launch() {
    if (!runtime.status.writable) { updateStorageStatus(); return; }
    if (launchTarget.mode === 'MAIN' && window.innerWidth < 768) { renderHome(); return; }
    if (!inputConfirmed) { rechecking = false; renderCheck(); return; }
    const mode = launchTarget.mode;
    const chosenIds = launchTarget.wordIds ?? wordsData.tutorialIds;
    if (mode === 'MAIN') {
      mainPreferredWordId = launchTarget.preferredWordId ?? null;
      const generator = new CourseGenerator(wordsData.words as Word[], { seed, courseId: selectedCourse, preferredWordId: mainPreferredWordId });
      session = new GameSession({ generator, mode, guideEnabled: runtime.settings.guide });
      sessionContext = { courseId: selectedCourse, planId: generator.plan.id, contentVersion: generator.plan.contentVersion, generatorVersion: generator.plan.generatorVersion, inputRuleVersion: 'romaji-1.0.0', scoringVersion: 'score-1.0.0', guideUsed: runtime.settings.guide, assisted: false };
    } else {
      const words = chosenIds.map(id => wordsData.words.find(word => word.id === id)!).filter(Boolean) as Word[];
      session = new GameSession({ words, mode, guideEnabled: runtime.settings.guide });
      practiceWordIds = [...chosenIds];
      sessionContext = { courseId: words[0].courseId, planId: `${mode}:${chosenIds.join(',')}`, contentVersion: wordsData.contentVersion, generatorVersion: 'fixed-word-list-1.0.0', inputRuleVersion: 'romaji-1.0.0', scoringVersion: 'score-1.0.0', guideUsed: runtime.settings.guide, assisted: false };
    }
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
    gameInput?.destroy(); gameInput = undefined; mapObserver?.disconnect(); screen = 'catalogue'; cataloguePage = 0;
    root.innerHTML = `${header()}${catalogueShell(runtime.profile)}${footer()}`;
    updateCatalogue(); updateStorageStatus();
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
  function openSettings() {
    if (screen === 'game') pause();
    const dialog = document.createElement('dialog'); dialog.className = 'settings-dialog paper-card';
    dialog.innerHTML = settingsContent(runtime.settings); root.append(dialog); dialog.showModal(); updateStorageStatus();
    dialog.addEventListener('change', event => {
      if (!runtime.status.writable) return;
      const input = event.target as HTMLInputElement; const patch: Partial<AppSettings> = {};
      if (input.name === 'fontScale') patch.fontScale = Number(input.value) as AppSettings['fontScale'];
      if (input.name === 'guide') patch.guide = input.checked;
      if (input.name === 'reducedMotion') patch.reducedMotion = input.checked;
      if (input.name === 'deliveryKeys') patch.deliveryKeys = input.value === 'both' ? ['Space', 'Enter'] : [input.value as 'Space' | 'Enter'];
      runtime.updateSettings(patch); applySettings();
      if (session && state().phase !== 'RESULT' && patch.guide !== undefined) mutate(session.setGuideEnabled(patch.guide, performance.now()));
    });
    dialog.addEventListener('close', () => { dialog.remove(); if (screen === 'game' && session) { gameInput?.destroy(); attachGameInput(); updateGame(state()); } }, { once: true });
  }
  function downloadBackup() {
    const blob = new Blob([runtime.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'kotobabin-backup.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    const message = root.querySelector<HTMLElement>('#recovery-status'); if (message) message.textContent = '保存データの控えを書き出しました。';
  }
  async function takeOver() {
    try { await runtime.takeOver(); updateStorageStatus(); }
    catch {
      updateStorageStatus();
      const dialog = document.createElement('dialog'); dialog.className = 'help-dialog paper-card';
      dialog.innerHTML = '<form method="dialog"><h2>未保存の進捗があります。</h2><p>この画面の未保存の進捗を控えに残し、保存済みの最新状態で続けますか？今の配達は終了します。</p><button class="button button-primary" value="cancel" autofocus>今の画面に戻る</button><button class="button" value="restore">控えを書き出して、最新の状態で続ける</button></form>';
      root.append(dialog); dialog.showModal();
      dialog.addEventListener('close', () => {
        const confirmed = dialog.returnValue === 'restore'; dialog.remove(); if (!confirmed) return;
        downloadBackup();
        void runtime.takeOver({ discardUnsaved: true }).then(() => { session = undefined; renderHome(); }).catch(updateStorageStatus);
      }, { once: true });
    }
  }
  function renderCheck() {
    gameInput?.destroy(); gameInput = undefined;
    screen = 'check'; checkPassed = false; pending = undefined;
    root.innerHTML = `${header()}<main id="main" class="centered-page"><section class="paper-card input-check"><p class="eyebrow">BEFORE WE GO</p><h1>キーボードを準備しましょう。</h1><p>IMEをオフにして、<strong>半角英字の a</strong> を1回入力してください。<br>確認の入力は、得点に数えません。</p><label class="check-label" for="game-input">入力の確認</label><input id="game-input" class="check-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="check-status"><p id="check-status" role="status">半角英字で a を入力してください</p><button class="button button-primary" data-action="confirm" disabled>${rechecking ? '一時停止へ戻る' : '準備できました →'}</button><button class="text-button" data-action="check-back">戻る</button></section></main>${footer()}`;
    focusInput();
  }
  function renderGame() {
    gameInput?.destroy(); gameInput = undefined;
    screen = 'game';
    root.innerHTML = `${header(true)}<main id="main" class="game-page" data-mode="${session!.mode}"><div class="game-topline"><div class="clock">${session!.mode === 'MAIN' ? '<span>のこり</span><strong id="time-left">90</strong><span>秒</span>' : '<strong class="untimed-clock">時間制限なし</strong>'}</div><p class="game-route">ことばの配達便 <span>住宅地ゆき</span></p><div class="score"><span>確定得点</span><strong id="score">0</strong><span>点</span></div></div><div class="time-track" aria-hidden="true"><div id="time-bar"></div></div><section id="tutorial-status" class="tutorial-status" hidden aria-live="polite"></section><section class="typing-card" aria-labelledby="prompt-word"><p id="word-stage" class="eyebrow">最初の一打で、配達がはじまります</p><h1 id="prompt-word" class="prompt-word"></h1><p id="prompt-reading" class="prompt-reading"></p><div id="romaji-guide" class="romaji-guide" aria-hidden="true"></div><label class="typing-input-label" for="game-input">キーボード入力<span id="input-indicator">入力できます</span></label><input id="game-input" class="typing-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="input-instructions" aria-label="ローマ字を入力"><p id="input-instructions" class="sr-only">表示されたことばを半角ローマ字で入力してください。語の境目にSpaceで配達できます。Escapeで一時停止します。</p><div class="cargo-area"><span class="cargo-caption">荷物 <strong id="cargo-count">0</strong> / 5</span><div class="cargo-slots" id="cargo-slots" aria-hidden="true"></div></div><div class="delivery-area"><button id="deliver-button" class="button button-primary deliver-button" data-action="deliver"><kbd>Space</kbd><span id="deliver-label">次のことばを完成させよう</span></button><p id="continue-hint" class="continue-hint"></p><p id="risk-hint" class="risk-hint"></p></div><p id="game-message" class="game-message" role="status" aria-live="polite"></p><div id="practice-actions" class="practice-actions" hidden></div></section><div class="play-bottom"><span>届け先 <strong>住宅地</strong></span><span id="completed-count">完成 0語</span><button class="text-button" data-action="guide">ローマ字ガイド <span id="guide-status">ON</span></button></div><p class="save-status" data-save-status data-save-state="${runtime.status.storage}"></p><div class="paused-layer" id="paused-layer" hidden></div>${session!.mode === 'MAIN' ? '<p class="narrow-note">本編は幅768px以上の画面と物理キーボードで遊べます。</p>' : ''}</main>${footer()}`;
    attachGameInput();
    updateGame(state()); updateStorageStatus();
  }
  function updateGame(snapshot: Snapshot) {
    if (screen !== 'game') return;
    if (snapshot.phase === 'RESULT') { if (snapshot.mode === 'MAIN') renderResult(snapshot); return; }
    const set = (id: string, value: string) => { const el = root.querySelector<HTMLElement>(`#${id}`); if (el && el.textContent !== value) el.textContent = value; };
    set('time-left', String(Math.ceil((snapshot.remainingMs ?? 90000) / 1000)));
    set('score', number(snapshot.score));
    set('word-stage', snapshot.phase === 'READY' ? '最初の一打で、配達がはじまります' : snapshot.wordStarted ? 'このことばを、届けよう' : '次のことば');
    set('prompt-word', snapshot.currentWord.display);
    set('prompt-reading', snapshot.currentWord.reading);
    const guide = root.querySelector<HTMLElement>('#romaji-guide')!;
    const nextGuide = `<span class="accepted">${esc(snapshot.acceptedInput)}</span><span class="next-key">${esc(snapshot.remainingGuide.slice(0, 1))}</span><span>${esc(snapshot.remainingGuide.slice(1))}</span>`;
    if (guide.innerHTML !== nextGuide) guide.innerHTML = nextGuide;
    guide.style.visibility = snapshot.guideEnabled ? 'visible' : 'hidden';
    set('guide-status', snapshot.guideEnabled ? 'ON' : 'OFF');
    set('cargo-count', String(snapshot.cargoCount));
    const slots = root.querySelector<HTMLElement>('#cargo-slots')!;
    const slotMarkup = Array.from({ length: 5 }, (_, index) => `<span class="cargo-slot ${index < snapshot.cargoCount ? 'filled' : ''}">${index < snapshot.cargoCount ? `<img src="${asset('cargo/cargo_parcel.webp')}" alt="">` : ''}</span>`).join('');
    if (slots.innerHTML !== slotMarkup) slots.innerHTML = slotMarkup;
    const canDeliver = (!snapshot.wordStarted || snapshot.awaitingWordChoice) && snapshot.cargoCount > 0;
    root.querySelector<HTMLButtonElement>('#deliver-button')!.disabled = !canDeliver;
    set('deliver-label', canDeliver ? `いま届ける +${number(snapshot.pendingBonus)}点` : snapshot.wordStarted ? 'このことばを完成すると届けられます' : '次のことばを完成させよう');
    set('continue-hint', canDeliver ? 'または、打ち始めて続ける' : '無誤打で完成すると、荷物がひとつ増えます');
    set('risk-hint', canDeliver ? `次も無誤打で完成して届ければ +${number(snapshot.nextBonus)}点 ／ ミスで失う追加点 ${number(snapshot.pendingBonus)}点。完成点は残ります。` : '荷物が5個になると、自動で配達します。');
    set('completed-count', `完成 ${snapshot.completedWords}語`);
    set('game-message', snapshot.message);
    updateModeControls(snapshot);
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
      overlay.innerHTML = `<section class="paper-card pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><p class="eyebrow">TAKE YOUR TIME</p><h1 id="pause-title">ひと休みしましょう。</h1><div id="paused-ownership"></div><p>時計と入力は止まっています。<br>準備ができたら、続きをどうぞ。</p><button class="button button-primary" data-action="resume">配達を再開する</button><button class="button" data-action="settings">設定</button><button class="button" data-action="recheck">半角入力を確認する</button><button class="button" data-action="skip">このことばを飛ばす</button>${snapshot.mode === 'TUTORIAL' ? '<button class="button" data-action="tutorial-skip">導入を飛ばして本編へ</button>' : ''}<button class="button" data-action="catalogue">ことば図鑑</button><button class="text-button" data-action="quit">${snapshot.mode === 'PRACTICE' ? '練習を終える' : 'ホームへ戻る'}</button></section>`;
      root.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus();
    } else if (snapshot.phase !== 'PAUSED') { overlay.hidden = true; isolatePausedContent(false); }
    syncOwnershipActions();
    const resume = root.querySelector<HTMLButtonElement>('[data-action="resume"]'); if (resume) resume.disabled = !runtime.status.writable || (snapshot.mode === 'MAIN' && window.innerWidth < 768);
  }
  function renderResult(snapshot: Snapshot) {
    gameInput?.destroy(); gameInput = undefined;
    screen = 'result'; lastResult = snapshot;
    root.innerHTML = `${header()}<main id="main" class="result-page"><div class="result-heading"><p class="eyebrow">DELIVERY COMPLETE</p><h1>ことばが、届きました。</h1><p>${course().name}コース · 住宅地へ · 90秒の配達 ${snapshot.skips ? '· 救済あり' : '· 通常'} ${snapshot.guideUsed ? '· ガイド表示あり' : '· ガイド表示なし'}</p></div><div class="result-grid"><section class="paper-card score-card"><h2>今回の得点</h2><p class="result-score">${number(snapshot.score)}<span>点</span></p><p class="score-breakdown">完成点 ${number(snapshot.baseScore)} ＋ 配達ボーナス ${number(snapshot.bonusScore)}</p><div class="result-metrics"><div><span>完成したことば</span><strong>${snapshot.completedWords}<small>語</small></strong></div><div><span>正確率</span><strong>${snapshot.accuracy === null ? '計測なし' : `${snapshot.accuracy.toFixed(1)}<small>%</small>`}</strong></div><div><span>基準打鍵 / 分</span><strong>${snapshot.canonicalKpm === null ? '計測なし' : snapshot.canonicalKpm.toFixed(1)}</strong></div><div><span>正解打鍵 / 誤打</span><strong>${snapshot.correctKeys}<small> / ${snapshot.mistakes}</small></strong></div></div></section><section class="paper-card result-letter"><span class="letter-postmark" aria-hidden="true">KOTOBABIN<br>DELIVERED</span><p class="eyebrow">あなたの配達記録</p><h2>${snapshot.completedWords > 0 ? 'ひとつひとつの、積み重ね。' : '今回は完成0語。'}</h2><p>${snapshot.completedWords > 0 ? `${snapshot.completedWords}個のことばを、最後まで打ち終えました。<br>完成したことばの得点は、すべて確定しています。` : 'あせらず、読みを見ながら打ってみましょう。<br>「ゆったり」コースから、自分のペースで。'}</p><div class="delivery-summary"><span>確定した配達ボーナス</span><strong>+${number(snapshot.bonusScore)}<small>点</small></strong></div><p class="result-note">90秒の配達を終えました。<br>途中のことばには完成点を加えていません。</p></section></div><div class="result-actions"><button class="button button-primary" data-action="retry">同じ問題でもう一度 ${envelope}</button><button class="button" data-action="new-round">別の問題で配達する</button>${reviewIds(snapshot).length ? '<button class="button" data-action="review">まちがえたことばを復習</button>' : ''}<button class="text-button" data-action="home">コースを選ぶ →</button></div><p class="save-status result-save" data-save-status></p></main>${footer()}`;
    root.querySelector<HTMLButtonElement>('[data-action="retry"]')?.focus(); updateStorageStatus();
  }
  function reviewIds(snapshot: Snapshot) { return snapshot.reviewWordIds; }
  function updateModeControls(snapshot: Snapshot) {
    const tutorial = root.querySelector<HTMLElement>('#tutorial-status')!;
    tutorial.hidden = snapshot.mode !== 'TUTORIAL';
    tutorial.dataset.delivered = String(snapshot.tutorialDelivered);
    if (snapshot.mode === 'TUTORIAL') {
      const markup = `<div><strong>${snapshot.tutorialDelivered ? 'はじめての配達、できました。' : snapshot.cargoCount > 0 ? '荷物ができました。語の境目で届けてみましょう。' : 'まずは、ひとつのことばから。'}</strong><p>${snapshot.tutorialDelivered ? 'できたことが、切手になります。次は90秒の配達へ。' : `無誤打で完成すると荷物がひとつ増えます。${runtime.settings.deliveryKeys.join(' または ')}で配達できます。まちがえても続きを打てます。`}</p></div>${snapshot.tutorialDelivered ? '<button class="button button-primary" data-action="tutorial-main">90秒の配達へ →</button>' : '<button class="text-button" data-action="tutorial-skip">導入を飛ばして本編へ</button>'}<div id="tutorial-fallback" ${snapshot.tutorialFallbackAvailable ? '' : 'hidden'}><p>あせらなくても大丈夫。自分に合うほうを選べます。</p><button class="button" data-action="tutorial-skip">そのまま本編へ</button><button class="button" data-action="tutorial-practice">ゆっくり練習する</button></div>`;
      if (tutorial.innerHTML !== markup) tutorial.innerHTML = markup;
    }
    const practice = root.querySelector<HTMLElement>('#practice-actions')!;
    practice.hidden = snapshot.mode !== 'PRACTICE';
    if (snapshot.mode === 'PRACTICE') {
      const clean = Math.min(3, runtime.profile.words[snapshot.currentWord.id]?.practiceCleanCompleted ?? 0);
      const markup = `<p id="practice-progress">このことばの練習 · 無誤打 <strong>${clean}/3</strong></p><p>${snapshot.awaitingWordChoice ? '完成しました。もう一度でも、次のことばでも。' : '途中で次のことばへ進むと、現在の連続成功は途切れます。'}</p><div>${snapshot.awaitingWordChoice ? '<button class="button button-primary" data-action="repeat-word">もう一度</button>' : ''}<button class="button" data-action="next-practice-word">次のことば</button><button class="button" data-action="practice-main" ${window.innerWidth < 768 ? 'disabled' : ''}>このことばを本編で試す</button>${window.innerWidth < 768 ? '<p>本編には幅768px以上の画面と物理キーボードが必要です。</p>' : ''}<button class="text-button" data-action="practice-end">練習を終える</button><button class="text-button" data-action="read-aloud">ことばを読み上げる</button></div>`;
      if (practice.innerHTML !== markup) practice.innerHTML = markup;
      root.querySelector<HTMLElement>('#input-indicator')!.textContent = snapshot.awaitingWordChoice ? '完成しました' : '入力できます';
    }
    root.querySelectorAll<HTMLElement>('.deliver-button kbd').forEach(element => { element.textContent = runtime.settings.deliveryKeys.join(' / '); });
    root.querySelector<HTMLElement>('#input-instructions')!.textContent = `表示されたことばを半角ローマ字で入力してください。語の境目に${runtime.settings.deliveryKeys.join('または')}で配達できます。Escapeで一時停止します。`;
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
      root.querySelector<HTMLButtonElement>(selector)?.focus();
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
    root.querySelector<HTMLButtonElement>('[data-action="cancel-quit"]')?.focus();
  }
  function showSkip() {
    const snapshot = state();
    const overlay = root.querySelector<HTMLElement>('#paused-layer')!;
    overlay.innerHTML = `<section class="paper-card pause-card" role="dialog" aria-modal="true" aria-labelledby="skip-title"><h2 id="skip-title">このことばを飛ばしますか？</h2><p>${snapshot.mode === 'MAIN' ? 'この便は救済ありの記録になります。完成したことばと確定済みの成果は残ります。通常の自己記録とは別に記録します。' : '途中のことばは完成に数えず、現在の連続成功は途切れます。完成済みの成果は残ります。'}</p><p>持っている荷物の追加点を届けて、次のことばへ進みます。</p><button class="button button-primary" data-action="cancel-quit">今のことばに戻る</button><button class="button" data-action="confirm-skip">説明を確認して飛ばす</button></section>`;
    root.querySelector<HTMLButtonElement>('[data-action="cancel-quit"]')?.focus();
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
  function districtInfo(name: string, threshold: number) {
    const dialog = document.createElement('dialog'); dialog.className = 'help-dialog paper-card';
    dialog.innerHTML = `<form method="dialog"><h2>${esc(name)}</h2><p>${threshold === 0 ? '住宅地は開通済みです。最初の30資材で建築が完成します。' : `開通には、この街の段階合計${threshold}が必要です。現在は0です。`}</p><button class="button button-primary">閉じる</button></form>`;
    root.append(dialog); dialog.showModal(); dialog.addEventListener('close', () => dialog.remove(), { once: true });
  }
  function attachGameInput() {
    const input = root.querySelector<HTMLInputElement>('#game-input')!;
    gameInput = new InputAdapter(input, {
      onCharacter: (key, at) => { if (screen === 'game' && session && !root.querySelector('dialog[open]') && runtime.status.writable) mutate(session.input(key, at)); },
      onDeliver: (at) => { if (screen === 'game' && session && !root.querySelector('dialog[open]') && runtime.status.writable) mutate(session.deliver(at)); },
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
  function focusInput() { suppressBlur = true; root.querySelector<HTMLInputElement>('#game-input')?.focus(); suppressBlur = false; }
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
    if (target.name === 'course') selectedCourse = target.value as CourseId;
    if (['catalogue-set', 'catalogue-topic', 'catalogue-state'].includes(target.id)) { cataloguePage = 0; updateCatalogue(); }
  });
  on(root, 'input', event => { if ((event.target as HTMLElement).id === 'catalogue-query') { cataloguePage = 0; updateCatalogue(); } });
  // Keep native input focus until an intended pointer action is handled. Otherwise
  // the adapter's blur pause can make the target inert before its click arrives.
  on(root, 'pointerdown', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (screen === 'game' && target && document.activeElement === root.querySelector('#game-input')) event.preventDefault();
  });
  on(root, 'click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    event.preventDefault();
    if (!runtime.status.writable && ['deliver', 'guide', 'confirm-skip', 'repeat-word', 'next-practice-word', 'practice-main', 'tutorial-main', 'tutorial-skip', 'confirm-quit'].includes(target.dataset.action ?? '')) return;
    switch (target.dataset.action) {
      case 'start': seed = newSeed(); launchTarget = { mode: runtime.settings.tutorialSeen ? 'MAIN' : 'TUTORIAL' }; launch(); break;
      case 'home': if (screen === 'game') { pause(); break; } confirmReplacement(renderHome); break;
      case 'help': help(); break;
      case 'settings': openSettings(); break;
      case 'close-settings': root.querySelector<HTMLDialogElement>('.settings-dialog')?.close(); break;
      case 'confirm': if (checkPassed) { inputConfirmed = true; if (rechecking) { renderGame(); updateGame(state()); } else launch(); } break;
      case 'check-back': if (rechecking) { renderGame(); updateGame(state()); } else renderHome(); break;
      case 'pause': pause(); break;
      case 'resume': {
        if (!runtime.status.writable) { updateStorageStatus(); break; }
        if (session!.mode === 'MAIN' && window.innerWidth < 768) break;
        if (!inputConfirmed) { rechecking = true; renderCheck(); break; }
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
      case 'district-info': districtInfo(target.dataset.district!, Number(target.dataset.threshold)); break;
      case 'read-aloud': { if ('speechSynthesis' in window) { speechSynthesis.cancel(); const speech = new SpeechSynthesisUtterance(state().currentWord.reading); speech.lang = 'ja-JP'; speechSynthesis.speak(speech); } break; }
      case 'takeover': void takeOver(); break;
      case 'export-data': downloadBackup(); break;
      case 'retry-save': void runtime.retrySave().then(updateStorageStatus).catch(updateStorageStatus); break;
    }
  });
  on(root, 'keydown', (raw) => {
    const event = raw as KeyboardEvent;
    const modal = root.querySelector<HTMLElement>('#paused-layer:not([hidden])');
    if (modal && !root.querySelector('dialog[open]') && event.key === 'Tab') {
      const buttons = [...modal.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
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
  on(window, 'blur', () => { pending = undefined; });
  on(document, 'visibilitychange', () => { if (document.hidden) pending = undefined; });
  const interval = setInterval(() => { if (screen === 'game' && session) mutate(session.tick(gameInput?.deadlineTime(performance.now()) ?? performance.now())); }, 80);
  const unsubscribe = runtime.subscribe(() => { applySettings(); updateStorageStatus(); });
  applySettings(); renderHome();
  return () => { gameInput?.destroy(); mapObserver?.disconnect(); unsubscribe(); abort.abort(); clearInterval(interval); clearTimeout(feedbackTimer); root.innerHTML = ''; };
}
