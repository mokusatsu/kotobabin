import { describe, expect, it } from 'vitest';
import { EconomyFormulas, MICRO_UNIT, WorldClock, initialWorldState, type EquipmentKind } from '../../src/economy';
import fixtures from './reference_fixtures.json';

const f = new EconomyFormulas();

describe('canonical Python economy parity', () => {
  it('matches all 644 independently computed next prices with integer rational ceilings', () => {
    for (const row of fixtures.prices) {
      const [kind, current, district, expected] = row;
      expect(f.nextPriceCoins(kind as EquipmentKind, current as number, district as string | undefined).toString()).toBe(expected);
    }
  });
  it('preserves fractional word and shipment materials at every multiplier boundary', () => {
    for (const sample of fixtures.materials) {
      const factor = f.materialMultiplier(sample.level, sample.rank);
      expect(f.wordMaterialMicro(3, factor).toString()).toBe(sample.word);
      const shipment = f.shipmentMaterial(230, 3, factor);
      expect(shipment.bonusPoints).toBe(138);
      expect(shipment.generatedMicro.toString()).toBe(sample.shipment);
      expect(f.wordMaterialMicro(3, factor, false)).toBe(0n);
      expect(f.wordMaterialMicro(3, factor, true, true)).toBe(0n);
    }
  });
  it('matches construction, integer millisecond boundaries, paused plans and capped offline restore', () => {
    for (const sample of fixtures.clock) {
      const s = initialWorldState(); const d = s.districts.residential!;
      d.queueMicro = BigInt(sample.queue); d.plan!.reservedMicro = BigInt(sample.reserved); d.plan!.paused = sample.paused;
      const clock = new WorldClock(s);
      if (sample.offline) { clock.restoreAt(sample.elapsed); clock.restoreAt(sample.elapsed); }
      else clock.advance(sample.elapsed);
      const summary = { clockMs: s.clockMs, savedWallMs: s.savedWallMs, coinsMicro: s.coinsMicro.toString(),
        cityArrivedMicro: s.cityArrivedMicro.toString(), deliveryCoinsMicro: s.deliveryCoinsMicro.toString(), shopCoinsMicro: s.shopCoinsMicro.toString(),
        districts: Object.fromEntries(Object.entries(s.districts).map(([id, district]) => [id, {
          stage: district.stage, shops: district.shops, queueMicro: district.queueMicro.toString(), stockMicro: district.stockMicro.toString(),
          arrivedMicro: district.arrivedMicro.toString(), planReservedMicro: district.plan?.reservedMicro.toString() ?? null,
        }])) };
      expect(summary).toEqual(sample.expected);
    }
  });
  it('produces identical state for segmented time and absolute retries', () => {
    const s = initialWorldState(); s.districts.residential!.queueMicro = 500n * MICRO_UNIT;
    const a = new WorldClock(structuredClone(s)); const b = new WorldClock(structuredClone(s));
    a.advance(125_000);
    for (const step of [1, 7498, 1, 15_000, 50_000, 52_500]) b.advance(step);
    expect(b.state).toEqual(a.state);
    expect(b.advanceTo(125_000).arrivedMicro).toBe(0n);
    expect(b.state).toEqual(a.state);
  });
  it('quotes individual rounded prices with partial funding and district caps', () => {
    expect(f.purchaseQuote('packaging', 0, 110n * MICRO_UNIT, 10)).toMatchObject({count: 2, after: 2, totalCostMicro: 109n * MICRO_UNIT, limitedByFunds: true});
    expect(f.purchaseQuote('shops', 4, 10000n * MICRO_UNIT, 10, 'residential', 1)).toMatchObject({count: 1, after: 5, limitedByCap: true});
    expect(f.transportPerSecondMicro({open: true, crews: 50, railway: true}, 5, true)).toBe(28_800n * MICRO_UNIT);
    expect(f.shopIncomePerSecondMicro('residential', {open: true, stage: 5, shops: 50})).toBe(640n * MICRO_UNIT);
  });
  it('keeps the offline wall high-water mark across clock rollback', () => {
    const s = initialWorldState(1000); const c = new WorldClock(s);
    c.restoreAt(500); expect(s.savedWallMs).toBe(1000); expect(s.clockMs).toBe(0);
    c.restoreAt(1000); expect(s.clockMs).toBe(0);
    c.restoreAt(2000); expect(s.clockMs).toBe(1000);
  });
});
