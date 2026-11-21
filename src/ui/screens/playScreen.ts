import type { DistrictId } from '@/contracts/types';
import type { CityEconomy } from '@/economy/cityEconomy';
import {
  AchievementEngine,
  CATALOG_ACHIEVEMENTS,
} from '@/progression/achievementEngine';
import type { SessionSnapshot } from '@/typing/gameSession';
import type { DeliveryKeyOption } from '@/typing/inputAdapter';
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
  deliveryKey: DeliveryKeyOption;
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
    './assets/sprites/anim_cargo_collapse.png',
    './assets/sprites/anim_delivery_arrive.png',
    './assets/sprites/cargo.png',
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

  // 2) Mistake with cargo collapse -> match collapse visual to dropped count
  const prevMistakeSeq = Number(worldBg.getAttribute('data-last-mistake-seq') ?? '0');
  if (feedback.mistakeSeq > prevMistakeSeq) {
    worldBg.setAttribute('data-last-mistake-seq', String(feedback.mistakeSeq));
    const collapseMatch = feedback.mistakeLabel?.match(/荷崩れ！ \(-(\d+)個\)/);
    if (loadingFxEl && collapseMatch) {
      const droppedCount = Number(collapseMatch[1]);
      if (droppedCount >= 3) {
        loadingFxEl.appendChild(
          createSpriteAnimEl(
            'kb-world-collapse-anim',
            './assets/sprites/anim_cargo_collapse.png',
            8,
            true,
          ),
        );
      } else {
        for (let i = 0; i < droppedCount; i += 1) {
          const parcel = assetImg('./assets/sprites/cargo.png', '', {
            decorative: true,
            className: `kb-dropped-parcel${i === 1 ? ' is-second' : ''}`,
          });
          parcel.addEventListener('animationend', () => parcel.remove());
          loadingFxEl.appendChild(parcel);
        }
      }
    }
  }

  // 3) Delivery dispatched -> animated right-facing courier pulls the loaded cargo wagon across the road
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
    loadingFxEl?.replaceChildren();
    const dispatchedCargo = Math.max(
      1,
      Math.min(
        5,
        feedback.lastDeliveredCargoCount > 0
          ? feedback.lastDeliveredCargoCount
          : Number(worldBg.getAttribute('data-last-cargo-count') ?? '1'),
      ),
    );
    if (waitingVehicleEl) {
      waitingVehicleEl.classList.remove('is-departing');
      void waitingVehicleEl.offsetWidth;
      waitingVehicleEl.classList.add('is-departing');
    }
    if (stackWrapEl) {
      stackWrapEl.classList.remove('is-departing');
      void stackWrapEl.offsetWidth;
      stackWrapEl.classList.add('is-departing');
    }
    const bonusText =
      feedback.lastDeliveryBonus !== null ? `+${feedback.lastDeliveryBonus}点` : '配達！';
    const courier = el(
      'div',
      { className: 'kb-world-courier' },
      el('span', { className: 'kb-world-courier-tag' }, bonusText),
      el(
        'div',
        { className: 'kb-world-courier-train' },
        createSpriteAnimEl(
          'kb-world-courier-wagon',
          `./assets/sprites/anim_wagon_stage${dispatchedCargo}.png`,
          8,
        ),
        createSpriteAnimEl('kb-world-courier-sprite', courierSpriteSrc, 8),
      ),
    );
    courier.addEventListener('animationend', () => {
      courier.remove();
      triggerDestinationArrivalFx(worldBg, destEl, arriveLayer);
    });
    courierLayer.appendChild(courier);
  }
  if (onboarding?.deliveryArrived) {
    courierLayer?.querySelectorAll('.kb-world-courier').forEach((node) => node.remove());
    triggerDestinationArrivalFx(worldBg, destEl, arriveLayer);
  }
  worldBg.setAttribute('data-last-cargo-count', String(clampedCargo));
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
    { className: 'kb-card kb-play-paper', 'aria-label': '一時停止中', 'data-testid': 'play-paused' },
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

