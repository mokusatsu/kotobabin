import type { CityState, DistrictId } from '../economy';
import type { SessionFact, SessionSnapshot } from '../typing';
import { districtArtwork, districtName, escapeCityText, formatMicro } from './city';
import '../delivery-scene.css';

export interface DeliverySceneState {
  cityId: string;
  destination: DistrictId;
  /** Exact destination queue/arrival counters. Keyboard dispatch is never arrival. */
  queuedMicro: bigint;
  arrivedCounterMicro: bigint;
  arrivedSinceMountMicro: bigint;
  lastArrivalMicro: bigint;
  cargoCount: number;
  words: number;
  dispatches: number;
  arrivalRevision: number;
  wordKind: 'none' | 'clean' | 'dirty';
  lastReason: string;
  paused: boolean;
  reducedMotion: boolean;
  factSequences: Readonly<Record<string, number>>;
}
export type DeliverySceneSnapshot = Pick<SessionSnapshot, 'cargoCount' | 'phase'>;
export function createDeliverySceneState(city: CityState, destination: DistrictId): DeliverySceneState {
  const district = city.districts[destination];
  return { cityId: city.cityId, destination, queuedMicro: district.queueMicro,
    arrivedCounterMicro: district.arrivedMicro, arrivedSinceMountMicro: 0n, lastArrivalMicro: 0n,
    cargoCount: 0, words: 0, dispatches: 0, arrivalRevision: 0, wordKind: 'none', lastReason: '',
    paused: false, reducedMotion: false, factSequences: {} };
}
/** Pure projection only: no wall/game clock, CityEconomy calls, awards or persistence. */
export function projectDeliveryScene(previous: DeliverySceneState, city: CityState,
  sessionId?: string, facts: readonly SessionFact[] = [], snapshot?: DeliverySceneSnapshot): DeliverySceneState {
  const state = city.cityId === previous.cityId ? { ...previous } : {
    ...createDeliverySceneState(city, previous.destination), paused: previous.paused, reducedMotion: previous.reducedMotion,
  };
  const district = city.districts[state.destination];
  const delta = district.arrivedMicro > state.arrivedCounterMicro ? district.arrivedMicro - state.arrivedCounterMicro : 0n;
  state.queuedMicro = district.queueMicro;
  state.arrivedCounterMicro = district.arrivedMicro;
  // Keep the last confirmed arrival amount for its visual pulse; redraws must not clear it.
  if (delta > 0n) {
    state.arrivedSinceMountMicro += delta;
    state.lastArrivalMicro = delta;
    state.arrivalRevision++;
  }
  if (sessionId) {
    const sequences = { ...state.factSequences };
    for (const fact of facts) {
      if (fact.sessionId !== sessionId || fact.factSequence <= (sequences[sessionId] ?? -1)) continue;
      sequences[sessionId] = fact.factSequence;
      if (fact.type === 'WordCompleted') { state.words++; state.wordKind = fact.clean ? 'clean' : 'dirty'; }
      if (fact.type === 'DeliveryCommitted') { state.dispatches++; state.lastReason = fact.reason; }
    }
    state.factSequences = sequences;
    if (snapshot) { state.cargoCount = snapshot.cargoCount; state.paused = snapshot.phase === 'PAUSED'; }
  }
  return state;
}
const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
/** Transport position follows confirmed throughput, never a cosmetic elapsed-time timer. */
export function deliveryPosition(state: DeliverySceneState): number {
  const total = state.arrivedSinceMountMicro + state.queuedMicro;
  return total > 0n ? Number(state.arrivedSinceMountMicro * 1000n / total) / 1000 : 0;
}
function sceneStatus(state: DeliverySceneState): string {
  return `${districtName(state.destination)}へ 輸送待ち ${formatMicro(state.queuedMicro)}資材・到着 ${formatMicro(state.arrivedSinceMountMicro)}資材${state.paused ? '。入力は一時停止中。街の輸送は継続' : ''}`;
}
export function renderDeliveryScene(city: CityState, destination: DistrictId): string {
  const state = createDeliverySceneState(city, destination);
  const art = districtArtwork(city, destination);
  return `<div id="delivery-scene" class="delivery-scene" data-transport="${state.queuedMicro > 0n ? 'waiting' : 'idle'}" aria-label="倉庫から${escapeCityText(districtName(destination))}への配送風景">
    <div class="delivery-scene-landscape" style="background-image:linear-gradient(180deg,#d8eee66b,#e6edc987),url('${asset('terrain/terrain_riverside.webp')}')" aria-hidden="true"></div>
    <svg class="delivery-scene-art" viewBox="0 0 1200 280" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><pattern id="delivery-road-lines" width="72" height="12" patternUnits="userSpaceOnUse"><path d="M0 6h36" stroke="#fff1c7" stroke-width="4"/></pattern></defs>
      <ellipse cx="600" cy="235" rx="580" ry="50" fill="#779e76" opacity=".6"/>
      <path d="M170 190 C380 120 730 240 1040 165" fill="none" stroke="#658276" stroke-width="46"/>
      <path d="M170 190 C380 120 730 240 1040 165" fill="none" stroke="#d9cda6" stroke-width="36"/>
      <path d="M170 190 C380 120 730 240 1040 165" fill="none" stroke="url(#delivery-road-lines)" stroke-width="8"/>
      <g class="delivery-arrival-glow" data-arrival-revision="0"><ellipse cx="1060" cy="198" rx="82" ry="22" fill="#fff4a2"/><path d="m1035 163 17 18 35-39" stroke="#326d48" stroke-width="10" fill="none"/></g>
    </svg>
    <img class="delivery-warehouse-art" src="${asset('city_shared/city_hub.webp')}" alt="" aria-hidden="true">
    <img class="delivery-district-art" data-delivery-district src="${asset(art.path)}" alt="" aria-hidden="true">
    <div class="delivery-action-lane" aria-hidden="true"><div class="delivery-vehicle"><img src="${asset('vehicle/vehicle_cart_front.webp')}" alt=""><span class="delivery-vehicle-parcel">✉</span></div><div class="delivery-word-letter">✉</div><div class="delivery-dispatch-cart"><img src="${asset('vehicle/vehicle_cart_rear.webp')}" alt=""><span>✉✉</span></div></div>
    <div class="delivery-place delivery-origin"><strong>ことば倉庫</strong><span data-scene-cargo>まとめ便 0 / 5</span><span class="delivery-envelope-rack" aria-hidden="true">${'<i>✉</i>'.repeat(5)}</span></div>
    <div class="delivery-place delivery-destination"><strong>${escapeCityText(districtName(destination))}</strong><span data-scene-arrived title="画面を開いてからの到着。開始前の輸送待ちを含みます。">到着 0資材</span></div>
    <p class="delivery-route-state" data-scene-status>${sceneStatus(state)}</p>
    <p class="delivery-confirmation" data-scene-confirmation aria-live="polite"></p>
  </div>`;
}

