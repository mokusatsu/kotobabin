import config from '../../spec/initial/data/economy_config.json';
import catalogue from '../../spec/initial/data/city_catalog.json';
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
const candidateStageArt = new Set(['city_residential_s2', 'city_residential_s3', 'city_residential_s4', 'city_residential_s5', 'city_market_s1']);
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
  const shop = id === 'residential' && city.districts[id].shops > 0;
  return `<figure class="district-figure ${extraClass}"><div class="district-composite"><img class="district-base-art" src="${asset(art.path)}" alt="${districtName(id)} ${art.ready ? `段階${art.stage}の外観` : '地区の区画'}">${scaffold ? `<img class="district-scaffold-art" src="${asset('construction/scaffold_small.webp')}" alt="建築中の足場">` : ''}${shop ? `<img class="district-shop-art" src="${asset('shop_scene/shop_residential.webp')}" alt="住宅地の代表店舗">` : ''}</div><figcaption>${districtName(id)} · 段階 ${art.stage}/5${art.candidate ? '<span class="art-pending">外観は調整中です。</span>' : art.ready ? '' : '<span class="art-pending">この段階の外観は制作中です。</span>'}</figcaption></figure>`;
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
export function homeTown(city: CityState, destination: DistrictId): string {
  const selected = city.districts[destination];
  const missingArt = config.districts.some(item => !districtArtwork(city, item.id).ready);
  const openCount = Object.values(city.districts).filter(district => district.open).length;
  const routes = catalogue.map_layout.routes.map(route => {
    const state = city.districts[route.district_id];
    return `<polyline points="${route.points.map(point => point.join(',')).join(' ')}" class="city-route ${state.open ? 'open' : 'locked'} ${state.railway ? 'railway' : ''}"/>`;
  }).join('');
  const vehicles = catalogue.map_layout.routes.map(route => {
    const district = city.districts[route.district_id];
    if (!district.open || district.railway || district.crews < 1 || district.crews >= 10) return '';
    const point = district.queueMicro > 0n ? route.points[1] : route.points[route.points.length - 1];
    const direction = district.queueMicro > 0n ? route.points[2] : route.points[route.points.length - 1];
    const dx = direction[0] - point[0]; const dy = direction[1] - point[1];
    const sprite = dy < 0 ? 'vehicle_cart_rear' : 'vehicle_cart_front';
    return `<g transform="translate(${point[0]} ${point[1]})"><ellipse cx="0" cy="1" rx="16" ry="4" fill="#203d36" opacity=".16"/><g transform="scale(${dx < 0 ? -1 : 1} 1)"><image href="${asset(`vehicle/${sprite}.webp`)}" x="-24" y="-30" width="48" height="36"/></g></g>`;
  }).join('');
  const scaffolds = config.districts.map(item => {
    const district = city.districts[item.id]; if (!district.plan || district.plan.targetStage !== 1) return '';
    const anchor = catalogue.map_layout.anchors[item.id as keyof typeof catalogue.map_layout.anchors];
    return `<image href="${asset('construction/scaffold_small.webp')}" x="${anchor.x - 132}" y="${anchor.y - 165}" width="264" height="198"/>`;
  }).join('');
  const residentialAnchor = catalogue.map_layout.anchors.residential;
  const shop = city.districts.residential.shops > 0 ? `<image href="${asset('shop_scene/shop_residential.webp')}" x="${residentialAnchor.x - 110.375}" y="${residentialAnchor.y - 47.75}" width="64" height="64"/>` : '';
  const candidateArt = config.districts.some(item => districtArtwork(city, item.id).candidate);
  const art = config.districts.map(item => {
    const anchor = catalogue.map_layout.anchors[item.id as keyof typeof catalogue.map_layout.anchors]; const image = districtArtwork(city, item.id);
    return `<image href="${asset(image.path)}" x="${anchor.x - 132}" y="${anchor.y - 165}" width="264" height="198" opacity="${city.districts[item.id].open ? 1 : .35}"/>`;
  }).join('');
  return `<section class="town-panel" data-page-children aria-labelledby="town-heading"><div class="town-heading"><div><p class="eyebrow">YOUR TOWN</p><h2 id="town-heading">${landscapeName(city.landscape)}の街</h2></div><span class="opened-label">開通 <strong>${openCount}</strong> / 6</span></div><div class="town-map canonical-map"><svg viewBox="0 0 1600 1000" aria-label="6地区の街の地図"><image href="${asset('terrain/terrain_riverside.webp')}" width="1600" height="1000"/><g class="city-routes">${routes}</g><image href="${asset('city_shared/city_hub.webp')}" x="696" y="398" width="128" height="128"/>${art}${scaffolds}${shop}${vehicles}</svg>${config.districts.map(item => {
    const district = city.districts[item.id]; const anchor = catalogue.map_layout.anchors[item.id as keyof typeof catalogue.map_layout.anchors];
    return `<button class="map-label ${district.open ? '' : 'locked'} ${item.id === destination ? 'selected' : ''}" style="left:${anchor.x / 16}%;top:${(anchor.y + 40) / 10}%" data-action="city-district" data-district-id="${item.id}" aria-label="${item.name}の詳細"><strong>${item.name}</strong><small>${district.open ? `段階${district.stage}/5${item.id === destination ? ' · 選択中' : ''}` : '未開通'}</small></button>`;
  }).join('')}</div><section class="compact-town" data-page-children hidden aria-label="地区一覧">${districtFigure(city, destination, 'selected-district-figure')}<ul data-page-children>${config.districts.map(item => { const district = city.districts[item.id]; return `<li><button class="district-list-button ${item.id === destination ? 'selected' : ''}" data-action="city-district" data-district-id="${item.id}"><strong>${item.name}</strong><span>${district.open ? `段階${district.stage}/5${item.id === destination ? ' · 選択中' : ''}` : `未開通 · 段階合計${item.unlock_stage_sum}が必要`}</span></button></li>`; }).join('')}</ul></section><div class="development-note"><div><strong id="city-stage-summary">${districtName(destination)} ${selected.stage}/5</strong><p>${selected.plan ? `段階${selected.plan.targetStage}へ · ${selected.plan.paused ? '計画を一時停止中' : '計画を進行中'} · 予約資材 ${formatMicro(selected.plan.reservedMicro)} / ${formatMicro(selected.plan.requiredMicro)}` : selected.stage === 5 ? 'この地区の開発は完了しました。' : '次の建築計画を選べます。'}</p></div><button class="button" data-action="city">街の詳細へ</button></div>${candidateArt ? '<p class="art-pending">一部の地区画は調整中です。開発段階は数値で確認できます。</p>' : ''}${missingArt ? '<p class="art-pending">未制作の地区外観は、共通の区画で仮表示しています。開発段階は数値で確認できます。</p>' : ''}${city.landscape === 'riverside' ? '' : '<p class="art-pending">選択した景観の原画は制作中です。地形には川沿いの仮表示を使っています。</p>'}</section>`;
}
export function cityShell(city: CityState, district: DistrictId): string {
  return `<main id="main" class="city-page"><div class="section-heading"><div><p class="eyebrow">A TOWN THAT GROWS</p><h1>街の開発</h1><p>届いた資材を、次の灯りへ。</p></div><button class="text-button" data-action="city-back">戻る →</button></div><div id="city-balance-strip">${balanceStrip(city)}</div><div class="city-detail-layout"><nav class="city-district-nav" aria-label="地区">${config.districts.map(item => `<button class="button ${district === item.id ? 'selected' : ''}" data-action="city-district" data-district-id="${item.id}" ${district === item.id ? 'aria-current="true"' : ''}>${item.name}</button>`).join('')}</nav><section id="district-detail"></section></div><div class="city-page-actions"><button class="button" data-action="equipment">街の設備へ</button><button class="button" data-action="new-city">新しい街について</button></div><p class="city-command-status" id="city-command-status" role="status"></p><p class="save-status" data-save-status></p></main>`;
}
export function equipmentShell(city: CityState, district: DistrictId, kind: EquipmentTab, quantity: PurchaseQuantity): string {
  const tabs: [EquipmentTab, string][] = [['packaging', '荷づくり台'], ['crews', '配送班'], ['shops', '店舗'], ['railway', '貨物鉄道'], ['synergies', '連携設備'], ['research', '恒久研究']];
  return `<main id="main" class="equipment-page"><div class="section-heading"><div><p class="eyebrow">MAKE THE NEXT DELIVERY BETTER</p><h1>街の設備</h1><p>作る・運ぶ・稼ぐ。次に伸ばす力を選びましょう。</p></div><button class="text-button" data-action="city-back">戻る →</button></div><div id="city-balance-strip">${balanceStrip(city)}</div><div class="equipment-layout"><nav class="equipment-tabs" aria-label="設備の種類">${tabs.map(([id, name]) => `<button class="button ${kind === id ? 'selected' : ''}" data-action="equipment-kind" data-kind="${id}" ${kind === id ? 'aria-current="true"' : ''}>${name}</button>`).join('')}</nav><section class="equipment-main"><div class="equipment-controls"><label>対象地区<select id="equipment-district">${destinationOptions(city, district)}</select></label><fieldset><legend>購入数量</legend><div class="setting-options">${([1, 10, 'max'] as const).map(value => `<label><input type="radio" name="purchase-quantity" value="${value}" ${quantity === value ? 'checked' : ''}> ${value === 'max' ? '買えるだけ' : value}</label>`).join('')}</div></fieldset></div><div id="equipment-content"></div></section><aside id="equipment-district-summary"></aside></div><p class="city-command-status" id="city-command-status" role="status"></p><p class="save-status" data-save-status></p></main>`;
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
  const reason = capReached ? `${kind === 'shops' ? `段階${city.districts[districtId].stage}で上限${quote.cap}軒。${city.districts[districtId].stage === 5 ? '最大上限に達しました。' : '次の開発で上限が広がります。'}` : '上限に達しました。'}` : short ? `次の1つに ${formatMicro(short)}コイン不足しています。` : quote.limitedByFunds ? '残高で買える実際の数量を表示しています。' : quote.limitedByCap ? '上限までの実際の数量を表示しています。' : '表示した数量と合計費用で購入します。';
  return `<article class="paper-card purchase-card"><h2>${name}</h2>${kind === 'packaging' && current === 0 ? `<img class="packaging-art" src="${asset('equipment_scene/equipment_packaging_0.webp')}" alt="手包みの敷き布と荷物">` : ''}<div class="purchase-comparison"><div><span>現在 ${kind === 'packaging' ? 'Lv' : ''}<strong id="purchase-current">${current}</strong></span><strong id="purchase-before-effect">${before}</strong></div><span aria-hidden="true">→</span><div><span>購入後 ${kind === 'packaging' ? 'Lv' : ''}<strong id="purchase-after">${quote.after}</strong></span><strong id="purchase-after-effect">${after}</strong></div></div><p id="purchase-count">購入数量 ${quote.count}</p><p>合計 <strong id="purchase-cost">${formatMicro(quote.totalCostMicro)}</strong> コイン</p><p id="purchase-balance">購入後の残高 ${formatMicro(city.coinsMicro - quote.totalCostMicro)} コイン</p><p id="purchase-reason">${reason}</p>${kind === 'crews' ? `<div class="transport-preview"><p id="purchase-queue">輸送待ち ${formatMicro(('queueMicro' in quote ? quote.queueMicro : 0n)!)}資材</p><p id="purchase-wait">${!('queueMicro' in quote) || quote.queueMicro === 0n ? '現在は輸送待ちなし' : `待ちの解消 ${time(('beforeWaitMs' in quote ? quote.beforeWaitMs : 0n)!)} → ${time(('afterWaitMs' in quote ? quote.afterWaitMs : 0n)!)}`}</p><p>新しい資材を追加しない場合の見込みです。</p></div>` : ''}<p class="setting-note">${kind === 'packaging' ? 'この強化は、次に始める便から有効です。' : '購入した時点から、輸送待ちや店舗の営業に反映します。'}タイピング得点は変わりません。</p><button class="button button-primary" data-action="city-purchase" ${quote.count === 0 || !writable || city.activeSession ? 'disabled' : ''}>${quote.count}購入</button></article>`;
}