function renderPaperFooterLine(
  snapshot: SessionSnapshot,
  deliveryKey: DeliveryKeyOption,
  feedback: PlayUiFeedback,
  actions: UIControllerActions,
  onboarding?: OnboardingUiState,
): HTMLElement {
  const line = el('div', { className: 'kb-play-paper-foot', role: 'status' });

  if (feedback.mistakeFlash && feedback.mistakeLabel) {
    line.appendChild(
      el(
        'span',
        { className: 'kb-play-deliver-hint', 'data-testid': 'play-deliver-hint' },
        el(
          'span',
          { className: snapshot.cargoCount > 0 ? 'kb-deliver-cargo-count' : 'kb-secondary' },
          `積載 ${snapshot.cargoCount}/5`,
        ),
        el('span', { className: 'kb-mistake-pop' }, feedback.mistakeLabel),
      ),
    );
    return line;
  }

  if (feedback.fullDeliveryFlash && feedback.lastDeliveryBonus === null) {
    line.appendChild(el('span', { className: 'kb-delivery-burst' }, '5個満載！ 自動配達出発！'));
    return line;
  }

  if (feedback.lastDeliveryBonus !== null) {
    line.appendChild(
      el(
        'span',
        { className: 'kb-delivery-burst' },
        `${feedback.fullDeliveryFlash ? '5個満載！ ' : ''}配達出発！ +${feedback.lastDeliveryBonus}点`,
      ),
    );
    return line;
  }

  if (feedback.notice) {
    const noticeText =
      snapshot.cargoCount > 0
        ? `積載 ${snapshot.cargoCount}/5 ・ ${feedback.notice}`
        : feedback.notice;
    line.appendChild(
      el(
        'span',
        {
          className: feedback.midWordDeliveryAttempt ? 'kb-small kb-secondary' : 'kb-accent kb-small',
          'data-testid': 'play-deliver-hint',
        },
        noticeText,
      ),
    );
    return line;
  }

  if (
    snapshot.mode === 'TUTORIAL' &&
    onboarding?.active &&
    onboarding.step === 'S4' &&
    snapshot.cargoCount === 1
  ) {
    line.appendChild(
      el(
        'span',
        {
          className: `kb-play-deliver-hint${feedback.midWordDeliveryAttempt ? ' is-mid-word-nudge' : ''}`,
          'data-testid': 'play-deliver-hint',
        },
        el('span', {}, `積載 1/5（+${snapshot.pendingBonus}点）・ あと1語ノーミスで2個（+40%）にしてから `),
        el('kbd', { className: 'kb-kbd' }, deliveryKey),
        el('span', {}, ' で運ぶ！'),
      ),
    );
    return line;
  }

  const canDeliver = snapshot.atWordBoundary && snapshot.cargoCount > 0;
  if (canDeliver) {
    const isOnboardDeliverReady =
      snapshot.mode === 'TUTORIAL' &&
      Boolean(onboarding?.active) &&
      onboarding?.step === 'S4' &&
      snapshot.cargoCount >= 2;
    const trigger = el(
      'button',
      {
        type: 'button',
        className: `kb-play-deliver-hint is-ready${isOnboardDeliverReady ? ' is-onboard-deliver-ready' : ''}${feedback.midWordDeliveryAttempt ? ' is-mid-word-nudge' : ''}`,
        'data-testid': 'play-deliver-hint',
      },
      el('span', { className: 'kb-deliver-cargo-count' }, `積載 ${snapshot.cargoCount}/5（+${snapshot.pendingBonus}点）`),
      el(
        'span',
        { className: 'kb-deliver-cta-chip' },
        el('span', { className: 'kb-deliver-action-text' }, '今すぐ運ぶ'),
        el('kbd', { className: 'kb-kbd' }, deliveryKey),
      ),
    );
    trigger.addEventListener('mousedown', (e) => e.preventDefault());
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      actions.commitManualDelivery();
    });
    line.appendChild(trigger);
    return line;
  }

  if (snapshot.cargoCount > 0) {
    line.appendChild(
      el(
        'span',
        {
          className: `kb-play-deliver-hint${feedback.midWordDeliveryAttempt ? ' is-mid-word-nudge' : ''}`,
          'data-testid': 'play-deliver-hint',
        },
        el('span', {}, `積載 ${snapshot.cargoCount}/5（+${snapshot.pendingBonus}点） ・ 打ち終えて `),
        el('kbd', { className: 'kb-kbd' }, deliveryKey),
        el('span', {}, ' で運ぶ'),
      ),
    );
    return line;
  }

  line.appendChild(
    el(
      'span',
      { className: 'kb-play-deliver-hint kb-secondary', 'data-testid': 'play-deliver-hint' },
      '積載 0/5 ・ 1語ノーミスで荷物+1（5個で自動配達）',
    ),
  );
  return line;
}

