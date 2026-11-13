import { describe, expect, it } from 'vitest';
import { CityEconomy, EconomyFormulas, MICRO_UNIT, decodeCityState, encodeCityState, executeCityCommand, initialCityState, summarizeCity, type CityCommand } from '../../src/economy';

const run = (c: CityEconomy, body: CityCommand) => executeCityCommand(c, body);
const restored = (c: CityEconomy) => new CityEconomy(decodeCityState(JSON.parse(JSON.stringify(encodeCityState(c.state)))));
function mature() {
  const s = initialCityState(); s.coinsMicro = 200000n * MICRO_UNIT; s.blueprints = 3;
  s.generatedMicro = 100000n * MICRO_UNIT; s.arrivedMicro = s.generatedMicro; s.cityArrivedMicro = s.generatedMicro;
  for (const d of Object.values(s.districts)) { d.open = true; d.stage = 3; d.shops = 1; d.crews = 10; d.plan = null; }
  let consumed = 0n;
  const formulas = new EconomyFormulas();
  for (const [id,d] of Object.entries(s.districts)) {
    for (let stage=1;stage<=3;stage++) d.arrivedMicro += formulas.developmentCost(id,stage).materialsMicro;
    consumed += d.arrivedMicro;
  }
  const free = s.cityArrivedMicro-consumed;
  s.districts.residential.stockMicro = free; s.districts.residential.arrivedMicro += free;
  return new CityEconomy(s);
}

describe('economic command ledger', () => {
  it('applies every investment command once and preserves dedupe across JSON save/restore', () => {
    let c = mature();
    const commands: CityCommand[] = [
      {type:'purchase',kind:'packaging',quantity:10,cityId:'city-1',economyEventId:'purchase'},
      {type:'startPlan',districtId:'market',cityId:'city-1',economyEventId:'start'},
      {type:'pausePlan',districtId:'market',cityId:'city-1',economyEventId:'pause'},
      {type:'resumePlan',districtId:'market',cityId:'city-1',economyEventId:'resume'},
      {type:'buySynergy',synergyId:'joint_delivery',cityId:'city-1',economyEventId:'synergy'},
      {type:'buyResearch',kind:'materials',cityId:'city-1',economyEventId:'research'},
    ];
    for (const command of commands) {
      expect(run(c,command).applied).toBe(true); c = restored(c);
      const before = c.snapshot(); expect(run(c,command).reason).toBe('duplicate'); expect(c.state).toEqual(before);
    }
    const rail: CityCommand = {type:'buyRailway',districtId:'residential',cityId:'city-1',economyEventId:'rail'};
    run(c,rail); c = restored(c); const beforeRail = c.snapshot(); expect(run(c,rail).reason).toBe('duplicate'); expect(c.state).toEqual(beforeRail);
    const restart: CityCommand = {type:'startNewCity',confirmed:true,location:'HOME',landscape:'seaside',cityId:'city-1',economyEventId:'restart'};
    run(c,restart); c = restored(c); const afterRestart = c.snapshot();
    expect(run(c,restart).reason).toBe('duplicate'); expect(c.state).toEqual(afterRestart);
    expect(c.state.cityId).toBe('city-2'); expect(c.state.blueprints).toBe(5);
    const open: CityCommand = {type:'openDistrict',districtId:'market',cityId:'city-2',economyEventId:'open'};
    c.state.districts.residential.stage = 2; c.state.districts.residential.shops = 1; c.state.districts.residential.plan = null; c.state.coinsMicro = 150n * MICRO_UNIT;
    c.state.districts.residential.arrivedMicro = 180n * MICRO_UNIT; c.state.cityArrivedMicro = 180n * MICRO_UNIT; c.state.arrivedMicro += 180n * MICRO_UNIT; c.state.generatedMicro += 180n * MICRO_UNIT;
    run(c,open); c = restored(c); const afterOpen = c.snapshot(); expect(run(c,open).reason).toBe('duplicate'); expect(c.state).toEqual(afterOpen);
  });
  it('rejects conflicting payloads, stale timestamps and failed operations without partial time or resource updates', () => {
    const c = mature();
    const command: CityCommand = {type:'purchase',kind:'packaging',cityId:'city-1',economyEventId:'one',atMs:1000};
    run(c,command); const before = c.snapshot();
    expect(() => run(c,{...command,quantity:10})).toThrow('reused with different content'); expect(c.state).toEqual(before);
    expect(run(c,{...command,cityId:'city-999',atMs:Number.NaN}).reason).toBe('stale_city'); expect(c.state).toEqual(before);
    expect(() => run(c,{type:'buyResearch',kind:'commerce',cityId:'city-1',economyEventId:'no-funds',atMs:100000})).not.toThrow();
    c.state.blueprints = 0;
    const beforeFailure = c.snapshot();
    expect(() => run(c,{type:'buyResearch',kind:'commerce',cityId:'city-1',economyEventId:'failed',atMs:200000})).toThrow('Insufficient blueprints');
    expect(c.state).toEqual(beforeFailure);
  });
  it('allows the same event ID in separate cities and rejects changed former-city restart payloads', () => {
    const c = mature();
    run(c,{type:'purchase',kind:'packaging',cityId:'city-1',economyEventId:'reusable'});
    const restart: CityCommand = {type:'startNewCity',confirmed:true,cityId:'city-1',economyEventId:'restart'};
    run(c,restart);
    const before = c.snapshot(); expect(() => run(c,{...restart,landscape:'highland'})).toThrow('different content'); expect(c.state).toEqual(before);
    c.state.coinsMicro = 50n * MICRO_UNIT;
    expect(run(c,{type:'purchase',kind:'packaging',cityId:'city-2',economyEventId:'reusable'}).applied).toBe(true);
    expect(c.state.packagingLevel).toBe(1);
  });
});

