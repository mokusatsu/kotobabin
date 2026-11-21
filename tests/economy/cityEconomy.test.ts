import { describe, expect, it } from 'vitest';
import screenFixtures from '@spec-data/screen_fixtures.json';
import { ECONOMY_CONFIG } from '@/contracts/data';
import type { ConfirmedFact, DistrictId, EconomySnapshot } from '@/contracts/types';
import {
  CityEconomy,
  type CityEconomySnapshot,
  EconomyError,
  MICRO,
  OFFLINE_CAP_MS,
  WorldClock,
  calculateOfflineProgress,
  ceilDiv,
  formatMicro,
  formatRate,
  isqrt,
} from '@/economy/cityEconomy';
import { milestoneFactor } from '@/economy/math';

function makeWordFact(
  sessionId: string,
  factSequence: number,
  canonicalLength: number,
  mistakes = 0,
  wordPosition = factSequence,
  wordId = `word_${factSequence}`,
): ConfirmedFact {
  return {
    type: 'WordCompleted',
    sessionId,
    factSequence,
    mode: 'MAIN',
    ruleVersion: 'romaji-1.0.0',
    timestamp: factSequence * 1000,
    wordId,
    topicId: 'daily',
    tags: [],
    canonicalLength,
    mistakes,
    wordPosition,
  };
}

function makeDeliveryFact(
  sessionId: string,
  factSequence: number,
  reason: 'extra' | 'full' | 'deadline' | 'skip',
  cargoCount: number,
  bonus: number,
  precedingWordPosition = 1,
): ConfirmedFact {
  return {
    type: 'DeliveryCommitted',
    sessionId,
    factSequence,
    mode: 'MAIN',
    ruleVersion: 'romaji-1.0.0',
    timestamp: factSequence * 1000,
    reason,
    cargoCount,
    bonus,
    precedingWordPosition,
  };
}

function makeStagedEconomy(stage = 1, shops = 1): CityEconomy {
  const m = new CityEconomy();
  const d = m.districts.residential;
  d.stage = stage;
  d.shops = shops;
  return m;
}

describe('math helpers', () => {
  it('computes ceilDiv and isqrt accurately with BigInt', () => {
    expect(ceilDiv(0n, 5n)).toBe(0n);
    expect(ceilDiv(1n, 5n)).toBe(1n);
    expect(ceilDiv(5n, 5n)).toBe(1n);
    expect(ceilDiv(6n, 5n)).toBe(2n);

    expect(isqrt(0n)).toBe(0n);
    expect(isqrt(1n)).toBe(1n);
    expect(isqrt(3n)).toBe(1n);
    expect(isqrt(4n)).toBe(2n);
    expect(isqrt(15n)).toBe(3n);
    expect(isqrt(16n)).toBe(4n);
    expect(isqrt(100_000_000n)).toBe(10_000n);
  });

  it('computes milestoneFactor and formatting helpers', () => {
    expect(milestoneFactor(0)).toBe(1n);
    expect(milestoneFactor(9)).toBe(1n);
    expect(milestoneFactor(10)).toBe(2n);
    expect(milestoneFactor(25)).toBe(4n);
    expect(milestoneFactor(50)).toBe(8n);

    expect(formatMicro(0n)).toBe('0');
    expect(formatMicro(1_500_000n)).toBe('1.5');
    expect(formatMicro(4_200_000n)).toBe('4.2');
    expect(formatMicro(83_625_000n)).toBe('83.625');
    expect(formatRate(4_200_000n)).toBe('4.2/s');
    expect(formatRate(8_200_000n)).toBe('8.2/s');
  });
});

describe('tutorial supplies', () => {
  it('tops up only the missing whole resources and preserves typing and delivery records', () => {
    const economy = new CityEconomy();
    economy.districts.residential.stockMicro = 11_200_000n;
    economy.coinsMicro = 22_400_000n;
    const lifetime = { ...economy.lifetime };
    expect(economy.grantTutorialSupplies()).toEqual({ materialsMicro: 19n * MICRO, coinsMicro: 28n * MICRO });
    expect(economy.lifetime).toEqual(lifetime);
    expect(economy.grantTutorialSupplies()).toEqual({ materialsMicro: 0n, coinsMicro: 0n });
    const restored = CityEconomy.fromSnapshot(economy.snapshot());
    restored.upgradeDistrict('residential');
    const purchase = restored.purchase('packaging', 1);
    expect(purchase.count).toBe(1);
    expect(restored.districts.residential.stage).toBe(1);
    expect(restored.packagingLevel).toBe(1);
    expect(restored.grantTutorialSupplies()).toEqual({ materialsMicro: 0n, coinsMicro: 0n });
    restored.assertInvariants();
  });
});

