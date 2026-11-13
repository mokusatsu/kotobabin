import type { CityState, DistrictId } from '../economy';
import type { SessionFact, SessionSnapshot } from '../typing';
import { districtName, escapeCityText, formatMicro } from './city';
import { renderDistrictCore } from './district-map';
import { vehicleArtworkId } from './equipment-visuals';
import '../delivery-scene.css';

export interface DeliveryBatch {
  id: string;
  amountMicro: bigint;
  remainingMicro: bigint;
  sessionId: string;
  combined: boolean;
}
export interface DeliverySceneState {
  cityId: string;
  sessionId: string;
  batches: readonly DeliveryBatch[];
  nextBatchId: number;
  lastWordEventId: string;
  lastDispatchEventId: string;
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
  return { cityId: city.cityId, sessionId: '', batches: district.queueMicro > 0n ? [{ id: `${city.cityId}:initial`, amountMicro: district.queueMicro, remainingMicro: district.queueMicro, sessionId: '', combined: false }] : [], nextBatchId: 1, lastWordEventId: '', lastDispatchEventId: '', destination, queuedMicro: district.queueMicro,
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
  // Conservation exposes exact newly queued material without repeating economy formulas.
  // Arrival consumes FIFO; new words therefore cannot rewind an existing parcel.
  const generated = district.queueMicro + delta - state.queuedMicro;
  let batches = state.batches.map(batch => ({ ...batch }));
  if (generated > 0n) batches.push({ id: `${state.cityId}:batch:${state.nextBatchId++}`,
    amountMicro: generated, remainingMicro: generated, sessionId: sessionId ?? state.sessionId, combined: false });
  let arriving = delta;
  let landed = 0n;
  for (const batch of batches) {
    if (arriving === 0n) break;
    if (batch.remainingMicro === 0n) continue;
    const consumed = arriving < batch.remainingMicro ? arriving : batch.remainingMicro;
    batch.remainingMicro -= consumed; arriving -= consumed;
    if (batch.remainingMicro === 0n) { landed += batch.amountMicro; state.arrivalRevision++; }
  }
  // Bound visual/retained groups. Finished groups leave first; if all are in transit,
  // combine the two oldest into an explicitly identified aggregate, never split amounts.
  while (batches.length > 6) {
    const finished = batches.findIndex(batch => batch.remainingMicro === 0n);
    if (finished >= 0) batches.splice(finished, 1);
    else {
      const [first, second, ...rest] = batches;
      batches = [{ id: `${state.cityId}:group:${state.nextBatchId++}`, amountMicro: first.amountMicro + second.amountMicro,
        remainingMicro: first.remainingMicro + second.remainingMicro, sessionId: '', combined: true }, ...rest];
    }
  }
  state.batches = batches;
  state.queuedMicro = district.queueMicro;
  state.arrivedCounterMicro = district.arrivedMicro;
  if (delta > 0n) state.arrivedSinceMountMicro += delta;
  if (landed > 0n) state.lastArrivalMicro = landed;
  if (sessionId) {
    state.sessionId = sessionId;
    const sequences = { ...state.factSequences };
    for (const fact of facts) {
      if (fact.sessionId !== sessionId || fact.factSequence <= (sequences[sessionId] ?? -1)) continue;
      sequences[sessionId] = fact.factSequence;
      if (fact.type === 'WordCompleted') { state.words++; state.lastWordEventId = fact.eventId; state.wordKind = fact.clean ? 'clean' : 'dirty'; }
      if (fact.type === 'DeliveryCommitted') { state.dispatches++; state.lastDispatchEventId = fact.eventId; state.lastReason = fact.reason; }
    }
    state.factSequences = sequences;
    if (snapshot) { state.cargoCount = snapshot.cargoCount; state.paused = snapshot.phase === 'PAUSED'; }
  }
  return state;
}
const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
/** Transport position follows confirmed throughput, never a cosmetic elapsed-time timer. */
export function deliveryBatchPosition(batch: DeliveryBatch): number {
  return batch.amountMicro > 0n ? Number((batch.amountMicro - batch.remainingMicro) * 10000n / batch.amountMicro) / 10000 : 0;
}
export function deliveryPosition(state: DeliverySceneState): number {
  const batch = state.batches.find(item => item.remainingMicro > 0n) ?? state.batches.at(-1);
  return batch ? deliveryBatchPosition(batch) : 0;
}
function sceneVehicleArt(city: CityState, destination: DistrictId, progress: number): string {
  const from = deliveryPathPoint(Math.max(0, progress - .001));
  const to = deliveryPathPoint(Math.min(1, progress + .001));
  const district = city.districts[destination];
  return vehicleArtworkId(district.crews, district.railway, to.y < from.y ? 'rear' : 'front');
}
function batchMarkup(batch: DeliveryBatch, destination: DistrictId, city: CityState): string {
  const art = sceneVehicleArt(city, destination, deliveryBatchPosition(batch));
  return `<div class="delivery-vehicle" data-delivery-transport data-effect-id="${escapeCityText(batch.id)}" data-from="warehouse" data-to="${escapeCityText(destination)}" data-session-id="${escapeCityText(batch.sessionId)}" data-state="${batch.remainingMicro > 0n ? 'in-transit' : 'arrived'}"><img class="delivery-vehicle-art" data-asset-id="${art}" src="${asset(`vehicle/${art}.webp`)}" alt=""><img class="delivery-vehicle-parcel" src="${asset('cargo/cargo_parcel.webp')}" alt=""></div>`;
}
/** One continuous road across the playfield; exact throughput chooses the point. */
export function deliveryPathPoint(progress: number): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, progress)); const u = 1 - t;
  return { x: u ** 3 * .12 + 3 * u ** 2 * t * .52 + 3 * u * t ** 2 * .40 + t ** 3 * .88,
    y: u ** 3 * .64 + 3 * u ** 2 * t * .72 + 3 * u * t ** 2 * -.22 + t ** 3 * .37 };
}
function sceneStatus(state: DeliverySceneState): string {
  return `${districtName(state.destination)}へ 輸送待ち ${formatMicro(state.queuedMicro)}資材・到着 ${formatMicro(state.arrivedSinceMountMicro)}資材${state.paused ? '。入力は一時停止中。街の輸送は継続' : ''}`;
}
export function renderDeliveryScene(city: CityState, destination: DistrictId): string {
  const state = createDeliverySceneState(city, destination);

  return `<div id="delivery-scene" class="delivery-scene" data-transport="${state.queuedMicro > 0n ? 'waiting' : 'idle'}" aria-label="倉庫から${escapeCityText(districtName(destination))}への配送風景">
    <div class="delivery-scene-landscape" style="background-image:linear-gradient(180deg,#d8eee66b,#e6edc987),url('${asset('terrain/terrain_riverside.webp')}')" aria-hidden="true"></div>
    <svg class="delivery-scene-art" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs><pattern id="delivery-road-lines" width="72" height="12" patternUnits="userSpaceOnUse"><path d="M0 6h36" stroke="#fff1c7" stroke-width="4"/></pattern></defs>
      <ellipse cx="144" cy="528" rx="174" ry="28" fill="#779e76" opacity=".25"/><ellipse cx="1056" cy="316" rx="150" ry="26" fill="#779e76" opacity=".25"/>
      <path d="M144 512 C624 576 480 -176 1056 296" fill="none" stroke="#658276" stroke-width="46"/>
      <path d="M144 512 C624 576 480 -176 1056 296" fill="none" stroke="#d9cda6" stroke-width="36"/>
      <path d="M144 512 C624 576 480 -176 1056 296" fill="none" stroke="url(#delivery-road-lines)" stroke-width="8"/>
    </svg>
    <img class="delivery-warehouse-art" src="${asset('city_shared/city_hub.webp')}" alt="" aria-hidden="true">
    <svg class="delivery-district-art" data-delivery-district data-stage="${city.districts[destination].stage}" viewBox="330 70 540 405" aria-hidden="true">${renderDistrictCore(city, destination)}</svg>
    <div class="delivery-arrival-glow" data-arrival-revision="0" aria-hidden="true">✓</div>
    <div class="delivery-action-lane" aria-hidden="true"><div data-delivery-batches>${state.batches.map(batch => batchMarkup(batch, destination, city)).join('')}</div><img class="delivery-word-letter" data-delivery-effect="word" data-state="issued" src="${asset('cargo/cargo_parcel.webp')}" alt=""><div class="delivery-dispatch-cart" data-delivery-effect="dispatch" data-state="issued"><img data-dispatch-vehicle src="${asset(`vehicle/${vehicleArtworkId(city.districts[destination].crews, city.districts[destination].railway, 'rear')}.webp`)}" alt=""><span>✉✉</span></div></div>
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
  view(): DeliverySceneState { return { ...this.state, batches: this.state.batches.map(batch => ({ ...batch })), factSequences: { ...this.state.factSequences } }; }
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
    Object.assign(el.dataset, { cityId: s.cityId, sessionId: s.sessionId, destination: s.destination,
      queuedMicro: String(s.queuedMicro), arrivedMicro: String(s.arrivedSinceMountMicro),
      arrivalRevision: String(s.arrivalRevision), words: String(s.words), dispatches: String(s.dispatches) });
    const batchRoot = el.querySelector<HTMLElement>('[data-delivery-batches]');
    if (batchRoot) {
      for (const node of Array.from(batchRoot.children)) if (!s.batches.some(batch => batch.id === (node as HTMLElement).dataset.effectId)) node.remove();
      s.batches.forEach((batch, index) => {
        let node = Array.from(batchRoot.children).find(item => (item as HTMLElement).dataset.effectId === batch.id) as HTMLElement | undefined;
        if (!node) {
          const container = document.createElement('div'); container.innerHTML = batchMarkup(batch, s.destination, this.city);
          node = container.firstElementChild as HTMLElement; batchRoot.append(node);
        }
        Object.assign(node.dataset, { state: batch.remainingMicro > 0n ? 'in-transit' : 'arrived',
          amountMicro: String(batch.amountMicro), remainingMicro: String(batch.remainingMicro), combined: String(batch.combined) });
        const progress = s.reducedMotion && batch.remainingMicro > 0n ? .5 : deliveryBatchPosition(batch);
        const art = sceneVehicleArt(this.city, s.destination, progress);
        const sprite = node.querySelector<HTMLImageElement>('.delivery-vehicle-art');
        if (sprite && sprite.dataset.assetId !== art) { sprite.src = asset(`vehicle/${art}.webp`); sprite.dataset.assetId = art; }
        const point = deliveryPathPoint(progress);
        node.style.left = `${point.x * 100}%`; node.style.top = `calc(${point.y * 100}% + ${(index % 3) * 7}px)`;
      });
    }
    const dispatchVehicle = el.querySelector<HTMLImageElement>('[data-dispatch-vehicle]');
    const dispatchArt = vehicleArtworkId(this.city.districts[s.destination].crews, this.city.districts[s.destination].railway, 'rear');
    if (dispatchVehicle && dispatchVehicle.dataset.assetId !== dispatchArt) { dispatchVehicle.src = asset(`vehicle/${dispatchArt}.webp`); dispatchVehicle.dataset.assetId = dispatchArt; }
    const wordEffect = el.querySelector<HTMLElement>('[data-delivery-effect=word]');
    const dispatchEffect = el.querySelector<HTMLElement>('[data-delivery-effect=dispatch]');
    if (wordEffect) Object.assign(wordEffect.dataset, { effectId: s.lastWordEventId, sessionId: s.sessionId, from: 'warehouse', to: s.destination });
    if (dispatchEffect) Object.assign(dispatchEffect.dataset, { effectId: s.lastDispatchEventId, sessionId: s.sessionId, from: 'warehouse', to: s.destination });
    el.querySelectorAll<HTMLElement>('.delivery-envelope-rack i').forEach((item, i) => item.classList.toggle('loaded', i < s.cargoCount));
    const text = (selector: string, value: string) => { const node = el.querySelector(selector); if (node && node.textContent !== value) node.textContent = value; };
    text('[data-scene-cargo]', `まとめ便 ${s.cargoCount} / 5`);
    text('[data-scene-arrived]', `到着 ${formatMicro(s.arrivedSinceMountMicro)}資材`);
    text('[data-scene-status]', sceneStatus(s));
    const district = el.querySelector('[data-delivery-district]');
    const nextStage = String(this.city.districts[s.destination].stage);
    if (district && district.getAttribute('data-stage') !== nextStage) { district.innerHTML = renderDistrictCore(this.city, s.destination); district.setAttribute('data-stage', nextStage); }
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
      el.querySelector('.delivery-arrival-glow')?.setAttribute('data-arrival-revision', String(s.arrivalRevision));
      pulse('.delivery-arrival-glow', s.arrivalRevision); this.paintedArrivals = s.arrivalRevision;
      text('[data-scene-confirmation]', `${districtName(s.destination)}へ ${formatMicro(s.lastArrivalMicro)}資材が到着`);
    }
    this.paintedWords = s.words; this.paintedDispatches = s.dispatches; this.paintedArrivals = s.arrivalRevision;
  }
}
