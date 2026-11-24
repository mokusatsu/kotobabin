import { ECONOMY_CONFIG } from '@/contracts/data';
import type {
  ConfirmedFact,
  DistrictId,
  EconomySnapshot,
  LandscapeId,
  ResearchId,
  SynergyId,
} from '@/contracts/types';
import {
  EconomyError,
  MS_PER_SECOND,
  ceilDiv,
  exactDiv,
  isqrt,
  milestoneFactor,
  minBigInt,
  multiplyRationals,
  parseMicro,
  powBigInt,
  reduceRational,
  requireInt,
  type Rational,
} from './math';
import { calculateOfflineProgress } from './worldClock';
import { DECORATIONS, decorationCost } from './decorations';

export type EquipmentKind = 'packaging' | 'crews' | 'shops';
export type PurchaseQuantity = 1 | 10 | 'max';

export interface DistrictState {
  open: boolean;
  stage: number;
  shops: number;
  crews: number;
  railway: boolean;
  queueMicro: bigint;
  stockMicro: bigint;
  arrivedMicro: bigint;
}

export interface ActiveSessionState {
  sessionId: string;
  districtId: DistrictId;
  mode: string;
  multiplierNumerator: bigint;
  multiplierDenominator: bigint;
  cityId: string;
  startedAtMs: number;
  generatedStartMicro: bigint;
  arrivedStartMicro: bigint;
  deliveryCoinsStartMicro: bigint;
  shopCoinsStartMicro: bigint;
}

export interface SessionSummary {
  session_id: string;
  city_id: string;
  district_id: DistrictId;
  mode: string;
  start_ms: number;
  end_ms: number;
  generated_micro: string;
  arrived_during_session_micro: string;
  delivery_coins_micro: string;
  shop_coins_micro: string;
  arrivals_include_preexisting_queue: boolean;
  remaining_queue_micro: string;
}

export interface ConstructionHistoryItem {
  district_id: DistrictId;
  stage: number;
  clock_ms: number;
  consumed_micro: string;
}

export interface AdvanceSegment {
  start_ms: number;
  end_ms: number;
  shop_income_per_second_micro: string;
  arrived_micro: string;
  delivery_coins_micro: string;
  shop_coins_micro: string;
  completed: ConstructionHistoryItem[];
}

export interface AdvanceResult {
  start_ms: number;
  end_ms: number;
  credited_ms: number;
  arrived_micro: string;
  shop_coins_micro: string;
  completed: ConstructionHistoryItem[];
  segments: AdvanceSegment[];
}

export interface RestoreResult extends AdvanceResult {
  wall_elapsed_ms: number;
  capped_ms: number;
  saved_wall_ms: number;
}

export interface PurchaseQuote {
  kind: EquipmentKind;
  district_id: DistrictId | null;
  quantity: PurchaseQuantity;
  count: number;
  requested_count: number;
  current: number;
  after: number;
  cap: number;
  prices_coins: number[];
  total_cost_coins: number;
  total_cost_micro: string;
  limited_by_cap: boolean;
  limited_by_funds: boolean;
  before_multiplier?: { numerator: number; denominator: number };
  after_multiplier?: { numerator: number; denominator: number };
  before_per_second_micro?: string;
  after_per_second_micro?: string;
  queue_micro?: string;
  before_wait_ms?: number;
  after_wait_ms?: number;
  wait_assumption?: string;
  applied?: boolean;
  reason?: string;
}

export interface OperationOptions {
  atMs?: number;
  economyEventId?: string;
}

export interface FactApplyResult {
  applied: boolean;
  reason?: 'duplicate' | 'stale_city';
  generatedMicro: string;
  districtId?: DistrictId;
  bonusPoints?: number;
  legacyDeliveryCounted?: boolean;
  sessionMultiplier?: { numerator: number; denominator: number };
}

export interface CityEconomySnapshot {
  schema_version: string;
  economy_version: string;
  clock_ms: number;
  saved_wall_ms: number;
  city_sequence: number;
  archived_cities?: ArchivedCity[];
  city_id: string;
  landscape: LandscapeId;
  coins_micro: string;
  city_arrived_micro: string;
  packaging_level: number;
  decoration_levels?: Record<string, number>;
  blueprints: number;
  research: Record<ResearchId, number>;
  synergies: SynergyId[];
  districts: Record<
    DistrictId,
    {
      open: boolean;
      stage: number;
      shops: number;
      crews: number;
      railway: boolean;
      queue_micro: string;
      stock_micro: string;
      arrived_micro: string;
    }
  >;
  active_session: {
    session_id: string;
    district_id: DistrictId;
    mode: string;
    multiplier_numerator: number;
    multiplier_denominator: number;
    city_id: string;
    started_at_ms: number;
    generated_start_micro: string;
    arrived_start_micro: string;
    delivery_coins_start_micro: string;
    shop_coins_start_micro: string;
  } | null;
  last_session_summary: SessionSummary | null;
  used_session_ids: string[];
  fact_ledger: Record<string, string>;
  economy_event_ledger?: Record<string, string>;
  construction_history: ConstructionHistoryItem[];
  persistent: {
    vocabulary: unknown[];
    stamps: unknown[];
    records: Record<string, unknown>;
    settings: Record<string, unknown>;
  };
  lifetime: {
    completed_words: number;
    economic_shipments: number;
    legacy_shipments: number;
    generated_micro: string;
    arrived_micro: string;
    delivery_coins_micro: string;
    shop_coins_micro: string;
    cities_restarted: number;
  };
}

type ArchivedCity = Pick<CityEconomySnapshot,
  'city_id' | 'landscape' | 'coins_micro' | 'city_arrived_micro' | 'packaging_level' |
  'decoration_levels' | 'synergies' | 'districts' | 'active_session' | 'last_session_summary' | 'used_session_ids' |
  'fact_ledger' | 'economy_event_ledger' | 'construction_history'
>;

function archiveCity(state: CityEconomySnapshot): ArchivedCity {
  const {
    city_id, landscape, coins_micro, city_arrived_micro, packaging_level, synergies, districts,
    active_session, last_session_summary, used_session_ids, fact_ledger, economy_event_ledger, construction_history,
  } = state;
  return {
    city_id, landscape, coins_micro, city_arrived_micro, packaging_level, synergies, districts,
    decoration_levels: state.decoration_levels ?? {},
    active_session, last_session_summary, used_session_ids, fact_ledger, economy_event_ledger, construction_history,
  };
}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;
}

export class CityEconomy {
  readonly config = ECONOMY_CONFIG;
  readonly unit: bigint = BigInt(ECONOMY_CONFIG.arithmetic.micro_unit);

  private readonly districtConfigMap = new Map(
    ECONOMY_CONFIG.districts.map((d) => [d.id as DistrictId, d]),
  );
  private readonly stageConfigMap = new Map(
    ECONOMY_CONFIG.development.stages.map((s) => [s.stage, s]),
  );
  private readonly synergyConfigMap = new Map(
    ECONOMY_CONFIG.synergies.map((s) => [s.id as SynergyId, s]),
  );

  clockMs = 0;
  savedWallMs = 0;
  citySequence = 1;
  private archivedCities = new Map<string, ArchivedCity>();
  cityId = 'city-1';
  landscape: LandscapeId = ECONOMY_CONFIG.initial.landscape as LandscapeId;
  coinsMicro = 0n;
  cityArrivedMicro = 0n;
  packagingLevel = 0;
  decorationLevels: Record<string, number> = {};
  blueprints = ECONOMY_CONFIG.initial.blueprints;

