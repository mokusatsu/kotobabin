import { CityEconomy, type DistrictId, type EquipmentKind, type ResearchKind } from './index';

type Envelope = { cityId: string; economyEventId: string; atMs?: number };
export type CityCommand = Envelope & (
  | { type: 'purchase'; kind: EquipmentKind; quantity?: 1 | 10 | 'max'; districtId?: DistrictId; expectedCount?: number; expectedTotalCostMicro?: string }
  | { type: 'startPlan' | 'pausePlan' | 'resumePlan' | 'openDistrict' | 'buyRailway'; districtId: DistrictId }
  | { type: 'buySynergy'; synergyId: string }
  | { type: 'buyResearch'; kind: ResearchKind }
  | { type: 'startNewCity'; confirmed: boolean; location?: 'HOME' | 'RESULT'; landscape?: string }
);
export interface CityCommandReceipt {
  applied: boolean; reason?: 'duplicate' | 'stale_city'; commandType: CityCommand['type']; cityId: string; economyEventId: string;
}
const stablePayload = (command: CityCommand) => JSON.stringify(Object.fromEntries(Object.entries(command).sort(([a], [b]) => a.localeCompare(b))));

/** Apply once to a candidate copy; repository must commit this state with profile facts atomically. */
export function executeCityCommand(city: CityEconomy, command: CityCommand): CityCommandReceipt {
  if (!command || typeof command.cityId !== 'string' || !command.cityId || typeof command.economyEventId !== 'string' || !command.economyEventId) throw new RangeError('City command requires cityId and economyEventId');
  const key = JSON.stringify([command.cityId, command.economyEventId]);
  const fingerprint = stablePayload(command);
  const receipt = { commandType: command.type, cityId: command.cityId, economyEventId: command.economyEventId };
  const prior = city.state.commandLedger[key];
  if (prior !== undefined) {
    if (prior !== fingerprint) throw new Error('Economic event identifier reused with different content');
    return { ...receipt, applied: false, reason: 'duplicate' };
  }
  if (command.cityId !== city.state.cityId) return { ...receipt, applied: false, reason: 'stale_city' };
  if (command.atMs !== undefined && (!Number.isSafeInteger(command.atMs) || command.atMs < 0)) throw new RangeError('Command time must be a nonnegative integer millisecond');
  const candidate = new CityEconomy(city.snapshot());
  switch (command.type) {
    case 'purchase': {
      const quote = candidate.purchase(command.kind, command.quantity, command.districtId, command.atMs);
      if (command.expectedCount !== undefined || command.expectedTotalCostMicro !== undefined) {
        if (!Number.isSafeInteger(command.expectedCount) || command.expectedCount! < 0 || typeof command.expectedTotalCostMicro !== 'string' || !/^(0|[1-9][0-9]*)$/.test(command.expectedTotalCostMicro)) throw new RangeError('Purchase confirmation requires an integer count and decimal micro cost');
        if (quote.count !== command.expectedCount || quote.totalCostMicro !== BigInt(command.expectedTotalCostMicro)) throw new Error('Purchase quote changed; confirm again');
      }
      break;
    }
    case 'startPlan': candidate.startPlan(command.districtId, command.atMs); break;
    case 'pausePlan': candidate.pausePlan(command.districtId, command.atMs); break;
    case 'resumePlan': candidate.resumePlan(command.districtId, command.atMs); break;
    case 'openDistrict': candidate.openDistrict(command.districtId, command.atMs); break;
    case 'buyRailway': candidate.buyRailway(command.districtId, command.atMs); break;
    case 'buySynergy': candidate.buySynergy(command.synergyId, command.atMs); break;
    case 'buyResearch': candidate.buyResearch(command.kind, command.atMs); break;
    case 'startNewCity': candidate.startNewCity(command); break;
    default: throw new RangeError('Unknown city command');
  }
  candidate.state.commandLedger[key] = fingerprint;
  Object.assign(city.state, candidate.state);
  return { ...receipt, applied: true };
}
