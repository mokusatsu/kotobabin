import { describe, expect, it } from 'vitest';
import fixture from '../../spec/initial/data/screen_fixtures.json';
import wordsData from '../../spec/initial/data/words.json';
import { CityEconomy, MICRO_UNIT, initialCityState, type EconomyMode, type MaterialReceipt } from '../../src/economy';
import { GameSession, RomajiEngine, type SessionFact, type SessionMode, type Word } from '../../src/typing';

const words = wordsData.words as Word[];
const wordById = new Map(words.map((word) => [word.id, word]));
const neko = words.find((word) => word.reading === 'ねこ')!;
const baseValue = (wordId: string) => new RomajiEngine(wordById.get(wordId)!.reading).canonicalLength * 10;

/** The boundary consumes confirmed facts only; the city clock is supplied independently. */
function applyConfirmedFacts(city: CityEconomy, facts: SessionFact[], worldAt: (fact: SessionFact) => number = (fact) => Math.floor(fact.confirmedAtMs)) {
  const receipts: MaterialReceipt[] = [];
  for (const fact of facts) {
    const identity = { cityId: city.state.activeSession!.cityId, sessionId: fact.sessionId,
      factSequence: fact.factSequence, atMs: worldAt(fact) };
    if (fact.type === 'WordCompleted') receipts.push(city.completeWord({ ...identity, baseLength: fact.canonicalLength, mistakes: fact.mistakes }));
    if (fact.type === 'DeliveryCommitted') {
      const scoreSum = fact.cargoWordIds.reduce((sum, wordId) => sum + baseValue(wordId), 0);
      expect(Math.floor(scoreSum * fact.cargoCount / 5)).toBe(fact.bonus);
      receipts.push(city.shipCargo({ ...identity, scoreSum, cargoCount: fact.cargoCount, reason: fact.reason }));
    }
  }
  return receipts;
}
function complete(session: GameSession, nowMs: number) {
  for (const key of session.snapshot(nowMs).remainingGuide) session.input(key, nowMs);
  return session.snapshot(nowMs);
}
function wrongKey(reading: string) {
  return 'abcdefghijklmnopqrstuvwxyz'.split('').find((key) => !new RomajiEngine(reading).input(key).accepted)!;
}
function screenReferenceCity() {
  // The unchanged Python model's fixture is the source of every initial amount.
  const reference = fixture.cityEconomy.snapshots.before_purchase;
  const state = initialCityState(reference.saved_wall_ms);
  state.clockMs = reference.clock_ms;
  state.coinsMicro = BigInt(reference.coins_micro);
  state.cityArrivedMicro = BigInt(reference.city_arrived_micro);
  state.packagingLevel = reference.packaging_level;
  state.research = { ...reference.research };
  state.generatedMicro = BigInt(reference.lifetime.generated_micro);
  state.arrivedMicro = BigInt(reference.lifetime.arrived_micro);
  state.deliveryCoinsMicro = BigInt(reference.lifetime.delivery_coins_micro);
  state.shopCoinsMicro = BigInt(reference.lifetime.shop_coins_micro);
  for (const [id, district] of Object.entries(reference.districts)) {
    state.districts[id] = { open: district.open, stage: district.stage, shops: district.shops, crews: district.crews,
      railway: district.railway, queueMicro: BigInt(district.queue_micro), stockMicro: BigInt(district.stock_micro),
      arrivedMicro: BigInt(district.arrived_micro), plan: district.plan ? {
        targetStage: district.plan.target_stage, requiredMicro: BigInt(district.plan.required_micro),
        reservedMicro: BigInt(district.plan.reserved_micro), paidCoinsMicro: BigInt(district.plan.paid_coins_micro), paused: district.plan.paused,
      } : null };
  }
  return new CityEconomy(state);
}