describe('city save boundary', () => {
  it('roundtrips active sessions, confirmed facts and pending queues with arbitrary large micro integers', () => {
    let c = new CityEconomy(); c.state.coinsMicro = 123456789012345678901234567890n;
    c.beginSession('save'); c.completeWord({cityId:'city-1',sessionId:'save',factSequence:1,baseLength:3});
    c = restored(c); const before = c.snapshot();
    expect(c.completeWord({cityId:'city-1',sessionId:'save',factSequence:1,baseLength:3}).reason).toBe('duplicate'); expect(c.state).toEqual(before);
    const original = c.snapshot(); expect(restored(c).state).toEqual(original);
    c.endSession(); expect(restored(c).state).toEqual(c.state);
  });
  it('rejects corrupted resource formats, config versions, costs, ownership and identities without resetting', () => {
    const base = encodeCityState(initialCityState());
    const corruptions = [
      (v: typeof base) => { v.coinsMicro = '-1'; }, (v: typeof base) => { v.coinsMicro = '0.5'; },
      (v: typeof base) => { v.economyVersion = 'old'; }, (v: typeof base) => { v.cityId = 'city-999'; },
      (v: typeof base) => { v.districts.residential.plan!.reservedMicro = '999999999'; },
      (v: typeof base) => { v.districts.residential.plan!.paidCoinsMicro = '10'; },
      (v: typeof base) => { v.districts.market.crews = 1; }, (v: typeof base) => { v.research.materials = 6; },
      (v: typeof base) => { v.districts.residential.shops = 1; },
      (v: typeof base) => { v.districts.residential.queueMicro = '1000000000'; },
      (v: typeof base) => { v.districts.residential.stockMicro = '1'; },
      (v: typeof base) => { v.usedSessionIds = ['a','a']; },
      (v: typeof base) => { v.factLedger['["city-2","absent",1]'] = '{}'; },
      (v: typeof base) => { v.commandLedger['["city-1","operation"]'] = '{"cityId":"city-2","economyEventId":"operation","type":"purchase"}'; },
    ];
    for (const corrupt of corruptions) { const value = structuredClone(base); corrupt(value); expect(() => decodeCityState(value)).toThrow('Invalid city state'); }
    expect(decodeCityState(base)).toEqual(initialCityState());
  });
  it('keeps capped offline credits and the wall high-water mark exact across save/reload and duplicate command', () => {
    let c = new CityEconomy(); c.beginSession('material'); c.completeWord({cityId:'city-1',sessionId:'material',factSequence:1,baseLength:30}); c.endSession();
    c.restoreAt(129600000); c = restored(c); const before = c.snapshot();
    expect(c.restoreAt(129600000).creditedMs).toBe(0); expect(c.state).toEqual(before);
    expect(c.restoreAt(1000).creditedMs).toBe(0); expect(c.state).toEqual(before);
    expect(c.state.coinsMicro).toBe(2939250000n);
  });
  it('returns authoritative display eligibility and previews while sessions lock all investments', () => {
    const c = mature(); const summary = summarizeCity(c.state);
    expect(summary.districts.find(d => d.id === 'residential')).toMatchObject({canStartPlan:true,canBuyRailway:true,railwayPrerequisitesMet:true,shopCap:20});
    expect(summary.synergies.find(s => s.id === 'joint_delivery')?.canBuy).toBe(true);
    expect(summary.research.every(r => r.canBuy)).toBe(true); expect(summary.newCity.canStart).toBe(true);
    c.beginSession('locked'); const locked = summarizeCity(c.state);
    expect(locked.canInvest).toBe(false); expect(locked.districts.some(d => d.canStartPlan || d.canBuyRailway || d.canOpen)).toBe(false);
    expect(locked.synergies.some(s => s.canBuy)).toBe(false); expect(locked.research.some(r => r.canBuy)).toBe(false); expect(locked.newCity.canStart).toBe(false);
  });
});


it('requires reconfirmation when fresh funds change the displayed bulk purchase count or price', () => {
  const c = new CityEconomy(); c.state.coinsMicro = 110n * MICRO_UNIT;
  const quote = c.quotePurchase('packaging',10);
  c.state.coinsMicro = 200n * MICRO_UNIT;
  const before = c.snapshot();
  const command: CityCommand = {type:'purchase',kind:'packaging',quantity:10,cityId:'city-1',economyEventId:'guard',expectedCount:quote.count,expectedTotalCostMicro:quote.totalCostMicro.toString()};
  expect(() => executeCityCommand(c,command)).toThrow('Purchase quote changed; confirm again'); expect(c.state).toEqual(before);
  const fresh = c.quotePurchase('packaging',10);
  expect(executeCityCommand(c,{...command,expectedCount:fresh.count,expectedTotalCostMicro:fresh.totalCostMicro.toString()}).applied).toBe(true);
  expect(c.state.packagingLevel).toBe(3);
});
