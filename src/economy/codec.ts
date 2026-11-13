import config from '../../spec/initial/data/economy_config.json';
import { EconomyFormulas, type CityState, type DistrictState, type EconomySession, type SessionEconomySummary, type Rational } from './index';

type JsonValue<T> = T extends bigint ? string : T extends (infer V)[] ? JsonValue<V>[] : T extends object ? { [K in keyof T]: JsonValue<T[K]> } : T;
export type EncodedCityState = JsonValue<CityState> & { schemaVersion: '1.0.0' };
export class CityStateError extends Error {
  constructor(path: string, message: string) { super(`Invalid city state at ${path}: ${message}`); this.name = 'CityStateError'; }
}
const fail = (path: string, message: string): never => { throw new CityStateError(path, message); };
const object = (v: unknown, p: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail(p, 'expected object');
  return v as Record<string, unknown>;
};
const integer = (v: unknown, p: string, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) return fail(p, `expected integer ${min}..${max}`);
  return v;
};
const text = (v: unknown, p: string): string => { if (typeof v !== 'string' || !v) return fail(p, 'expected nonempty string'); return v; };
const boolean = (v: unknown, p: string): boolean => { if (typeof v !== 'boolean') return fail(p, 'expected boolean'); return v; };
const micro = (v: unknown, p: string): bigint => {
  if (typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/.test(v)) return fail(p, 'expected nonnegative integer decimal string');
  return BigInt(v);
};
const choices = <T extends string>(v: unknown, p: string, values: readonly T[]): T => {
  if (typeof v !== 'string' || !values.includes(v as T)) return fail(p, 'unknown value'); return v as T;
};
const array = (v: unknown, p: string): unknown[] => { if (!Array.isArray(v)) return fail(p, 'expected array'); return v; };
const uniqueStrings = (v: unknown, p: string) => {
  const values = array(v, p).map((item, i) => text(item, `${p}[${i}]`));
  if (new Set(values).size !== values.length) fail(p, 'duplicate identities'); return values;
};
const exactKeys = (v: Record<string, unknown>, p: string, keys: string[]) => {
  if (Object.keys(v).sort().join('|') !== keys.slice().sort().join('|')) fail(p, 'keys differ from configuration');
};
const parseJson = (v: string, p: string): unknown => {
  try { return JSON.parse(v) as unknown; } catch { return fail(p, 'invalid JSON identity or payload'); }
};
const readRational = (v: unknown, p: string): Rational => {
  const r = object(v, p); const numerator = micro(r.numerator, `${p}.numerator`); const denominator = micro(r.denominator, `${p}.denominator`);
  if (!numerator || !denominator) fail(p, 'multiplier must be positive'); return { numerator, denominator };
};