describe('confirmed GameSession facts integrated with CityEconomy', () => {
  it('matches the Python 20-word trace and final 2070 points / 1449 generated / 531 arrived / 918 waiting', () => {
    const city = screenReferenceCity();
    const purchase = city.purchase('packaging', 1);
    expect(purchase.totalCostMicro).toBe(BigInt(fixture.cityEconomy.purchase.total_cost_micro));
    const ordered = fixture.round.map((entry) => wordById.get(entry.wordId)!);
    const session = new GameSession({ words: ordered, sessionId: 'screen-reference-90s' });
    city.beginSession(session.sessionId, 'residential', 'normal', 0);
    session.input('o', 0);
    for (const entry of fixture.round) {
      const current = session.snapshot(entry.completedAtMs).currentWord;
      for (let index = 0; index < entry.mistakes; index++) session.input(wrongKey(current.reading), entry.completedAtMs - 1);
      complete(session, entry.completedAtMs);
      applyConfirmedFacts(city, session.drainEvents());
      const reference = fixture.cityEconomy.trace[entry.position - 1];
      const state = city.snapshot();
      const district = state.districts.residential;
      expect({ generated: (state.generatedMicro - state.activeSession!.generatedStartMicro).toString(),
        arrived: (state.cityArrivedMicro - state.activeSession!.arrivedStartMicro).toString(),
        queue: district.queueMicro.toString(), reserved: (district.plan?.reservedMicro ?? 0n).toString(),
        stock: district.stockMicro.toString(), stage: district.stage, coins: state.coinsMicro.toString() }, `word ${entry.position}`)
        .toEqual({ generated: reference.session_generated_micro, arrived: reference.session_arrived_micro,
          queue: reference.residential_queue_micro, reserved: reference.residential_reserved_micro,
          stock: reference.residential_stock_micro, stage: reference.residential_stage, coins: reference.coins_micro });
    }
    const result = session.tick(90_000);
    applyConfirmedFacts(city, session.drainEvents());
    const summary = city.endSession(90_000)!;
    expect(result.score).toBe(2070);
    expect(result.correctKeys).toBe(140);
    expect(result.mistakes).toBe(10);
    expect(summary).toMatchObject({ generatedMicro: 1449n * MICRO_UNIT, arrivedDuringSessionMicro: 531n * MICRO_UNIT,
      remainingQueueMicro: 918n * MICRO_UNIT, shopCoinsMicro: 403_500_000n, deliveryCoinsMicro: 1062n * MICRO_UNIT });
    expect(city.state.coinsMicro).toBe(2_043_500_000n);
    expect(city.state.districts.residential.stage).toBe(3);
    expect(city.state.constructionHistory).toContainEqual({ districtId: 'residential', stage: 3, clockMs: 83_625, consumedMicro: 600n * MICRO_UNIT });
    expect(city.endSession(90_000)).toEqual(summary);
  });

  const modes: [SessionMode, EconomyMode][] = [ ['MAIN', 'normal'], ['MAIN', 'skip'], ['PRACTICE', 'practice'], ['PRACTICE', 'review'], ['TUTORIAL', 'intro'] ];
  for (const [typingMode, economyMode] of modes) {
    it(`freezes the materials multiplier and leaves scores independent in ${economyMode}`, () => {
      const state = initialCityState(); state.packagingLevel = 1;
      const city = new CityEconomy(state);
      const session = new GameSession({ words: [neko], mode: typingMode, sessionId: `fixed-${economyMode}` });
      city.beginSession(session.sessionId, 'residential', economyMode, 0);
      // Simulate a restored profile changing outside the captured session; no investment is permitted during play.
      city.state.packagingLevel = 10; city.state.research.materials = 1;
      complete(session, 0); session.deliver(1);
      applyConfirmedFacts(city, session.drainEvents());
      expect(session.snapshot(1).score).toBe(48);
      expect(city.state.generatedMicro).toBe(6n * MICRO_UNIT); // 4*1.25 + (8/10)*1.25
      expect(city.state.activeSession!.multiplier).toEqual({ numerator: 5n, denominator: 4n });
      session.finish(2); applyConfirmedFacts(city, session.drainEvents());
      expect(city.endSession(2)!.generatedMicro).toBe(6n * MICRO_UNIT);
    });
  }

  it('applies the original cargo-value bonus, and replays confirmed facts exactly once', () => {
    const city = new CityEconomy();
    const session = new GameSession({ words: [neko], sessionId: 'fact-replay' });
    city.beginSession(session.sessionId);
    complete(session, 0); complete(session, 1); session.deliver(2);
    const facts = session.drainEvents();
    const initial = applyConfirmedFacts(city, facts);
    expect(initial.every((receipt) => receipt.applied)).toBe(true);
    expect(session.snapshot(2).bonusScore).toBe(32);
    expect(city.state.generatedMicro).toBe(11_200_000n);
    const before = city.snapshot();
    const duplicates = applyConfirmedFacts(city, facts);
    expect(duplicates.every((receipt) => !receipt.applied && receipt.reason === 'duplicate')).toBe(true);
    expect(city.snapshot()).toEqual(before);
  });

  it('gives dirty completions base materials, loses no generated materials on mistakes, and ignores uncompleted input', () => {
    const city = new CityEconomy();
    const session = new GameSession({ words: [neko], sessionId: 'mistakes' });
    city.beginSession(session.sessionId);
    complete(session, 0); applyConfirmedFacts(city, session.drainEvents());
    session.input('n', 1); session.input('z', 2);
    expect(applyConfirmedFacts(city, session.drainEvents())).toEqual([]);
    expect(city.state.generatedMicro).toBe(4n * MICRO_UNIT);
    complete(session, 3); applyConfirmedFacts(city, session.drainEvents());
    expect(city.state.generatedMicro).toBe(8n * MICRO_UNIT);
    expect(session.snapshot(3).cargoCount).toBe(0);
    session.input('n', 4); session.tick(90_000); applyConfirmedFacts(city, session.drainEvents());
    expect(city.endSession(90_000)!.generatedMicro).toBe(8n * MICRO_UNIT);
    expect(session.snapshot(90_000).baseScore).toBe(80);
  });

  it('generates skip and deadline shipment materials without counting those as delivery achievements', () => {
    const city = new CityEconomy();
    const session = new GameSession({ words: [neko], sessionId: 'skip-deadline' });
    city.beginSession(session.sessionId);
    complete(session, 0); session.pause(1); session.skip(2);
    applyConfirmedFacts(city, session.drainEvents());
    session.resume(3); complete(session, 4); session.tick(90_003);
    const facts = session.drainEvents();
    const reasons = facts.filter((fact) => fact.type === 'DeliveryCommitted').map((fact) => fact.reason);
    expect(reasons).toEqual(['deadline']);
    applyConfirmedFacts(city, facts);
    expect(session.snapshot(90_003).skips).toBe(1);
    expect(session.snapshot(90_003).bonusScore).toBe(16);
    expect(city.state.generatedMicro).toBe(9_600_000n);
    expect(city.state.economicShipments).toBe(2);
    expect(city.state.legacyShipments).toBe(0);
  });

  it('keeps city transport and shop time advancing while the game clock is paused', () => {
    const state = initialCityState();
    state.districts.residential.plan = null;
    state.districts.residential.stage = 1;
    state.districts.residential.shops = 1;
    state.districts.residential.queueMicro = 20n * MICRO_UNIT;
    state.generatedMicro = 20n * MICRO_UNIT;
    const city = new CityEconomy(state);
    const session = new GameSession({ words: [neko], sessionId: 'two-clocks' });
    city.beginSession(session.sessionId, 'residential', 'normal', 0);
    complete(session, 0); applyConfirmedFacts(city, session.drainEvents(), () => 0);
    session.pause(1_000); city.advanceTo(1_000);
    const beforePause = session.snapshot(1_000);
    city.advanceTo(61_000);
    expect(session.snapshot(61_000).elapsedMs).toBe(beforePause.elapsedMs);
    expect(session.snapshot(61_000).score).toBe(beforePause.score);
    expect(city.state.clockMs).toBe(61_000);
    expect(city.state.generatedMicro).toBe(24n * MICRO_UNIT);
    expect(city.state.cityArrivedMicro).toBe(24n * MICRO_UNIT);
    expect(city.state.shopCoinsMicro).toBe(6_100_000n);
    session.resume(61_000);
    expect(session.snapshot(62_000).elapsedMs).toBe(2_000);
    expect(session.snapshot(62_000).remainingMs).toBe(88_000);
    session.finish(62_000); applyConfirmedFacts(city, session.drainEvents(), () => 62_000);
    const summary = city.endSession(62_000)!;
    expect(summary.generatedMicro).toBe(4n * MICRO_UNIT);
    expect(summary.arrivedDuringSessionMicro).toBe(24n * MICRO_UNIT);
    expect(summary.arrivalsIncludePreexistingQueue).toBe(true);
  });

  it('closes each mode explicitly without fabricating a tutorial terminal fact or pending-bonus materials', () => {
    for (const mode of ['MAIN', 'PRACTICE', 'TUTORIAL'] as const) {
      const city = new CityEconomy();
      const session = new GameSession({ words: [neko], mode, sessionId: `close-${mode}` });
      city.beginSession(session.sessionId, 'residential', mode === 'MAIN' ? 'normal' : mode === 'PRACTICE' ? 'practice' : 'intro');
      complete(session, 0); applyConfirmedFacts(city, session.drainEvents());
      session.finish(1);
      const terminal = session.drainEvents();
      expect(terminal.map((fact) => fact.type)).toEqual(mode === 'MAIN' ? ['RoundFinished'] : mode === 'PRACTICE' ? ['PracticeSessionEnded'] : []);
      applyConfirmedFacts(city, terminal);
      expect(city.state.activeSession).not.toBeNull(); // Explicit runtime lifecycle boundary is required in every mode.
      expect(city.endSession(1)!.generatedMicro).toBe(4n * MICRO_UNIT);
      expect(city.state.activeSession).toBeNull();
      expect(city.state.economicShipments).toBe(0);
    }
  });
});
