import type { DistrictId } from '@/contracts/types';
import type { CityEconomy } from '@/economy/cityEconomy';
import {
  AchievementEngine,
  CATALOG_ACHIEVEMENTS,
} from '@/progression/achievementEngine';
import { MAX_CARGO_COUNT, type SessionSnapshot } from '@/typing/gameSession';
import { renderCoachMark } from '../components/coachMark';
import type { OnboardingUiState, PlayUiFeedback, UIControllerActions } from '../types';
import { assetImg, assetUrl, el } from '../utils/dom';
import {
  DISTRICT_NAME_MAP,
  formatCountdownSec,
  formatMaterials,
  getDestinationRasterSprite,
} from '../utils/format';

export interface PlayScreenProps {
  snapshot: SessionSnapshot;
  economy: CityEconomy;
  achievements: AchievementEngine;
  pinnedAchievementId: string | null;
  feedback: PlayUiFeedback;
  onboarding?: OnboardingUiState;
  onboardingInProgress?: boolean;
  inputEl: HTMLInputElement;
  countdownRemaining?: number | null;
  actions: UIControllerActions;
}

type CourierTier = 'cart' | 'van' | 'box_van' | 'truck' | 'train';

function getCourierTier(railway: boolean, crews: number): CourierTier {
  if (railway) {
    return 'train';
  }
  if (crews >= 10) {
    return 'truck';
  }
  if (crews >= 7) {
    return 'box_van';
  }
  if (crews >= 4) {
    return 'van';
  }
  return 'cart';
}

function renderRomajiGuide(guide: string, typed: string): HTMLElement {
  const container = el('div', { className: 'kb-prompt-roman', 'aria-label': 'ローマ字入力ガイド' });
  if (!guide) {
    container.appendChild(
      el('span', { className: 'kb-secondary kb-small' }, '（ローマ字ガイド非表示）'),
    );
    return container;
  }

  const nextChar = guide.slice(0, 1);
  const restPart = guide.slice(1);

  if (typed) {
    container.appendChild(el('span', { className: 'kb-roman-typed' }, typed));
  }
  if (nextChar) {
    container.appendChild(el('span', { className: 'kb-roman-next' }, nextChar));
  }
  if (restPart) {
    container.appendChild(el('span', {}, restPart));
  }
  return container;
}

const EXTRA_MARK_EMPTY_SRC = './assets/ui_icon/extra_delivery_mark_empty.webp';
const EXTRA_MARK_LIT_SRC = './assets/ui_icon/extra_delivery_mark_lit.webp';

const preloadedUrls = new Set<string>();

function preloadImageUrl(url: string): void {
  const resolved = assetUrl(url);
  if (preloadedUrls.has(resolved) || typeof Image === 'undefined') {
    return;
  }
  preloadedUrls.add(resolved);
  const img = new Image();
  img.src = resolved;
}

function preloadPlayAssets(
  economy: CityEconomy,
  districtId: DistrictId,
  stageSnapshot: number,
): void {
  const district = economy.districts[districtId];
  const tier = getCourierTier(district.railway, district.crews);
  const urls = [
    `./assets/raster/play_backdrop_${economy.landscape}.jpg`,
    './assets/raster/scenic_hub.jpg',
    getDestinationRasterSprite(districtId, stageSnapshot),
    `./assets/sprites/anim_courier_${tier}.png`,
    './assets/sprites/anim_central_hub.png',
    './assets/sprites/anim_delivery_arrive.png',
    './assets/sprites/cargo.png',
    EXTRA_MARK_EMPTY_SRC,
    EXTRA_MARK_LIT_SRC,
    './assets/sprites/cargo_wagon_stage0.png',
    './assets/sprites/cargo_wagon_stage1.png',
    './assets/sprites/cargo_wagon_stage2.png',
    './assets/sprites/cargo_wagon_stage3.png',
    './assets/sprites/cargo_wagon_stage4.png',
    './assets/sprites/cargo_wagon_stage5.png',
    './assets/sprites/anim_wagon_stage1.png',
    './assets/sprites/anim_wagon_stage2.png',
    './assets/sprites/anim_wagon_stage3.png',
    './assets/sprites/anim_wagon_stage4.png',
    './assets/sprites/anim_wagon_stage5.png',
  ];
  for (const url of urls) {
    preloadImageUrl(url);
  }
}

function createSpriteAnimEl(
  className: string,
  spriteSrc: string,
  frames: 8 | 15,
  oneShot = false,
): HTMLElement {
  const node = el('div', {
    className: `${className} kb-sprite-anim-${frames}${oneShot ? ' is-oneshot' : ''}`,
    'aria-hidden': 'true',
  });
  node.style.backgroundImage = `url("${assetUrl(spriteSrc)}")`;
  if (oneShot) {
    const cleanup = (): void => node.remove();
    node.addEventListener('animationend', cleanup, { once: true });
    window.setTimeout(cleanup, 750);
  }
  return node;
}