  research: Record<ResearchId, number> = {
    materials: 0,
    logistics: 0,
    commerce: 0,
  };
  synergies = new Set<SynergyId>();
  districts!: Record<DistrictId, DistrictState>;
  activeSession: ActiveSessionState | null = null;
  lastSessionSummary: SessionSummary | null = null;
  usedSessionIds = new Set<string>();
  factLedger: Record<string, string> = {};
  economyEventLedger: Record<string, string> = {};
  constructionHistory: ConstructionHistoryItem[] = [];
  persistent: {
    vocabulary: unknown[];
    stamps: unknown[];
    records: Record<string, unknown>;
    settings: Record<string, unknown>;
  } = {
    vocabulary: [],
    stamps: [],
    records: {},
    settings: {},
  };
  lifetime = {
    completedWords: 0,
    economicShipments: 0,
    legacyShipments: 0,
    generatedMicro: 0n,
    arrivedMicro: 0n,
    deliveryCoinsMicro: 0n,
    shopCoinsMicro: 0n,
    citiesRestarted: 0,
  };

  constructor(wallMs = 0) {
    this.savedWallMs = requireInt(wallMs, 'wallMs', 0);
    this.resetCity();
  }

  private resetCity(): void {
    const cfg = this.config.initial;
    this.coinsMicro = BigInt(cfg.coins_micro);
    this.packagingLevel = cfg.packaging_level;
    this.decorationLevels = {};
    this.cityArrivedMicro = 0n;
    this.synergies = new Set();
    this.activeSession = null;
    this.lastSessionSummary = null;
    this.usedSessionIds = new Set();
    this.factLedger = {};
    this.economyEventLedger = {};
    this.constructionHistory = [];

    const openSet = new Set(cfg.open_districts);
    const districts = {} as Record<DistrictId, DistrictState>;
    for (const d of this.config.districts) {
      const id = d.id as DistrictId;
      const isOpen = openSet.has(id);
      districts[id] = {
        open: isOpen,
        stage: 0,
        shops: 0,
        crews: isOpen ? cfg.crews_per_open_route : 0,
        railway: false,
        queueMicro: 0n,
        stockMicro: 0n,
        arrivedMicro: 0n,
      };
    }
    this.districts = districts;
    this.assertInvariants();
  }

  milestoneFactor(count: number): bigint {
    return milestoneFactor(
      count,
      this.config.equipment.milestones,
      BigInt(this.config.equipment.milestone_factor),
    );
  }

  researchMultiplier(kind: ResearchId, rank?: number): Rational {
    if (!(kind in this.research)) {
      throw new EconomyError('unknown research');
    }
    const level = rank === undefined ? this.research[kind] : requireInt(rank, 'rank', 0);
    if (level > this.config.research.maximum_rank) {
      throw new EconomyError('research rank exceeds cap');
    }
    const cfg = this.config.research.multiplier;
    return reduceRational(
      BigInt(cfg.base_numerator + cfg.rank_numerator * level),
      BigInt(cfg.denominator),
    );
  }

  packagingMultiplier(level?: number): Rational {
    const count =
      level === undefined ? this.packagingLevel : requireInt(level, 'level', 0);
    const cfg = this.config.equipment.packaging;
    if (count > cfg.maximum) {
      throw new EconomyError('packaging level exceeds cap');
    }
    const mult = cfg.material_multiplier;
    const mFactor = this.milestoneFactor(count);
    return reduceRational(
      BigInt(mult.base_numerator + mult.level_numerator * count) * mFactor,
      BigInt(mult.denominator),
    );
  }

  materialMultiplier(): Rational {
    return multiplyRationals(this.packagingMultiplier(), this.researchMultiplier('materials'));
  }

  deliveryReward(): number {
    let reward = this.config.delivery_reward.coins_per_material;
    const sortedSynergies = [...this.synergies].sort();
    for (const id of sortedSynergies) {
      const cfg = this.synergyConfigMap.get(id);
      if (cfg && 'delivery_coins_per_material' in cfg.effect) {
        reward = (cfg.effect as { delivery_coins_per_material: number })
          .delivery_coins_per_material;
      }
    }
    return reward;
  }

  transportPerSecondMicro(districtId: DistrictId, crews?: number): bigint {
    const d = this.requireDistrict(districtId);
    if (!d.open) {
      return 0n;
    }
    const n = crews === undefined ? d.crews : requireInt(crews, 'crews', 0);
    const base = BigInt(this.config.equipment.crews.base_material_per_crew_second);
    let num = base * BigInt(n) * this.milestoneFactor(n) * this.unit;
    const logMult = this.researchMultiplier('logistics');
    num *= logMult.numerator;
    const den = logMult.denominator;
    if (d.railway) {
      num *= BigInt(this.config.railway.transport_factor);
    }
    for (const id of this.synergies) {
      const cfg = this.synergyConfigMap.get(id);
      if (cfg && 'transport_factor' in cfg.effect) {
        num *= BigInt((cfg.effect as { transport_factor: number }).transport_factor);
      }
    }
    return exactDiv(num, den, 'transport rate');
  }

  shopIncomePerSecondMicro(districtId: DistrictId, shops?: number): bigint {
    const d = this.requireDistrict(districtId);
    if (!d.open || d.stage === 0) {
      return 0n;
    }
    const n = shops === undefined ? d.shops : requireInt(shops, 'shops', 0);
    const cfg = this.config.equipment.shops;
    const districtCfg = this.districtConfigMap.get(districtId)!;
    const base = BigInt(districtCfg.shop_base_income_per_second_micro);
    const stageFactor = powBigInt(
      BigInt(cfg.stage_factor),
      d.stage + cfg.stage_exponent_offset,
    );
    const comMult = this.researchMultiplier('commerce');
    let num = base * BigInt(n) * stageFactor * this.milestoneFactor(n) * comMult.numerator;
    const den = comMult.denominator;
    for (const id of this.synergies) {
      const cfgSynergy = this.synergyConfigMap.get(id);
      if (cfgSynergy && 'shop_income_factor' in cfgSynergy.effect) {
        num *= BigInt((cfgSynergy.effect as { shop_income_factor: number }).shop_income_factor);
      }
    }
    return exactDiv(num, den, 'shop income rate');
  }

  totalIncomePerSecondMicro(): bigint {
    let total = 0n;
    for (const id of Object.keys(this.districts) as DistrictId[]) {
      total += this.shopIncomePerSecondMicro(id);
    }
    return total;
  }

  waitMs(districtId: DistrictId, crews?: number): number {
    const d = this.requireDistrict(districtId);
    if (d.queueMicro === 0n) {
      return 0;
    }
    const perMs = this.transportPerSecondMicro(districtId, crews) / MS_PER_SECOND;
    if (perMs <= 0n) {
      throw new EconomyError('queued material has no active transport');
    }
    return Number(ceilDiv(d.queueMicro, perMs));
  }

  private requireDistrict(districtId: DistrictId): DistrictState {
    const d = this.districts[districtId];
    if (!d) {
      throw new EconomyError('unknown district');
    }
    return d;
  }

  private requireIdle(): void {
    if (this.activeSession !== null) {
      throw new EconomyError('end the current session before investment or plan operations');
    }
  }

  private eventTime(atMs?: number): void {
    if (atMs !== undefined) {
      this.advanceTo(atMs);
    }
  }

