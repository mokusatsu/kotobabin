import config from '../../spec/initial/data/economy_config.json';
import { shopOverlayArtwork, vehicleArtworkId } from './equipment-visuals';
import catalogue from '../../spec/initial/data/city_catalog.json';
import { renderDistrictMap, renderDistrictCore, DISTRICT_CORE_BOUNDS, type DistrictMapFeature } from './district-map';
import { CityEconomy, EconomyFormulas, MICRO_UNIT, summarizeCity, type CityState, type DistrictId, type EquipmentKind, type Rational } from '../economy';

export type EquipmentTab = EquipmentKind | 'railway' | 'synergies' | 'research';
export type PurchaseQuantity = 1 | 10 | 'max';
const formulas = new EconomyFormulas();
const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
export const districtName = (id: DistrictId) => config.districts.find(district => district.id === id)!.name;
export const landscapeName = (id: string) => ({ riverside: '川沿い', seaside: '海辺', highland: '高原' })[id] ?? '川沿い';
export const escapeCityText = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
/** Decimal strings preserve micro-unit precision; display truncation never changes resources. */
export function formatMicro(amount: bigint, digits = 2): string {
  const sign = amount < 0n ? '−' : ''; const absolute = amount < 0n ? -amount : amount;
  const whole = (absolute / MICRO_UNIT).toLocaleString('ja-JP');
  const fraction = (absolute % MICRO_UNIT).toString().padStart(6, '0').slice(0, digits).replace(/0+$/, '');
  if (absolute > 0n && absolute < MICRO_UNIT / 10n ** BigInt(digits)) return `${sign}<0.${'0'.repeat(digits - 1)}1`;
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}
export const formatMultiplier = (value: Rational) => formatMicro(value.numerator * MICRO_UNIT / value.denominator, 4);
const time = (ms: bigint) => `${formatMicro(ms * 1000n)}秒`;
// Only approved, integrated stage art is listed. Missing stages keep exact DOM state.
const availableStageArt = new Set(['city_residential_s1']);
const candidateStageArt = new Set(['city_residential_s2', 'city_residential_s3', 'city_residential_s4', 'city_residential_s5', 'city_market_s1', 'city_market_s2', 'city_market_s3', 'city_market_s4', 'city_market_s5', 'city_workshop_s1', 'city_workshop_s2', 'city_workshop_s3', 'city_workshop_s4', 'city_workshop_s5', 'city_park_s1', 'city_park_s2', 'city_park_s3', 'city_park_s4', 'city_park_s5', 'city_station_s1', 'city_station_s2', 'city_station_s3', 'city_station_s4', 'city_station_s5', 'city_harbor_s1', 'city_harbor_s2', 'city_harbor_s3', 'city_harbor_s4', 'city_harbor_s5']);
export function districtArtwork(city: CityState, id: DistrictId) {
  const stage = city.districts[id].stage;
  const requested = `city_${id}_s${stage}`;
  const candidate = stage > 0 && candidateStageArt.has(requested);
  const ready = stage > 0 && (availableStageArt.has(requested) || candidate);
  return { path: ready ? `city_stage/${requested}.webp` : 'city_plot/city_plot_empty.webp', ready: stage === 0 || ready, stage, candidate };
}
export function districtFigure(city: CityState, id: DistrictId, extraClass = ''): string {
  const art = districtArtwork(city, id);
  const scaffold = city.districts[id].plan && city.districts[id].plan!.targetStage === 1;
  const shop = ['residential','market','workshop','park','station','harbor'].includes(id) && city.districts[id].shops > 0;
  return `<figure class="district-figure ${extraClass}"><div class="district-composite"><img class="district-base-art" src="${asset(art.path)}" alt="${districtName(id)} ${art.ready ? `段階${art.stage}の外観` : '地区の区画'}">${scaffold ? `<img class="district-scaffold-art" src="${asset('construction/scaffold_small.webp')}" alt="建築中の足場">` : ''}${shop ? `<img class="district-shop-art" src="${asset(`shop_scene/shop_${id}.webp`)}" alt="${districtName(id)}の代表店舗">` : ''}</div><figcaption>${districtName(id)} · 段階 ${art.stage}/5${art.candidate ? '<span class="art-pending">外観は調整中です。</span>' : art.ready ? '' : '<span class="art-pending">この段階の外観は制作中です。</span>'}</figcaption></figure>`;
}
export function cityIncome(city: CityState): bigint {
  return Object.entries(city.districts).reduce((total, [id, district]) => total + formulas.shopIncomePerSecondMicro(id, district, city.research.commerce, city.synergies.includes('tourism_service')), 0n);
}
export function balanceStrip(city: CityState): string {
  const summary = summarizeCity(city);
  return `<div class="city-balance"><span>コイン <strong id="city-coin">${formatMicro(city.coinsMicro)}</strong></span><span>街の営業収益 <strong id="city-income">${formatMicro(cityIncome(city))}</strong> /秒</span><span>中央倉庫の輸送待ち <strong id="city-warehouse">${formatMicro(summary.queueTotalMicro)}</strong>資材</span></div>`;
}
export function destinationOptions(city: CityState, destination: DistrictId) {
  return config.districts.filter(item => city.districts[item.id].open).map(item => `<option value="${item.id}" ${item.id === destination ? 'selected' : ''}>${item.name}</option>`).join('');
}
export function gameWorldMap(city: CityState, destination: DistrictId): string {
  const openCount = Object.values(city.districts).filter(district => district.open).length;
  const routes = catalogue.map_layout.routes.map(route => {
    const state = city.districts[route.district_id];
    return `<polyline points="${route.points.map(point => point.join(',')).join(' ')}" class="city-route ${state.open ? 'open' : 'locked'} ${state.railway ? 'railway' : ''}"/>`;
  }).join('');
  const vehicles = catalogue.map_layout.routes.map(route => {
    const district = city.districts[route.district_id];
    if (!district.open || district.crews < 1) return '';
    const point = district.queueMicro > 0n ? route.points[1] : route.points[route.points.length - 1];
    const direction = district.queueMicro > 0n ? route.points[2] : route.points[route.points.length - 1];
    const dx = direction[0] - point[0]; const dy = direction[1] - point[1];
    const sprite = vehicleArtworkId(district.crews, district.railway, dy < 0 ? 'rear' : 'front');
    return `<g transform="translate(${point[0]} ${point[1]})"><ellipse cx="0" cy="1" rx="16" ry="4" fill="#203d36" opacity=".16"/><g transform="scale(${dx < 0 ? -1 : 1} 1)"><image href="${asset(`vehicle/${sprite}.webp`)}" x="-24" y="-30" width="48" height="36"/></g></g>`;
  }).join('');
  const scaffolds = config.districts.map(item => {
    const district = city.districts[item.id]; if (!district.plan || district.plan.targetStage !== 1) return '';
    const anchor = catalogue.map_layout.anchors[item.id as keyof typeof catalogue.map_layout.anchors];
    return `<image href="${asset('construction/scaffold_small.webp')}" x="${anchor.x - 132}" y="${anchor.y - 165}" width="264" height="198"/>`;
  }).join('');
  const shop = ['residential','market','workshop','park','station','harbor'].map(id=>{const anchor=catalogue.map_layout.anchors[id as keyof typeof catalogue.map_layout.anchors];return city.districts[id].shops>0?`<image href="${asset(`shop_scene/shop_${id}.webp`)}" x="${anchor.x-110.375}" y="${anchor.y-47.75}" width="64" height="64"/>${shopOverlayArtwork(city.districts[id].shops).map(overlay=>`<image href="${asset(`shop_overlay/${overlay}.svg`)}" x="${anchor.x-110.375}" y="${anchor.y-47.75}" width="64" height="64"/>`).join('')}`:'';}).join('');
  const art = config.districts.map(item => {
    const anchor = catalogue.map_layout.anchors[item.id as keyof typeof catalogue.map_layout.anchors];
    const scale = 264 / DISTRICT_CORE_BOUNDS.width;
    return `<g data-world-district="${item.id}" data-world-district-id="${item.id}" data-stage="${city.districts[item.id].stage}" opacity="${city.districts[item.id].open?1:.35}" transform="translate(${anchor.x-DISTRICT_CORE_BOUNDS.anchorX*scale} ${anchor.y-DISTRICT_CORE_BOUNDS.anchorY*scale}) scale(${scale})">${renderDistrictCore(city,item.id)}</g>`;
  }).join('');
  return `<section class="town-panel game-world-map" aria-label="${landscapeName(city.landscape)}の全体地図"><div class="town-map canonical-map world-map-canvas"><svg viewBox="0 0 1600 1000" aria-label="6地区の街の地図"><image href="${asset('terrain/terrain_riverside.webp')}" width="1600" height="1000"/><g class="city-routes">${routes}</g><image href="${asset('city_shared/city_hub.webp')}" x="696" y="398" width="128" height="128"/>${art}${scaffolds}${shop}${vehicles}</svg>${config.districts.map(item => {
    const district = city.districts[item.id]; const anchor = catalogue.map_layout.anchors[item.id as keyof typeof catalogue.map_layout.anchors];
    return `<button class="map-label ${district.open ? '' : 'locked'} ${item.id === destination ? 'selected' : ''}" style="left:${anchor.x / 16}%;top:${(anchor.y + 40) / 10}%" data-action="city-district" data-district-id="${item.id}" data-world-x="${anchor.x}" data-world-y="${anchor.y}" aria-label="${item.name}の詳細"><strong>${item.name}</strong><small>${district.open ? `段階${district.stage}/5` : '未開通'}</small></button>`;
  }).join('')}</div><span class="world-map-status">開通 ${openCount}/6</span></section>`;
}
export function homeTown(city: CityState, destination: DistrictId): string { return gameWorldMap(city, destination); }

