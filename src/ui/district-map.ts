import catalogue from '../../spec/initial/data/city_catalog.json';
import config from '../../spec/initial/data/economy_config.json';
import type { CityState, DistrictId } from '../economy';

export type DistrictMapFeature = 'plan' | 'shops' | 'crews' | 'railway' | 'packaging' | 'research' | 'synergies';
export interface DistrictMapOptions { interactive?: boolean; selectedFeature?: DistrictMapFeature }
export interface DistrictMapControllerOptions { onSelect?: (feature: DistrictMapFeature, district: DistrictId) => void }
const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const stages = new Set(['city_residential_s1', 'city_residential_s2', 'city_residential_s3', 'city_residential_s4', 'city_residential_s5', 'city_market_s1']);
const shops = new Set(['residential']);
const positions: Record<DistrictMapFeature, readonly [number, number]> = {
  plan: [50, 52], shops: [19, 68], crews: [81, 67], railway: [81, 87], packaging: [19, 24], research: [82, 23], synergies: [48, 88],
};
const features = Object.keys(positions) as DistrictMapFeature[];
const image = (path: string, x: number, y: number, width: number, height: number) => `<image href="${asset(path)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
const plot = (x: number, y: number, width = 160) => `<g transform="translate(${x} ${y})" class="dm-empty-plot"><path d="M0 0l${width / 2} -32 ${width / 2} 32 -${width / 2} 32z"/><path d="M0 0v-14m${width / 2} -18v-14m${width / 2} 46v-14m-${width / 2} 46v-14"/></g>`;

/** Explicit schematic silhouettes are used only where a district's original art does not exist. */
function schematic(id: DistrictId, stage: number): string {
  const elements = Array.from({ length: stage }, (_, index) => {
    const x = 440 + (index % 3) * 112; const y = 280 + Math.floor(index / 3) * 78;
    const roof = `<path d="M${x - 38} ${y}l50 -28 50 28 -50 28z"/>`;
    if (id === 'park') return `<g class="dm-schematic-tree"><ellipse cx="${x + 10}" cy="${y + 60}" rx="40" ry="16"/><path d="M${x + 10} ${y + 40}v-65"/><circle cx="${x + 10}" cy="${y - 24}" r="34"/></g>`;
    if (id === 'harbor') return `<g class="dm-schematic-building"><path d="M${x} ${y + 55}v-95h72v24m-70 -16 62 0m-42 0v80m48 -64v38"/>${roof}<path d="M${x + 12} ${y + 28}v34"/></g>`;
    if (id === 'station') return `<g class="dm-schematic-building">${roof}<path d="M${x - 38} ${y}v60l50 28 50 -28v-60m-78 72v-40q28 -30 56 0v40"/></g>`;
    return `<g class="dm-schematic-building">${roof}<path d="M${x - 38} ${y}v60l50 28 50 -28v-60m-50 28v60m-30 -55v18m60 -18v18"/>${id === 'workshop' ? `<path d="M${x + 42} ${y - 10}v-54h18v66"/>` : ''}</g>`;
  }).join('');
  return `<g data-art-kind="schematic">${elements}</g>`;
}
/** Normalized artwork geometry shared by world and district cameras. */
export const DISTRICT_CORE_BOUNDS = { x: 330, y: 70, width: 540, height: 405, anchorX: 600, anchorY: 407.5 } as const;
export function renderDistrictCore(city: CityState, id: DistrictId): string {
  const stage = city.districts[id].stage;
  const artId = `city_${id}_s${stage}`;
  return `<g data-district-core="${id}" data-stage="${stage}">${stage === 0 ? image('city_plot/city_plot_empty.webp', 330, 70, 540, 405)
    : stages.has(artId) ? image(`city_stage/${artId}.webp`, 330, 70, 540, 405) : schematic(id, stage)}</g>`;
}
/** Physical rack/bay occupancy shows every owned unit, including purchases beyond the representative art. */
function capacityRack(feature: 'shops' | 'crews' | 'packaging', value: number, x: number, y: number): string {
  const maximum = config.equipment[feature].maximum;
  const width = 220; const filled = width * value / maximum;
  return `<g class="dm-capacity-rack" data-capacity-feature="${feature}" data-value="${value}" data-maximum="${maximum}" transform="translate(${x} ${y})"><rect class="dm-rack-empty" width="${width}" height="18" rx="3"/><rect class="dm-rack-filled" width="${filled}" height="18" rx="3"/>${config.equipment.milestones.map(mark => `<path class="${value >= mark ? 'reached' : ''}" d="M${width * mark / maximum} -3v24"/>`).join('')}</g>`;
}
function packaging(level: number): string {
  const parcels = Math.min(6, level);
  return `<g transform="translate(145 110)" class="dm-packaging" data-visual-feature="packaging" data-scope="city" data-level="${level}"><path d="M-70 45l100 -45 105 45 -100 48z"/><path d="M-70 45v22l100 49 105 -49v-22m-120 64v30m100 -75v30m-160 -45v30"/>${Array.from({ length: parcels }, (_, i) => `<path class="dm-parcel" d="M${-35 + i * 23} 39v-30l22 -10 22 10v30l-22 11z"/>`).join('')}${level >= 5 ? '<path class="dm-machine" d="M-55 20v-54h110v54m-90 -40h70v24h-70z"/>' : ''}${level >= 15 ? '<path class="dm-machine" d="M80 10v-60h22v60m-12 -56h60v18h-60"/>' : ''}</g>${capacityRack('packaging', level, 75, 265)}`;
}
function fleet(city: CityState, id: DistrictId): string {
  const district = city.districts[id];
  if (!district.open || !district.crews) return '';
  const units = Math.min(4, district.crews);
  return `<g class="dm-fleet" data-visual-feature="crews" data-district-id="${id}" data-crews="${district.crews}">${Array.from({ length: units }, (_, index) => {
    const x = 840 + (index % 2) * 90; const y = 400 + Math.floor(index / 2) * 48;
    if (district.crews < 10) return image('vehicle/vehicle_cart_front.webp', x, y, 88, 66);
    return `<g transform="translate(${x} ${y})" class="dm-schematic-truck"><path d="M0 0l50 -24 32 16v42l-50 24 -32 -16z"/><path d="M0 0v42m32 -18v34m0 -34 50 -24m-50 24 -32 -24"/><circle cx="16" cy="44" r="8"/><circle cx="65" cy="39" r="8"/></g>`;
  }).join('')}</g>${capacityRack('crews', district.crews, 845, 545)}`;
}
function railway(owned: boolean): string {
  if (!owned) return '<path class="dm-route" data-visual-feature="railway" data-owned="false" d="M1180 610H860L700 690H60"/>';
  return `<g class="dm-railway" data-visual-feature="railway" data-owned="true"><path d="M1180 598H860L700 678H60M1180 622H860L700 702H60"/>${Array.from({ length: 28 }, (_, i) => `<path d="M${70 + i * 24} 670v40"/>`).join('')}<g transform="translate(870 580)"><path class="dm-train" d="M0 0h90v40H0zM90 12h38v28H90zM18 0v-22h22V0"/><circle cx="20" cy="42" r="10"/><circle cx="70" cy="42" r="10"/><circle cx="113" cy="42" r="10"/></g></g>`;
}
function research(city: CityState): string {
  return `<g class="dm-research" data-visual-feature="research" data-scope="city" transform="translate(970 90)" data-materials="${city.research.materials}" data-logistics="${city.research.logistics}" data-commerce="${city.research.commerce}"><path d="M-75 30l70 -35 90 40 -70 35zM-75 30v42l90 40 70 -35V35"/>${(['materials', 'logistics', 'commerce'] as const).map((kind, i) => {
    const rank = city.research[kind];
    return `<g class="${rank ? 'active' : ''}" transform="translate(${-48 + i * 42} 15)"><path d="M0 0v-${16 + Math.min(10, rank) * 3}h22v${16 + Math.min(10, rank) * 3}"/>${Array.from({ length: Math.min(5, rank) }, (_, j) => `<path d="M3 -${6 + j * 6}h16"/>`).join('')}</g>`;
  }).join('')}</g>`;
}
function synergies(city: CityState): string {
  const ids = ['joint_delivery', 'sorting_network', 'tourism_service'];
  return `<g class="dm-synergies" data-visual-feature="synergies" data-scope="city" transform="translate(515 590)">${ids.map((id, i) => `<g class="${city.synergies.includes(id) ? 'active' : ''}" data-synergy-id="${id}" data-owned="${city.synergies.includes(id)}" transform="translate(${i * 65} 0)"><path d="M0 15l25 -14 25 14v35l-25 14 -25 -14z"/><path d="M0 15l25 14 25 -14m-25 14v35"/>${city.synergies.includes(id) ? '<path class="dm-active-link" d="M9 36l11 9 20 -23"/>' : ''}</g>`).join('')}</g>`;
}

/** Pure rendering: no prices, resource generation, mutations or persistence. */
export function renderDistrictMap(city: CityState, id: DistrictId, options: DistrictMapOptions = {}): string {
  const district = city.districts[id];
  const definition = catalogue.districts.find(item => item.id === id)!;
  const stage = definition.stage_entries.find(item => item.stage === district.stage)!;
  const anchor = catalogue.map_layout.anchors[definition.id as keyof typeof catalogue.map_layout.anchors];
  const artId = `city_${id}_s${district.stage}`;
  const actualArt = district.stage > 0 && stages.has(artId);
  const core = renderDistrictCore(city, id);
  const shopArt = district.shops > 0 ? shops.has(id) ? image(`shop_scene/shop_${id}.webp`, 100, 345, 200, 200)
    : `<g class="dm-shop-schematic" transform="translate(150 365)"><path d="M-45 15l65 -34 65 34 -65 34zM-45 15v80l65 34 65 -34V15m-65 34v80M-30 75l40 20V58l-40 -20z"/>${Array.from({ length: Math.min(6, district.shops) }, (_, i) => `<path d="M${-25 + i * 14} 5v25"/>`).join('')}</g>` : plot(120, 440, 200);
  const names: Record<DistrictMapFeature, string> = {
    plan: district.open ? district.stage === 0 ? '空き区画 · 建築計画' : `${definition.name} ${district.stage}/5` : '未開通の区画',
    shops: `店舗 ${district.shops}軒`, crews: `配送班 ${district.crews}班`, railway: district.railway ? '貨物鉄道' : '配送路',
    packaging: `荷づくり台 Lv.${city.packagingLevel}`, research: `研究 ${city.research.materials} / ${city.research.logistics} / ${city.research.commerce}`,
    synergies: `街の連携 ${city.synergies.length}/3`,
  };
  const controls = features.map(feature => {
    const [x, y] = positions[feature];
    return `<button type="button" class="dm-feature ${options.selectedFeature === feature ? 'selected' : ''}" style="--dm-x:${x}%;--dm-y:${y}%" data-action="district-feature" data-feature="${feature}" data-district-id="${id}" aria-pressed="${options.selectedFeature === feature}" aria-label="${escape(`${definition.name}、${names[feature]}の詳細`)}" ${options.interactive === false ? 'disabled' : ''}>${escape(names[feature])}</button>`;
  }).join('');
  return `<figure class="district-map" data-district-id="${id}" data-stage="${district.stage}" data-open="${district.open}" data-world-x="${anchor.x}" data-world-y="${anchor.y}" aria-label="${definition.name}の全体図"><div class="district-map-canvas"><div class="dm-map-board"><div class="dm-camera-layer"><svg class="dm-scene" viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><pattern id="dm-paper-${id}" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M0 24L24 0" stroke="#697c5a" stroke-opacity=".025"/></pattern></defs><rect class="dm-ground" data-map-bounds="district" x="12" y="12" width="1176" height="736" rx="72"/><rect x="12" y="12" width="1176" height="736" rx="72" fill="url(#dm-paper-${id})"/>${id === 'harbor' ? '<path class="dm-water" d="M1140 10q-80 320 20 450t-60 290h100V10z"/><path class="dm-pier" d="M1060 430l115 50v30l-115 -50z"/>' : ''}<path class="dm-walkway" d="M250 190L580 355 970 160M580 355L950 525M580 355L245 530"/>${plot(420, 205)}${plot(730, 235)}${plot(410, 455)}${railway(district.railway)}<g data-visual-feature="plan" data-stage="${district.stage}">${core}</g>${district.plan ? `<g class="dm-construction ${district.plan.paused ? 'paused' : ''}" data-plan-target="${district.plan.targetStage}" data-plan-paused="${district.plan.paused}">${image('construction/scaffold_small.webp', 320, 57.5, 560, 420)}<path class="dm-construction-rope" d="M370 390L600 280 830 390"/></g>` : ''}<g data-visual-feature="shops" data-shops="${district.shops}" data-district-id="${id}">${shopArt}${Array.from({ length: Math.min(6, district.shops) }, (_, i) => `<path class="dm-shop-annex" d="M${70 + i * 37} 555l18 -12 18 12v24h-36z"/>`).join('')}${capacityRack('shops', district.shops, 75, 600)}</g>${fleet(city, id)}${packaging(city.packagingLevel)}${research(city)}${synergies(city)}${district.queueMicro > 0n ? '<g class="dm-waiting-cargo"><path d="M780 480v-30l30 -15 30 15v30l-30 15zM810 465v30m-30 -45 30 15 30 -15"/><path d="M815 500v-30l30 -15 30 15v30l-30 15z"/></g>' : ''}</svg></div><div class="dm-feature-layer">${controls}</div></div></div><figcaption class="dm-caption"><strong>${definition.name}</strong><span>${escape(stage.stage_name)}${district.plan ? ` · ${district.plan.paused ? '計画は一時停止中' : '建築中'}` : ''}</span><span class="dm-art-note">${actualArt ? '地区原画は候補版' : district.stage === 0 ? '建物のない区画' : '地区外観は模式図'} · 設備の配置は模式図（街共通設備を含む）</span></figcaption></figure>`;
}