  private checkEconomyEventId(
    economyEventId: string | undefined,
    payload: Record<string, unknown>,
  ): { isDuplicate: boolean; key?: string; fingerprint?: string } {
    if (economyEventId === undefined) {
      return { isDuplicate: false };
    }
    if (typeof economyEventId !== 'string' || !economyEventId) {
      throw new EconomyError('economyEventId must be a nonempty string');
    }
    const key = JSON.stringify([this.cityId, economyEventId]);
    const fingerprint = canonicalStringify(payload);
    if (key in this.economyEventLedger) {
      if (this.economyEventLedger[key] !== fingerprint) {
        throw new EconomyError('economyEventId reused with different content');
      }
      return { isDuplicate: true, key, fingerprint };
    }
    return { isDuplicate: false, key, fingerprint };
  }

  private commitEconomyEventId(key?: string, fingerprint?: string): void {
    if (key !== undefined && fingerprint !== undefined) {
      this.economyEventLedger[key] = fingerprint;
    }
  }

  simulatePiecewise(elapsedMs: number): AdvanceResult {
    requireInt(elapsedMs, 'elapsedMs', 0);
    const start = this.clockMs;
    let delivered = 0n;
    let passive = 0n;
    const segments: AdvanceSegment[] = [];
    const completed: ConstructionHistoryItem[] = [];
    let remaining = elapsedMs;

    while (remaining > 0) {
      const rates = {} as Record<DistrictId, bigint>;
      const boundaries: number[] = [remaining];
      const incomePerMs = exactDiv(
        this.totalIncomePerSecondMicro(),
        MS_PER_SECOND,
        'shop income per millisecond',
      );

      for (const [id, d] of Object.entries(this.districts) as [DistrictId, DistrictState][]) {
        const rate = exactDiv(
          this.transportPerSecondMicro(id),
          MS_PER_SECOND,
          'transport per millisecond',
        );
        rates[id] = rate;
        if (d.queueMicro > 0n && rate > 0n) {
          boundaries.push(Number(ceilDiv(d.queueMicro, rate)));
        }
      }

      const step = Math.min(...boundaries);
      if (step <= 0) {
        throw new EconomyError('invalid zero-length simulation boundary');
      }
      const stepBig = BigInt(step);
      const shopCoins = incomePerMs * stepBig;
      this.coinsMicro += shopCoins;
      passive += shopCoins;

      let movedTotal = 0n;
      for (const [id, d] of Object.entries(this.districts) as [DistrictId, DistrictState][]) {
        const moved = minBigInt(d.queueMicro, rates[id] * stepBig);
        d.queueMicro -= moved;
        d.stockMicro += moved;
        d.arrivedMicro += moved;
        movedTotal += moved;
      }

      const deliveryCoins = movedTotal * BigInt(this.deliveryReward());
      this.coinsMicro += deliveryCoins;
      this.cityArrivedMicro += movedTotal;
      this.lifetime.arrivedMicro += movedTotal;
      this.lifetime.deliveryCoinsMicro += deliveryCoins;
      this.lifetime.shopCoinsMicro += shopCoins;
      delivered += movedTotal;
      this.clockMs += step;
      remaining -= step;

      segments.push({
        start_ms: this.clockMs - step,
        end_ms: this.clockMs,
        shop_income_per_second_micro: (incomePerMs * MS_PER_SECOND).toString(),
        arrived_micro: movedTotal.toString(),
        delivery_coins_micro: deliveryCoins.toString(),
        shop_coins_micro: shopCoins.toString(),
        completed: [],
      });
    }

    this.assertInvariants();
    return {
      start_ms: start,
      end_ms: this.clockMs,
      credited_ms: elapsedMs,
      arrived_micro: delivered.toString(),
      shop_coins_micro: passive.toString(),
      completed,
      segments,
    };
  }

  advanceTime(deltaMs: number, wallMs?: number): AdvanceResult {
    if (typeof deltaMs !== 'number' || !Number.isInteger(deltaMs)) {
      throw new EconomyError('deltaMs must be an integer');
    }
    const clamped = Math.max(0, deltaMs);
    const result = this.simulatePiecewise(clamped);
    if (wallMs === undefined) {
      this.savedWallMs += clamped;
    } else {
      this.savedWallMs = Math.max(this.savedWallMs, requireInt(wallMs, 'wallMs', 0));
    }
    return result;
  }

  advance(elapsedMs: number, wallMs?: number): AdvanceResult {
    return this.advanceTime(elapsedMs, wallMs);
  }

  advanceTo(targetMs: number, wallMs?: number): AdvanceResult {
    const target = requireInt(targetMs, 'targetMs', 0);
    return this.advanceTime(Math.max(0, target - this.clockMs), wallMs);
  }

  restoreAt(wallMs: number): RestoreResult {
    const calc = calculateOfflineProgress(
      this.savedWallMs,
      wallMs,
      this.config.offline.maximum_elapsed_ms,
    );
    const result = this.simulatePiecewise(calc.creditedMs);
    this.savedWallMs = calc.nextSavedWallMs;
    return {
      ...result,
      wall_elapsed_ms: calc.wallElapsedMs,
      capped_ms: calc.cappedMs,
      saved_wall_ms: this.savedWallMs,
    };
  }

  beginSession(
    sessionId: string,
    districtId: DistrictId = 'residential',
    mode = 'normal',
    options?: { atMs?: number },
  ): ActiveSessionState {
    this.eventTime(options?.atMs);
    if (this.activeSession !== null) {
      throw new EconomyError('a session is already active');
    }
    if (typeof sessionId !== 'string' || !sessionId || this.usedSessionIds.has(sessionId)) {
      throw new EconomyError('session_id must be nonempty and unused in this city');
    }
    if (!this.config.material_generation.modes.includes(mode)) {
      throw new EconomyError('unknown session mode');
    }
    if (!this.requireDistrict(districtId).open) {
      throw new EconomyError('destination is not open');
    }
    const factor = this.materialMultiplier();
    this.activeSession = {
      sessionId,
      districtId,
      mode,
      multiplierNumerator: factor.numerator,
      multiplierDenominator: factor.denominator,
      cityId: this.cityId,
      startedAtMs: this.clockMs,
      generatedStartMicro: this.lifetime.generatedMicro,
      arrivedStartMicro: this.cityArrivedMicro,
      deliveryCoinsStartMicro: this.lifetime.deliveryCoinsMicro,
      shopCoinsStartMicro: this.lifetime.shopCoinsMicro,
    };
    this.usedSessionIds.add(sessionId);
    return { ...this.activeSession };
  }

  endSession(options?: { atMs?: number }): SessionSummary | null {
    this.eventTime(options?.atMs);
    const s = this.activeSession;
    if (s !== null) {
      this.lastSessionSummary = {
        session_id: s.sessionId,
        city_id: s.cityId,
        district_id: s.districtId,
        mode: s.mode,
        start_ms: s.startedAtMs,
        end_ms: this.clockMs,
        generated_micro: (this.lifetime.generatedMicro - s.generatedStartMicro).toString(),
        arrived_during_session_micro: (this.cityArrivedMicro - s.arrivedStartMicro).toString(),
        delivery_coins_micro: (
          this.lifetime.deliveryCoinsMicro - s.deliveryCoinsStartMicro
        ).toString(),
        shop_coins_micro: (this.lifetime.shopCoinsMicro - s.shopCoinsStartMicro).toString(),
        arrivals_include_preexisting_queue: true,
        remaining_queue_micro: this.districts[s.districtId].queueMicro.toString(),
      };
    }
    this.activeSession = null;
    return this.lastSessionSummary ? { ...this.lastSessionSummary } : null;
  }