/** JSON-safe output; decoding is the single validation boundary for data read from storage/import. */
export function encodeCityState(state: CityState): EncodedCityState {
  return JSON.parse(JSON.stringify({ ...state, schemaVersion: '1.0.0' }, (_, v: unknown) => typeof v === 'bigint' ? v.toString() : v)) as EncodedCityState;
}
export function decodeCityState(value: unknown): CityState {
  const v = object(value, 'city');
  if (v.schemaVersion !== '1.0.0' || v.economyVersion !== config.economy_version) fail('city', 'unsupported schema or economy version');
  const formulas = new EconomyFormulas();
  const citySequence = integer(v.citySequence, 'citySequence', 1); const cityId = text(v.cityId, 'cityId');
  if (cityId !== `city-${citySequence}`) fail('cityId', 'does not match city sequence');
  const clockMs = integer(v.clockMs, 'clockMs');
  const readDistricts = object(v.districts, 'districts'); exactKeys(readDistricts, 'districts', config.districts.map(d => d.id));
  const districts: Record<string, DistrictState> = {};
  for (const cfg of config.districts) {
    const p = `districts.${cfg.id}`; const d = object(readDistricts[cfg.id], p);
    const stage = integer(d.stage, `${p}.stage`, 0, config.development.maximum_stage);
    const open = boolean(d.open, `${p}.open`);
    const crews = integer(d.crews, `${p}.crews`, open ? 1 : 0, config.equipment.crews.maximum);
    const cap = config.development.stages.find(s => s.stage === stage)?.shop_cap ?? 0;
    const state: DistrictState = { open, stage, crews, shops: integer(d.shops, `${p}.shops`, 0, cap), railway: boolean(d.railway, `${p}.railway`),
      queueMicro: micro(d.queueMicro, `${p}.queueMicro`), stockMicro: micro(d.stockMicro, `${p}.stockMicro`), arrivedMicro: micro(d.arrivedMicro, `${p}.arrivedMicro`), plan: null };
    if (d.plan !== null) {
      const plan = object(d.plan, `${p}.plan`); const targetStage = integer(plan.targetStage, `${p}.plan.targetStage`, 1, config.development.maximum_stage);
      const cost = formulas.developmentCost(cfg.id, targetStage);
      const requiredMicro = micro(plan.requiredMicro, `${p}.plan.requiredMicro`); const reservedMicro = micro(plan.reservedMicro, `${p}.plan.reservedMicro`);
      const paidCoinsMicro = micro(plan.paidCoinsMicro, `${p}.plan.paidCoinsMicro`);
      if (targetStage !== stage + 1 || requiredMicro !== cost.materialsMicro || paidCoinsMicro !== cost.coinsMicro || reservedMicro > requiredMicro) fail(`${p}.plan`, 'stage, cost or reservation differs from configuration');
      state.plan = { targetStage, requiredMicro, reservedMicro, paidCoinsMicro, paused: boolean(plan.paused, `${p}.plan.paused`) };
    }
    if (!open && (stage || crews || state.shops || state.railway || state.queueMicro || state.stockMicro || state.arrivedMicro || state.plan)) fail(p, 'closed route has active resources');
    if (state.railway && (stage < config.railway.minimum_stage || crews < config.railway.minimum_crews)) fail(p, 'railway prerequisites not met');
    districts[cfg.id] = state;
  }
  const r = object(v.research, 'research'); exactKeys(r, 'research', config.research.types.map(t => t.id));
  const research = { materials: integer(r.materials, 'research.materials', 0, config.research.maximum_rank), logistics: integer(r.logistics, 'research.logistics', 0, config.research.maximum_rank), commerce: integer(r.commerce, 'research.commerce', 0, config.research.maximum_rank) };
  const synergies = uniqueStrings(v.synergies, 'synergies');
  for (const id of synergies) {
    const cfg = config.synergies.find(s => s.id === id);
    if (!cfg || Object.entries(cfg.requires).some(([district, stage]) => districts[district].stage < stage!)) fail('synergies', 'unknown synergy or missing prerequisites');
  }
  const s: CityState = { economyVersion: config.economy_version, citySequence, cityId, clockMs,
    savedWallMs: integer(v.savedWallMs, 'savedWallMs'), landscape: choices(v.landscape, 'landscape', config.new_city.landscapes),
    coinsMicro: micro(v.coinsMicro, 'coinsMicro'), cityArrivedMicro: micro(v.cityArrivedMicro, 'cityArrivedMicro'), arrivedMicro: micro(v.arrivedMicro, 'arrivedMicro'),
    deliveryCoinsMicro: micro(v.deliveryCoinsMicro, 'deliveryCoinsMicro'), shopCoinsMicro: micro(v.shopCoinsMicro, 'shopCoinsMicro'), generatedMicro: micro(v.generatedMicro, 'generatedMicro'),
    packagingLevel: integer(v.packagingLevel, 'packagingLevel', 0, config.equipment.packaging.maximum), blueprints: integer(v.blueprints, 'blueprints'),
    completedWords: integer(v.completedWords, 'completedWords'), economicShipments: integer(v.economicShipments, 'economicShipments'), legacyShipments: integer(v.legacyShipments, 'legacyShipments'),
    citiesRestarted: integer(v.citiesRestarted, 'citiesRestarted'), research, synergies, districts,
    activeSession: null, lastSessionSummary: null, usedSessionIds: uniqueStrings(v.usedSessionIds, 'usedSessionIds'), factLedger: {}, commandLedger: {}, constructionHistory: [] };
  if (s.legacyShipments > s.economicShipments || s.cityArrivedMicro > s.arrivedMicro || s.arrivedMicro > s.generatedMicro) fail('city', 'lifetime resource or shipment counters are inconsistent');
  if (s.citiesRestarted !== s.citySequence - 1) fail('citiesRestarted', 'does not match city sequence');
  const queued = Object.values(districts).reduce((sum, d) => sum + d.queueMicro, 0n);
  if (queued + s.arrivedMicro > s.generatedMicro) fail('generatedMicro', 'current queues and lifetime arrivals exceed generated resources');
  for (const [id, district] of Object.entries(districts)) {
    let allocated = district.stockMicro + (district.plan?.reservedMicro ?? 0n);
    for (let stage = 1; stage <= district.stage; stage++) allocated += formulas.developmentCost(id, stage).materialsMicro;
    if (district.railway) allocated += BigInt(config.railway.base_materials_micro) * BigInt(config.districts.find(d => d.id === id)!.cost_multiplier);
    if (allocated !== district.arrivedMicro) fail(`districts.${id}.arrivedMicro`, 'stock, reservations and spent materials do not conserve arrivals');
  }
  const districtArrivals = Object.values(districts).reduce((sum, d) => sum + d.arrivedMicro, 0n);
  if (districtArrivals !== s.cityArrivedMicro) fail('cityArrivedMicro', 'does not equal current district arrivals');
  const summary = (raw: unknown): SessionEconomySummary => {
    const p = 'lastSessionSummary'; const a = object(raw, p);
    const result: SessionEconomySummary = { sessionId: text(a.sessionId, `${p}.sessionId`), cityId: text(a.cityId, `${p}.cityId`), districtId: choices(a.districtId, `${p}.districtId`, config.districts.map(d => d.id)),
      mode: choices(a.mode, `${p}.mode`, ['normal','skip','practice','review','intro']), startMs: integer(a.startMs, `${p}.startMs`, 0, clockMs), endMs: integer(a.endMs, `${p}.endMs`, 0, clockMs),
      generatedMicro: micro(a.generatedMicro, `${p}.generatedMicro`), arrivedDuringSessionMicro: micro(a.arrivedDuringSessionMicro, `${p}.arrivedDuringSessionMicro`),
      deliveryCoinsMicro: micro(a.deliveryCoinsMicro, `${p}.deliveryCoinsMicro`), shopCoinsMicro: micro(a.shopCoinsMicro, `${p}.shopCoinsMicro`),
      remainingQueueMicro: micro(a.remainingQueueMicro, `${p}.remainingQueueMicro`), arrivalsIncludePreexistingQueue: true };
    if (a.arrivalsIncludePreexistingQueue !== true || result.cityId !== cityId || result.startMs > result.endMs || !s.usedSessionIds.includes(result.sessionId) || !districts[result.districtId].open || result.generatedMicro > s.generatedMicro || result.arrivedDuringSessionMicro > s.cityArrivedMicro || result.deliveryCoinsMicro > s.deliveryCoinsMicro || result.shopCoinsMicro > s.shopCoinsMicro) fail(p, 'inconsistent session summary');
    return result;
  };
  if (v.lastSessionSummary !== null) s.lastSessionSummary = summary(v.lastSessionSummary);
  if (v.activeSession !== null) {
    const p = 'activeSession'; const a = object(v.activeSession, p);
    const session: EconomySession = { sessionId: text(a.sessionId, `${p}.sessionId`), cityId: text(a.cityId, `${p}.cityId`), districtId: choices(a.districtId, `${p}.districtId`, config.districts.map(d => d.id)),
      mode: choices(a.mode, `${p}.mode`, ['normal','skip','practice','review','intro']), multiplier: readRational(a.multiplier, `${p}.multiplier`),
      startedAtMs: integer(a.startedAtMs, `${p}.startedAtMs`, 0, clockMs), generatedStartMicro: micro(a.generatedStartMicro, `${p}.generatedStartMicro`),
      arrivedStartMicro: micro(a.arrivedStartMicro, `${p}.arrivedStartMicro`), deliveryCoinsStartMicro: micro(a.deliveryCoinsStartMicro, `${p}.deliveryCoinsStartMicro`), shopCoinsStartMicro: micro(a.shopCoinsStartMicro, `${p}.shopCoinsStartMicro`) };
    const factor = formulas.materialMultiplier(s.packagingLevel, research.materials);
    if (session.cityId !== cityId || !s.usedSessionIds.includes(session.sessionId) || !districts[session.districtId].open || session.generatedStartMicro > s.generatedMicro || session.arrivedStartMicro > s.cityArrivedMicro
      || session.deliveryCoinsStartMicro > s.deliveryCoinsMicro || session.shopCoinsStartMicro > s.shopCoinsMicro || session.multiplier.numerator * factor.denominator !== factor.numerator * session.multiplier.denominator) fail(p, 'inconsistent session identity, counters or multiplier');
    s.activeSession = session;
  }
  for (const [key, payload] of Object.entries(object(v.factLedger, 'factLedger'))) {
    const identity = array(parseJson(key, 'factLedger.key'), 'factLedger.key');
    if (JSON.stringify(identity) !== key || identity.length !== 3 || identity[0] !== cityId || !s.usedSessionIds.includes(text(identity[1], 'factLedger.sessionId'))) fail('factLedger', 'unknown city or session');
    integer(identity[2], 'factLedger.sequence');
    const fingerprint = text(payload, 'factLedger.payload'); const fact = object(parseJson(fingerprint, 'factLedger.payload'), 'factLedger.payload');
    if (fact.kind === 'WordCompleted') {
      integer(fact.baseLength, 'factLedger.baseLength', 1); integer(fact.mistakes, 'factLedger.mistakes'); boolean(fact.completed, 'factLedger.completed'); boolean(fact.confirmation, 'factLedger.confirmation');
    } else if (fact.kind === 'CargoShipped') {
      integer(fact.scoreSum, 'factLedger.scoreSum'); integer(fact.cargoCount, 'factLedger.cargoCount', 1, config.material_generation.maximum_cargo_count);
      const reason = choices(fact.reason, 'factLedger.reason', config.material_generation.shipment_reasons);
      if ((reason === 'manual' && (fact.cargoCount as number) > 4) || (reason === 'full' && fact.cargoCount !== 5)) fail('factLedger', 'cargo count does not match shipment reason');
    } else fail('factLedger', 'unknown fact kind');
    s.factLedger[key] = fingerprint;
  }
  for (const [key, payload] of Object.entries(object(v.commandLedger, 'commandLedger'))) {
    const identity = array(parseJson(key, 'commandLedger.key'), 'commandLedger.key');
    if (JSON.stringify(identity) !== key || identity.length !== 2) fail('commandLedger', 'invalid identity');
    const commandCity = text(identity[0], 'commandLedger.cityId'); text(identity[1], 'commandLedger.economyEventId');
    if (!/^city-[1-9][0-9]*$/.test(commandCity) || BigInt(commandCity.slice(5)) > BigInt(citySequence)) fail('commandLedger', 'unknown city');
    const fingerprint = text(payload, 'commandLedger.payload'); const command = object(parseJson(fingerprint, 'commandLedger.payload'), 'commandLedger.payload');
    if (command.cityId !== identity[0] || command.economyEventId !== identity[1]) fail('commandLedger', 'payload identity mismatch');
    const type = choices(command.type, 'commandLedger.type', ['purchase','startPlan','pausePlan','resumePlan','openDistrict','buyRailway','buySynergy','buyResearch','startNewCity']);
    if (command.atMs !== undefined) integer(command.atMs, 'commandLedger.atMs');
    if (type === 'purchase') {
      const kind = choices(command.kind, 'commandLedger.kind', ['packaging','crews','shops']);
      if (kind !== 'packaging') choices(command.districtId, 'commandLedger.districtId', config.districts.map(d => d.id));
      if (command.quantity !== undefined && !config.equipment.purchase_quantities.includes(command.quantity as number | string)) fail('commandLedger.quantity', 'unknown quantity');
      if (command.expectedCount !== undefined || command.expectedTotalCostMicro !== undefined) {
        integer(command.expectedCount, 'commandLedger.expectedCount', 0, config.equipment.packaging.maximum);
        micro(command.expectedTotalCostMicro, 'commandLedger.expectedTotalCostMicro');
      }
    } else if (type === 'buyResearch') choices(command.kind, 'commandLedger.kind', config.research.types.map(r => r.id));
    else if (type === 'buySynergy') choices(command.synergyId, 'commandLedger.synergyId', config.synergies.map(y => y.id));
    else if (type === 'startNewCity') {
      if (command.confirmed !== true) fail('commandLedger.confirmed', 'restart was not confirmed');
      if (command.location !== undefined) choices(command.location, 'commandLedger.location', config.new_city.allowed_locations);
      if (command.landscape !== undefined) choices(command.landscape, 'commandLedger.landscape', config.new_city.landscapes);
    } else choices(command.districtId, 'commandLedger.districtId', config.districts.map(d => d.id));
    s.commandLedger[key] = fingerprint;
  }
  s.constructionHistory = array(v.constructionHistory, 'constructionHistory').map((raw, i) => {
    const p = `constructionHistory[${i}]`; const a = object(raw, p);
    const districtId = choices(a.districtId, `${p}.districtId`, config.districts.map(d => d.id)); const stage = integer(a.stage, `${p}.stage`, 1, districts[districtId].stage);
    const consumedMicro = micro(a.consumedMicro, `${p}.consumedMicro`);
    if (consumedMicro !== formulas.developmentCost(districtId, stage).materialsMicro) fail(p, 'construction cost mismatch');
    return { districtId, stage, clockMs: integer(a.clockMs, `${p}.clockMs`, 0, clockMs), consumedMicro };
  });
  return s;
}
