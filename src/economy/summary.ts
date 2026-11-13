import config from '../../spec/initial/data/economy_config.json';
import { CityEconomy, EconomyFormulas, MICRO_UNIT, type CityState, type ResearchKind } from './index';

/** Read-only economic display values and eligibility; labels and asset IDs remain canonical catalog data. */
export function summarizeCity(state: CityState) {
  const f = new EconomyFormulas(); const canInvest = state.activeSession === null;
  const stageSum = Object.values(state.districts).reduce((sum, d) => sum + d.stage, 0);
  const districts = config.districts.map(cfg => {
    const d = state.districts[cfg.id];
    const transportPerSecondMicro = f.transportPerSecondMicro(d, state.research.logistics, state.synergies.includes('sorting_network'));
    const shopIncomePerSecondMicro = f.shopIncomePerSecondMicro(cfg.id, d, state.research.commerce, state.synergies.includes('tourism_service'));
    const waitMs = d.queueMicro === 0n ? 0n : (d.queueMicro + transportPerSecondMicro / 1000n - 1n) / (transportPerSecondMicro / 1000n);
    const unlockCostMicro = BigInt(cfg.unlock_coins) * MICRO_UNIT;
    const nextPlan = d.stage < config.development.maximum_stage ? { targetStage: d.stage + 1, ...f.developmentCost(cfg.id, d.stage + 1) } : null;
    const railwayCoinsMicro = BigInt(config.railway.base_coins * cfg.cost_multiplier) * MICRO_UNIT;
    const railwayMaterialsMicro = BigInt(config.railway.base_materials_micro) * BigInt(cfg.cost_multiplier);
    const railwayPrerequisitesMet = d.open && d.stage >= config.railway.minimum_stage && d.crews >= config.railway.minimum_crews;
    return { id: cfg.id, name: cfg.name, ...structuredClone(d), transportPerSecondMicro, shopIncomePerSecondMicro, waitMs,
      shopCap: config.development.stages.find(s => s.stage === d.stage)?.shop_cap ?? 0,
      unlockStageSum: cfg.unlock_stage_sum, unlockCostMicro,
      canOpen: canInvest && !d.open && stageSum >= cfg.unlock_stage_sum && state.coinsMicro >= unlockCostMicro,
      nextPlan, canStartPlan: canInvest && d.open && !d.plan && !!nextPlan && state.coinsMicro >= nextPlan.coinsMicro,
      canPausePlan: canInvest && !!d.plan && !d.plan.paused, canResumePlan: canInvest && !!d.plan && d.plan.paused,
      railwayCoinsMicro, railwayMaterialsMicro, railwayPrerequisitesMet,
      canBuyRailway: canInvest && !d.railway && railwayPrerequisitesMet && state.coinsMicro >= railwayCoinsMicro && d.stockMicro >= railwayMaterialsMicro };
  });
  const synergies = config.synergies.map(cfg => {
    const owned = state.synergies.includes(cfg.id); const costMicro = BigInt(cfg.cost_coins) * MICRO_UNIT;
    const prerequisitesMet = Object.entries(cfg.requires).every(([id, stage]) => state.districts[id].stage >= stage!);
    return { id: cfg.id, name: cfg.name, requires: cfg.requires, owned, costMicro, prerequisitesMet, canBuy: canInvest && !owned && prerequisitesMet && state.coinsMicro >= costMicro };
  });
  const research = config.research.types.map(cfg => {
    const kind = cfg.id as ResearchKind; const rank = state.research[kind];
    const costBlueprints = rank < config.research.maximum_rank ? config.research.next_rank_cost_blueprints[rank] : null;
    return { id: kind, name: cfg.name, rank, maximumRank: config.research.maximum_rank, costBlueprints,
      multiplier: f.researchMultiplier(rank), nextMultiplier: f.researchMultiplier(Math.min(rank + 1, config.research.maximum_rank)),
      canBuy: canInvest && costBlueprints !== null && state.blueprints >= costBlueprints };
  });
  const newCity = new CityEconomy(state).newCityPreview();
  return { cityId: state.cityId, canInvest, stageSum, coinsMicro: state.coinsMicro, blueprints: state.blueprints,
    packagingLevel: state.packagingLevel, materialMultiplier: f.materialMultiplier(state.packagingLevel, state.research.materials),
    totalIncomePerSecondMicro: districts.reduce((sum, d) => sum + d.shopIncomePerSecondMicro, 0n),
    queueTotalMicro: districts.reduce((sum, d) => sum + d.queueMicro, 0n), stockTotalMicro: districts.reduce((sum, d) => sum + d.stockMicro, 0n),
    reservedTotalMicro: districts.reduce((sum, d) => sum + (d.plan?.reservedMicro ?? 0n), 0n),
    districts, synergies, research, newCity: { ...newCity, canStart: canInvest && newCity.eligible } };
}
export type CitySummary = ReturnType<typeof summarizeCity>;