  applyTypingFact(
    fact: ConfirmedFact,
    snapshot?: EconomySnapshot,
    options?: { atMs?: number; cityId?: string },
  ): FactApplyResult {
    this.eventTime(options?.atMs);
    const cityId = options?.cityId ?? this.cityId;
    if (cityId !== this.cityId) {
      return { applied: false, reason: 'stale_city', generatedMicro: '0' };
    }
    requireInt(fact.factSequence, 'factSequence', 0);
    if (typeof fact.sessionId !== 'string' || !fact.sessionId) {
      throw new EconomyError('fact.sessionId must be nonempty');
    }

    const key = JSON.stringify([cityId, fact.sessionId, fact.factSequence]);
    const payload =
      fact.type === 'WordCompleted'
        ? {
            kind: 'WordCompleted',
            wordId: fact.wordId,
            canonicalLength: fact.canonicalLength,
            mistakes: fact.mistakes,
            wordPosition: fact.wordPosition,
          }
        : fact.type === 'DeliveryCommitted'
          ? {
              kind: 'DeliveryCommitted',
              reason: fact.reason,
              cargoCount: fact.cargoCount,
              bonus: fact.bonus,
              precedingWordPosition: fact.precedingWordPosition,
            }
          : { kind: fact.type };
    const fingerprint = canonicalStringify(payload);

    if (key in this.factLedger) {
      if (this.factLedger[key] !== fingerprint) {
        throw new EconomyError('fact identifier reused with different content');
      }
      return { applied: false, reason: 'duplicate', generatedMicro: '0' };
    }

    let mult: Rational;
    let districtId: DistrictId;
    if (snapshot !== undefined) {
      const d = this.requireDistrict(snapshot.districtId);
      if (!d.open) {
        throw new EconomyError('destination is not open');
      }
      mult = multiplyRationals(
        this.packagingMultiplier(snapshot.packagingLevel),
        this.researchMultiplier('materials', snapshot.materialsResearchRank),
      );
      districtId = snapshot.districtId;
    } else {
      const session = this.activeSession;
      if (session === null || session.sessionId !== fact.sessionId) {
        throw new EconomyError('the referenced session is not active');
      }
      mult = {
        numerator: session.multiplierNumerator,
        denominator: session.multiplierDenominator,
      };
      districtId = session.districtId;
    }

    if (fact.type === 'WordCompleted') {
      requireInt(fact.canonicalLength, 'canonicalLength', 1);
      requireInt(fact.mistakes, 'mistakes', 0);
      const baseFactor = this.config.material_generation.base_material_per_length;
      const base: Rational = {
        numerator: BigInt(fact.canonicalLength) * BigInt(baseFactor.numerator),
        denominator: BigInt(baseFactor.denominator),
      };
      const combined = multiplyRationals(base, mult);
      const amount = exactDiv(combined.numerator * this.unit, combined.denominator, 'word material');
      this.districts[districtId].queueMicro += amount;
      this.lifetime.generatedMicro += amount;
      this.lifetime.completedWords += 1;
      this.factLedger[key] = fingerprint;
      return {
        applied: true,
        generatedMicro: amount.toString(),
        districtId,
        sessionMultiplier: {
          numerator: Number(mult.numerator),
          denominator: Number(mult.denominator),
        },
      };
    }

    if (fact.type === 'DeliveryCommitted') {
      requireInt(fact.bonus, 'bonus', 0);
      requireInt(fact.cargoCount, 'cargoCount', 0);
      const cfg = this.config.material_generation;
      if (!cfg.shipment_reasons.includes(fact.reason)) {
        throw new EconomyError('unknown shipment reason');
      }
      if (fact.cargoCount > cfg.maximum_cargo_count) {
        throw new EconomyError('too many cargo items');
      }
      if (fact.reason === 'full' && fact.cargoCount !== cfg.maximum_cargo_count) {
        throw new EconomyError('full shipment requires 5 items');
      }
      if (
        (fact.reason === 'deadline' || fact.reason === 'skip') &&
        (fact.cargoCount < 1 || fact.cargoCount > 5)
      ) {
        throw new EconomyError('deadline or skip shipment requires completed cargo');
      }
      if (fact.reason === 'extra' && fact.cargoCount !== 0) {
        throw new EconomyError('extra shipment cannot count cargo again');
      }
      const bonusFactor = cfg.bonus_material_per_point;
      const base: Rational = {
        numerator: BigInt(fact.bonus) * BigInt(bonusFactor.numerator),
        denominator: BigInt(bonusFactor.denominator),
      };
      const combined = multiplyRationals(base, mult);
      const amount = exactDiv(
        combined.numerator * this.unit,
        combined.denominator,
        'bonus material',
      );
      this.districts[districtId].queueMicro += amount;
      this.lifetime.generatedMicro += amount;
      this.lifetime.economicShipments += 1;
      const legacy = cfg.legacy_achievement_shipment_reasons.includes(fact.reason);
      if (legacy) {
        this.lifetime.legacyShipments += 1;
      }
      this.factLedger[key] = fingerprint;
      return {
        applied: true,
        bonusPoints: fact.bonus,
        generatedMicro: amount.toString(),
        legacyDeliveryCounted: legacy,
        districtId,
      };
    }

    this.factLedger[key] = fingerprint;
    return { applied: true, generatedMicro: '0', districtId };
  }

  developmentCost(
    districtId: DistrictId,
    targetStage: number,
  ): { materialsMicro: bigint; coinsMicro: bigint } {
    const dCfg = this.districtConfigMap.get(districtId);
    const sCfg = this.stageConfigMap.get(targetStage);
    if (!dCfg || !sCfg) {
      throw new EconomyError('unknown development stage or district');
    }
    const mult = BigInt(dCfg.cost_multiplier);
    return {
      materialsMicro: BigInt(sCfg.base_materials_micro) * mult,
      coinsMicro: 0n,
    };
  }

  grantTutorialSupplies(): { materialsMicro: bigint; coinsMicro: bigint } {
    this.requireIdle();
    const residential = this.requireDistrict('residential');
    const firstBuildingCost = this.developmentCost('residential', 1).materialsMicro;
    const firstEquipmentCost = BigInt(this.nextPriceCoins('packaging', 0)) * this.unit;
    const materialsMicro = residential.stage === 0 && residential.stockMicro < firstBuildingCost
      ? ceilDiv(firstBuildingCost - residential.stockMicro, this.unit) * this.unit
      : 0n;
    const coinsMicro = this.packagingLevel === 0 && this.coinsMicro < firstEquipmentCost
      ? ceilDiv(firstEquipmentCost - this.coinsMicro, this.unit) * this.unit
      : 0n;
    residential.stockMicro += materialsMicro;
    this.coinsMicro += coinsMicro;
    return { materialsMicro, coinsMicro };
  }

  private autoOpenUnlockedDistricts(): DistrictId[] {
    const stageSum = Object.values(this.districts).reduce((acc, x) => acc + x.stage, 0);
    const opened: DistrictId[] = [];
    for (const cfg of this.config.districts) {
      const id = cfg.id as DistrictId;
      const d = this.districts[id];
      if (!d.open && stageSum >= cfg.unlock_stage_sum) {
        d.open = true;
        d.crews = this.config.initial.crews_per_open_route;
        opened.push(id);
      }
    }
    return opened;
  }

