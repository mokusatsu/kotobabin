import config from '../../spec/initial/data/economy_config.json';

export type EquipmentKind = 'packaging' | 'crews' | 'shops';
export type DistrictId = typeof config.districts[number]['id'];
export type ResearchKind = 'materials' | 'logistics' | 'commerce';
export interface Rational { numerator: bigint; denominator: bigint }
export const MICRO_UNIT = BigInt(config.arithmetic.micro_unit);
const min = (a: bigint, b: bigint) => a < b ? a : b;
const ceilDiv = (n: bigint, d: bigint) => (n + d - 1n) / d;
const rational = (numerator: bigint, denominator = 1n): Rational => {
  let a = numerator; let b = denominator;
  while (b) { const rest = a % b; a = b; b = rest; }
  return { numerator: numerator / a, denominator: denominator / a };
};
const multiply = (a: Rational, b: Rational) => rational(a.numerator * b.numerator, a.denominator * b.denominator);
const exact = (n: bigint, factor: Rational) => {
  const product = n * factor.numerator;
  if (product % factor.denominator) throw new RangeError('Amount is not exactly representable in micro units');
  return product / factor.denominator;
};
const districtConfig = (id: string) => {
  const d = config.districts.find(item => item.id === id);
  if (!d) throw new RangeError('Unknown district');
  return d;
};

/** Canonical formulas only: consume confirmed facts; never change typing scores. */
export class EconomyFormulas {
  milestoneFactor(count: number): bigint {
    return BigInt(config.equipment.milestone_factor) ** BigInt(config.equipment.milestones.filter(n => count >= n).length);
  }
  researchMultiplier(rank: number): Rational {
    const c = config.research.multiplier;
    return rational(BigInt(c.base_numerator + c.rank_numerator * rank), BigInt(c.denominator));
  }
  packagingMultiplier(level: number): Rational {
    const c = config.equipment.packaging.material_multiplier;
    return rational(BigInt(c.base_numerator + c.level_numerator * level) * this.milestoneFactor(level), BigInt(c.denominator));
  }
  materialMultiplier(level: number, materialsRank = 0): Rational {
    return multiply(this.packagingMultiplier(level), this.researchMultiplier(materialsRank));
  }
  nextPriceCoins(kind: EquipmentKind, current: number, districtId?: DistrictId): bigint {
    const c = config.equipment[kind];
    if (current >= c.maximum || current < (kind === 'crews' ? 1 : 0)) throw new RangeError('No next equipment price');
    const multiplier = kind === 'packaging' ? 1 : districtConfig(districtId ?? '').cost_multiplier;
    const p = c.price; const exponent = BigInt(current + p.exponent_offset);
    return ceilDiv(BigInt(p.base_coins * multiplier) * BigInt(p.growth_numerator) ** exponent,
      BigInt(p.growth_denominator) ** exponent);
  }
  purchaseQuote(kind: EquipmentKind, current: number, coinsMicro: bigint, quantity: 1 | 10 | 'max', districtId?: DistrictId, stage = 0) {
    const cap = kind === 'shops' ? (config.development.stages.find(s => s.stage === stage)?.shop_cap ?? 0) : config.equipment[kind].maximum;
    const requested = quantity === 'max' ? cap - current : quantity;
    const limit = Math.min(requested, cap - current);
    const pricesCoins: bigint[] = []; let total = 0n;
    for (let offset = 0; offset < limit; offset++) {
      const price = this.nextPriceCoins(kind, current + offset, districtId);
      if ((total + price) * MICRO_UNIT > coinsMicro) break;
      pricesCoins.push(price); total += price;
    }
    return { count: pricesCoins.length, after: current + pricesCoins.length, cap, requestedCount: requested,
      pricesCoins, totalCostMicro: total * MICRO_UNIT, limitedByCap: requested > cap - current, limitedByFunds: pricesCoins.length < limit };
  }
  wordMaterialMicro(length: number, multiplier: Rational, completed = true, confirmation = false): bigint {
    if (!completed || confirmation) return 0n;
    const c = config.material_generation.base_material_per_length;
    return exact(BigInt(length) * MICRO_UNIT, multiply(multiplier, rational(BigInt(c.numerator), BigInt(c.denominator))));
  }
  shipmentMaterial(scoreSum: number, cargoCount: number, multiplier: Rational) {
    const c = config.material_generation;
    const bonusPoints = Math.floor(scoreSum * cargoCount / c.bonus_divisor);
    const f = c.bonus_material_per_point;
    return { bonusPoints, generatedMicro: exact(BigInt(bonusPoints) * MICRO_UNIT,
      multiply(multiplier, rational(BigInt(f.numerator), BigInt(f.denominator)))) };
  }
  transportPerSecondMicro(d: Pick<DistrictState, 'open' | 'crews' | 'railway'>, logisticsRank = 0, sortingNetwork = false): bigint {
    if (!d.open) return 0n;
    let amount = BigInt(config.equipment.crews.base_material_per_crew_second * d.crews) * MICRO_UNIT * this.milestoneFactor(d.crews);
    amount = exact(amount, this.researchMultiplier(logisticsRank));
    if (d.railway) amount *= BigInt(config.railway.transport_factor);
    if (sortingNetwork) amount *= BigInt(config.synergies.find(s => s.id === 'sorting_network')!.effect.transport_factor!);
    return amount;
  }
  shopIncomePerSecondMicro(id: DistrictId, d: Pick<DistrictState, 'open' | 'stage' | 'shops'>, commerceRank = 0, tourismService = false): bigint {
    if (!d.open || d.stage === 0) return 0n;
    const c = config.equipment.shops;
    let amount = BigInt(districtConfig(id).shop_base_income_per_second_micro) * BigInt(d.shops) * this.milestoneFactor(d.shops)
      * BigInt(c.stage_factor) ** BigInt(d.stage + c.stage_exponent_offset);
    amount = exact(amount, this.researchMultiplier(commerceRank));
    if (tourismService) amount *= BigInt(config.synergies.find(s => s.id === 'tourism_service')!.effect.shop_income_factor!);
    return amount;
  }
  developmentCost(id: DistrictId, stage: number) {
    const c = config.development.stages.find(s => s.stage === stage);
    if (!c) throw new RangeError('Unknown development stage');
    const multiplier = BigInt(districtConfig(id).cost_multiplier);
    return { materialsMicro: BigInt(c.base_materials_micro) * multiplier, coinsMicro: BigInt(c.base_coins_micro) * multiplier };
  }
}