export function districtDetail(city: CityState, id: DistrictId, writable: boolean): string {
  const summary = summarizeCity(city); const district = summary.districts.find(item => item.id === id)!;
  const plan = district.plan;
  return `<article class="paper-card district-detail-card"><div class="district-detail-heading"><div><h2>${district.name}</h2><p>開発段階 <strong id="district-stage">${district.stage}/5</strong> · ${district.open ? '開通済み' : '未開通'}</p></div>${district.open ? `<button class="button" data-action="choose-destination" data-district-id="${id}" ${!writable || city.activeSession ? 'disabled' : ''}>この地区へ届ける</button>` : ''}</div>${districtFigure(city, id)}${!district.open ? `<section class="unlock-requirements"><h3>開通に必要なもの</h3><p>この街の段階合計 ${summary.stageSum} / ${district.unlockStageSum}</p><p>開通費 ${formatMicro(district.unlockCostMicro)}コイン · 所持 ${formatMicro(city.coinsMicro)}</p><button class="button button-primary" data-action="city-open-district" data-district-id="${id}" ${!writable || !district.canOpen ? 'disabled' : ''}>${district.name}へ開通する</button></section>` : `<dl class="district-resources"><div><dt>輸送待ち</dt><dd id="district-queue">${formatMicro(district.queueMicro)}資材</dd></div><div><dt>自由在庫</dt><dd id="district-stock">${formatMicro(district.stockMicro)}資材</dd></div><div><dt>建築へ予約済み</dt><dd id="district-reserved">${formatMicro(plan?.reservedMicro ?? 0n)}資材</dd></div><div><dt>店舗</dt><dd id="district-shops">${district.shops}/${district.shopCap}軒</dd></div><div><dt>輸送力</dt><dd>${formatMicro(district.transportPerSecondMicro)}資材/秒</dd></div><div><dt>地区の営業収益</dt><dd>${formatMicro(district.shopIncomePerSecondMicro)}コイン/秒</dd></div></dl><section class="plan-card"><h3>${plan ? `段階${plan.targetStage}への建築計画` : district.stage === 5 ? '地区の開発が完了しました' : `次は段階${district.nextPlan!.targetStage}へ`}</h3>${plan ? `<p id="plan-state">${plan.paused ? '一時停止中' : '進行中'} · 予約資材 ${formatMicro(plan.reservedMicro)} / ${formatMicro(plan.requiredMicro)}</p><progress value="${Number(plan.reservedMicro * 10000n / plan.requiredMicro)}" max="10000" aria-label="建築計画の進捗"></progress><p>前払い済み ${formatMicro(plan.paidCoinsMicro)}コイン</p><p>一時停止しても予約分は残ります。その後に届く資材は自由在庫へ入ります。</p><button class="button" data-action="${plan.paused ? 'city-resume-plan' : 'city-pause-plan'}" data-district-id="${id}" ${!writable || (plan.paused ? !district.canResumePlan : !district.canPausePlan) ? 'disabled' : ''}>計画を${plan.paused ? '再開' : '一時停止'}する</button>` : district.nextPlan ? `<p>必要な資材 ${formatMicro(district.nextPlan.materialsMicro)}</p><p>開始時に前払い ${formatMicro(district.nextPlan.coinsMicro)}コイン</p><button class="button button-primary" data-action="city-start-plan" data-district-id="${id}" ${!writable || !district.canStartPlan ? 'disabled' : ''}>建築計画を始める</button>${!district.canStartPlan && summary.canInvest ? '<p>開始には表示したコインが必要です。</p>' : ''}` : '<p>次の計画はありません。設備や、ほかの地区の発展を選べます。</p>'}</section>`}</article>`;
}
export function districtEquipmentSummary(city: CityState, id: DistrictId): string {
  const district = summarizeCity(city).districts.find(item => item.id === id)!;
  return `<section class="paper-card equipment-district-card"><h2>${district.name}</h2><p>段階 ${district.stage}/5 · 店舗 ${district.shops}/${district.shopCap}軒</p><p>輸送力 ${formatMicro(district.transportPerSecondMicro)}資材/秒</p><p>輸送待ち ${formatMicro(district.queueMicro)}資材</p><p>営業収益 ${formatMicro(district.shopIncomePerSecondMicro)}コイン/秒</p><p>自由在庫 ${formatMicro(district.stockMicro)}資材</p><p>予約資材 ${formatMicro(district.plan?.reservedMicro ?? 0n)}資材</p><button class="text-button" data-action="city-district" data-district-id="${id}">開発計画を見る →</button></section>`;
}
export function specialEquipment(city: CityState, id: DistrictId, tab: 'railway' | 'synergies' | 'research', writable: boolean): string {
  const summary = summarizeCity(city);
  if (tab === 'railway') {
    const district = summary.districts.find(item => item.id === id)!;
    const conditions = [
      [district.stage >= config.railway.minimum_stage, `地区段階 ${district.stage}/${config.railway.minimum_stage}`],
      [district.crews >= config.railway.minimum_crews, `配送班 ${district.crews}/${config.railway.minimum_crews}班`],
      [city.coinsMicro >= district.railwayCoinsMicro, `コイン ${formatMicro(city.coinsMicro)} / ${formatMicro(district.railwayCoinsMicro)}`],
      [district.stockMicro >= district.railwayMaterialsMicro, `自由在庫 ${formatMicro(district.stockMicro)} / ${formatMicro(district.railwayMaterialsMicro)}資材`],
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
    return `<article class="paper-card"><h2>${district.name}の貨物鉄道</h2><p>${district.railway ? '購入済み' : 'この路線の輸送力が4倍になります。'}</p><ul class="condition-list">${conditions.map(([met, label]) => `<li><strong>${met ? '達成' : '必要'}</strong> ${label}</li>`).join('')}</ul><p>輸送力 ${formatMicro(district.transportPerSecondMicro)} → ${formatMicro(afterRate)}資材/秒</p><p>${district.queueMicro === 0n ? '現在は輸送待ちなし' : `待ちの解消 ${time(district.waitMs)} → ${time(afterWait)}（新しい資材を追加しない場合）`}</p><p>建築へ予約済みの ${formatMicro(district.plan?.reservedMicro ?? 0n)}資材は使いません。</p>${district.stockMicro < district.railwayMaterialsMicro && district.plan ? `<button class="text-button" data-action="city-district" data-district-id="${id}">計画を一時停止して自由在庫へ回す →</button>` : ''}<button class="button button-primary" data-action="city-buy-railway" data-district-id="${id}" ${!writable || !district.canBuyRailway ? 'disabled' : ''}>${district.railway ? '鉄道化済み' : '貨物鉄道を購入する'}</button></article>`;
  }
  if (tab === 'synergies') {
    const effects = { joint_delivery: '到着資材1あたりの報酬が2→3コイン', sorting_network: '全路線の輸送力が2倍', tourism_service: '全店舗の営業収益が2倍' };
    return `<div class="special-equipment-grid">${summary.synergies.map(item => `<article class="paper-card"><h2>${item.name}</h2><p>${effects[item.id as keyof typeof effects]}</p><ul>${Object.entries(item.requires).map(([district, stage]) => `<li>${districtName(district)} 段階${city.districts[district].stage}/${stage}</li>`).join('')}</ul><p>費用 ${formatMicro(item.costMicro)}コイン</p><button class="button button-primary" data-action="city-buy-synergy" data-synergy-id="${item.id}" ${!writable || !item.canBuy ? 'disabled' : ''}>${item.owned ? '購入済み' : '連携設備を購入する'}</button></article>`).join('')}</div>`;
  }
  return `<p>設計図の残り <strong id="research-blueprints">${city.blueprints}</strong>枚。研究と未使用の設計図は、新しい街へ引き継ぎます。</p><div class="special-equipment-grid">${summary.research.map(item => `<article class="paper-card"><h2>${item.name}</h2><p>ランク ${item.rank}/${item.maximumRank}</p><p>${formatMultiplier(item.multiplier)}倍 → ${formatMultiplier(item.nextMultiplier)}倍</p><p>${item.costBlueprints === null ? '最大ランクです。' : `次のランクに設計図 ${item.costBlueprints}枚`}</p><button class="button button-primary" data-action="city-buy-research" data-research-kind="${item.id}" ${!writable || !item.canBuy ? 'disabled' : ''}>${item.costBlueprints === null ? '研究完了' : 'この研究を進める'}</button></article>`).join('')}</div>`;
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