/** Keep this controller across RESULT if the route remains visible. updateCity accepts
 * real city updates while typing is paused/hidden; it never starts an economy timer. */
export class DeliverySceneController {
  private state: DeliverySceneState;
  private city: CityState;
  private element: HTMLElement | null = null;
  private paintedWords = 0;
  private paintedDispatches = 0;
  private paintedArrivals = 0;
  constructor(city: CityState, destination: DistrictId) { this.city = city; this.state = createDeliverySceneState(city, destination); }
  view(): DeliverySceneState { return { ...this.state, factSequences: { ...this.state.factSequences } }; }
  render(): string { return renderDeliveryScene(this.city, this.state.destination); }
  attach(root: HTMLElement): void {
    this.element = root.id === 'delivery-scene' ? root : root.querySelector('#delivery-scene');
    this.paint();
  }
  observe(sessionId: string, facts: readonly SessionFact[], snapshot: DeliverySceneSnapshot, city: CityState): void {
    this.city = city; this.state = projectDeliveryScene(this.state, city, sessionId, facts, snapshot); this.paint();
  }
  updateCity(city: CityState): void { this.city = city; this.state = projectDeliveryScene(this.state, city); this.paint(); }
  setPaused(paused: boolean): void { this.state = { ...this.state, paused }; this.paint(); }
  setReducedMotion(reducedMotion: boolean): void { this.state = { ...this.state, reducedMotion }; this.paint(); }
  detach(): void { this.element = null; }
  private paint(): void {
    const el = this.element; if (!el) return;
    const s = this.state;
    el.dataset.transport = s.queuedMicro > 0n ? 'waiting' : s.arrivedSinceMountMicro > 0n ? 'arrived' : 'idle';
    el.classList.toggle('delivery-reduced-motion', s.reducedMotion);
    el.classList.toggle('delivery-input-paused', s.paused);
    el.style.setProperty('--delivery-progress', `${deliveryPosition(s) * 100}%`);
    el.querySelectorAll<HTMLElement>('.delivery-envelope-rack i').forEach((item, i) => item.classList.toggle('loaded', i < s.cargoCount));
    const text = (selector: string, value: string) => { const node = el.querySelector(selector); if (node && node.textContent !== value) node.textContent = value; };
    text('[data-scene-cargo]', `まとめ便 ${s.cargoCount} / 5`);
    text('[data-scene-arrived]', `到着 ${formatMicro(s.arrivedSinceMountMicro)}資材`);
    text('[data-scene-status]', sceneStatus(s));
    const district = el.querySelector('[data-delivery-district]');
    district?.setAttribute('src', asset(districtArtwork(this.city, s.destination).path));
    // Animation restart only on a new confirmed event, never 80ms UI refresh/replay.
    const pulse = (selector: string, revision: number) => {
      const node = el.querySelector<HTMLElement>(selector);
      if (node) { node.style.animationName = 'none'; void node.getBoundingClientRect(); node.style.animationName = ''; node.dataset.revision = String(revision); }
    };
    if (s.words > this.paintedWords) {
      el.dataset.wordKind = s.wordKind; pulse('.delivery-word-letter', s.words); this.paintedWords = s.words;
      text('[data-scene-confirmation]', s.wordKind === 'clean' ? '資材の便が出発・まとめ便の荷物も追加' : '資材の便が出発・まとめ便の荷物は追加なし');
    }
    if (s.dispatches > this.paintedDispatches) {
      el.dataset.dispatchRevision = String(s.dispatches); pulse('.delivery-dispatch-cart', s.dispatches); this.paintedDispatches = s.dispatches;
      text('[data-scene-confirmation]', 'まとめ便を発送・追加資材も輸送待ちへ');
    }
    if (s.arrivalRevision > this.paintedArrivals) {
      pulse('.delivery-arrival-glow', s.arrivalRevision); this.paintedArrivals = s.arrivalRevision;
      text('[data-scene-confirmation]', `${districtName(s.destination)}へ ${formatMicro(s.lastArrivalMicro)}資材が到着`);
    }
    this.paintedWords = s.words; this.paintedDispatches = s.dispatches; this.paintedArrivals = s.arrivalRevision;
  }
}
