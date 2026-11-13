import wordsData from '../../spec/initial/data/words.json';
import { CourseGenerator, GameSession, type Word } from '../typing';

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
export function mountApp(root: HTMLElement): () => void {
  let selectedCourse: CourseId = 'relaxed';
  let seed = newSeed();
  let session: GameSession | undefined;
  let screen: 'home' | 'check' | 'game' | 'result' = 'home';
  let inputConfirmed = false;
  let checkPassed = false;
  let rechecking = false;
  let pending: { key: string; at: number } | undefined;
  let composing = false;
  let suppressBlur = false;
  let guideEnabled = true;
  let lastMistakes = 0;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const on = (target: EventTarget, type: string, handler: EventListener) => target.addEventListener(type, handler, { signal: abort.signal });
  const course = () => courses.find((item) => item.id === selectedCourse)!;
  const state = () => session!.snapshot(performance.now());
  function newSeed() { return crypto.getRandomValues(new Uint32Array(1))[0]!; }
  function brand() { return `<a class="brand" href="#" data-action="home" aria-label="ことば便 ホーム"><span class="brand-stamp">${envelope}</span><span>ことば便<small>KOTOBABIN</small></span><span class="postmark" aria-hidden="true">∿<br>∿</span></a>`; }
  function header(game = false) {
    return `<header class="site-header">${brand()}${game ? `<span class="route-label">${course().name} <span>／ 住宅地へ</span></span><button class="button button-small pause-button" data-action="pause">一時停止 <kbd>Esc</kbd></button>` : '<nav aria-label="メイン"><span class="nav-current" aria-current="page">ホーム</span><button class="nav-button" data-action="help">遊び方</button></nav><span class="header-note">ことばを届けて、街を育てる</span>'}</header>`;
  }
  function footer() { return '<footer class="site-footer"><span>ひとつずつ、ことばを届けよう。</span><span>日本語タイピングゲーム</span></footer>'; }
  function renderHome() {
    screen = 'home'; session = undefined; pending = undefined;
    root.innerHTML = `${header()}<main id="main" class="home-layout"><section class="home-intro"><p class="eyebrow">A LITTLE JOURNEY WITH WORDS</p><h1>届けたことばが、<br>街を育てる。</h1><p class="intro-copy">ひとつのことばを、ひとつの荷物に。<br>90秒の配達へ出かけませんか。</p><fieldset class="course-picker"><legend>今日のコース</legend><div class="course-options">${courses.map((item) => `<label class="course-option"><input type="radio" name="course" value="${item.id}" ${item.id === selectedCourse ? 'checked' : ''}><span><strong>${item.name}</strong><small>${item.description}</small></span></label>`).join('')}</div></fieldset><div class="destination"><span>届け先</span><strong>住宅地</strong><span class="destination-tag">最初の街</span></div><button class="button button-primary start-button" data-action="start" ${window.innerWidth < 768 ? 'disabled' : ''}>${envelope} 配達をはじめる <span aria-hidden="true">→</span></button><p class="keyboard-note">${window.innerWidth < 768 ? '本編には幅768px以上の画面と物理キーボードが必要です' : '半角ローマ字で入力 · 90秒でひと便'}</p><button class="text-button" data-action="help">はじめての方へ <span aria-hidden="true">↗</span></button></section><section class="town-panel" aria-labelledby="town-heading"><div class="town-heading"><div><p class="eyebrow">YOUR TOWN</p><h2 id="town-heading">川沿いの街</h2></div><span class="opened-label">開通 <strong>1</strong> / 6</span></div><div class="town-map"><img class="terrain" src="${asset('terrain/terrain_riverside.webp')}" alt="川と山に囲まれた、水彩の小さな街の地形"><div class="map-paper-wash"></div><svg class="delivery-routes" viewBox="0 0 800 560" aria-hidden="true"><path d="M394 310 Q260 330 195 180"/><circle cx="394" cy="310" r="7"/><circle cx="195" cy="180" r="7"/></svg><img class="city-hub" src="${asset('city_shared/city_hub.webp')}" alt="中央集配所"><div class="map-label residential"><span class="map-dot"></span><strong>住宅地</strong><small>段階 0 / 5</small></div><div class="map-label locked market"><span aria-hidden="true">◇</span>商店街<small>段階合計2で開通</small></div><div class="map-label locked workshop"><span aria-hidden="true">◇</span>工房街<small>段階合計4で開通</small></div><div class="map-label locked park"><span aria-hidden="true">◇</span>公園通り<small>段階合計7で開通</small></div><div class="map-label locked station"><span aria-hidden="true">◇</span>駅前<small>段階合計11で開通</small></div><div class="map-label locked harbor"><span aria-hidden="true">◇</span>港町<small>段階合計16で開通</small></div><span class="map-caption">ことばから、はじまる街。</span></div><div class="development-note"><span class="plan-icon" aria-hidden="true">01</span><div><strong>住宅地に、最初の灯りを。</strong><p>最初の建築に必要な資材は30。</p></div><span class="plan-label">はじめの一歩</span></div></section><aside class="welcome-note"><span class="note-number">POST 01</span><p><strong>まちがえても、完成したことばの得点は残ります。</strong><br>ゆっくりでも大丈夫。自分のペースで届けましょう。</p><span class="save-note">この回の成績は、ページを閉じると残りません。</span></aside></main>${footer()}`;
  }
  function launch() {
    if (window.innerWidth < 768) { renderHome(); return; }
    if (!inputConfirmed) { rechecking = false; renderCheck(); return; }
    session = new GameSession({ generator: new CourseGenerator(wordsData.words as Word[], { seed, courseId: selectedCourse }) });
    lastMistakes = 0;
    renderGame();
    focusInput();
  }
  function renderCheck() {
    screen = 'check'; checkPassed = false; pending = undefined;
    root.innerHTML = `${header()}<main id="main" class="centered-page"><section class="paper-card input-check"><p class="eyebrow">BEFORE WE GO</p><h1>キーボードを準備しましょう。</h1><p>IMEをオフにして、<strong>半角英字の a</strong> を1回入力してください。<br>確認の入力は、得点に数えません。</p><label class="check-label" for="game-input">入力の確認</label><input id="game-input" class="check-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="check-status"><p id="check-status" role="status">半角英字で a を入力してください</p><button class="button button-primary" data-action="confirm" disabled>${rechecking ? '一時停止へ戻る' : '準備できました →'}</button><button class="text-button" data-action="check-back">戻る</button></section></main>${footer()}`;
    focusInput();
  }
  function renderGame() {
    screen = 'game';
    root.innerHTML = `${header(true)}<main id="main" class="game-page"><div class="game-topline"><div class="clock"><span>のこり</span><strong id="time-left">90</strong><span>秒</span></div><p class="game-route">ことばの配達便 <span>住宅地ゆき</span></p><div class="score"><span>確定得点</span><strong id="score">0</strong><span>点</span></div></div><div class="time-track" aria-hidden="true"><div id="time-bar"></div></div><section class="typing-card" aria-labelledby="prompt-word"><p id="word-stage" class="eyebrow">最初の一打で、配達がはじまります</p><h1 id="prompt-word" class="prompt-word"></h1><p id="prompt-reading" class="prompt-reading"></p><div id="romaji-guide" class="romaji-guide" aria-hidden="true"></div><label class="typing-input-label" for="game-input">キーボード入力<span id="input-indicator">入力できます</span></label><input id="game-input" class="typing-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="input-instructions" aria-label="ローマ字を入力"><p id="input-instructions" class="sr-only">表示されたことばを半角ローマ字で入力してください。語の境目にSpaceで配達できます。Escapeで一時停止します。</p><div class="cargo-area"><span class="cargo-caption">荷物 <strong id="cargo-count">0</strong> / 5</span><div class="cargo-slots" id="cargo-slots" aria-hidden="true"></div></div><div class="delivery-area"><button id="deliver-button" class="button button-primary deliver-button" data-action="deliver"><kbd>Space</kbd><span id="deliver-label">次のことばを完成させよう</span></button><p id="continue-hint" class="continue-hint"></p><p id="risk-hint" class="risk-hint"></p></div><p id="game-message" class="game-message" role="status" aria-live="polite"></p></section><div class="play-bottom"><span>届け先 <strong>住宅地</strong></span><span id="completed-count">完成 0語</span><button class="text-button" data-action="guide">ローマ字ガイド <span id="guide-status">ON</span></button></div><div class="paused-layer" id="paused-layer" hidden></div><p class="narrow-note">本編は幅768px以上の画面と物理キーボードで遊べます。</p></main>${footer()}`;
    updateGame(state());
  }
  function updateGame(snapshot: Snapshot) {
    if (screen !== 'game') return;
    if (snapshot.phase === 'RESULT') { renderResult(snapshot); return; }
    const set = (id: string, value: string) => { const el = root.querySelector<HTMLElement>(`#${id}`); if (el && el.textContent !== value) el.textContent = value; };
    set('time-left', String(Math.ceil((snapshot.remainingMs ?? 90000) / 1000)));
    set('score', number(snapshot.score));
    set('word-stage', snapshot.phase === 'READY' ? '最初の一打で、配達がはじまります' : snapshot.wordStarted ? 'このことばを、届けよう' : '次のことば');
    set('prompt-word', snapshot.currentWord.display);
    set('prompt-reading', snapshot.currentWord.reading);
    const guide = root.querySelector<HTMLElement>('#romaji-guide')!;
    const nextGuide = `<span class="accepted">${esc(snapshot.acceptedInput)}</span><span class="next-key">${esc(snapshot.remainingGuide.slice(0, 1))}</span><span>${esc(snapshot.remainingGuide.slice(1))}</span>`;
    if (guide.innerHTML !== nextGuide) guide.innerHTML = nextGuide;
    guide.style.visibility = guideEnabled ? 'visible' : 'hidden';
    set('guide-status', guideEnabled ? 'ON' : 'OFF');
    set('cargo-count', String(snapshot.cargoCount));
    const slots = root.querySelector<HTMLElement>('#cargo-slots')!;
    const slotMarkup = Array.from({ length: 5 }, (_, index) => `<span class="cargo-slot ${index < snapshot.cargoCount ? 'filled' : ''}">${index < snapshot.cargoCount ? `<img src="${asset('cargo/cargo_parcel.webp')}" alt="">` : ''}</span>`).join('');
    if (slots.innerHTML !== slotMarkup) slots.innerHTML = slotMarkup;
    const canDeliver = !snapshot.wordStarted && snapshot.cargoCount > 0;
    root.querySelector<HTMLButtonElement>('#deliver-button')!.disabled = !canDeliver;
    set('deliver-label', canDeliver ? `いま届ける +${number(snapshot.pendingBonus)}点` : snapshot.wordStarted ? 'このことばを完成すると届けられます' : '次のことばを完成させよう');
    set('continue-hint', canDeliver ? 'または、打ち始めて続ける' : '無誤打で完成すると、荷物がひとつ増えます');
    set('risk-hint', canDeliver ? `次も無誤打で完成して届ければ +${number(snapshot.nextBonus)}点 ／ ミスで失う追加点 ${number(snapshot.pendingBonus)}点。完成点は残ります。` : '荷物が5個になると、自動で配達します。');
    set('completed-count', `完成 ${snapshot.completedWords}語`);
    set('game-message', snapshot.message);
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
      overlay.innerHTML = `<section class="paper-card pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title"><p class="eyebrow">TAKE YOUR TIME</p><h1 id="pause-title">ひと休みしましょう。</h1><p>時計と入力は止まっています。<br>準備ができたら、続きをどうぞ。</p><button class="button button-primary" data-action="resume">配達を再開する</button><button class="button" data-action="recheck">半角入力を確認する</button><button class="text-button" data-action="quit">ホームへ戻る</button></section>`;
      root.querySelector<HTMLButtonElement>('[data-action="resume"]')?.focus();
    } else if (snapshot.phase !== 'PAUSED') { overlay.hidden = true; isolatePausedContent(false); }
  }
  function renderResult(snapshot: Snapshot) {
    screen = 'result';
    root.innerHTML = `${header()}<main id="main" class="result-page"><div class="result-heading"><p class="eyebrow">DELIVERY COMPLETE</p><h1>ことばが、届きました。</h1><p>${course().name}コース · 住宅地へ · 90秒の配達</p></div><div class="result-grid"><section class="paper-card score-card"><h2>今回の得点</h2><p class="result-score">${number(snapshot.score)}<span>点</span></p><p class="score-breakdown">完成点 ${number(snapshot.baseScore)} ＋ 配達ボーナス ${number(snapshot.bonusScore)}</p><div class="result-metrics"><div><span>完成したことば</span><strong>${snapshot.completedWords}<small>語</small></strong></div><div><span>正確率</span><strong>${snapshot.accuracy === null ? '計測なし' : `${snapshot.accuracy.toFixed(1)}<small>%</small>`}</strong></div><div><span>基準打鍵 / 分</span><strong>${snapshot.canonicalKpm === null ? '計測なし' : snapshot.canonicalKpm.toFixed(1)}</strong></div><div><span>正解打鍵 / 誤打</span><strong>${snapshot.correctKeys}<small> / ${snapshot.mistakes}</small></strong></div></div></section><section class="paper-card result-letter"><span class="letter-postmark" aria-hidden="true">KOTOBABIN<br>DELIVERED</span><p class="eyebrow">あなたの配達記録</p><h2>${snapshot.completedWords > 0 ? 'ひとつひとつの、積み重ね。' : '今回は完成0語。'}</h2><p>${snapshot.completedWords > 0 ? `${snapshot.completedWords}個のことばを、最後まで打ち終えました。<br>完成したことばの得点は、すべて確定しています。` : 'あせらず、読みを見ながら打ってみましょう。<br>「ゆったり」コースから、自分のペースで。'}</p><div class="delivery-summary"><span>確定した配達ボーナス</span><strong>+${number(snapshot.bonusScore)}<small>点</small></strong></div><p class="result-note">90秒の配達を終えました。<br>途中のことばには完成点を加えていません。</p></section></div><div class="result-actions"><button class="button button-primary" data-action="retry">同じ問題でもう一度 ${envelope}</button><button class="button" data-action="new-round">別の問題で配達する</button><button class="text-button" data-action="home">コースを選ぶ →</button></div><p class="save-note result-save">この回の成績は、ページを閉じると残りません。</p></main>${footer()}`;
    root.querySelector<HTMLButtonElement>('[data-action="retry"]')?.focus();
  }
  function isolatePausedContent(paused: boolean) {
    const elements = [...root.querySelectorAll<HTMLElement>('.site-header, .site-footer, .game-page > :not(#paused-layer)')];
    for (const element of elements) { element.inert = paused; if (paused) element.setAttribute('aria-hidden', 'true'); else element.removeAttribute('aria-hidden'); }
  }
  function focusInput() { suppressBlur = true; root.querySelector<HTMLInputElement>('#game-input')?.focus(); suppressBlur = false; }
  function pause() { if (screen === 'game' && session) updateGame(session.pause(performance.now())); }
  function help() {
    const dialog = document.createElement('dialog');
    dialog.className = 'help-dialog paper-card';
    dialog.innerHTML = `<form method="dialog"><p class="eyebrow">HOW TO PLAY</p><h2>ことばを打って、届けよう。</h2><ol><li><strong>読みをローマ字で入力。</strong><br>別の正しいつづりでも入力できます。</li><li><strong>無誤打で完成すると、荷物に。</strong><br>まちがえても、完成したことばの得点は残ります。</li><li><strong>語の境目にSpaceで配達。</strong><br>荷物をためるほど追加点が増え、5個で自動配達します。次の語でミスすると、未配達の追加点を失います。</li></ol><p>90秒が過ぎたら、残った荷物も自動で配達。<br>途中のことばは完成点に数えません。</p><button class="button button-primary">わかりました</button></form>`;
    root.append(dialog); dialog.showModal();
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
  }
  on(root, 'change', (event) => { const target = event.target as HTMLInputElement; if (target.name === 'course') selectedCourse = target.value as CourseId; });
  on(root, 'pointerdown', (event) => { if ((event.target as HTMLElement).closest('[data-action="deliver"], [data-action="guide"]')) event.preventDefault(); });
  on(root, 'click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target || (target as HTMLButtonElement).disabled) return;
    event.preventDefault();
    switch (target.dataset.action) {
      case 'start': seed = newSeed(); launch(); break;
      case 'home': if (screen === 'game') { pause(); break; } renderHome(); break;
      case 'help': help(); break;
      case 'confirm': if (checkPassed) { inputConfirmed = true; if (rechecking) { renderGame(); updateGame(state()); } else launch(); } break;
      case 'check-back': if (rechecking) { renderGame(); updateGame(state()); } else renderHome(); break;
      case 'pause': pause(); break;
      case 'resume': { if (!inputConfirmed) { rechecking = true; renderCheck(); break; } isolatePausedContent(false); const overlay = root.querySelector<HTMLElement>('#paused-layer')!; overlay.hidden = true; focusInput(); if (document.activeElement === root.querySelector('#game-input')) updateGame(session!.resume(performance.now())); break; }
      case 'recheck': rechecking = true; renderCheck(); break;
      case 'deliver': updateGame(session!.deliver(performance.now())); focusInput(); break;
      case 'guide': guideEnabled = !guideEnabled; if (session) updateGame(state()); break;
      case 'retry': launch(); break;
      case 'new-round': seed = newSeed(); launch(); break;
      case 'quit': { const overlay = root.querySelector<HTMLElement>('#paused-layer')!; overlay.innerHTML = '<section class="paper-card pause-card" role="dialog" aria-modal="true" aria-labelledby="quit-title"><h2 id="quit-title">配達を途中で終了しますか？</h2><p>未配達の追加点は確定しません。</p><button class="button button-primary" data-action="cancel-quit">配達を続ける</button><button class="button" data-action="confirm-quit">終了してホームへ</button></section>'; root.querySelector<HTMLButtonElement>('[data-action="cancel-quit"]')?.focus(); break; }
      case 'cancel-quit': { root.querySelector<HTMLElement>('#paused-layer')!.hidden = true; updateGame(state()); break; }
      case 'confirm-quit': renderHome(); break;
    }
  });
  on(root, 'keydown', (raw) => {
    const event = raw as KeyboardEvent;
    const modal = root.querySelector<HTMLElement>('#paused-layer:not([hidden])');
    if (modal && event.key === 'Tab') {
      const buttons = [...modal.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if (!event.isTrusted) return;
    if ((event.target as HTMLElement).id !== 'game-input') return;
    if (event.isComposing || event.key === 'Process' || event.keyCode === 229) { pending = undefined; if (screen === 'game') { inputConfirmed = false; pause(); } return; }
    if (event.repeat) { event.preventDefault(); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) { pending = undefined; if (screen === 'game') pause(); return; }
    if (event.key === 'Escape') { event.preventDefault(); pause(); return; }
    if (event.key === ' ' && screen === 'game') { event.preventDefault(); pending = undefined; updateGame(session!.deliver(performance.now())); return; }
    if (/^[a-zA-Z'-]$/.test(event.key)) { pending = { key: event.key, at: performance.now() }; (event.target as HTMLInputElement).value = ''; }
    else pending = undefined;
  });
  on(root, 'keyup', (raw) => {
    const event = raw as KeyboardEvent;
    if ((event.target as HTMLElement).id === 'game-input' && pending && event.key.toLowerCase() === pending.key.toLowerCase()) { pending = undefined; if (screen === 'game') { inputConfirmed = false; pause(); } }
  });
  on(root, 'beforeinput', (raw) => {
    const event = raw as InputEvent;
    if ((event.target as HTMLElement).id === 'game-input' && (event.isComposing || event.inputType !== 'insertText')) { pending = undefined; if (!event.isComposing) event.preventDefault(); if (screen === 'game') { inputConfirmed = false; pause(); } }
  });
  on(root, 'input', (raw) => {
    const event = raw as InputEvent;
    const input = event.target as HTMLInputElement;
    if (input.id !== 'game-input') return;
    const value = input.value;
    input.value = '';
    const confirmed = pending && event.isTrusted && !event.isComposing && !composing && event.inputType === 'insertText' && value.length === 1 && value.toLowerCase() === pending.key.toLowerCase();
    const operation = pending; pending = undefined;
    if (!confirmed || !operation) { if (screen === 'game') { inputConfirmed = false; pause(); } else { checkPassed = false; const confirm = root.querySelector<HTMLButtonElement>('[data-action="confirm"]'); if (confirm) confirm.disabled = true; const el = root.querySelector('#check-status'); if (el) el.textContent = 'IMEをオフにして、半角英字の a を入力してください'; } return; }
    if (screen === 'check') {
      if (value.toLowerCase() === 'a') { checkPassed = true; root.querySelector('#check-status')!.textContent = '半角入力を確認できました。'; root.querySelector<HTMLButtonElement>('[data-action="confirm"]')!.disabled = false; }
    } else if (screen === 'game') updateGame(session!.input(operation.key, operation.at));
  });
  on(root, 'compositionstart', () => { checkPassed = false; const confirm = root.querySelector<HTMLButtonElement>('[data-action="confirm"]'); if (confirm) confirm.disabled = true; composing = true; pending = undefined; inputConfirmed = false; pause(); });
  on(root, 'compositionend', () => { composing = false; pending = undefined; });
  on(root, 'paste', (event) => { if ((event.target as HTMLElement).id === 'game-input') { event.preventDefault(); pending = undefined; } });
  on(root, 'drop', (event) => { if ((event.target as HTMLElement).id === 'game-input') { event.preventDefault(); pending = undefined; } });
  on(root, 'focusout', (event) => { if ((event.target as HTMLElement).id === 'game-input' && !suppressBlur) pause(); });
  on(window, 'resize', () => { if (screen === 'home') renderHome(); });
  on(window, 'blur', () => { pending = undefined; pause(); });
  on(document, 'visibilitychange', () => { if (document.hidden) { pending = undefined; pause(); } });
  const interval = setInterval(() => { if (screen === 'game' && session && !pending) updateGame(session.tick(performance.now())); }, 80);
  renderHome();
  return () => { abort.abort(); clearInterval(interval); clearTimeout(feedbackTimer); root.innerHTML = ''; };
}