function renderEfficiencyTable(cargoCount: number): HTMLElement {
  const tiers: readonly { count: number; pct: string; suffix?: string }[] = [
    { count: 1, pct: '+20%' },
    { count: 2, pct: '+40%' },
    { count: 3, pct: '+60%' },
    { count: 4, pct: '+80%' },
    { count: 5, pct: '+100%', suffix: '自動' },
  ];

  return el(
    'div',
    {
      className: 'kb-onboard-efficiency-bar',
      'data-testid': 'onboarding-efficiency-table',
      'aria-label': 'まとめ積みの上乗せ率',
    },
    el('span', { className: 'kb-onboard-eff-label' }, '上乗せ率'),
    ...tiers.map((t) => {
      const isCurrent = cargoCount === t.count;
      return el(
        'div',
        {
          className: `kb-onboard-eff-pill${isCurrent ? ' is-current' : ''}${t.count >= 2 ? ' is-recommended' : ''}`,
          'data-cargo-tier': String(t.count),
        },
        el('strong', {}, `${t.count}個`),
        el('span', {}, t.suffix ? `${t.pct} ${t.suffix}` : t.pct),
      );
    }),
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
    deliveryKey,
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
      const showSingleDeliveryWarning = Boolean(
        onboarding?.singleDeliveryNoticeShown && snapshot.cargoCount < 2,
      );
      const guideText = showSingleDeliveryWarning
        ? `2個以上まとめて運んでみましょう！いまの1個は残るので、あと1語ノーミスで2個にして ${deliveryKey} で運びましょう。`
        : snapshot.cargoCount >= 2
          ? snapshot.atWordBoundary
            ? `いま ${snapshot.cargoCount} 個積んでいます！ ${deliveryKey} キーまたは「今すぐ運ぶ (${deliveryKey})」で一気に運べます。`
            : `いま ${snapshot.cargoCount} 個積んでいます！ このことばを打ち終えてから ${deliveryKey} キーで一気に運べます。`
          : snapshot.cargoCount === 1
            ? `いま 1 個積んでいます。あと1語ノーミスで積み、2個以上にして ${deliveryKey} で運びましょう。`
            : `続けて2語ノーミスで積み、2個以上まとめて ${deliveryKey} キーで運びましょう（5個で自動）。`;
      guideCard = renderCoachMark({
        stepBadge: 'ステップ 4 / 9',
        title: '荷物をたくさん積み込むと効率が上がる！',
        body: guideText,
        bodyAccent: showSingleDeliveryWarning,
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
      const showZeroCargoMistake = Boolean(onboarding?.mistakeZeroCargoNoticeShown);
      const guideInstruction = showZeroCargoMistake
        ? '打ち間違えても大丈夫！入力済みの文字は残るので最後まで打ち切りましょう（誤打した語は積まれません）。'
        : targetGuide
          ? `表示のローマ字（${targetGuide}）をそのまま打ちましょう。1語ノーミスで荷物+1！`
          : 'お題のローマ字をそのまま打ちましょう。1語ノーミスで荷物+1！';
      guideCard = renderCoachMark({
        stepBadge: 'ステップ 3 / 9',
        title: 'タイピングで荷物を積み込もう',
        body: guideInstruction,
        bodyAccent: showZeroCargoMistake,
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
  const romajiEl = renderRomajiGuide(snapshot.guide, snapshot.typed);
  if (feedback.midWordDeliveryAttempt) {
    romajiEl.classList.add('is-highlight-next');
  }
  paper.appendChild(romajiEl);
  paper.appendChild(renderPaperFooterLine(snapshot, deliveryKey, feedback, actions, onboarding));

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

  // S4 Efficiency table, collapse lesson, rescue, and skip controls
  if (snapshot.mode === 'TUTORIAL') {
    const step = onboarding?.step ?? 'S3';
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

    if (step === 'S4') {
      contentHost.appendChild(renderEfficiencyTable(snapshot.cargoCount));
    }

    if (onboarding?.collapseLessonShown) {
      const actualCollapsed = onboarding.actualCollapseNoticeShown && snapshot.cargoCount === 0;
      const collapseIcon = createSpriteAnimEl(
        'kb-onboard-collapse-sample',
        './assets/sprites/anim_cargo_collapse.png',
        8,
      );
      contentHost.appendChild(
        el(
          'div',
          {
            className: 'kb-banner-warning kb-onboard-collapse-banner',
            role: 'status',
            'data-testid': 'onboarding-collapse-lesson',
          },
          collapseIcon,
          el(
            'div',
            { className: 'kb-small' },
            el(
              'strong',
              {},
              actualCollapsed
                ? '荷物が崩れました！'
                : '注意：誤打で積んだ荷物が崩れます！',
            ),
            ' ',
            actualCollapsed
              ? `打ち終えた語（完了 ${snapshot.completedWordCount}語分）の資材は減りません。またここから2個積みましょう。`
              : `崩れるのは積載中の上乗せ分だけで、打ち終えた語（完了 ${snapshot.completedWordCount}語分）の資材はそのまま残ります。`,
          ),
        ),
      );
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