function triggerDestinationArrivalFx(
  worldBg: HTMLElement,
  destEl: HTMLElement | null,
  arriveLayer: HTMLElement | null,
): void {
  if (worldBg.getAttribute('data-arrival-fx-played') === '1') {
    return;
  }
  worldBg.setAttribute('data-arrival-fx-played', '1');
  if (destEl) {
    destEl.classList.remove('is-receiving');
    void destEl.offsetWidth;
    destEl.classList.add('is-receiving');
  }
  if (arriveLayer) {
    arriveLayer.appendChild(
      createSpriteAnimEl(
        'kb-world-arrive-anim',
        './assets/sprites/anim_delivery_arrive.png',
        8,
        true,
      ),
    );
  }
}

function syncPlayWorldBackdrop(
  container: HTMLElement,
  economy: CityEconomy,
  districtId: DistrictId,
  stageSnapshot: number,
  cargoCount: number,
  feedback: PlayUiFeedback,
  isTutorial = false,
  onboarding?: OnboardingUiState,
): void {
  const district = economy.districts[districtId];
  const backdropSrc = `./assets/raster/play_backdrop_${economy.landscape}.jpg`;
  const fallbackTerrainSrc = `./assets/raster/terrain_${economy.landscape}.jpg`;
  const buildingSrc = getDestinationRasterSprite(districtId, stageSnapshot);
  const tier = getCourierTier(district.railway, district.crews);
  const courierSpriteSrc = `./assets/sprites/anim_courier_${tier}.png`;

  let worldBg = container.querySelector<HTMLElement>('[data-world-bg]');
  if (!worldBg) {
    worldBg = el(
      'div',
      { className: 'kb-play-world-bg', 'data-world-bg': 'true', 'aria-hidden': 'true' },
      assetImg(backdropSrc, '', {
        decorative: true,
        className: 'kb-play-world-terrain',
        fallbackSrc: fallbackTerrainSrc,
      }),
      el('div', { className: 'kb-play-world-wash' }),
      el(
        'div',
        { className: 'kb-play-world-stage' },
        el(
          'div',
          { className: 'kb-play-world-hub' },
          el(
            'div',
            { className: 'kb-world-buildings-group' },
            el(
              'div',
              { className: 'kb-world-vignette-wrap is-hub' },
              assetImg('./assets/raster/scenic_hub.jpg', '', {
                decorative: true,
                className: 'kb-world-hub-img',
              }),
            ),
            createSpriteAnimEl('kb-world-hub-anim', './assets/sprites/anim_central_hub.png', 15),
          ),
          el('div', { className: 'kb-world-label' }, '中央集配所'),
        ),
        el(
          'div',
          { className: 'kb-world-loading-bay', 'data-loading-bay': 'true' },
          el(
            'div',
            { className: 'kb-world-cargo-stack-wrap', 'data-cargo-stack-wrap': 'true' },
            assetImg('./assets/sprites/cargo_wagon_stage0.png', '', {
              decorative: true,
              className: 'kb-world-cargo-stack-img',
            }),
            el('div', { className: 'kb-world-waiting-wagon', 'data-waiting-wagon': 'true' }),
          ),
          el('div', { className: 'kb-world-waiting-vehicle', 'data-waiting-vehicle': 'true' }),
          el('div', { className: 'kb-world-fx-layer', 'data-loading-fx': 'true' }),
        ),
        el('div', { className: 'kb-world-courier-layer', 'data-courier-layer': 'true' }),
        el(
          'div',
          { className: 'kb-play-world-dest', 'data-world-dest': 'true' },
          el(
            'div',
            { className: 'kb-world-dest-group' },
            el(
              'div',
              { className: 'kb-world-vignette-wrap is-dest' },
              assetImg(buildingSrc, '', { decorative: true, className: 'kb-world-dest-img' }),
            ),
            el('div', { className: 'kb-world-arrive-layer', 'data-arrive-layer': 'true' }),
          ),
          el('div', { className: 'kb-world-label', 'data-world-dest-label': 'true' }),
        ),
      ),
    );
    container.prepend(worldBg);
  }
  worldBg.setAttribute('data-tutorial-mode', isTutorial ? 'true' : 'false');

  const destImgEl = worldBg.querySelector<HTMLImageElement>('.kb-world-dest-img');
  const versionedBuildingSrc = assetUrl(buildingSrc);
  if (destImgEl && destImgEl.getAttribute('src') !== versionedBuildingSrc) {
    destImgEl.setAttribute('src', versionedBuildingSrc);
  }

  // Update waiting vehicle sprite (first frame of the courier strip)
  const waitingVehicleEl = worldBg.querySelector<HTMLElement>('[data-waiting-vehicle]');
  if (waitingVehicleEl) {
    waitingVehicleEl.style.backgroundImage = `url("${assetUrl(courierSpriteSrc)}")`;
    waitingVehicleEl.classList.toggle('has-cargo', cargoCount > 0);
  }

  // Update stacked cargo stage (0..5) and tension wobble
  const stackWrapEl = worldBg.querySelector<HTMLElement>('[data-cargo-stack-wrap]');
  const stackImgEl = worldBg.querySelector<HTMLImageElement>('.kb-world-cargo-stack-img');
  const waitingWagonEl = worldBg.querySelector<HTMLElement>('[data-waiting-wagon]');
  const clampedCargo = Math.max(0, Math.min(5, cargoCount));
  const prevRenderedCargo = worldBg.getAttribute('data-rendered-cargo');
  if (stackImgEl && waitingWagonEl) {
    if (clampedCargo <= 0) {
      stackImgEl.style.display = '';
      waitingWagonEl.style.display = 'none';
    } else {
      stackImgEl.style.display = 'none';
      waitingWagonEl.style.display = '';
      const nextUrl = `url("${assetUrl(`./assets/sprites/anim_wagon_stage${clampedCargo}.png`)}")`;
      if (waitingWagonEl.style.backgroundImage !== nextUrl) {
        waitingWagonEl.style.backgroundImage = nextUrl;
      }
      if (prevRenderedCargo !== String(clampedCargo)) {
        waitingWagonEl.classList.remove('is-pop');
        void waitingWagonEl.offsetWidth;
        waitingWagonEl.classList.add('is-pop');
      }
    }
  }
  worldBg.setAttribute('data-rendered-cargo', String(clampedCargo));
  if (stackWrapEl) {
    stackWrapEl.classList.toggle('is-wobbly', clampedCargo >= 3 && clampedCargo < 5);
    stackWrapEl.classList.toggle('is-full', clampedCargo >= 5);
  }

  // Update destination label
  const destLabelEl = worldBg.querySelector<HTMLElement>('[data-world-dest-label]');
  if (destLabelEl) {
    const stockUnits = Math.floor(Number(district.stockMicro / 1_000_000n));
    destLabelEl.textContent = `${DISTRICT_NAME_MAP[districtId]} Lv.${stageSnapshot} ・ 在庫 ${stockUnits}`;
  }

  // 1) Word completed -> flying parcel drops onto the cargo stack
  const loadingFxEl = worldBg.querySelector<HTMLElement>('[data-loading-fx]');
  const prevWordSeq = Number(worldBg.getAttribute('data-last-word-seq') ?? '0');
  if (feedback.wordPopSeq > prevWordSeq) {
    worldBg.setAttribute('data-last-word-seq', String(feedback.wordPopSeq));
    if (loadingFxEl) {
      const flying = assetImg('./assets/sprites/cargo.png', '', {
        decorative: true,
        className: 'kb-flying-parcel',
      });
      flying.addEventListener('animationend', () => flying.remove());
      loadingFxEl.appendChild(flying);
    }
  }

  const loadingBayEl = worldBg.querySelector<HTMLElement>('[data-loading-bay]');
  if (loadingBayEl) {
    loadingBayEl.classList.toggle('is-hidden-bay', Boolean(onboarding?.deliveryInTransit));
  }
  const courierLayer = worldBg.querySelector<HTMLElement>('[data-courier-layer]');
  const destEl = worldBg.querySelector<HTMLElement>('[data-world-dest]');
  const arriveLayer = worldBg.querySelector<HTMLElement>('[data-arrive-layer]');
  const prevDeliverySeq = Number(worldBg.getAttribute('data-last-delivery-seq') ?? '0');
  if (feedback.deliveryPopSeq > prevDeliverySeq && courierLayer) {
    worldBg.setAttribute('data-last-delivery-seq', String(feedback.deliveryPopSeq));
    worldBg.removeAttribute('data-arrival-fx-played');
    if (feedback.fullDeliveryFlash) {
      loadingFxEl?.replaceChildren();
      for (const departing of [waitingVehicleEl, stackWrapEl]) {
        if (!departing) continue;
        departing.classList.remove('is-departing');
        void departing.offsetWidth;
        departing.classList.add('is-departing');
      }
    }

    const dispatches = [
      ...(feedback.fullDeliveryFlash ? ['通常便'] : []),
      ...(feedback.extraDeliveryFlash ? ['追加便'] : []),
    ];
    for (const [index, name] of dispatches.entries()) {
      const courier = el(
        'div',
        { className: 'kb-world-courier', 'aria-hidden': 'true' },
        el('span', { className: 'kb-world-courier-tag' }, name),
        el(
          'div',
          { className: 'kb-world-courier-train' },
          name === '通常便'
            ? createSpriteAnimEl('kb-world-courier-wagon', './assets/sprites/anim_wagon_stage5.png', 8)
            : null,
          createSpriteAnimEl('kb-world-courier-sprite', courierSpriteSrc, 8),
        ),
      );
      if (index > 0) courier.style.animationDelay = '160ms';
      courier.addEventListener('animationend', (event) => {
        if (event.target !== courier) return;
        courier.remove();
        triggerDestinationArrivalFx(worldBg, destEl, arriveLayer);
      });
      courierLayer.appendChild(courier);
    }
  }
  if (onboarding?.deliveryArrived) {
    courierLayer?.querySelectorAll('.kb-world-courier').forEach((node) => node.remove());
    triggerDestinationArrivalFx(worldBg, destEl, arriveLayer);
  }
}