function cityHud(city: CityState, district: DistrictId, equipment = false): string {
  const balance=balanceStrip(city).replace(/<\/div>$/, '<span class="city-score-independence">得点は不変</span></div>');
  return `<header class="city-stage-hud"><div class="city-stage-heading"><button class="button" data-action="world-map">← 全体地図</button><h1>${equipment ? '街の設備' : '街の開発'}<strong id="city-stage-district-state">${districtName(district)} · 段階 ${city.districts[district].stage}/5</strong></h1><button class="text-button" data-action="new-city">再出発</button></div><div id="city-balance-strip">${balance}</div></header>`;
}
function cityFeedback(): string { return '<footer class="city-stage-feedback"><p class="city-command-status" id="city-command-status" role="status"></p><p class="save-status" data-save-status></p></footer>'; }
export function cityShell(city: CityState, district: DistrictId, feature: DistrictMapFeature = 'plan'): string {
  return `<main id="main" class="city-page city-game-stage" data-ipad-exclude data-stage-district="${district}">${cityHud(city,district)}<div class="city-stage-body"><section class="city-stage-map" aria-label="${districtName(district)}の地図"><div id="district-map-slot">${renderDistrictMap(city,district,{selectedFeature:feature})}</div><div id="equipment-district-summary">${districtEquipmentSummary(city,district)}</div></section><aside class="city-stage-panel" aria-label="選択した設備の操作"><div id="district-detail"></div></aside></div>${cityFeedback()}</main>`;
}
function purchaseControls(kind:EquipmentKind,quantity:PurchaseQuantity):string {
  return `<div class="equipment-controls"><div class="city-quantity" role="group" aria-label="購入数量"><h2>${config.equipment[kind].name}</h2>${([1,10,'max'] as const).map(value=>`<label><input type="radio" name="purchase-quantity" value="${value}" ${quantity===value?'checked':''}>${value==='max'?'買えるだけ':value}</label>`).join('')}</div></div>`;
}
export function equipmentShell(city: CityState, district: DistrictId, kind: EquipmentTab, quantity: PurchaseQuantity): string {
  const purchase = ['packaging','crews','shops'].includes(kind);
  return `<main id="main" class="equipment-page city-game-stage" data-ipad-exclude data-stage-district="${district}">${cityHud(city,district,true)}<div class="city-stage-body"><section class="city-stage-map" aria-label="${districtName(district)}の地図"><div id="district-map-slot">${renderDistrictMap(city,district,{selectedFeature:kind})}</div><div id="equipment-district-summary">${districtEquipmentSummary(city,district)}</div></section><aside class="city-stage-panel" aria-label="選択した設備の操作">${purchase ? purchaseControls(kind as EquipmentKind,quantity):''}<div id="equipment-content"></div></aside></div>${cityFeedback()}</main>`;
}
export function districtPanel(city:CityState,id:DistrictId,feature:DistrictMapFeature,writable:boolean,quantity:PurchaseQuantity=1,selectedSpecialId?:string):string {
  if(feature==='plan')return districtDetail(city,id,writable);
  if(feature==='shops'||feature==='crews'||feature==='packaging')return purchaseControls(feature,quantity)+purchaseCard(city,id,feature,quantity,writable);
  return specialEquipment(city,id,feature,writable,selectedSpecialId);
}

