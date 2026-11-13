import config from '../../spec/initial/data/economy_config.json';
import { EconomyFormulas, MICRO_UNIT, WorldClock, initialWorldState, type AdvanceResult, type Construction, type DistrictId, type DistrictState, type EquipmentKind, type Rational, type ResearchKind, type WorldState } from './index';

export type EconomyMode = 'normal' | 'skip' | 'practice' | 'review' | 'intro';
export type ShipmentReason = 'manual' | 'full' | 'deadline' | 'skip';
export interface EconomySession {
  sessionId: string; districtId: DistrictId; mode: EconomyMode; multiplier: Rational; cityId: string;
  startedAtMs: number; generatedStartMicro: bigint; arrivedStartMicro: bigint;
  deliveryCoinsStartMicro: bigint; shopCoinsStartMicro: bigint;
}
export interface SessionEconomySummary {
  sessionId: string; cityId: string; districtId: DistrictId; mode: EconomyMode; startMs: number; endMs: number;
  generatedMicro: bigint; arrivedDuringSessionMicro: bigint; deliveryCoinsMicro: bigint; shopCoinsMicro: bigint;
  arrivalsIncludePreexistingQueue: true; remainingQueueMicro: bigint;
}
export interface CityState extends WorldState {
  economyVersion: string; citySequence: number; cityId: string; landscape: string;
  packagingLevel: number; blueprints: number; generatedMicro: bigint; arrivedMicro: bigint;
  completedWords: number; economicShipments: number; legacyShipments: number; citiesRestarted: number;
  activeSession: EconomySession | null; lastSessionSummary: SessionEconomySummary | null;
  usedSessionIds: string[]; factLedger: Record<string, string>; commandLedger: Record<string, string>; constructionHistory: Construction[];
}
export function initialCityState(wallMs = 0): CityState {
  return { ...initialWorldState(wallMs), economyVersion: config.economy_version, citySequence: 1, cityId: 'city-1',
    landscape: config.initial.landscape, packagingLevel: config.initial.packaging_level, blueprints: config.initial.blueprints,
    generatedMicro: 0n, arrivedMicro: 0n, completedWords: 0, economicShipments: 0, legacyShipments: 0, citiesRestarted: 0,
    activeSession: null, lastSessionSummary: null, usedSessionIds: [], factLedger: {}, commandLedger: {}, constructionHistory: [] };
}
interface FactIdentity { cityId: string; sessionId: string; factSequence: number; atMs?: number }
export interface CompletedWordFact extends FactIdentity { baseLength: number; mistakes?: number; completed?: boolean; confirmation?: boolean }
export interface ShippedCargoFact extends FactIdentity { scoreSum: number; cargoCount: number; reason: ShipmentReason }
export interface MaterialReceipt { applied: boolean; reason?: 'stale_city' | 'duplicate'; generatedMicro: bigint; districtId?: DistrictId; bonusPoints?: number; legacyDeliveryCounted?: boolean }
const integer = (value: number, name: string, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw new RangeError(`${name} must be an integer >= ${minimum}`);
};
const sqrt = (n: bigint): bigint => {
  if (n < 2n) return n;
  let x = n; let next = (x + 1n) / 2n;
  while (next < x) { x = next; next = (x + n / x) / 2n; }
  return x;
};