function renderInputCheckCard(actions: UIControllerActions, isTutorial = false, snapshot?: SessionSnapshot, countdown: number | null = null): HTMLElement {
  const resuming = snapshot && (snapshot.completedWordCount > 0 || snapshot.typed.length > 0 || snapshot.mistakeCount > 0);

  const cancelBtn = el('button', { type: 'button', className: 'kb-btn-secondary' },
    el('span', {}, '戻る'), el('kbd', { className: 'kb-kbd' }, 'Esc'));
  cancelBtn.addEventListener('click', () => actions.cancelInputCheck());

  const card = el(
    'section',
    { className: `kb-card kb-play-paper${isTutorial ? ' is-onboard-modal' : ''}`, 'aria-label': '入力方式の確認' },
    isTutorial
      ? el(
          'div',
          { className: 'kb-badge kb-small', 'data-testid': 'onboarding-input-check-note' },
          resuming ? `続きから再開します。完了 ${snapshot.completedWordCount}語・積載 ${snapshot.cargoCount}/5 を保存しています。`
            : '住宅地への配達準備をしましょう。',
        )
      : null,
    el('h2', { className: 'kb-h2' }, countdown === null ? 'スタート前の確認' : 'まもなくスタート'),
    countdown === null
      ? el('kbd', { className: 'kb-kbd kb-input-start-key', 'aria-label': 'Fキー' }, 'F')
      : el('div', { className: 'kb-start-countdown', 'data-testid': 'start-countdown', role: 'status', 'aria-live': 'assertive' }, String(countdown)),
    el('p', {}, countdown === null ? 'Fを押すと開始します' : '3・2・1のあとにスタートします。'),
    countdown === null ? el('p', { className: 'kb-secondary kb-small' }, '日本語入力（IME）をオフにし、半角英数に切り替えてください。') : null,
    cancelBtn,
  );

  if (isTutorial) {
    return el(
      'div',
      {
        className: 'kb-play-onboard-modal-backdrop',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': '入力方式の確認',
      },
      card,
    );
  }
  return card;
}