export function purchaseCard(city: CityState, districtId: DistrictId, kind: EquipmentKind, quantity: PurchaseQuantity, writable: boolean): string {
  const economy = new CityEconomy(structuredClone(city)); const quote = economy.quotePurchase(kind, quantity, districtId);
  const current = kind === 'packaging' ? city.packagingLevel : city.districts[districtId][kind];
  const name = config.equipment[kind].name;
  const before = 'beforeMultiplier' in quote ? `資材 ${formatMultiplier(quote.beforeMultiplier!)}倍` : `${formatMicro(('beforePerSecondMicro' in quote ? quote.beforePerSecondMicro : 0n)!)} ${kind === 'crews' ? '資材' : 'コイン'} /秒`;
  const after = 'afterMultiplier' in quote ? `資材 ${formatMultiplier(quote.afterMultiplier!)}倍` : `${formatMicro(('afterPerSecondMicro' in quote ? quote.afterPerSecondMicro : 0n)!)} ${kind === 'crews' ? '資材' : 'コイン'} /秒`;
  const capReached = current === quote.cap;
  const nextPrice = capReached ? null : formulas.nextPriceCoins(kind, current, districtId) * MICRO_UNIT;
  const short = nextPrice && nextPrice > city.coinsMicro ? nextPrice - city.coinsMicro : 0n;
  const reason = capReached ? `所有上限 ${quote.cap}` : short ? `不足 ${formatMicro(short)}コイン` : quote.limitedByFunds ? `残高内の ${quote.count}購入` : quote.limitedByCap ? `上限まで ${quote.count}購入` : '表示した数量・費用で購入';
  return `<article class="paper-card purchase-card"><h2>${name}</h2><div class="purchase-comparison"><div><span>現在 ${kind==='packaging'?'Lv':''}<strong id="purchase-current">${current}</strong></span><strong id="purchase-before-effect">${before}</strong></div><span aria-hidden="true">→</span><div><span>購入後 ${kind==='packaging'?'Lv':''}<strong id="purchase-after">${quote.after}</strong></span><strong id="purchase-after-effect">${after}</strong></div></div><p id="purchase-count">購入数量 ${quote.count}</p><p>合計 <strong id="purchase-cost">${formatMicro(quote.totalCostMicro)}</strong> コイン</p><p id="purchase-balance">残高 ${formatMicro(city.coinsMicro-quote.totalCostMicro)} コイン</p><p id="purchase-reason">${reason} · ${kind==='packaging'?'次の便から有効':'購入時から有効'}</p>${kind==='crews'?`<div class="transport-preview"><p id="purchase-queue">待ち ${formatMicro(('queueMicro' in quote?quote.queueMicro:0n)!)}資材</p><p id="purchase-wait">${!('queueMicro' in quote)||quote.queueMicro===0n?'輸送待ちなし':`${time(('beforeWaitMs' in quote?quote.beforeWaitMs:0n)!)} → ${time(('afterWaitMs' in quote?quote.afterWaitMs:0n)!)}`}</p><p>追加資材なしの見込み</p></div>`:''}<button class="button button-primary" data-action="city-purchase" ${quote.count===0||!writable||city.activeSession?'disabled':''}>${quote.count}購入</button></article>`;
}