describe('WorldClock', () => {
  it('caps offline progress at 8 hours and prevents clock rollback', () => {
    expect(OFFLINE_CAP_MS).toBe(28_800_000);

    const calc = calculateOfflineProgress(0, 36 * 3600 * 1000);
    expect(calc.wallElapsedMs).toBe(36 * 3600 * 1000);
    expect(calc.creditedMs).toBe(OFFLINE_CAP_MS);
    expect(calc.cappedMs).toBe(28 * 3600 * 1000);
    expect(calc.nextSavedWallMs).toBe(36 * 3600 * 1000);

    const clock = new WorldClock(10_000);
    const rollback = clock.restoreAt(5_000);
    expect(rollback.wallElapsedMs).toBe(0);
    expect(rollback.creditedMs).toBe(0);
    expect(rollback.nextSavedWallMs).toBe(10_000);
    expect(clock.getSavedWallMs()).toBe(10_000);
  });
});

function stripPlan(snap: Record<string, unknown>): Record<string, unknown> {
  const districts = snap.districts as Record<string, Record<string, unknown>>;
  const nextDistricts: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(districts)) {
    const { plan: _plan, ...rest } = v;
    nextDistricts[k] = rest;
  }
  return { ...snap, districts: nextDistricts };
}

describe('screen_fixtures.json exact match', () => {
  it('matches all snapshots, 42s and 90s checkpoints, and purchase values', () => {
    const fixtures = screenFixtures.cityEconomy;
    const snapshots = fixtures.snapshots;

    const eco = CityEconomy.fromSnapshot(
      snapshots.before_purchase as unknown as CityEconomySnapshot,
    );
    expect(eco.snapshot()).toEqual(stripPlan(snapshots.before_purchase));

    const purchase = eco.purchase('packaging', 1);
    expect(purchase.total_cost_coins).toBe(222);
    expect(purchase.current).toBe(9);
    expect(purchase.after).toBe(10);
    expect(purchase.before_multiplier).toEqual({ numerator: 13, denominator: 4 });
    expect(purchase.after_multiplier).toEqual({ numerator: 7, denominator: 1 });
    expect(eco.snapshot()).toEqual(stripPlan(snapshots.after_purchase));

    eco.beginSession('screen-reference-90s', 'residential', 'normal');
    expect(eco.snapshot()).toEqual(stripPlan(snapshots.session_start));
    expect(formatMicro(eco.totalIncomePerSecondMicro())).toBe(
      fixtures.expected_and_actual.at_90s.income_before_per_second,
    );

    const round = screenFixtures.round;
    const shipments = new Map(screenFixtures.shipments.map((s) => [s.afterWord, s]));
    let seq = 0;

    for (const item of round) {
      eco.advanceTo(item.completedAtMs);
      seq += 1;
      eco.applyTypingFact(
        makeWordFact(
          'screen-reference-90s',
          seq,
          item.canonicalLength,
          item.mistakes,
          item.position,
          item.wordId,
        ),
      );
      const shipment = shipments.get(item.position);
      if (shipment) {
        seq += 1;
        eco.applyTypingFact(
          makeDeliveryFact(
            'screen-reference-90s',
            seq,
            'full',
            5,
            shipment.bonus,
            item.position,
          ),
        );
      }

      if (item.position === 4) {
        const at42 = fixtures.expected_and_actual.at_42s;
        expect(formatMicro(eco.coinsMicro)).toBe(at42.coins);
        expect(formatMicro(eco.districts.residential.queueMicro)).toBe(at42.queue_material);
        expect(formatMicro(eco.districts.residential.stockMicro)).toBe('147');
        const snap42 = eco.snapshot();
        expect(Object.keys(snap42.fact_ledger)).toEqual(
          Object.keys(snapshots.at_42s_after_word4.fact_ledger),
        );
      }
    }

    const summary = eco.endSession({ atMs: 90_000 })!;
    const at90 = fixtures.expected_and_actual.at_90s;
    expect(summary.generated_micro).toBe(fixtures.session_summary.generated_micro);
    expect(summary.arrived_during_session_micro).toBe(
      fixtures.session_summary.arrived_during_session_micro,
    );
    expect(summary.remaining_queue_micro).toBe(fixtures.session_summary.remaining_queue_micro);
    expect(summary.delivery_coins_micro).toBe(fixtures.session_summary.delivery_coins_micro);

    expect(formatMicro(BigInt(summary.generated_micro))).toBe(at90.generated_material);
    expect(formatMicro(BigInt(summary.arrived_during_session_micro))).toBe(at90.arrived_material);
    expect(formatMicro(BigInt(summary.remaining_queue_micro))).toBe(at90.queue_material);
    expect(eco.districts.residential.stage).toBe(2);
    expect(formatMicro(eco.districts.residential.stockMicro)).toBe(at90.arrived_material);
    // Cannot upgrade before remaining queue is delivered (531 < 600)
    expect(() => eco.upgradeDistrict('residential')).toThrow(EconomyError);
    eco.advanceTime(120_000);
    const coinsBeforeUpgrade = eco.coinsMicro;
    eco.upgradeDistrict('residential');
    expect(eco.districts.residential.stage).toBe(3);
    expect(eco.coinsMicro).toBe(coinsBeforeUpgrade);
  });
});