function renderPausedCard(feedback: PlayUiFeedback, actions: UIControllerActions): HTMLElement {
  const resumeBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-primary' },
    el('span', {}, '再開する'),
    el('kbd', { className: 'kb-kbd' }, 'Enter'),
  );
  resumeBtn.addEventListener('click', () => actions.resumePlay());

  const recheckBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary' },
    el('span', {}, '半角入力を再確認'),
    el('kbd', { className: 'kb-kbd' }, 'R'),
  );
  recheckBtn.addEventListener('click', () => actions.recheckImeFromPause());

  const skipBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary' },
    el('span', {}, 'このことばをスキップ'),
    el('kbd', { className: 'kb-kbd' }, 'S'),
  );
  skipBtn.addEventListener('click', () => actions.skipWordFromPause());

  const quitBtn = el(
    'button',
    { type: 'button', className: 'kb-btn-secondary' },
    el('span', {}, 'ホームへ戻る'),
    el('kbd', { className: 'kb-kbd' }, 'Q'),
  );
  quitBtn.addEventListener('click', () => actions.quitPlayToHome());

  return el(
    'section',
    { className: 'kb-card kb-play-paper', 'aria-label': '一時停止中' },
    el('h2', { className: 'kb-h2' }, '一時停止中'),
    feedback.imePauseReason
      ? el(
          'p',
          { className: 'kb-banner-warning' },
          '日本語入力（IME）が検出されたため一時停止しました。半角英数に切り替えてから再開してください。',
        )
      : el('p', { className: 'kb-secondary' }, 'お題は一時停止中に隠しています。再開すると表示されます。'),
    el('p', { className: 'kb-secondary kb-small' }, '「このことばをスキップ」は、積んだ荷物を配達してから次のことばへ進みます。'),
    el('div', { className: 'kb-stack-sm kb-center-actions' }, resumeBtn, recheckBtn, skipBtn, quitBtn),
  );
}