/** Delegated controls survive map repaint. Enter/Space use native buttons; arrows follow the map. */
export function installDistrictMap(root: HTMLElement, options: DistrictMapControllerOptions = {}): () => void {
  const abort = new AbortController();
  root.addEventListener('click', event => {
    const button = (event.target as Element).closest<HTMLButtonElement>('.district-map [data-feature]');
    if (button && !button.disabled) options.onSelect?.(button.dataset.feature as DistrictMapFeature, button.dataset.districtId as DistrictId);
  }, { signal: abort.signal });
  root.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const button = (event.target as Element).closest<HTMLButtonElement>('.district-map [data-feature]');
    if (!button) return;
    const buttons = [...button.closest('.district-map')!.querySelectorAll<HTMLButtonElement>('[data-feature]:not(:disabled)')];
    const current = button.dataset.feature as DistrictMapFeature;
    let next: HTMLButtonElement | undefined;
    if (event.key === 'Home') next = buttons[0];
    else if (event.key === 'End') next = buttons.at(-1);
    else {
      const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key];
      if (!direction) return;
      const [x, y] = positions[current];
      next = buttons.filter(candidate => candidate !== button).map(candidate => {
        const point = positions[candidate.dataset.feature as DistrictMapFeature]; const dx = point[0] - x; const dy = point[1] - y;
        const forward = dx * direction[0] + dy * direction[1]; const cross = Math.abs(dx * direction[1] - dy * direction[0]);
        return { button: candidate, score: forward > 0 ? forward + cross * 3 : Infinity };
      }).sort((a, b) => a.score - b.score).find(candidate => Number.isFinite(candidate.score))?.button;
    }
    if (next) { event.preventDefault(); next.focus({ preventScroll: true }); }
  }, { signal: abort.signal });
  return () => abort.abort();
}

/** The source is the actual selected world-map tile; the final frame always contains the whole district. */
export function animateDistrictEntry(element: HTMLElement, source: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, reducedMotion = false): Animation | null {
  if (reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !element.animate) return null;
  const layer = element.querySelector<HTMLElement>('.dm-camera-layer');
  const scene = layer?.querySelector<SVGElement>('.dm-scene');
  if (!layer || !scene) return null;
  const target = layer.getBoundingClientRect();
  if (!target.width || !target.height || !source.width || !source.height) return null;
  const dx = source.left + source.width / 2 - target.left - target.width / 2;
  const dy = source.top + source.height / 2 - target.top - target.height / 2;
  // Only the animated art layer clips during the camera movement; DOM controls stay still and accessible.
  const previousOverflow = layer.style.overflow;
  layer.style.overflow = 'clip';
  const animation = scene.animate([{ transform: `translate(${dx}px,${dy}px) scale(${source.width / target.width},${source.height / target.height})`, opacity: .45 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'none' });
  const restore = () => { layer.style.overflow = previousOverflow; };
  animation.addEventListener('finish', restore, { once: true });
  animation.addEventListener('cancel', restore, { once: true });
  return animation;
}