export function districtDetail(city: CityState, id: DistrictId, writable: boolean): string {
  const summary = summarizeCity(city); const d = summary.districts.find(item => item.id === id)!; const plan=d.plan;
  const action = plan?.paused ? 'city-resume-plan' : 'city-pause-plan';
  return `<section class="district-detail-card city-control-panel"><div class="city-control-heading"><h2>建築 <span id="district-stage">${d.stage}/5</span></h2>${d.open?`<button class="button" data-action="choose-destination" data-district-id="${id}" aria-label="この地区へ届ける" ${!writable||city.activeSession?'disabled':''}>届け先にする</button>`:''}</div>${!d.open?`<h3>${d.name}の開通</h3><dl class="district-resources"><div><dt>段階合計</dt><dd>${summary.stageSum}/${d.unlockStageSum}</dd></div><div><dt>費用</dt><dd>${formatMicro(d.unlockCostMicro)}コイン</dd></div></dl><button class="button button-primary" data-action="city-open-district" data-district-id="${id}" ${!writable||!d.canOpen?'disabled':''}>${d.name}へ開通する</button>`:`<dl class="district-resources"><div><dt>輸送待ち</dt><dd id="district-queue">${formatMicro(d.queueMicro)}</dd></div><div><dt>自由在庫</dt><dd id="district-stock">${formatMicro(d.stockMicro)}</dd></div><div><dt>予約資材</dt><dd id="district-reserved">${formatMicro(plan?.reservedMicro??0n)}</dd></div><div><dt>店舗</dt><dd id="district-shops">${d.shops}/${d.shopCap}軒</dd></div></dl><section class="plan-card"><h3>${plan?`段階${plan.targetStage}への建築`:d.stage===5?'地区の開発が完了しました':`次は段階${d.nextPlan!.targetStage}へ`}</h3>${plan?`<p id="plan-state">${plan.paused?'一時停止中':'進行中'} · 予約 ${formatMicro(plan.reservedMicro)} / ${formatMicro(plan.requiredMicro)}</p><progress value="${Number(plan.reservedMicro*10000n/plan.requiredMicro)}" max="10000" aria-label="建築計画の進捗"></progress><p>前払い済み ${formatMicro(plan.paidCoinsMicro)}コイン</p><button class="button button-primary" data-action="${action}" data-district-id="${id}" aria-description="一時停止しても予約分は残り、その後に届く資材は自由在庫に入ります。" ${!writable||(plan.paused?!d.canResumePlan:!d.canPausePlan)?'disabled':''}>計画を${plan.paused?'再開':'一時停止'}する</button>`:d.nextPlan?`<dl class="city-plan-cost"><div><dt>必要資材</dt><dd>${formatMicro(d.nextPlan.materialsMicro)}</dd></div><div><dt>前払い</dt><dd>${formatMicro(d.nextPlan.coinsMicro)}コイン</dd></div></dl><button class="button button-primary" data-action="city-start-plan" data-district-id="${id}" ${!writable||!d.canStartPlan?'disabled':''}>建築計画を始める</button>`:'<p>設備や、ほかの地区を育てられます。</p>'}</section>`}</section>`;
}
export function districtEquipmentSummary(city: CityState, id: DistrictId): string {
  const d=summarizeCity(city).districts.find(item=>item.id===id)!;
  return `<dl class="city-map-readout" aria-label="地区の資材と物流"><div><dt>輸送</dt><dd>${formatMicro(d.transportPerSecondMicro)}資材/秒</dd></div><div><dt>営業</dt><dd>${formatMicro(d.shopIncomePerSecondMicro)}コイン/秒</dd></div><div><dt>在庫</dt><dd>${formatMicro(d.stockMicro)}資材</dd></div><div><dt>予約</dt><dd>${formatMicro(d.plan?.reservedMicro??0n)}資材</dd></div></dl>`;
}
export function specialEquipment(city: CityState, id: DistrictId, tab: 'railway' | 'synergies' | 'research', writable: boolean, selectedItemId?: string): string {
  const summary = summarizeCity(city);
  if (tab === 'railway') {
    const district = summary.districts.find(item => item.id === id)!;
    const conditions = [
      [district.stage>=config.railway.minimum_stage,`段階 ${district.stage}/${config.railway.minimum_stage}`],
      [district.crews>=config.railway.minimum_crews,`配送班 ${district.crews}/${config.railway.minimum_crews}`],
      [city.coinsMicro>=district.railwayCoinsMicro,`必要コイン ${formatMicro(district.railwayCoinsMicro)}`],
      [district.stockMicro>=district.railwayMaterialsMicro,`必要在庫 ${formatMicro(district.railwayMaterialsMicro)}`],
    ] as const;
    const preview = new CityEconomy(structuredClone(city));
    let afterRate = district.transportPerSecondMicro; let afterWait = district.waitMs;
    if (!district.railway && district.open) {
      const candidate = { ...city.districts[id], railway: true };
      afterRate = formulas.transportPerSecondMicro(candidate, city.research.logistics, city.synergies.includes('sorting_network'));
      // The canonical crew quote provides the same transport/wait calculation for a candidate state.
      preview.state.districts[id] = candidate;
      const quote = preview.quotePurchase('crews', 1, id); afterWait = ('beforeWaitMs' in quote ? quote.beforeWaitMs : 0n)!;
    }
    return `<section class="city-control-panel city-special-panel"><h2>貨物鉄道 · 輸送×4</h2><ul class="condition-list">${conditions.map(([met,label])=>`<li aria-label="${met?'達成':'未達成'}：${label}"><span>${label}</span><strong>${met?'済':'未'}</strong></li>`).join('')}</ul><div class="transport-preview"><p>輸送 ${formatMicro(district.transportPerSecondMicro)} → ${formatMicro(afterRate)}資材/秒</p><p>${district.queueMicro===0n?'輸送待ちなし':`待ち ${time(district.waitMs)} → ${time(afterWait)}`}</p></div>${district.stockMicro<district.railwayMaterialsMicro&&district.plan?`<button class="text-button" data-action="city-district" data-district-id="${id}" aria-description="計画を一時停止すると、その後の到着資材を自由在庫へ回せます。">予約 ${formatMicro(district.plan.reservedMicro)}資材は保持 · 計画を見る</button>`:`<p>予約 ${formatMicro(district.plan?.reservedMicro??0n)}資材は使いません</p>`}<button class="button button-primary" data-action="city-buy-railway" data-district-id="${id}" ${!writable||!district.canBuyRailway?'disabled':''}>${district.railway?'鉄道化済み':'貨物鉄道を購入する'}</button></section>`;
  }
  if (tab === 'synergies') {
    const effects = { joint_delivery: '到着報酬 2→3コイン/資材', sorting_network: '全路線の輸送力が2倍', tourism_service: '全店舗の営業収益が2倍' };
    const item=summary.synergies.find(item=>item.id===selectedItemId)??summary.synergies[0];
    return `<section class="city-control-panel city-special-panel"><h2>連携設備</h2><select id="special-equipment-item" aria-label="連携設備を選ぶ">${summary.synergies.map(option=>`<option value="${option.id}" ${option.id===item.id?'selected':''}>${option.name}</option>`).join('')}</select><p>${effects[item.id as keyof typeof effects]}</p><ul class="condition-list">${Object.entries(item.requires).map(([district,stage])=>`<li>${districtName(district)} ${city.districts[district].stage}/${stage}</li>`).join('')}</ul><p>費用 ${formatMicro(item.costMicro)}コイン</p><button class="button button-primary" data-action="city-buy-synergy" data-synergy-id="${item.id}" ${!writable||!item.canBuy?'disabled':''}>${item.owned?'購入済み':'連携設備を購入する'}</button></section>`;
  }
  const item=summary.research.find(item=>item.id===selectedItemId)??summary.research[0];
  return `<section class="city-control-panel city-special-panel"><div class="city-control-heading"><h2>恒久研究</h2><span>設計図 <strong id="research-blueprints">${city.blueprints}</strong></span></div><select id="special-equipment-item" aria-label="研究を選ぶ">${summary.research.map(option=>`<option value="${option.id}" ${option.id===item.id?'selected':''}>${option.name}</option>`).join('')}</select><p>ランク ${item.rank}/${item.maximumRank}</p><p>${formatMultiplier(item.multiplier)}倍 → ${formatMultiplier(item.nextMultiplier)}倍</p><p>${item.costBlueprints===null?'最大ランクです。':`必要な設計図 ${item.costBlueprints}枚`}</p><button class="button button-primary" data-action="city-buy-research" data-research-kind="${item.id}" ${!writable||!item.canBuy?'disabled':''}>${item.costBlueprints===null?'研究完了':'この研究を進める'}</button></section>`;
}

