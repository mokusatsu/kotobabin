import { CityEconomy, decodeCityState, encodeCityState, executeCityCommand, type CityCommand, type DistrictId } from '../../../src/economy';
import { matureCityFixture } from '../fixtures/mature-city';
import words from '../../../spec/initial/data/words.json';

export const districts: DistrictId[] = ['residential', 'market', 'workshop', 'park', 'station', 'harbor'];
type Body = CityCommand extends infer C ? C extends CityCommand ? Omit<C, 'cityId' | 'economyEventId'> : never : never;
/** Explicit source-aware setup, not evidence of native earning. Every resource,
 * blueprint and stage comes from public economic facts, elapsed time and commands.
 * Like matureCityFixture, this imports confirmed clean length-24 cargo groups;
 * no direct balance, ownership, research, stage or achievement assignments. */
export function finalCityFixture(wall: number) {
  const city = new CityEconomy(decodeCityState(matureCityFixture(wall)));
  const canonical = words.words.find(word => word.canonicalLength === 24)!;
  if (!canonical) throw new Error('Canonical length24 source is missing');
  let serial = 0;
  const command = (body: Body) => executeCityCommand(city, { ...body, cityId: city.state.cityId, economyEventId: `m6-fixture-${++serial}` } as CityCommand);
  function deliver(id: DistrictId, amount: bigint) {
    const sessionId = `m6-source-facts-${++serial}`;
    city.beginSession(sessionId, id); let factSequence = 0;
    const before = city.state.generatedMicro;
    while (city.state.generatedMicro - before < amount) {
      for (let word = 0; word < 5; word++) city.completeWord({ cityId: city.state.cityId, sessionId, factSequence: ++factSequence, baseLength: canonical.canonicalLength });
      city.shipCargo({ cityId: city.state.cityId, sessionId, factSequence: ++factSequence, scoreSum: canonical.canonicalLength * 10 * 5, cargoCount: 5, reason: 'full' });
    }
    city.endSession();
    // Source fixture public elapsed-time simulation; not the capped offline UI.
    city.advance(30_000_000_000);
  }
  // One genuinely eligible source-fixture restart earns enough for all45 research costs.
  while (city.state.packagingLevel < 15) command({ type: 'purchase', kind: 'packaging', quantity: 1 });
  deliver('residential', 22_500_000_000_000n);
  command({ type: 'startNewCity', confirmed: true, location: 'HOME', landscape: 'riverside' });
  for (const id of districts) {
    if (!city.state.districts[id].open) command({ type: 'openDistrict', districtId: id });
    deliver(id, id === 'harbor' ? 500_000_000_000n : 250_000_000_000n);
    while (city.state.districts[id].stage < 4) {
      if (!city.state.districts[id].plan) command({ type: 'startPlan', districtId: id });
      city.advance(0);
    }
    while (city.state.districts[id].crews < 10) command({ type: 'purchase', kind: 'crews', districtId: id, quantity: 1 });
    // Reduce synthetic ledger/artifact size through actual paid generation upgrades.
    if (id === 'residential') while (city.state.packagingLevel < 15) command({ type: 'purchase', kind: 'packaging', quantity: 1 });
    const finalPlan=city.formulas.developmentCost(id,5);
    if (city.state.districts[id].stockMicro < finalPlan.materialsMicro + 500_000_000n * BigInt(2 ** districts.indexOf(id))) throw new Error(`Insufficient final plan and railway stock: ${id}`);
  }
  if (city.state.blueprints < 45 || !city.newCityPreview().eligible) throw new Error('Fixture failed public progression prerequisites');
  const result = encodeCityState(city.snapshot());decodeCityState(result);return result;
}