  upgradeDistrict(
    districtId: DistrictId,
    options?: OperationOptions,
  ): {
    completed: ConstructionHistoryItem[];
    openedDistricts: DistrictId[];
    applied?: boolean;
    reason?: string;
  } {
    this.eventTime(options?.atMs);
    const ev = this.checkEconomyEventId(options?.economyEventId, {
      op: 'upgradeDistrict',
      districtId,
    });
    if (ev.isDuplicate) {
      return { applied: false, reason: 'duplicate', completed: [], openedDistricts: [] };
    }
    this.requireIdle();
    const d = this.requireDistrict(districtId);
    if (!d.open || d.stage >= this.config.development.maximum_stage) {
      throw new EconomyError('district cannot upgrade');
    }
    const targetStage = d.stage + 1;
    const cost = this.developmentCost(districtId, targetStage);
    if (d.stockMicro < cost.materialsMicro) {
      throw new EconomyError('insufficient materials to upgrade district');
    }
    d.stockMicro -= cost.materialsMicro;
    d.stage = targetStage;
    if (d.stage === 1) {
      d.shops += this.config.development.free_shops_at_stage_one;
    }
    const item: ConstructionHistoryItem = {
      district_id: districtId,
      stage: d.stage,
      clock_ms: this.clockMs,
      consumed_micro: cost.materialsMicro.toString(),
    };
    this.constructionHistory.push(item);
    const openedDistricts = this.autoOpenUnlockedDistricts();
    this.commitEconomyEventId(ev.key, ev.fingerprint);
    return { completed: [item], openedDistricts, applied: true };
  }

  openDistrict(districtId: DistrictId, options?: OperationOptions): { applied: boolean; reason?: string } {
    this.eventTime(options?.atMs);
    const ev = this.checkEconomyEventId(options?.economyEventId, {
      op: 'openDistrict',
      districtId,
    });
    if (ev.isDuplicate) {
      return { applied: false, reason: 'duplicate' };
    }
    this.requireIdle();
    const d = this.requireDistrict(districtId);
    const cfg = this.districtConfigMap.get(districtId)!;
    if (d.open) {
      throw new EconomyError('district is already open');
    }
    const stageSum = Object.values(this.districts).reduce((acc, x) => acc + x.stage, 0);
    if (stageSum < cfg.unlock_stage_sum) {
      throw new EconomyError('current development stage sum is too low');
    }
    d.open = true;
    d.crews = this.config.initial.crews_per_open_route;
    this.commitEconomyEventId(ev.key, ev.fingerprint);
    return { applied: true };
  }

  nextPriceCoins(kind: EquipmentKind, current: number, districtId?: DistrictId): number {
    requireInt(current, 'current', 0);
    const cfg = this.config.equipment[kind];
    if (current >= cfg.maximum || (kind === 'crews' && current < 1)) {
      throw new EconomyError('no next price at this ownership count');
    }
    let mult = 1n;
    if (kind !== 'packaging') {
      if (!districtId || !this.districtConfigMap.has(districtId)) {
        throw new EconomyError('district_id is required');
      }
      mult = BigInt(this.districtConfigMap.get(districtId)!.cost_multiplier);
    }
    const p = cfg.price;
    const exponent = current + p.exponent_offset;
    const num = BigInt(p.base_coins) * mult * powBigInt(BigInt(p.growth_numerator), exponent);
    const den = powBigInt(BigInt(p.growth_denominator), exponent);
    return Number(ceilDiv(num, den));
  }

  quotePurchase(
    kind: EquipmentKind,
    quantity: PurchaseQuantity = 1,
    districtId: DistrictId | null = null,
  ): PurchaseQuote {
    if (quantity !== 'max') {
      requireInt(quantity, 'quantity', 1);
    }
    if (quantity !== 1 && quantity !== 10 && quantity !== 'max') {
      throw new EconomyError('quantity must be 1, 10 or max');
    }
    const cfg = this.config.equipment[kind];
    let current: number;
    let cap: number;
    if (kind === 'packaging') {
      current = this.packagingLevel;
      cap = cfg.maximum;
    } else {
      if (!districtId) {
        throw new EconomyError('district_id is required');
      }
      const d = this.requireDistrict(districtId);
      if (!d.open) {
        throw new EconomyError('district is not open');
      }
      current = kind === 'crews' ? d.crews : d.shops;
      cap =
        kind === 'crews'
          ? cfg.maximum
          : d.stage > 0
            ? this.stageConfigMap.get(d.stage)!.shop_cap
            : 0;
    }

    const requested = quantity === 'max' ? cap - current : quantity;
    const limit = Math.min(requested, cap - current);
    let count = 0;
    let total = 0;
    const prices: number[] = [];
    for (let offset = 0; offset < limit; offset++) {
      const p = this.nextPriceCoins(kind, current + offset, districtId ?? undefined);
      if (BigInt(total + p) * this.unit > this.coinsMicro) {
        break;
      }
      prices.push(p);
      total += p;
      count += 1;
    }
    const after = current + count;
    const totalMicro = BigInt(total) * this.unit;

    const quote: PurchaseQuote = {
      kind,
      district_id: districtId,
      quantity,
      count,
      requested_count: requested,
      current,
      after,
      cap,
      prices_coins: prices,
      total_cost_coins: total,
      total_cost_micro: totalMicro.toString(),
      limited_by_cap: requested > cap - current,
      limited_by_funds: count < limit,
    };

    if (kind === 'packaging') {
      const before = this.materialMultiplier();
      const afterMult = multiplyRationals(
        this.packagingMultiplier(after),
        this.researchMultiplier('materials'),
      );
      quote.before_multiplier = {
        numerator: Number(before.numerator),
        denominator: Number(before.denominator),
      };
      quote.after_multiplier = {
        numerator: Number(afterMult.numerator),
        denominator: Number(afterMult.denominator),
      };
    } else if (kind === 'crews') {
      const id = districtId!;
      quote.before_per_second_micro = this.transportPerSecondMicro(id).toString();
      quote.after_per_second_micro = this.transportPerSecondMicro(id, after).toString();
      quote.queue_micro = this.districts[id].queueMicro.toString();
      quote.before_wait_ms = this.waitMs(id);
      quote.after_wait_ms = this.waitMs(id, after);
      quote.wait_assumption = 'no_additional_arrivals';
    } else {
      const id = districtId!;
      quote.before_per_second_micro = this.shopIncomePerSecondMicro(id).toString();
      quote.after_per_second_micro = this.shopIncomePerSecondMicro(id, after).toString();
    }

    return quote;
  }

  purchase(
    kind: EquipmentKind,
    quantity: PurchaseQuantity = 1,
    districtId: DistrictId | null = null,
    options?: OperationOptions,
  ): PurchaseQuote {
    this.eventTime(options?.atMs);
    const ev = this.checkEconomyEventId(options?.economyEventId, {
      op: 'purchase',
      kind,
      quantity,
      districtId,
    });
    if (ev.isDuplicate) {
      const q = this.quotePurchase(kind, quantity, districtId);
      return { ...q, count: 0, total_cost_coins: 0, total_cost_micro: '0', applied: false, reason: 'duplicate' };
    }
    this.requireIdle();
    const quote = this.quotePurchase(kind, quantity, districtId);
    this.coinsMicro -= BigInt(quote.total_cost_micro);
    if (kind === 'packaging') {
      this.packagingLevel = quote.after;
    } else if (kind === 'crews') {
      this.districts[districtId!].crews = quote.after;
    } else {
      this.districts[districtId!].shops = quote.after;
    }
    this.assertInvariants();
    this.commitEconomyEventId(ev.key, ev.fingerprint);
    return { ...quote, applied: true };
  }