export interface PlanState { targetStage: number; requiredMicro: bigint; reservedMicro: bigint; paidCoinsMicro: bigint; paused: boolean }
export interface DistrictState {
  open: boolean; stage: number; shops: number; crews: number; railway: boolean;
  queueMicro: bigint; stockMicro: bigint; arrivedMicro: bigint; plan: PlanState | null;
}
export interface WorldState {
  clockMs: number; savedWallMs: number; coinsMicro: bigint; cityArrivedMicro: bigint;
  deliveryCoinsMicro: bigint; shopCoinsMicro: bigint;
  research: Record<ResearchKind, number>;
  synergies: string[];
  districts: Record<DistrictId, DistrictState>;
}
export interface Construction { districtId: DistrictId; stage: number; clockMs: number; consumedMicro: bigint }
export interface AdvanceResult { creditedMs: number; arrivedMicro: bigint; shopCoinsMicro: bigint; completed: Construction[] }

export function initialWorldState(wallMs = 0): WorldState {
  const formulas = new EconomyFormulas();
  const districts = Object.fromEntries(config.districts.map(d => [d.id, {
    open: config.initial.open_districts.includes(d.id), stage: 0, shops: 0,
    crews: config.initial.open_districts.includes(d.id) ? config.initial.crews_per_open_route : 0,
    railway: false, queueMicro: 0n, stockMicro: 0n, arrivedMicro: 0n, plan: null,
  }])) as Record<DistrictId, DistrictState>;
  const p = config.initial.active_plan; const cost = formulas.developmentCost(p.district_id, p.target_stage);
  districts[p.district_id]!.plan = { targetStage: p.target_stage, requiredMicro: cost.materialsMicro,
    reservedMicro: 0n, paidCoinsMicro: cost.coinsMicro, paused: false };
  return { clockMs: 0, savedWallMs: wallMs, coinsMicro: BigInt(config.initial.coins_micro), cityArrivedMicro: 0n,
    deliveryCoinsMicro: 0n, shopCoinsMicro: 0n, research: { materials: 0, logistics: 0, commerce: 0 }, synergies: [], districts };
}