export function restartContent(city: CityState, writable: boolean): string {
  const preview = summarizeCity(city).newCity;
  return `<form method="dialog"><p class="eyebrow">A NEW TOWN, WITH WHAT YOU LEARNED</p><h2>新しい街への再出発</h2><p>再出発は、好きなタイミングで選べる任意の目標です。</p><ul data-page-children>${config.districts.map(item => `<li>${item.name} 段階 ${city.districts[item.id].stage}/3</li>`).join('')}</ul><p>この街の到着資材 ${formatMicro(city.cityArrivedMicro)} / 100,000</p><p>今回の設計図 <strong id="restart-blueprints">${preview.rewardBlueprints}</strong>枚</p><p>次は ${formatMicro(preview.nextRewardThresholdMicro)}到着で${preview.nextRewardBlueprints}枚。あと${formatMicro(preview.remainingToNextRewardMicro)}資材です。</p><h3>初期状態へ戻るもの</h3><p>コイン、輸送待ち、地区の資材と建築計画、建物、店舗、設備、路線、連携設備。</p><h3>次の街へ残るもの</h3><p>研究、未使用の設計図、切手、図鑑と練習成果、記録、設定。</p><label class="landscape-picker">次の街の景観<select id="restart-landscape"><option value="riverside">川沿い</option><option value="seaside">海辺</option><option value="highland">高原</option></select></label><p>景観による費用・収益の差はありません。</p><button class="button button-primary" value="cancel" autofocus>今の街へ戻る</button><button type="button" class="button" data-action="confirm-city-restart" ${!writable || !preview.canStart ? 'disabled' : ''}>内容を確認して新しい街へ進む</button><p id="restart-status" role="status"></p></form>`;
}
export function resultEconomy(city: CityState, sessionId: string): string {
  const summary = city.lastSessionSummary;
  if (!summary || summary.sessionId !== sessionId) return '';
  const completed = city.constructionHistory.filter(item => item.clockMs >= summary.startMs && item.clockMs <= summary.endMs);
  return `<section class="paper-card result-city" data-page-children><h2>街に届けたもの</h2>${completed.length ? `<p class="construction-result">${completed.map(item => `${districtName(item.districtId)}が段階${item.stage}になりました。`).join(' ')}</p>` : ''}<dl class="district-resources"><div><dt>今回作った資材</dt><dd id="result-generated">${formatMicro(summary.generatedMicro)}</dd></div><div><dt>この便の間に到着</dt><dd id="result-arrived">${formatMicro(summary.arrivedDuringSessionMicro)}</dd></div><div><dt>終了時点の輸送待ち</dt><dd id="result-queue">${formatMicro(summary.remainingQueueMicro)}</dd></div></dl><p>待っている資材は、この後も街に届きます。</p><details><summary>資材と収益の詳細</summary><p>到着報酬 ${formatMicro(summary.deliveryCoinsMicro)}コイン</p><p>営業収益 ${formatMicro(summary.shopCoinsMicro)}コイン</p><p>実経過 ${(summary.endMs - summary.startMs) / 1000}秒。一時停止中も街は進みます。</p><p>到着には、以前の便の輸送待ちも含まれます。</p></details><button class="button" data-action="equipment">街の設備へ</button></section>`;
}