  buyRailway(
    districtId: DistrictId,
    options?: OperationOptions,
  ): { paid_coins_micro: string; paid_materials_micro: string; applied: boolean; reason?: string } {
    this.eventTime(options?.atMs);
    const ev = this.checkEconomyEventId(options?.economyEventId, {
      op: 'buyRailway',
      districtId,
    });
    if (ev.isDuplicate) {
      return { applied: false, reason: 'duplicate', paid_coins_micro: '0', paid_materials_micro: '0' };
    }
    this.requireIdle();
    const d = this.requireDistrict(districtId);
    const cfg = this.config.railway;
    if (!d.open || d.railway || d.stage < cfg.minimum_stage || d.crews < cfg.minimum_crews) {
      throw new EconomyError('railway prerequisites are not met');
    }
    const mult = BigInt(this.districtConfigMap.get(districtId)!.cost_multiplier);
    const coins = BigInt(cfg.base_coins) * mult * this.unit;
    if (this.coinsMicro < coins) {
      throw new EconomyError('railway needs enough coins');
    }
    this.coinsMicro -= coins;
    d.railway = true;
    this.commitEconomyEventId(ev.key, ev.fingerprint);
    return {
      paid_coins_micro: coins.toString(),
      paid_materials_micro: '0',
      applied: true,
    };
  }

  buyDecoration(id: string, options?: OperationOptions): boolean {
    this.eventTime(options?.atMs);
    const event = this.checkEconomyEventId(options?.economyEventId, { op: 'buyDecoration', id });
    if (event.isDuplicate) return false;
    this.requireIdle();
    const item = DECORATIONS[this.landscape].find(entry => entry.id === id);
    if (!item) throw new EconomyError('unknown decoration for this landscape');
    const level = this.decorationLevels[id] ?? 0;
    if (level >= item.spots.length) return false;
    const price = BigInt(decorationCost(item, level)) * this.unit;
    if (this.coinsMicro < price) return false;
    this.coinsMicro -= price;
    this.decorationLevels[id] = level + 1;
    this.commitEconomyEventId(event.key, event.fingerprint);
    return true;
  }

  buySynergy(synergyId: SynergyId, options?: OperationOptions): { applied: boolean; reason?: string } {
    this.eventTime(options?.atMs);
    const ev = this.checkEconomyEventId(options?.economyEventId, {
      op: 'buySynergy',
      synergyId,
    });
    if (ev.isDuplicate) {
      return { applied: false, reason: 'duplicate' };
    }
    this.requireIdle();
    const cfg = this.synergyConfigMap.get(synergyId);
    if (!cfg || this.synergies.has(synergyId)) {
      throw new EconomyError('unknown or already owned synergy');
    }
    for (const [dId, reqStage] of Object.entries(cfg.requires) as [DistrictId, number][]) {
      if (this.districts[dId].stage < reqStage) {
        throw new EconomyError('synergy stage prerequisites are not met');
      }
    }
    const coins = BigInt(cfg.cost_coins) * this.unit;
    if (this.coinsMicro < coins) {
      throw new EconomyError('insufficient coins for synergy');
    }
    this.coinsMicro -= coins;
    this.synergies.add(synergyId);
    this.commitEconomyEventId(ev.key, ev.fingerprint);
    return { applied: true };
  }

  buyResearch(kind: ResearchId, options?: OperationOptions): {
    kind: ResearchId;
    cost_blueprints: number;
    rank: number;
    before_multiplier: { numerator: number; denominator: number };
    after_multiplier: { numerator: number; denominator: number };
    applied: boolean;
    reason?: string;
  } {
    this.eventTime(options?.atMs);
    const ev = this.checkEconomyEventId(options?.economyEventId, {
      op: 'buyResearch',
      kind,
    });
    if (ev.isDuplicate) {
      const mult = this.researchMultiplier(kind);
      const r = { numerator: Number(mult.numerator), denominator: Number(mult.denominator) };
      return {
        applied: false,
        reason: 'duplicate',
        kind,
        cost_blueprints: 0,
        rank: this.research[kind],
        before_multiplier: r,
        after_multiplier: r,
      };
    }
    this.requireIdle();
    if (!(kind in this.research)) {
      throw new EconomyError('unknown research');
    }
    const rank = this.research[kind];
    if (rank >= this.config.research.maximum_rank) {
      throw new EconomyError('research is at maximum rank');
    }
    const cost = this.config.research.next_rank_cost_blueprints[rank];
    if (this.blueprints < cost) {
      throw new EconomyError('insufficient blueprints');
    }
    const before = this.researchMultiplier(kind);
    this.blueprints -= cost;
    this.research[kind] += 1;
    const after = this.researchMultiplier(kind);
    this.commitEconomyEventId(ev.key, ev.fingerprint);
    return {
      applied: true,
      kind,
      cost_blueprints: cost,
      rank: rank + 1,
      before_multiplier: { numerator: Number(before.numerator), denominator: Number(before.denominator) },
      after_multiplier: { numerator: Number(after.numerator), denominator: Number(after.denominator) },
    };
  }

  adjacentCity(direction: -1 | 1): string | null {
    const city = `city-${Number(this.cityId.slice('city-'.length)) + direction}`;
    return this.archivedCities.has(city) ? city : null;
  }

  visitCity(cityId: string): CityEconomy {
    this.requireIdle();
    const destination = this.archivedCities.get(cityId);
    if (!destination) throw new EconomyError('city is not unlocked');
    const state = this.snapshot();
    const otherCities = [...this.archivedCities.values()].filter((city) => city.city_id !== cityId);
    return CityEconomy.fromSnapshot({ ...state, ...destination, decoration_levels: destination.decoration_levels,
      archived_cities: [...otherCities, archiveCity(state)] });
  }