/** All economic operations consume confirmed facts; UI/rendering must never generate resources itself. */
export class CityEconomy {
  private formulas = new EconomyFormulas();
  constructor(readonly state: CityState = initialCityState()) {}
  snapshot(): CityState { return structuredClone(this.state); }
  private district(id: DistrictId): DistrictState {
    const d = this.state.districts[id];
    if (!d) throw new RangeError('Unknown district');
    return d;
  }
  private idle() { if (this.state.activeSession) throw new Error('End the current session before investment or plan operations'); }
  private at(time?: number) { if (time !== undefined) this.advanceTo(time); }
  private recordAdvance<T extends AdvanceResult>(result: T): T { this.state.constructionHistory.push(...result.completed); this.state.arrivedMicro += result.arrivedMicro; return result; }
  advance(elapsedMs: number) { return this.recordAdvance(new WorldClock(this.state).advance(elapsedMs)); }
  advanceTo(targetMs: number) { integer(targetMs, 'targetMs'); return this.recordAdvance(new WorldClock(this.state).advanceTo(targetMs)); }
  restoreAt(wallMs: number) { return this.recordAdvance(new WorldClock(this.state).restoreAt(wallMs)); }
  beginSession(sessionId: string, districtId: DistrictId = 'residential', mode: EconomyMode = 'normal', atMs?: number) {
    this.at(atMs);
    if (this.state.activeSession) throw new Error('A session is already active');
    if (!sessionId || this.state.usedSessionIds.includes(sessionId)) throw new Error('Session ID must be nonempty and unused in this city');
    if (!config.material_generation.modes.includes(mode)) throw new RangeError('Unknown session mode');
    if (!this.district(districtId).open) throw new Error('Destination is not open');
    const s = this.state;
    s.activeSession = { sessionId, districtId, mode, multiplier: this.formulas.materialMultiplier(s.packagingLevel, s.research.materials),
      cityId: s.cityId, startedAtMs: s.clockMs, generatedStartMicro: s.generatedMicro, arrivedStartMicro: s.cityArrivedMicro,
      deliveryCoinsStartMicro: s.deliveryCoinsMicro, shopCoinsStartMicro: s.shopCoinsMicro };
    s.usedSessionIds.push(sessionId);
    return structuredClone(s.activeSession);
  }
  endSession(atMs?: number): SessionEconomySummary | null {
    this.at(atMs); const s = this.state; const session = s.activeSession;
    if (session) s.lastSessionSummary = { sessionId: session.sessionId, cityId: session.cityId, districtId: session.districtId,
      mode: session.mode, startMs: session.startedAtMs, endMs: s.clockMs, generatedMicro: s.generatedMicro - session.generatedStartMicro,
      arrivedDuringSessionMicro: s.cityArrivedMicro - session.arrivedStartMicro,
      deliveryCoinsMicro: s.deliveryCoinsMicro - session.deliveryCoinsStartMicro, shopCoinsMicro: s.shopCoinsMicro - session.shopCoinsStartMicro,
      arrivalsIncludePreexistingQueue: true, remainingQueueMicro: this.district(session.districtId).queueMicro };
    s.activeSession = null;
    return structuredClone(s.lastSessionSummary);
  }
  private rejectStaleCity(cityId: string): MaterialReceipt | null {
    if (!cityId) throw new Error('Economic facts require an explicit cityId');
    return cityId === this.state.cityId ? null : { applied: false, reason: 'stale_city', generatedMicro: 0n };
  }
  private fact(identity: FactIdentity, payload: object): { reason: 'stale_city' | 'duplicate' } | { key: string; fingerprint: string; session: EconomySession } {
    integer(identity.factSequence, 'factSequence');
    const key = JSON.stringify([identity.cityId, identity.sessionId, identity.factSequence]);
    // Canonical fixed-key payloads preserve exact content equality without asynchronous hashing.
    const fingerprint = JSON.stringify(payload); const existing = this.state.factLedger[key];
    if (existing !== undefined) {
      if (existing !== fingerprint) throw new Error('Fact identifier reused with different content');
      return { reason: 'duplicate' };
    }
    const session = this.state.activeSession;
    if (!session || session.sessionId !== identity.sessionId) throw new Error('The referenced session is not active');
    return { key, fingerprint, session };
  }
  completeWord(fact: CompletedWordFact): MaterialReceipt {
    const stale = this.rejectStaleCity(fact.cityId); if (stale) return stale;
    this.at(fact.atMs); integer(fact.baseLength, 'baseLength', 1); integer(fact.mistakes ?? 0, 'mistakes');
    const completed = fact.completed ?? true; const confirmation = fact.confirmation ?? false;
    const result = this.fact(fact, { kind: 'WordCompleted', baseLength: fact.baseLength, mistakes: fact.mistakes ?? 0, completed, confirmation });
    if ('reason' in result) return { applied: false, reason: result.reason, generatedMicro: 0n };
    const amount = this.formulas.wordMaterialMicro(fact.baseLength, result.session.multiplier, completed, confirmation);
    this.district(result.session.districtId).queueMicro += amount; this.state.generatedMicro += amount;
    if (completed && !confirmation) this.state.completedWords++;
    this.state.factLedger[result.key] = result.fingerprint;
    return { applied: true, generatedMicro: amount, districtId: result.session.districtId };
  }
  shipCargo(fact: ShippedCargoFact): MaterialReceipt {
    const stale = this.rejectStaleCity(fact.cityId); if (stale) return stale;
    this.at(fact.atMs); integer(fact.scoreSum, 'scoreSum'); integer(fact.cargoCount, 'cargoCount');
    const { cargoCount: k, reason } = fact; const cfg = config.material_generation;
    if (!cfg.shipment_reasons.includes(reason)) throw new RangeError('Unknown shipment reason');
    if (k > cfg.maximum_cargo_count || (reason === 'manual' && (k < 1 || k > 4)) || (reason === 'full' && k !== 5)
      || ((reason === 'deadline' || reason === 'skip') && k < 1) || (k === 0 && fact.scoreSum > 0)) throw new RangeError('Invalid cargo count for shipment reason');
    const result = this.fact(fact, { kind: 'CargoShipped', scoreSum: fact.scoreSum, cargoCount: k, reason });
    if ('reason' in result) return { applied: false, reason: result.reason, generatedMicro: 0n };
    const shipment = this.formulas.shipmentMaterial(fact.scoreSum, k, result.session.multiplier);
    this.district(result.session.districtId).queueMicro += shipment.generatedMicro; this.state.generatedMicro += shipment.generatedMicro;
    if (k > 0) this.state.economicShipments++;
    const legacy = cfg.legacy_achievement_shipment_reasons.includes(reason);
    if (legacy) this.state.legacyShipments++;
    this.state.factLedger[result.key] = result.fingerprint;
    return { applied: true, generatedMicro: shipment.generatedMicro, bonusPoints: shipment.bonusPoints,
      legacyDeliveryCounted: legacy, districtId: result.session.districtId };
  }
  startPlan(id: DistrictId, atMs?: number) {
    this.at(atMs); this.idle(); const d = this.district(id);
    if (!d.open || d.plan || d.stage >= config.development.maximum_stage) throw new Error('District cannot start a new plan');
    const cost = this.formulas.developmentCost(id, d.stage + 1);
    if (this.state.coinsMicro < cost.coinsMicro) throw new Error('Insufficient coins for plan');
    this.state.coinsMicro -= cost.coinsMicro;
    d.plan = { targetStage: d.stage + 1, requiredMicro: cost.materialsMicro, reservedMicro: 0n, paidCoinsMicro: cost.coinsMicro, paused: false };
    return { paidCoinsMicro: cost.coinsMicro, completed: this.advance(0).completed };
  }
  pausePlan(id: DistrictId, atMs?: number) {
    this.at(atMs); this.idle(); const p = this.district(id).plan;
    if (!p) throw new Error('No plan to pause'); p.paused = true;
  }
  resumePlan(id: DistrictId, atMs?: number) {
    this.at(atMs); this.idle(); const p = this.district(id).plan;
    if (!p) throw new Error('No plan to resume'); p.paused = false;
    return this.advance(0).completed;
  }
  openDistrict(id: DistrictId, atMs?: number) {
    this.at(atMs); this.idle(); const d = this.district(id); const cfg = config.districts.find(item => item.id === id)!;
    if (d.open) throw new Error('District is already open');
    if (Object.values(this.state.districts).reduce((sum, district) => sum + district.stage, 0) < cfg.unlock_stage_sum) throw new Error('Current development stage sum is too low');
    const cost = BigInt(cfg.unlock_coins) * MICRO_UNIT;
    if (this.state.coinsMicro < cost) throw new Error('Insufficient coins to open district');
    this.state.coinsMicro -= cost; d.open = true; d.crews = config.initial.crews_per_open_route;
  }
  quotePurchase(kind: EquipmentKind, quantity: 1 | 10 | 'max' = 1, districtId?: DistrictId) {
    if (!config.equipment.purchase_quantities.includes(quantity)) throw new RangeError('Quantity must be 1, 10 or max');
    const d = kind === 'packaging' ? null : this.district(districtId ?? '');
    if (d && !d.open) throw new Error('District is not open');
    const current = kind === 'packaging' ? this.state.packagingLevel : (kind === 'crews' ? d!.crews : d!.shops);
    const quote = this.formulas.purchaseQuote(kind, current, this.state.coinsMicro, quantity, districtId, d?.stage);
    const s = this.state;
    if (kind === 'packaging') return { ...quote,
      beforeMultiplier: this.formulas.materialMultiplier(current, s.research.materials),
      afterMultiplier: this.formulas.materialMultiplier(quote.after, s.research.materials) };
    if (kind === 'crews') {
      const before = this.formulas.transportPerSecondMicro(d!, s.research.logistics, s.synergies.includes('sorting_network'));
      const after = this.formulas.transportPerSecondMicro({ ...d!, crews: quote.after }, s.research.logistics, s.synergies.includes('sorting_network'));
      const wait = (rate: bigint) => d!.queueMicro === 0n ? 0n : (d!.queueMicro + rate / 1000n - 1n) / (rate / 1000n);
      return { ...quote, beforePerSecondMicro: before, afterPerSecondMicro: after, queueMicro: d!.queueMicro,
        beforeWaitMs: wait(before), afterWaitMs: wait(after), waitAssumption: 'no_additional_arrivals' as const };
    }
    return { ...quote,
      beforePerSecondMicro: this.formulas.shopIncomePerSecondMicro(districtId!, d!, s.research.commerce, s.synergies.includes('tourism_service')),
      afterPerSecondMicro: this.formulas.shopIncomePerSecondMicro(districtId!, { ...d!, shops: quote.after }, s.research.commerce, s.synergies.includes('tourism_service')) };
  }
  purchase(kind: EquipmentKind, quantity: 1 | 10 | 'max' = 1, districtId?: DistrictId, atMs?: number) {
    this.at(atMs); this.idle(); const quote = this.quotePurchase(kind, quantity, districtId);
    this.state.coinsMicro -= quote.totalCostMicro;
    if (kind === 'packaging') this.state.packagingLevel = quote.after;
    else if (kind === 'crews') this.district(districtId!).crews = quote.after;
    else this.district(districtId!).shops = quote.after;
    return quote;
  }
  buyRailway(id: DistrictId, atMs?: number) {
    this.at(atMs); this.idle(); const d = this.district(id); const cfg = config.railway;
    if (!d.open || d.railway || d.stage < cfg.minimum_stage || d.crews < cfg.minimum_crews) throw new Error('Railway prerequisites are not met');
    const mult = BigInt(config.districts.find(item => item.id === id)!.cost_multiplier);
    const coins = BigInt(cfg.base_coins) * mult * MICRO_UNIT; const materials = BigInt(cfg.base_materials_micro) * mult;
    if (this.state.coinsMicro < coins || d.stockMicro < materials) throw new Error('Railway needs enough coins and unreserved stock');
    this.state.coinsMicro -= coins; d.stockMicro -= materials; d.railway = true;
    return { paidCoinsMicro: coins, paidMaterialsMicro: materials };
  }
  buySynergy(id: string, atMs?: number) {
    this.at(atMs); this.idle(); const cfg = config.synergies.find(item => item.id === id);
    if (!cfg || this.state.synergies.includes(id)) throw new Error('Unknown or already owned synergy');
    if (Object.entries(cfg.requires).some(([district, stage]) => this.district(district).stage < stage!)) throw new Error('Synergy stage prerequisites are not met');
    const cost = BigInt(cfg.cost_coins) * MICRO_UNIT;
    if (this.state.coinsMicro < cost) throw new Error('Insufficient coins for synergy');
    this.state.coinsMicro -= cost; this.state.synergies.push(id);
  }
  buyResearch(kind: ResearchKind, atMs?: number) {
    this.at(atMs); this.idle();
    if (!(kind in this.state.research)) throw new RangeError('Unknown research');
    const rank = this.state.research[kind];
    if (rank >= config.research.maximum_rank) throw new Error('Research is at maximum rank');
    const cost = config.research.next_rank_cost_blueprints[rank];
    if (this.state.blueprints < cost) throw new Error('Insufficient blueprints');
    const before = this.formulas.researchMultiplier(rank);
    this.state.blueprints -= cost; this.state.research[kind]++;
    return { kind, costBlueprints: cost, rank: rank + 1, beforeMultiplier: before, afterMultiplier: this.formulas.researchMultiplier(rank + 1) };
  }
  newCityPreview() {
    const cfg = config.new_city; const threshold = BigInt(cfg.minimum_arrived_micro);
    const level = sqrt(this.state.cityArrivedMicro / threshold); const next = threshold * (level + 1n) ** 2n;
    const stageRequirementMet = Object.values(this.state.districts).every(d => d.stage >= cfg.minimum_stage_each_district);
    const research = this.formulas.researchMultiplier(this.state.research.materials);
    let numerator = BigInt(config.development.stages[0].base_materials_micro) * research.denominator;
    let denominator = MICRO_UNIT * research.numerator;
    let a = numerator; let b = denominator;
    while (b) { const r = a % b; a = b; b = r; }
    numerator /= a; denominator /= a;
    return { eligible: stageRequirementMet && this.state.cityArrivedMicro >= threshold, stageRequirementMet,
      rewardBlueprints: Number(level * BigInt(cfg.reward_unit_blueprints)), nextRewardThresholdMicro: next,
      remainingToNextRewardMicro: next - this.state.cityArrivedMicro,
      nextRewardBlueprints: Number((level + 1n) * BigInt(cfg.reward_unit_blueprints)),
      firstBuildingBaseMaterials: { numerator, denominator } };
  }
  startNewCity(options: { confirmed?: boolean; location?: 'HOME' | 'RESULT'; landscape?: string; atMs?: number } = {}) {
    this.at(options.atMs); this.idle(); const cfg = config.new_city;
    const location = options.location ?? 'HOME'; const landscape = options.landscape ?? 'riverside';
    if (!options.confirmed || !cfg.allowed_locations.includes(location)) throw new Error('Confirmed new city requires HOME or RESULT');
    if (!cfg.landscapes.includes(landscape)) throw new Error('Unknown landscape');
    const preview = this.newCityPreview();
    if (!preview.eligible) throw new Error('New-city requirements are not met');
    const s = this.state; const oldCityId = s.cityId;
    const reset = initialWorldState(s.savedWallMs);
    s.coinsMicro = reset.coinsMicro; s.cityArrivedMicro = 0n; s.districts = reset.districts; s.synergies = [];
    s.packagingLevel = config.initial.packaging_level; s.blueprints += preview.rewardBlueprints;
    s.citiesRestarted++; s.citySequence++; s.cityId = `city-${s.citySequence}`; s.landscape = landscape;
    s.activeSession = null; s.lastSessionSummary = null; s.usedSessionIds = []; s.factLedger = {}; s.constructionHistory = [];
    return { oldCityId, cityId: s.cityId, earnedBlueprints: preview.rewardBlueprints, unspentBlueprints: s.blueprints };
  }
}