function renderExtraProgress(
  snapshot: SessionSnapshot, feedback: PlayUiFeedback, previous: HTMLElement | null,
): HTMLElement {
  const progress = previous ?? el('span', {
    className: 'kb-extra-progress', role: 'meter',
    'aria-label': '追加便', 'aria-valuemin': 0, 'aria-valuemax': MAX_CARGO_COUNT,
    'data-testid': 'extra-delivery-progress',
  }, el('span', {}, '追加便'), ...Array.from({ length: MAX_CARGO_COUNT }, () => {
    const mark = assetImg(EXTRA_MARK_EMPTY_SRC, '', {
      className: 'kb-extra-mark',
      decorative: true,
    });
    mark.addEventListener('animationend', () => mark.classList.remove('is-new'));
    return mark;
  }));
  const current = snapshot.currentCleanStreak % MAX_CARGO_COUNT;
  const complete = feedback.extraDeliveryFlash && snapshot.currentCleanStreak > 0 && current === 0;
  const filled = complete ? MAX_CARGO_COUNT : current;
  const before = Number(progress.getAttribute('aria-valuenow') ?? 0);
  progress.setAttribute('aria-valuenow', String(filled));
  progress.setAttribute('aria-valuetext', complete
    ? '5問連続成功。追加便が出発'
    : `ノーミス ${filled}/${MAX_CARGO_COUNT}問。追加便まであと${MAX_CARGO_COUNT - filled}問`);
  progress.classList.toggle('is-complete', complete);
  const emptySrc = assetUrl(EXTRA_MARK_EMPTY_SRC);
  const litSrc = assetUrl(EXTRA_MARK_LIT_SRC);
  progress.querySelectorAll<HTMLImageElement>('.kb-extra-mark').forEach((mark, index) => {
    const lit = index < filled;
    const nextSrc = lit ? litSrc : emptySrc;
    if (mark.getAttribute('src') !== nextSrc) {
      mark.setAttribute('src', nextSrc);
    }
    mark.classList.toggle('is-lit', lit);
    if (!lit) mark.classList.remove('is-new');
    else if (index >= before) mark.classList.add('is-new');
  });
  return progress;
}

function renderPaperFooterLine(
  snapshot: SessionSnapshot, feedback: PlayUiFeedback, previousProgress: HTMLElement | null,
): HTMLElement {
  const dispatch = feedback.fullDeliveryFlash
    ? feedback.extraDeliveryFlash ? '通常便と追加便が出発！' : '通常便が出発！'
    : '追加便が出発！';
  const message = feedback.mistakeLabel ?? feedback.notice ??
    (feedback.lastDeliveryBonus === null ? null : dispatch + ' +' + feedback.lastDeliveryBonus + '点');
  return el(
    'div',
    { className: 'kb-play-paper-foot', role: 'status', 'aria-atomic': 'true' },
    el(
      'span',
      { className: 'kb-play-deliver-hint', 'data-testid': 'play-deliver-hint' },
      el(
        'span',
        { className: 'kb-delivery-progress-row' },
        el('span', { className: 'kb-deliver-cargo-count' }, '積載 ' + snapshot.cargoCount + '/5'),
        renderExtraProgress(snapshot, feedback, previousProgress),
      ),
      el(
        'span',
        { className: 'kb-dispatch-status' },
        message
          ? el('span', { className: feedback.mistakeLabel ? 'kb-mistake-pop' : 'kb-delivery-burst' }, message)
          : null,
      ),
    ),
  );
}