  newCityPreview(researchKind?: ResearchId): {
    eligible: boolean;
    stage_requirement_met: boolean;
    reward_blueprints: number;
    arrived_micro: string;
    next_reward_threshold_micro: string;
    remaining_to_next_reward_micro: string;
    next_reward_blueprints: number;
    first_building_base_materials: { numerator: number; denominator: number };
    research_preview?: {
      kind: ResearchId;
      current_rank: number;
      next_rank: number;
      cost_blueprints: number | null;
      current_multiplier: { numerator: number; denominator: number };
      next_multiplier: { numerator: number; denominator: number };
    };
  } {
    const cfg = this.config.new_city;
    const threshold = BigInt(cfg.minimum_arrived_micro);
    const level = isqrt(this.cityArrivedMicro / threshold);
    const reward = cfg.reward_unit_blueprints * Number(level);
    const nextLevel = level + 1n;
    const nextThreshold = threshold * nextLevel * nextLevel;
    const readyStages = Object.values(this.districts).every(
      (d) => d.stage >= cfg.minimum_stage_each_district,
    );
    const baseFirst = BigInt(this.stageConfigMap.get(1)!.base_materials_micro) / this.unit;
    const matMult = this.researchMultiplier('materials');
    const firstBuilding = reduceRational(baseFirst * matMult.denominator, matMult.numerator);

    const result: ReturnType<CityEconomy['newCityPreview']> = {
      eligible: this.adjacentCity(1) === null && readyStages && this.cityArrivedMicro >= threshold,
      stage_requirement_met: readyStages,
      reward_blueprints: reward,
      arrived_micro: this.cityArrivedMicro.toString(),
      next_reward_threshold_micro: nextThreshold.toString(),
      remaining_to_next_reward_micro: (nextThreshold - this.cityArrivedMicro).toString(),
      next_reward_blueprints: cfg.reward_unit_blueprints * Number(nextLevel),
      first_building_base_materials: {
        numerator: Number(firstBuilding.numerator),
        denominator: Number(firstBuilding.denominator),
      },
    };

    if (researchKind !== undefined) {
      if (!(researchKind in this.research)) {
        throw new EconomyError('unknown research');
      }
      const rank = this.research[researchKind];
      const maxRank = this.config.research.maximum_rank;
      const nextRank = Math.min(maxRank, rank + 1);
      const currMult = this.researchMultiplier(researchKind);
      const nextMult = this.researchMultiplier(researchKind, nextRank);
      result.research_preview = {
        kind: researchKind,
        current_rank: rank,
        next_rank: nextRank,
        cost_blueprints:
          rank < maxRank ? this.config.research.next_rank_cost_blueprints[rank] : null,
        current_multiplier: {
          numerator: Number(currMult.numerator),
          denominator: Number(currMult.denominator),
        },
        next_multiplier: {
          numerator: Number(nextMult.numerator),
          denominator: Number(nextMult.denominator),
        },
      };
    }

    return result;
  }

  startNewCity(options: {
    confirmed?: boolean;
    location?: string;
    landscape?: LandscapeId;
    atMs?: number;
    economyEventId?: string;
  } = {}): {
    old_city_id: string;
    city_id: string;
    earned_blueprints: number;
    unspent_blueprints: number;
    applied: boolean;
    reason?: string;
  } {
    const {
      confirmed = false,
      location = 'HOME',
      landscape = 'riverside',
      atMs,
      economyEventId,
    } = options;
    this.eventTime(atMs);
    const ev = this.checkEconomyEventId(economyEventId, {
      op: 'startNewCity',
      confirmed,
      location,
      landscape,
    });
    if (ev.isDuplicate) {
      return {
        applied: false,
        reason: 'duplicate',
        old_city_id: this.cityId,
        city_id: this.cityId,
        earned_blueprints: 0,
        unspent_blueprints: this.blueprints,
      };
    }
    this.requireIdle();
    const cfg = this.config.new_city;
    if (!confirmed || !cfg.allowed_locations.includes(location)) {
      throw new EconomyError('confirmed new city requires HOME or RESULT');
    }
    if (!cfg.landscapes.includes(landscape)) {
      throw new EconomyError('unknown landscape');
    }
    const preview = this.newCityPreview();
    if (!preview.eligible) {
      throw new EconomyError('new-city requirements are not met');
    }
    const reward = preview.reward_blueprints;
    const oldCity = this.cityId;
    this.archivedCities.set(oldCity, archiveCity(this.snapshot()));
    this.blueprints += reward;
    this.lifetime.citiesRestarted += 1;
    this.citySequence += 1;
    this.cityId = `city-${this.citySequence}`;
    this.landscape = landscape;
    this.resetCity();
    // Note: resetCity clears economyEventLedger for the new city;
    // old city's events are naturally rejected by stale cityId anyway.
    return {
      applied: true,
      old_city_id: oldCity,
      city_id: this.cityId,
      earned_blueprints: reward,
      unspent_blueprints: this.blueprints,
    };
  }

  snapshot(): CityEconomySnapshot {
    this.assertInvariants();
    const districtsSnap = {} as CityEconomySnapshot['districts'];
    for (const [id, d] of Object.entries(this.districts) as [DistrictId, DistrictState][]) {
      districtsSnap[id] = {
        open: d.open,
        stage: d.stage,
        shops: d.shops,
        crews: d.crews,
        railway: d.railway,
        queue_micro: d.queueMicro.toString(),
        stock_micro: d.stockMicro.toString(),
        arrived_micro: d.arrivedMicro.toString(),
      };
    }

    const snap: CityEconomySnapshot = {
      schema_version: '1.0.0',
      economy_version: this.config.economy_version,
      clock_ms: this.clockMs,
      saved_wall_ms: this.savedWallMs,
      city_sequence: this.citySequence,
      ...(this.archivedCities.size > 0 ? { archived_cities: [...this.archivedCities.values()] } : {}),
      city_id: this.cityId,
      landscape: this.landscape,
      coins_micro: this.coinsMicro.toString(),
      city_arrived_micro: this.cityArrivedMicro.toString(),
      packaging_level: this.packagingLevel,
      ...(Object.keys(this.decorationLevels).length ? { decoration_levels: { ...this.decorationLevels } } : {}),
      blueprints: this.blueprints,
      research: { ...this.research },
      synergies: [...this.synergies].sort(),
      districts: districtsSnap,
      active_session: this.activeSession
        ? {
            session_id: this.activeSession.sessionId,
            district_id: this.activeSession.districtId,
            mode: this.activeSession.mode,
            multiplier_numerator: Number(this.activeSession.multiplierNumerator),
            multiplier_denominator: Number(this.activeSession.multiplierDenominator),
            city_id: this.activeSession.cityId,
            started_at_ms: this.activeSession.startedAtMs,
            generated_start_micro: this.activeSession.generatedStartMicro.toString(),
            arrived_start_micro: this.activeSession.arrivedStartMicro.toString(),
            delivery_coins_start_micro: this.activeSession.deliveryCoinsStartMicro.toString(),
            shop_coins_start_micro: this.activeSession.shopCoinsStartMicro.toString(),
          }
        : null,
      last_session_summary: this.lastSessionSummary ? { ...this.lastSessionSummary } : null,
      used_session_ids: [...this.usedSessionIds].sort(),
      fact_ledger: { ...this.factLedger },
      construction_history: this.constructionHistory.map((item) => ({ ...item })),
      persistent: {
        vocabulary: [...this.persistent.vocabulary],
        stamps: [...this.persistent.stamps],
        records: { ...this.persistent.records },
        settings: { ...this.persistent.settings },
      },
      lifetime: {
        completed_words: this.lifetime.completedWords,
        economic_shipments: this.lifetime.economicShipments,
        legacy_shipments: this.lifetime.legacyShipments,
        generated_micro: this.lifetime.generatedMicro.toString(),
        arrived_micro: this.lifetime.arrivedMicro.toString(),
        delivery_coins_micro: this.lifetime.deliveryCoinsMicro.toString(),
        shop_coins_micro: this.lifetime.shopCoinsMicro.toString(),
        cities_restarted: this.lifetime.citiesRestarted,
      },
    };
    if (Object.keys(this.economyEventLedger).length > 0) {
      snap.economy_event_ledger = { ...this.economyEventLedger };
    }
    return snap;
  }