/** Independent real-time clock. The caller persists this state and wall timestamp atomically. */
export class WorldClock {
  private formulas = new EconomyFormulas();
  constructor(readonly state: WorldState = initialWorldState()) {}
  private settlePlans(): Construction[] {
    const completed: Construction[] = [];
    for (const [id, d] of Object.entries(this.state.districts)) {
      const p = d.plan;
      if (!p || p.paused) continue;
      const transfer = min(d.stockMicro, p.requiredMicro - p.reservedMicro);
      d.stockMicro -= transfer; p.reservedMicro += transfer;
      if (p.reservedMicro === p.requiredMicro) {
        d.stage = p.targetStage;
        if (d.stage === 1) d.shops += config.development.free_shops_at_stage_one;
        completed.push({ districtId: id, stage: d.stage, clockMs: this.state.clockMs, consumedMicro: p.requiredMicro });
        d.plan = null;
      }
    }
    return completed;
  }
  private advanceElapsed(elapsedMs: number): AdvanceResult {
    if (!Number.isSafeInteger(elapsedMs)) throw new RangeError('Elapsed time must be an integer millisecond');
    const s = this.state; const completed = this.settlePlans();
    let remaining = Math.max(0, elapsedMs); let arrivedMicro = 0n; let shopCoinsMicro = 0n;
    while (remaining > 0) {
      const rates = new Map<DistrictState, bigint>(); let step = remaining; let income = 0n;
      for (const [id, d] of Object.entries(s.districts)) {
        const rate = this.formulas.transportPerSecondMicro(d, s.research.logistics, s.synergies.includes('sorting_network')) / 1000n;
        rates.set(d, rate);
        income += this.formulas.shopIncomePerSecondMicro(id, d, s.research.commerce, s.synergies.includes('tourism_service')) / 1000n;
        if (d.queueMicro > 0n && rate > 0n) {
          const emptyAt = ceilDiv(d.queueMicro, rate);
          if (emptyAt < BigInt(step)) step = Number(emptyAt);
          const p = d.plan;
          if (p && !p.paused) {
            const need = p.requiredMicro - p.reservedMicro;
            const readyAt = ceilDiv(need, rate);
            if (need <= d.queueMicro && readyAt < BigInt(step)) step = Number(readyAt);
          }
        }
      }
      const earned = income * BigInt(step); s.coinsMicro += earned; s.shopCoinsMicro += earned; shopCoinsMicro += earned;
      let movedTotal = 0n;
      for (const d of Object.values(s.districts)) {
        const moved = min(d.queueMicro, rates.get(d)! * BigInt(step));
        d.queueMicro -= moved; d.stockMicro += moved; d.arrivedMicro += moved; movedTotal += moved;
      }
      const reward = s.synergies.includes('joint_delivery')
        ? config.synergies.find(item => item.id === 'joint_delivery')!.effect.delivery_coins_per_material!
        : config.delivery_reward.coins_per_material;
      const delivery = movedTotal * BigInt(reward);
      s.coinsMicro += delivery; s.deliveryCoinsMicro += delivery;
      s.cityArrivedMicro += movedTotal; arrivedMicro += movedTotal;
      s.clockMs += step; remaining -= step; completed.push(...this.settlePlans());
    }
    return { creditedMs: Math.max(0, elapsedMs), arrivedMicro, shopCoinsMicro, completed };
  }
  advance(elapsedMs: number): AdvanceResult {
    const result = this.advanceElapsed(Math.max(0, elapsedMs));
    this.state.savedWallMs += result.creditedMs;
    return result;
  }
  advanceTo(targetMs: number): AdvanceResult { return this.advance(Math.max(0, targetMs - this.state.clockMs)); }
  restoreAt(wallMs: number): AdvanceResult & { wallElapsedMs: number; cappedMs: number } {
    if (!Number.isSafeInteger(wallMs) || wallMs < 0) throw new RangeError('Wall time must be a nonnegative integer millisecond');
    const elapsed = Math.max(0, wallMs - this.state.savedWallMs);
    const credited = Math.min(elapsed, config.offline.maximum_elapsed_ms);
    const result = this.advanceElapsed(credited);
    this.state.savedWallMs = Math.max(this.state.savedWallMs, wallMs);
    return { ...result, wallElapsedMs: elapsed, cappedMs: elapsed - credited };
  }
}
