import { CityEconomy, initialCityState, encodeCityState, decodeCityState, executeCityCommand, type CityCommand, type DistrictId } from '../../../src/economy';

type CommandBody = CityCommand extends infer C ? C extends CityCommand ? Omit<C, 'cityId' | 'economyEventId'> : never : never;
/** Source-fixture E2E only: confirmed economic facts and public commands, not native typing.
 * No resources, ownership, stages, or achievement rewards are assigned directly.
 */
export function matureCityFixture(wallMs: number) {
  const city = new CityEconomy(initialCityState(wallMs)); let operation = 0;
  const command = (body: CommandBody) => executeCityCommand(city, { ...body, cityId: city.state.cityId, economyEventId: `qa-setup-${++operation}` } as CityCommand);
  const ids: DistrictId[] = ['residential', 'market', 'workshop', 'park', 'station', 'harbor'];
  function develop() {
    for (const id of ids) {
      if (id === 'harbor' && city.state.districts.residential.stage === 3) command({ type: 'startPlan', districtId: 'residential' });
      if (!city.state.districts[id].open) command({ type: 'openDistrict', districtId: id });
      const sessionId = `qa-fixture-${city.state.cityId}-${id}`;
      city.beginSession(sessionId, id); let sequence = 0;
      for (let group = 0; group < 200; group++) {
        for (let word = 0; word < 5; word++) city.completeWord({ cityId: city.state.cityId, sessionId, factSequence: ++sequence, baseLength: 24 });
        city.shipCargo({ cityId: city.state.cityId, sessionId, factSequence: ++sequence, scoreSum: 1200, cargoCount: 5, reason: 'full' });
      }
      city.endSession(); city.advance(30000000);
      while (city.state.districts[id].stage < 3) {
        if (!city.state.districts[id].plan) command({ type: 'startPlan', districtId: id });
        city.advance(0);
      }
    }
  }
  develop(); command({ type: 'startNewCity', confirmed: true, location: 'HOME', landscape: 'riverside' });
  develop();
  // Beyond the illustrative sprite caps: the UI transaction must still visibly grow the map.
  for (let level = 0; level < 7; level++) command({ type: 'purchase', kind: 'packaging', quantity: 1 });
  for (let count = city.state.districts.residential.crews; count < 10; count++) command({ type: 'purchase', kind: 'crews', districtId: 'residential', quantity: 1 });
  for (let count = city.state.districts.residential.shops; count < 7; count++) command({ type: 'purchase', kind: 'shops', districtId: 'residential', quantity: 1 });
  const encoded = encodeCityState(city.snapshot()); decodeCityState(encoded);
  return encoded;
}
