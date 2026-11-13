import { describe, expect, it } from 'vitest';
import { CityEconomy, MICRO_UNIT, initialCityState, type CityState, type EquipmentKind, type ResearchKind, type EconomyMode, type ShipmentReason } from '../../src/economy';
import fixtures from './transaction_fixtures.json';

function json(value: unknown): unknown { return JSON.parse(JSON.stringify(value, (_, v: unknown) => typeof v === 'bigint' ? v.toString() : v)); }
function project(s: CityState) {
  return json({ economyVersion: s.economyVersion, clockMs: s.clockMs, savedWallMs: s.savedWallMs, citySequence: s.citySequence,
    cityId: s.cityId, landscape: s.landscape, coinsMicro: s.coinsMicro, cityArrivedMicro: s.cityArrivedMicro,
    packagingLevel: s.packagingLevel, blueprints: s.blueprints, research: s.research, synergies: s.synergies.slice().sort(),
    districts: s.districts, lastSessionSummary: s.lastSessionSummary, constructionHistory: s.constructionHistory,
    generatedMicro: s.generatedMicro, completedWords: s.completedWords, economicShipments: s.economicShipments,
    legacyShipments: s.legacyShipments, citiesRestarted: s.citiesRestarted, arrivedMicro: s.arrivedMicro,
    deliveryCoinsMicro: s.deliveryCoinsMicro, shopCoinsMicro: s.shopCoinsMicro, usedSessionIds: s.usedSessionIds.slice().sort(), factKeys: Object.keys(s.factLedger).sort(),
  });
}
function setup(name: string) {
  const s = initialCityState();
  if (name === 'plans-investment-unlock-and-boundaries') { s.coinsMicro = 10000n * MICRO_UNIT; s.districts.residential.queueMicro = 500n * MICRO_UNIT; }
  if (name === 'railway-synergies-research-restart') {
    s.coinsMicro = 200000n * MICRO_UNIT;
    for (const d of Object.values(s.districts)) { d.open = true; d.stage = 3; d.shops = 1; d.crews = 10; d.plan = null; d.stockMicro = 20000n * MICRO_UNIT; d.queueMicro = 100n * MICRO_UNIT; }
    s.cityArrivedMicro = 100000n * MICRO_UNIT; s.blueprints = 4;
  }
  if (name === 'offline-restoration-high-water-mark') s.districts.residential.queueMicro = 30n * MICRO_UNIT;
  return new CityEconomy(s);
}
function execute(c: CityEconomy, name: string, args: Record<string, unknown>) {
  const str = (key: string) => args[key] as string; const num = (key: string) => args[key] as number;
  switch (name) {
    case 'begin_session': return c.beginSession(str('session_id'), args.district_id as string | undefined, args.mode as EconomyMode | undefined, args.at_ms as number | undefined);
    case 'end_session': return c.endSession(args.at_ms as number | undefined);
    case 'complete_word': return c.completeWord({cityId: str('city_id'), sessionId: str('session_id'), factSequence: num('fact_sequence'), baseLength: num('base_length'), mistakes: args.mistakes as number | undefined, atMs: args.at_ms as number | undefined});
    case 'ship_cargo': return c.shipCargo({cityId: str('city_id'), sessionId: str('session_id'), factSequence: num('fact_sequence'), scoreSum: num('score_sum'), cargoCount: num('cargo_count'), reason: str('reason') as ShipmentReason, atMs: args.at_ms as number | undefined});
    case 'advance': return c.advance(num('elapsed_ms'));
    case 'advance_to': return c.advanceTo(num('target_ms'));
    case 'restore_at': return c.restoreAt(num('wall_ms'));
    case 'start_plan': return c.startPlan(str('district_id'));
    case 'pause_plan': return c.pausePlan(str('district_id'));
    case 'resume_plan': return c.resumePlan(str('district_id'));
    case 'open_district': return c.openDistrict(str('district_id'));
    case 'purchase': return c.purchase(str('kind') as EquipmentKind, args.quantity as 1 | 10 | 'max' | undefined, args.district_id as string | undefined, args.at_ms as number | undefined);
    case 'buy_railway': return c.buyRailway(str('district_id'));
    case 'buy_synergy': return c.buySynergy(str('synergy_id'));
    case 'buy_research': return c.buyResearch(str('kind') as ResearchKind);
    case 'start_new_city': return c.startNewCity({confirmed: args.confirmed as boolean, location: args.location as 'HOME' | 'RESULT', landscape: str('landscape')});
    default: throw new Error(`Unsupported test action ${name}`);
  }
}