  static fromSnapshot(state: CityEconomySnapshot): CityEconomy {
    const model = new CityEconomy();
    if (state.economy_version !== model.config.economy_version) {
      throw new EconomyError('save and economy configuration versions differ');
    }
    model.clockMs = requireInt(state.clock_ms, 'clock_ms', 0);
    model.savedWallMs = requireInt(state.saved_wall_ms, 'saved_wall_ms', 0);
    model.citySequence = requireInt(state.city_sequence, 'city_sequence', 1);
    model.archivedCities = new Map((state.archived_cities ?? []).map((city) => [city.city_id, city]));
    model.packagingLevel = requireInt(state.packaging_level, 'packaging_level', 0);
    model.blueprints = requireInt(state.blueprints, 'blueprints', 0);
    model.cityId = state.city_id;
    model.landscape = state.landscape;
    for (const item of DECORATIONS[model.landscape]) {
      const level = requireInt(state.decoration_levels?.[item.id] ?? 0, item.id, 0);
      if (level > item.spots.length) throw new EconomyError('invalid decoration level');
      if (level) model.decorationLevels[item.id] = level;
    }
    model.coinsMicro = parseMicro(state.coins_micro, 'coins_micro');
    model.cityArrivedMicro = parseMicro(state.city_arrived_micro, 'city_arrived_micro');
    model.research = { ...state.research };
    model.synergies = new Set(state.synergies);

    const districts = {} as Record<DistrictId, DistrictState>;
    for (const [id, raw] of Object.entries(state.districts) as [
      DistrictId,
      CityEconomySnapshot['districts'][DistrictId],
    ][]) {
      districts[id] = {
        open: raw.open,
        stage: requireInt(raw.stage, `${id}.stage`, 0),
        shops: requireInt(raw.shops, `${id}.shops`, 0),
        crews: requireInt(raw.crews, `${id}.crews`, 0),
        railway: raw.railway,
        queueMicro: parseMicro(raw.queue_micro, `${id}.queue_micro`),
        stockMicro: parseMicro(raw.stock_micro, `${id}.stock_micro`),
        arrivedMicro: parseMicro(raw.arrived_micro, `${id}.arrived_micro`),
      };
    }
    model.districts = districts;

    if (state.active_session) {
      const s = state.active_session;
      model.activeSession = {
        sessionId: s.session_id,
        districtId: s.district_id,
        mode: s.mode,
        multiplierNumerator: BigInt(requireInt(s.multiplier_numerator, 'multiplier_numerator', 1)),
        multiplierDenominator: BigInt(
          requireInt(s.multiplier_denominator, 'multiplier_denominator', 1),
        ),
        cityId: s.city_id,
        startedAtMs: requireInt(s.started_at_ms, 'started_at_ms', 0),
        generatedStartMicro: parseMicro(s.generated_start_micro, 'generated_start_micro'),
        arrivedStartMicro: parseMicro(s.arrived_start_micro, 'arrived_start_micro'),
        deliveryCoinsStartMicro: parseMicro(
          s.delivery_coins_start_micro,
          'delivery_coins_start_micro',
        ),
        shopCoinsStartMicro: parseMicro(s.shop_coins_start_micro, 'shop_coins_start_micro'),
      };
    } else {
      model.activeSession = null;
    }

    model.lastSessionSummary = state.last_session_summary
      ? { ...state.last_session_summary }
      : null;
    model.usedSessionIds = new Set(state.used_session_ids);
    model.factLedger = { ...state.fact_ledger };
    model.economyEventLedger = state.economy_event_ledger
      ? { ...state.economy_event_ledger }
      : {};
    model.constructionHistory = state.construction_history.map((item) => ({ ...item }));
    model.persistent = {
      vocabulary: [...state.persistent.vocabulary],
      stamps: [...state.persistent.stamps],
      records: { ...state.persistent.records },
      settings: { ...state.persistent.settings },
    };
    model.lifetime = {
      completedWords: requireInt(state.lifetime.completed_words, 'completed_words', 0),
      economicShipments: requireInt(state.lifetime.economic_shipments, 'economic_shipments', 0),
      legacyShipments: requireInt(state.lifetime.legacy_shipments, 'legacy_shipments', 0),
      generatedMicro: parseMicro(state.lifetime.generated_micro, 'lifetime.generated_micro'),
      arrivedMicro: parseMicro(state.lifetime.arrived_micro, 'lifetime.arrived_micro'),
      deliveryCoinsMicro: parseMicro(
        state.lifetime.delivery_coins_micro,
        'lifetime.delivery_coins_micro',
      ),
      shopCoinsMicro: parseMicro(state.lifetime.shop_coins_micro, 'lifetime.shop_coins_micro'),
      citiesRestarted: requireInt(state.lifetime.cities_restarted, 'cities_restarted', 0),
    };
    model.assertInvariants();
    return model;
  }

  assertInvariants(): void {
    if (this.coinsMicro < 0n || this.cityArrivedMicro < 0n) {
      throw new EconomyError('micro resources must be nonnegative');
    }
    requireInt(this.blueprints, 'blueprints', 0);
    requireInt(this.packagingLevel, 'packagingLevel', 0);
    requireInt(this.clockMs, 'clockMs', 0);
    requireInt(this.savedWallMs, 'savedWallMs', 0);

    if (this.packagingLevel > this.config.equipment.packaging.maximum) {
      throw new EconomyError('packaging cap exceeded');
    }
    const expectedDistricts = new Set(this.config.districts.map((d) => d.id));
    const actualDistricts = new Set(Object.keys(this.districts));
    if (
      expectedDistricts.size !== actualDistricts.size ||
      [...expectedDistricts].some((id) => !actualDistricts.has(id))
    ) {
      throw new EconomyError('district set differs from configuration');
    }

    const expectedResearch = new Set(this.config.research.types.map((r) => r.id));
    const actualResearch = new Set(Object.keys(this.research));
    if (
      expectedResearch.size !== actualResearch.size ||
      [...expectedResearch].some((id) => !actualResearch.has(id))
    ) {
      throw new EconomyError('research set differs from configuration');
    }
    for (const rank of Object.values(this.research)) {
      if (requireInt(rank, 'research rank', 0) > this.config.research.maximum_rank) {
        throw new EconomyError('research cap exceeded');
      }
    }

    for (const [id, d] of Object.entries(this.districts) as [DistrictId, DistrictState][]) {
      requireInt(d.stage, `${id}.stage`, 0);
      requireInt(d.shops, `${id}.shops`, 0);
      requireInt(d.crews, `${id}.crews`, 0);
      if (d.queueMicro < 0n || d.stockMicro < 0n || d.arrivedMicro < 0n) {
        throw new EconomyError(`${id} micro resource must be nonnegative`);
      }
      if (d.stage > this.config.development.maximum_stage) {
        throw new EconomyError('development cap exceeded');
      }
      if (d.open && (d.crews < 1 || d.crews > this.config.equipment.crews.maximum)) {
        throw new EconomyError('open route has invalid crew count');
      }
      if (
        !d.open &&
        (d.crews !== 0 ||
          d.stage !== 0 ||
          d.shops !== 0 ||
          d.queueMicro !== 0n ||
          d.stockMicro !== 0n)
      ) {
        throw new EconomyError('closed route has active resources');
      }
      const cap = d.stage > 0 ? this.stageConfigMap.get(d.stage)!.shop_cap : 0;
      if (d.shops > cap) {
        throw new EconomyError('shop cap exceeded');
      }
    }
  }
}

export { EconomyError, MICRO, formatMicro, formatRate, ceilDiv, isqrt } from './math';
export { OFFLINE_CAP_MS, WorldClock, calculateOfflineProgress } from './worldClock';
