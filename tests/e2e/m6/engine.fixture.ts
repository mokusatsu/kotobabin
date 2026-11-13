// Node-only source-aware public API bundle. Production browser imports no source.
export { CityEconomy, decodeCityState, encodeCityState, executeCityCommand } from '../../../src/economy';
export { createProfileDocument } from '../../../src/profile/repository';
export { districts, finalCityFixture } from './city.fixture';