describe('CityEconomy invariants', () => {
  it('calculates exact fixed-point materials and packaging milestones', () => {
    expect([0, 10, 25, 50].map((n) => Number(new CityEconomy().packagingMultiplier(n).numerator))).toEqual([
      1, 7, 29, 108,
    ]);

    const a = new CityEconomy();
    a.packagingLevel = 1;
    a.beginSession('s1');
    expect(a.applyTypingFact(makeWordFact('s1', 1, 3)).generatedMicro).toBe('3750000');

    const b = new CityEconomy();
    b.beginSession('s2');
    expect(b.applyTypingFact(makeDeliveryFact('s2', 1, 'extra', 0, 138)).generatedMicro).toBe(
      '13800000',
    );

    const c = new CityEconomy();
    c.packagingLevel = 10;
    c.beginSession('s3');
    expect(c.applyTypingFact(makeDeliveryFact('s3', 1, 'extra', 0, 138)).generatedMicro).toBe(
      '96600000',
    );

    // 16 * 1.5625 = 25 without per-word truncation; mistakes keep material
    const d = new CityEconomy();
    const snapshot: EconomySnapshot = {
      packagingLevel: 1,
      materialsResearchRank: 1,
      districtId: 'residential',
    };
    for (let i = 1; i <= 16; i++) {
      d.applyTypingFact(makeWordFact('s4', i, 1, 4, i), snapshot);
    }
    expect(d.districts.residential.queueMicro).toBe(25_000_000n);
  });

  it('matches all 644 price table cells and bulk buy behavior', () => {
    const m = new CityEconomy();
    const table = ECONOMY_CONFIG.price_tables;
    let count = 0;

    table.packaging_by_current_level.forEach((expected, n) => {
      expect(m.nextPriceCoins('packaging', n)).toBe(expected);
      count += 1;
    });
    for (const [id, rows] of Object.entries(table.crews_by_district_current_1_to_49)) {
      rows.forEach((expected, idx) => {
        expect(m.nextPriceCoins('crews', idx + 1, id as DistrictId)).toBe(expected);
        count += 1;
      });
    }
    for (const [id, rows] of Object.entries(table.shops_by_district_current_0_to_49)) {
      rows.forEach((expected, idx) => {
        expect(m.nextPriceCoins('shops', idx, id as DistrictId)).toBe(expected);
        count += 1;
      });
    }
    expect(count).toBe(644);

    m.coinsMicro = 179n * MICRO;
    const one = m.purchase('packaging', 1);
    expect(one.count).toBe(1);
    expect(one.total_cost_coins).toBe(50);
    const ten = m.purchase('packaging', 10);
    expect(ten.count).toBe(2);
    expect(ten.total_cost_coins).toBe(129);
    expect(m.packagingLevel).toBe(3);
    expect(m.coinsMicro).toBe(0n);

    const n = new CityEconomy();
    n.coinsMicro = 179n * MICRO;
    const max = n.purchase('packaging', 'max');
    expect(max.count).toBe(3);
    expect(max.total_cost_coins).toBe(179);
  });

  it('pays delivery coins once on arrival and upgrades district only after delivery with 0 coins', () => {
    const m = new CityEconomy();
    m.districts.residential.queueMicro = 30n * MICRO;
    // Cannot upgrade while materials are still in transit (undelivered)
    expect(() => m.upgradeDistrict('residential')).toThrow(EconomyError);

    const res = m.advanceTime(60_000);
    expect(m.coinsMicro).toBe(60_000_000n);
    expect(m.districts.residential.stage).toBe(0);
    expect(m.districts.residential.stockMicro).toBe(30n * MICRO);
    expect(res.segments.map((s) => s.end_ms)).toEqual([7_500, 60_000]);

    const coinsBeforeUpgrade = m.coinsMicro;
    const up = m.upgradeDistrict('residential');
    expect(up.applied).toBe(true);
    expect(m.districts.residential.stage).toBe(1);
    expect(m.districts.residential.shops).toBe(1);
    expect(m.districts.residential.stockMicro).toBe(0n);
    expect(m.coinsMicro).toBe(coinsBeforeUpgrade);
    expect(m.constructionHistory[0].clock_ms).toBe(60_000);

    // Reaching stage sum 2 auto-opens market without coins
    m.districts.residential.stockMicro = 150n * MICRO;
    const up2 = m.upgradeDistrict('residential');
    expect(m.districts.residential.stage).toBe(2);
    expect(up2.openedDistricts).toContain('market');
    expect(m.districts.market.open).toBe(true);
    expect(m.coinsMicro).toBe(coinsBeforeUpgrade);
  });

  it('enforces same-timestamp order (arrival -> operation)', () => {
    const m = new CityEconomy();
    m.districts.residential.queueMicro = 30n * MICRO;
    const r = m.purchase('packaging', 1, null, { atMs: 7_500 });
    expect(r.count).toBe(1);
    expect(m.districts.residential.stage).toBe(0);
    expect(m.districts.residential.stockMicro).toBe(30n * MICRO);
    expect(m.coinsMicro).toBe(10n * MICRO);
  });

  it('allows railway purchase with coins only without consuming district materials', () => {
    const m = makeStagedEconomy(3, 1);
    const d = m.districts.residential;
    d.crews = 10;
    d.stockMicro = 100n * MICRO;
    m.coinsMicro = 2_999n * MICRO;
    expect(() => m.buyRailway('residential')).toThrow(EconomyError);

    m.coinsMicro = 3_000n * MICRO;
    const railRes = m.buyRailway('residential');
    expect(d.railway).toBe(true);
    expect(railRes.paid_materials_micro).toBe('0');
    expect(d.stockMicro).toBe(100n * MICRO);
    expect(m.coinsMicro).toBe(0n);
    expect(m.transportPerSecondMicro('residential')).toBe(320n * MICRO);
  });

  it('enforces _requireIdle guard and idempotency by factSequence and economyEventId', () => {
    const m = new CityEconomy();
    m.coinsMicro = 1_000n * MICRO;
    m.districts.residential.stockMicro = 30n * MICRO;
    m.beginSession('s1');
    expect(() => m.purchase('packaging', 1)).toThrow(EconomyError);
    expect(() => m.upgradeDistrict('residential')).toThrow(EconomyError);

    const fact = makeWordFact('s1', 1, 5);
    expect(m.applyTypingFact(fact).applied).toBe(true);
    expect(m.applyTypingFact(fact)).toEqual({
      applied: false,
      reason: 'duplicate',
      generatedMicro: '0',
    });
    expect(() => m.applyTypingFact(makeWordFact('s1', 1, 6))).toThrow(EconomyError);

    m.endSession();
    const p1 = m.purchase('packaging', 1, null, { economyEventId: 'buy-pkg-1' });
    expect(p1.applied).toBe(true);
    expect(p1.count).toBe(1);
    const p2 = m.purchase('packaging', 1, null, { economyEventId: 'buy-pkg-1' });
    expect(p2.applied).toBe(false);
    expect(p2.reason).toBe('duplicate');
    expect(m.packagingLevel).toBe(1);
    expect(() =>
      m.purchase('packaging', 10, null, { economyEventId: 'buy-pkg-1' }),
    ).toThrow(EconomyError);
  });

  it('supports offline 8h cap, rollback guard, and piecewise split equivalence', () => {
    const m = makeStagedEconomy(1, 1);
    const r = m.restoreAt(36 * 3600 * 1000);
    expect(r.credited_ms).toBe(28_800_000);
    expect(m.coinsMicro).toBe(2880n * MICRO);
    expect(m.savedWallMs).toBe(36 * 3600 * 1000);

    // Rollback does not grant extra coins or lower savedWallMs
    const snap = m.snapshot();
    m.restoreAt(1000);
    expect(m.snapshot()).toEqual(snap);

    // Split equivalence
    const a = new CityEconomy();
    a.districts.residential.queueMicro = 100n * MICRO;
    const b = CityEconomy.fromSnapshot(a.snapshot());
    a.advanceTime(30_000);
    b.advanceTime(5_000);
    b.advanceTime(2_500);
    b.advanceTime(12_500);
    b.advanceTime(10_000);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('handles New City prestige and permanent research', () => {
    const m = new CityEconomy();
    for (const d of Object.values(m.districts)) {
      d.open = true;
      d.stage = 3;
      d.shops = 1;
      d.crews = 10;
    }
    m.cityArrivedMicro = 400_000n * MICRO;
    m.packagingLevel = 10;
    m.coinsMicro = 500n * MICRO;

    const preview = m.newCityPreview();
    expect(preview.eligible).toBe(true);
    expect(preview.reward_blueprints).toBe(6);

    const res = m.startNewCity({ confirmed: true, location: 'HOME', landscape: 'seaside' });
    expect(res.earned_blueprints).toBe(6);
    expect(m.blueprints).toBe(6);
    expect(m.cityId).toBe('city-2');
    expect(m.coinsMicro).toBe(0n);
    expect(m.packagingLevel).toBe(0);
    expect(m.districts.residential.stage).toBe(0);

    const r1 = m.buyResearch('materials');
    expect(r1.cost_blueprints).toBe(1);
    expect(r1.rank).toBe(1);
    const r2 = m.buyResearch('materials');
    expect(r2.cost_blueprints).toBe(2);
    expect(r2.rank).toBe(2);
    expect(m.blueprints).toBe(3);

    // Old city facts are rejected as stale_city
    const stale = m.applyTypingFact(
      makeWordFact('old-s', 1, 5),
      { packagingLevel: 0, materialsResearchRank: 0, districtId: 'residential' },
      { cityId: 'city-1' },
    );
    expect(stale).toEqual({ applied: false, reason: 'stale_city', generatedMicro: '0' });
  });

  it('preserves each city when travelling and grants blueprints only for a new city', () => {
    const first = new CityEconomy();
    for (const district of Object.values(first.districts)) {
      Object.assign(district, { open: true, stage: 3, crews: 1 });
    }
    first.cityArrivedMicro = 100_000n * MICRO;
    first.coinsMicro = 42n * MICRO;
    first.districts.residential.queueMicro = 20n * MICRO;
    expect(first.adjacentCity(-1)).toBeNull();
    expect(first.startNewCity({ confirmed: true, landscape: 'seaside' }).earned_blueprints).toBe(3);
    first.buyResearch('materials');
    const second = CityEconomy.fromSnapshot(first.snapshot());
    expect(second.adjacentCity(-1)).toBe('city-1');
    expect(second.cityId).toBe('city-2');
    second.coinsMicro = 7n * MICRO;

    const visited = second.visitCity('city-1');
    expect(visited.coinsMicro).toBe(42n * MICRO);
    expect(visited.districts.residential.queueMicro).toBe(20n * MICRO);
    expect(visited.cityArrivedMicro).toBe(100_000n * MICRO);
    expect(visited.research.materials).toBe(1);
    expect(visited.newCityPreview().eligible).toBe(false);
    expect(() => visited.startNewCity({ confirmed: true })).toThrow();
    visited.coinsMicro += MICRO;

    const returned = visited.visitCity('city-2');
    expect(returned.landscape).toBe('seaside');
    expect(returned.coinsMicro).toBe(7n * MICRO);
    expect(returned.blueprints).toBe(2);
    expect(returned.lifetime.citiesRestarted).toBe(1);
    expect(returned.visitCity('city-1').coinsMicro).toBe(43n * MICRO);
  });
});