export function syncPlayScreen(
  container: HTMLElement,
  props: PlayScreenProps,
  initialStageSnapshot: number,
): void {
  const {
    snapshot,
    economy,
    achievements,
    pinnedAchievementId,
    feedback,
    onboarding,
    onboardingInProgress = false,
    inputEl,
    countdownRemaining = null,
    actions,
  } = props;

  if (!container.contains(inputEl)) {
    inputEl.className = 'kb-hidden-input';
    inputEl.setAttribute('aria-label', 'タイピング入力欄');
    inputEl.autocomplete = 'off';
    inputEl.autocapitalize = 'off';
    inputEl.spellcheck = false;
    container.appendChild(inputEl);
  }

  let contentHost = container.querySelector<HTMLElement>('[data-play-content]');
  if (!contentHost) {
    contentHost = el('div', { className: 'kb-play-stage', 'data-play-content': 'true' });
    container.appendChild(contentHost);
  }

  const previousProgress = contentHost.querySelector<HTMLElement>('[data-testid="extra-delivery-progress"]');
  contentHost.replaceChildren();

  preloadPlayAssets(economy, snapshot.districtId, initialStageSnapshot);

  const isTutorialMode = snapshot.mode === 'TUTORIAL';

  if (snapshot.state === 'INPUT_CHECK') {
    syncPlayWorldBackdrop(
      container,
      economy,
      snapshot.districtId,
      initialStageSnapshot,
      snapshot.cargoCount,
      feedback,
      isTutorialMode,
      onboarding,
    );
    contentHost.appendChild(renderInputCheckCard(actions, isTutorialMode, snapshot, countdownRemaining));
    return;
  }

  if (snapshot.state === 'PAUSED') {
    syncPlayWorldBackdrop(
      container,
      economy,
      snapshot.districtId,
      initialStageSnapshot,
      snapshot.cargoCount,
      feedback,
      isTutorialMode,
      onboarding,
    );
    contentHost.appendChild(renderPausedCard(feedback, actions));
    return;
  }

  syncPlayWorldBackdrop(
    container,
    economy,
    snapshot.districtId,
    initialStageSnapshot,
    snapshot.cargoCount,
    feedback,
    isTutorialMode,
    onboarding,
  );

  // Top status bar
  const timerLabel =
    snapshot.mode === 'MAIN'
      ? `残り ${formatCountdownSec(snapshot.remainingMs)}`
      : snapshot.mode === 'PRACTICE'
        ? `連続ノーミス ${snapshot.currentCleanStreak}語`
        : '時間制限なし';

  const showStreak = snapshot.mode === 'MAIN' && snapshot.currentCleanStreak >= 2;
  const isUrgentTimer = snapshot.mode === 'MAIN' && snapshot.remainingMs <= 10_000;
  const names = feedback.lastUnlockedStampNames;
  const toastLabel =
    names.length > 1
      ? `切手${names.length}枚獲得！「${names[0]}」ほか`
      : `切手獲得！「${names[0]}」`;
  const stampToastEl =
    names.length > 0
      ? (() => {
          const stampAssetId = feedback.lastUnlockedStampAssetIds[0];
          const stampSrc = stampAssetId
            ? `./assets/achievement_stamp/${stampAssetId}.webp`
            : './assets/shared_frame/stamp_frame.svg';
          return el(
            'div',
            { className: 'kb-achievement-toast kb-play-toast-inline kb-row-gap', role: 'status' },
            assetImg(stampSrc, '', {
              className: 'kb-toast-stamp-icon',
              decorative: true,
              width: 24,
              height: 24,
            }),
            el('strong', {}, toastLabel),
          );
        })()
      : null;

  const statusBar = el(
    'div',
    { className: 'kb-play-topbar' },
    el(
      'div',
      { className: 'kb-play-topbar-left' },
      el(
        'strong',
        {
          className: `kb-badge kb-tabular${isUrgentTimer ? ' is-urgent' : ''}`,
          'data-testid': 'play-timer',
        },
        snapshot.mode === 'MAIN'
          ? assetImg('./assets/ui_icon/ui_clock.svg', '', { decorative: true, width: 15, height: 15 })
          : null,
        el('span', {}, timerLabel),
      ),
      el('span', { className: 'kb-stat-pill kb-tabular' }, `スコア ${snapshot.score.toLocaleString('ja-JP')}点`),
      el('span', { className: 'kb-stat-pill kb-tabular' }, `完了 ${snapshot.completedWordCount}語`),
      snapshot.mode === 'MAIN'
        ? el(
            'span',
            {
              className: `kb-badge kb-streak-pill kb-tabular${showStreak ? '' : ' is-hidden-slot'}`,
              'aria-hidden': showStreak ? 'false' : 'true',
            },
            showStreak ? `連続ノーミス ${snapshot.currentCleanStreak}語！` : '連続ノーミス 00語！',
          )
        : null,
    ),
    stampToastEl,
  );
  contentHost.appendChild(statusBar);

  if (isTutorialMode && onboarding?.deliveryInTransit) {
    const arrived = onboarding.deliveryArrived;
    const transitCard = renderCoachMark({
      stepBadge: 'ステップ 4 / 9',
      title: onboarding.saveFailed ? '保存をもう一度試してください' : arrived ? '住宅地に資材が到着しました！' : '荷馬車が出発しました！',
      body: onboarding.saveFailed ? '配達は完了しています。切手と街の状態を保存してから、建築へ進みます。' : arrived
        ? `住宅地の在庫は ${formatMaterials(economy.districts.residential.stockMicro)} 資材です。`
        : '住宅地へ荷物を届けています。',
      pointerDirection: 'none',
      compactHeader: true,
      primaryLabel: onboarding.saveFailed ? '保存を再試行' : undefined,
      primaryTestId: 'onboarding-retry-save-btn',
      onPrimary: () => actions.retryOnboardingArrival(),
      secondaryLabel: 'スキップしてホームへ',
      secondaryTestId: 'onboarding-skip-btn',
      onSecondary: () => {
        if (onboarding?.active) {
          actions.skipOnboarding();
        } else {
          actions.quitPlayToHome();
        }
      },
      testId: 'onboarding-play-guide',
      step: 'S4',
      className: 'kb-play-coach-overlay',
    });
    contentHost.appendChild(transitCard);
    return;
  }

  if (snapshot.mode === 'TUTORIAL') {
    const step = onboarding?.step ?? 'S3';
    const showSkipInCoach = true;
    const onSkip = () => {
      if (onboarding?.active) {
        actions.skipOnboarding();
      } else {
        actions.quitPlayToHome();
      }
    };

    let guideCard: HTMLElement;
    if (step === 'S4') {
      guideCard = renderCoachMark({
        stepBadge: 'ステップ 4 / 9',
        title: '荷物が5個そろうと通常便が出発！',
        body: 'ミスなしで5問続けると追加便も出ます。',
        pointerDirection: 'down',
        compactHeader: true,
        secondaryLabel: showSkipInCoach ? 'スキップしてホームへ' : undefined,
        secondaryTestId: showSkipInCoach ? 'onboarding-skip-btn' : undefined,
        onSecondary: showSkipInCoach ? onSkip : undefined,
        testId: 'onboarding-play-guide',
        step: 'S4',
        className: 'kb-play-coach-overlay',
      });
    } else {
      const targetGuide = snapshot.guide;
      const guideInstruction = targetGuide
        ? '表示のローマ字（' + targetGuide + '）をそのまま打ちましょう。'
        : 'お題のローマ字をそのまま打ちましょう。';
      guideCard = renderCoachMark({
        stepBadge: 'ステップ 3 / 9',
        title: 'タイピングで荷物を積み込もう',
        body: guideInstruction,
        pointerDirection: 'down',
        compactHeader: true,
        secondaryLabel: showSkipInCoach ? 'スキップしてホームへ' : undefined,
        secondaryTestId: showSkipInCoach ? 'onboarding-skip-btn' : undefined,
        onSecondary: showSkipInCoach ? onSkip : undefined,
        testId: 'onboarding-play-guide',
        step: 'S3',
        className: 'kb-play-coach-overlay',
      });
    }
    guideCard.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('button')) {
        actions.focusPlayInput();
      }
    });
    contentHost.appendChild(guideCard);
  }

  // Upper layer: Slim typing slip with "next word" inside and text-only Enter hint
  const paper = el('section', {
    className: `kb-play-paper${snapshot.mode === 'TUTORIAL' ? ' is-onboard-spotlight' : ''}${feedback.mistakeFlash ? ' is-mistake' : ''}${feedback.fullDeliveryFlash ? ' is-full-delivery' : ''}`,
    'aria-label': '入力お題',
  });
  paper.addEventListener('click', () => actions.focusPlayInput());

  const paperLead =
    snapshot.mode === 'MAIN' && snapshot.state === 'READY'
      ? '90秒の配達をはじめよう'
      : 'いま打つことば';

  paper.appendChild(
    el(
      'div',
      { className: 'kb-play-paper-head' },
      el('span', { className: 'kb-play-paper-lead kb-small kb-secondary' }, paperLead),
      el(
        'div',
        {
          className: 'kb-play-next-word kb-small',
          title: `つぎ: ${snapshot.nextWord.display}（${snapshot.nextWord.reading}）`,
        },
        el('span', { className: 'kb-secondary' }, 'つぎ: '),
        el('strong', {}, snapshot.nextWord.display),
        el('span', { className: 'kb-secondary' }, `（${snapshot.nextWord.reading}）`),
      ),
    ),
  );

  paper.appendChild(el('div', { className: 'kb-prompt-ja', 'data-testid': 'play-word-ja' }, snapshot.currentWord.display));
  paper.appendChild(el('div', { className: 'kb-prompt-reading' }, snapshot.currentWord.reading));
  paper.appendChild(renderRomajiGuide(snapshot.guide, snapshot.typed));
  paper.appendChild(renderPaperFooterLine(snapshot, feedback, previousProgress));

  contentHost.appendChild(paper);

  // Pinned goal status (compact strip right below slip)
  if (pinnedAchievementId) {
    const def = CATALOG_ACHIEVEMENTS.find((a) => a.id === pinnedAchievementId);
    if (def) {
      const provisional = achievements.getProvisionalStatuses(snapshot.sessionId)[def.id];
      const isIneligible = provisional === 'disqualified_this_round'
        || ('seriesId' in def && def.scope === '通常' && (snapshot.mode !== 'MAIN' || snapshot.skips > 0 || snapshot.rescueUsed));
      contentHost.appendChild(
        el(
          'div',
          { className: 'kb-play-goal-strip kb-small' },
          assetImg('./assets/ui_icon/ui_pin.svg', '', { decorative: true, width: 14, height: 14 }),
          el(
            'span',
            {},
            `目標: ${def.hidden && !achievements.isUnlocked(def.id) ? '？？？' : def.name}`,
          ),
          isIneligible
            ? el('span', { className: 'kb-accent' }, '今回は対象外')
            : el('span', { className: 'kb-secondary' }, provisional === 'provisional_held' ? '完走で確定' : ''),
        ),
      );
    }
  }

  // Tutorial loading explanation and recovery actions
  if (snapshot.mode === 'TUTORIAL') {
    if (onboarding?.rescueOffered) {
      const rescuePracticeBtn = el(
        'button',
        {
          type: 'button',
          className: 'kb-btn-secondary kb-rescue-btn',
          'data-testid': 'onboarding-rescue-practice-btn',
        },
        'ゆっくり練習する',
      );
      rescuePracticeBtn.addEventListener('mousedown', (e) => e.preventDefault());
      rescuePracticeBtn.addEventListener('click', () => {
        actions.quitPlayToHome();
        actions.startPractice();
      });

      const rescueHomeBtn = el(
        'button',
        {
          type: 'button',
          className: 'kb-btn-primary kb-rescue-btn',
          'data-testid': 'onboarding-rescue-home-btn',
        },
        'そのままホームへ戻る',
      );
      rescueHomeBtn.addEventListener('mousedown', (e) => e.preventDefault());
      rescueHomeBtn.addEventListener('click', () => actions.skipOnboarding());

      contentHost.querySelector('.kb-play-coach-overlay .kb-coach-inner')?.appendChild(
        el(
          'div',
          {
            className: 'kb-row-between kb-onboard-rescue-bar',
            'data-testid': 'onboarding-rescue-bar',
          },
          el('span', { className: 'kb-small' }, 'ミスが続いています。練習しますか？'),
          el('div', { className: 'kb-row-gap' }, rescuePracticeBtn, rescueHomeBtn),
        ),
      );
    }

    if (!onboarding?.rescueOffered) {
      contentHost.appendChild(el(
        'p',
        { className: 'kb-play-tutorial-banner kb-small', 'data-testid': 'onboarding-loading-rule' },
        '同じ問題で2か所以上打ち間違えたときだけ、その問題の荷物は積まれません。',
      ));
    }
  }

  // Practice controls
  if (snapshot.mode === 'PRACTICE') {
    const nextWordBtn = el(
      'button',
      { type: 'button', className: 'kb-btn-secondary' },
      el('span', {}, '次の語'),
      el('kbd', { className: 'kb-kbd' }, 'Tab'),
    );
    nextWordBtn.addEventListener('mousedown', (e) => e.preventDefault());
    nextWordBtn.addEventListener('click', () => actions.nextPracticeWord());

    const tryMainBtn = el(
      'button',
      { type: 'button', className: 'kb-btn-primary', 'data-testid': 'practice-try-main-btn' },
      el('span', {}, onboardingInProgress ? 'チュートリアルに戻る' : '本編で試す'),
      el('kbd', { className: 'kb-kbd' }, 'Shift+Enter'),
    );
    tryMainBtn.addEventListener('mousedown', (e) => e.preventDefault());
    tryMainBtn.addEventListener('click', () => actions.tryMainFromPractice());

    const endPracticeBtn = el(
      'button',
      { type: 'button', className: 'kb-btn-secondary' },
      el('span', {}, onboardingInProgress ? '地区選択へ戻る' : '終了'),
      el('kbd', { className: 'kb-kbd' }, 'Esc'),
    );
    endPracticeBtn.addEventListener('mousedown', (e) => e.preventDefault());
    endPracticeBtn.addEventListener('click', () => actions.endPracticeToHome());

    contentHost.appendChild(
      el('div', { className: 'kb-row-gap kb-center-actions' }, nextWordBtn, tryMainBtn, endPracticeBtn),
    );
  }
}