describe('CityEconomy canonical action-by-action Python parity', () => {
  for (const scenario of fixtures) it(scenario.name, () => {
    let c = setup(scenario.name);
    expect(project(c.state)).toEqual(scenario.initial);
    for (const step of scenario.steps) {
      const [name, args] = step.action;
      execute(c, name as string, args as Record<string, unknown>);
      expect(project(c.state), `after ${name as string}`).toEqual(step.expected);
      // Reconstruct between all operations: event ledger/session clocks survive repository roundtrips.
      c = new CityEconomy(c.snapshot());
    }
  });
});

describe('CityEconomy transaction rejection and confirmation boundaries', () => {
  it('rejects every investment entry point throughout each session mode without changing state', () => {
    for (const mode of ['normal', 'skip', 'practice', 'review', 'intro'] as const) {
      const c = setup('railway-synergies-research-restart');
      c.beginSession(`gate-${mode}`, 'residential', mode);
      const operations = [
        () => c.purchase('packaging'), () => c.purchase('crews', 1, 'residential'), () => c.purchase('shops', 1, 'residential'),
        () => c.startPlan('residential'), () => c.pausePlan('residential'), () => c.resumePlan('residential'),
        () => c.openDistrict('market'), () => c.buyRailway('residential'), () => c.buySynergy('joint_delivery'),
        () => c.buyResearch('materials'), () => c.startNewCity({confirmed: true}),
      ];
      for (const operation of operations) {
        const before = c.snapshot();
        expect(operation).toThrow('End the current session');
        expect(c.state).toEqual(before);
      }
    }
  });
  it('preserves session multipliers, rejects fact collisions and never rewards confirmation or incomplete words', () => {
    const c = new CityEconomy(); c.state.packagingLevel = 1;
    c.beginSession('facts');
    // A captured session cannot be revalued even if a later restored state has changed upgrades.
    c.state.packagingLevel = 10;
    const identity = {cityId: 'city-1', sessionId: 'facts', factSequence: 1};
    expect(c.completeWord({...identity, baseLength: 3, mistakes: 2}).generatedMicro).toBe(3_750_000n);
    const before = c.snapshot();
    expect(c.completeWord({...identity, baseLength: 3, mistakes: 2}).reason).toBe('duplicate');
    expect(c.state).toEqual(before);
    expect(() => c.completeWord({...identity, baseLength: 4, mistakes: 2})).toThrow('reused with different content');
    expect(c.state).toEqual(before);
    expect(c.completeWord({...identity, factSequence: 2, baseLength: 3, confirmation: true}).generatedMicro).toBe(0n);
    expect(c.completeWord({...identity, factSequence: 3, baseLength: 3, completed: false}).generatedMicro).toBe(0n);
    expect(c.state.completedWords).toBe(1);
    c.endSession(); expect(c.state.generatedMicro).toBe(3_750_000n);
    expect(() => c.beginSession('facts')).toThrow('unused');
  });
  it('uses only free stock for railway and retains paused reservations', () => {
    const c = setup('railway-synergies-research-restart'); const d = c.state.districts.residential;
    d.stockMicro = 499n * MICRO_UNIT;
    d.plan = {targetStage: 4, requiredMicro: 2400n * MICRO_UNIT, reservedMicro: 2000n * MICRO_UNIT, paidCoinsMicro: 3000n * MICRO_UNIT, paused: true};
    const before = c.snapshot();
    expect(() => c.buyRailway('residential')).toThrow('unreserved stock'); expect(c.state).toEqual(before);
    d.stockMicro += MICRO_UNIT;
    c.buyRailway('residential'); expect(d.stockMicro).toBe(0n); expect(d.plan.reservedMicro).toBe(2000n * MICRO_UNIT);
  });
  it('uses exact arrived thresholds and preserves lifetime/research while discarding former city ledgers', () => {
    const c = setup('railway-synergies-research-restart');
    c.state.cityArrivedMicro = 100000n * MICRO_UNIT - 1n;
    expect(c.newCityPreview().eligible).toBe(false);
    expect(() => c.startNewCity({confirmed: true})).toThrow('requirements');
    c.state.cityArrivedMicro++;
    c.state.arrivedMicro = 170000n * MICRO_UNIT;
    c.buyResearch('materials');
    expect(c.newCityPreview().firstBuildingBaseMaterials).toEqual({numerator: 24n, denominator: 1n});
    expect(() => c.startNewCity()).toThrow('Confirmed');
    c.startNewCity({confirmed: true});
    expect(c.state.arrivedMicro).toBe(170000n * MICRO_UNIT); expect(c.state.cityArrivedMicro).toBe(0n);
    expect(c.state.research.materials).toBe(1); expect(c.state.blueprints).toBe(6);
    expect(c.completeWord({cityId: 'city-1', sessionId: 'former', factSequence: 1, baseLength: 10}).reason).toBe('stale_city');
    for (const [materials, reward] of [[399999, 3], [400000, 6], [899999, 6], [900000, 9]]) {
      c.state.cityArrivedMicro = BigInt(materials) * MICRO_UNIT; expect(c.newCityPreview().rewardBlueprints).toBe(reward);
    }
  });
  it('keeps transport wait estimates tied to existing queue and applies per-item funding limits', () => {
    const c = new CityEconomy();
    c.state.coinsMicro = 40n * MICRO_UNIT; c.state.districts.residential.queueMicro = 600n * MICRO_UNIT;
    expect(c.quotePurchase('crews', 1, 'residential')).toMatchObject({beforeWaitMs: 150000n, afterWaitMs: 75000n});
    c.purchase('crews', 1, 'residential');
    expect(c.state.districts.residential.queueMicro).toBe(600n * MICRO_UNIT);
    c.advance(1000); expect(c.state.cityArrivedMicro).toBe(8n * MICRO_UNIT);
    c.state.coinsMicro = 110n * MICRO_UNIT;
    expect(c.purchase('packaging', 10)).toMatchObject({count: 2, after: 2, totalCostMicro: 109n * MICRO_UNIT});
    expect(c.state.coinsMicro).toBe(MICRO_UNIT);
  });
  it('counts only manual/full for legacy achievements while deadline/skip still generate economic materials', () => {
    const c = new CityEconomy(); c.beginSession('reasons');
    let sequence = 0;
    for (const [reason, cargoCount] of [['manual', 1], ['full', 5], ['deadline', 1], ['skip', 1]] as const) {
      c.shipCargo({cityId:'city-1', sessionId:'reasons', factSequence:sequence++, scoreSum:50 * cargoCount, cargoCount, reason});
    }
    expect(c.state.legacyShipments).toBe(2); expect(c.state.economicShipments).toBe(4);
    expect(c.state.generatedMicro).toBe(28n * MICRO_UNIT);
    const before = c.snapshot();
    expect(() => c.shipCargo({cityId:'city-1', sessionId:'reasons', factSequence:sequence, scoreSum:50, cargoCount:5, reason:'manual'})).toThrow('Invalid cargo');
    expect(c.state).toEqual(before);
  });
});


it('rejects delayed old-city facts before their timestamps can advance or invalidate the new city', () => {
  const state = initialCityState(100000);
  state.cityId = 'city-2'; state.citySequence = 2; state.clockMs = 100000;
  const district = state.districts.residential;
  district.stage = 1; district.shops = 1; district.plan = null; district.queueMicro = 100n * MICRO_UNIT;
  const c = new CityEconomy(state);
  const before = c.snapshot();
  for (const atMs of [200000, -1, Number.NaN]) {
    const identity = {cityId: 'city-1', sessionId: 'delayed', factSequence: 1, atMs};
    expect(c.completeWord({...identity, baseLength: 10})).toEqual({applied: false, reason: 'stale_city', generatedMicro: 0n});
    expect(c.shipCargo({...identity, scoreSum: 50, cargoCount: 1, reason: 'manual'})).toEqual({applied: false, reason: 'stale_city', generatedMicro: 0n});
    expect(c.state).toEqual(before);
  }
});
