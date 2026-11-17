import wordsData from '@spec-data/words.json';
import romajiRulesData from '@spec-data/romaji_rules_v1.json';
import economyConfigData from '@spec-data/economy_config.json';
import cityCatalogData from '@spec-data/city_catalog.json';
import equipmentCatalogData from '@spec-data/equipment_catalog.json';
import achievementCatalogData from '@spec-data/achievement_catalog.json';
import designTokensData from '@spec-data/design_tokens.json';
import renderingRulesData from '@spec-data/rendering_rules.json';
import type { Word } from './types';

export interface WordsDataset {
  schemaVersion: string;
  contentVersion: string;
  inputRuleVersion: string;
  dictionarySetId: string;
  tutorialIds: string[];
  prototypeIds: string[];
  words: Word[];
}

export const WORDS_DATA = wordsData as unknown as WordsDataset;
export const ROMAJI_RULES = romajiRulesData;
export const ECONOMY_CONFIG = economyConfigData;
export const CITY_CATALOG = cityCatalogData;
export const EQUIPMENT_CATALOG = equipmentCatalogData;
export const ACHIEVEMENT_CATALOG = achievementCatalogData;
export const DESIGN_TOKENS = designTokensData;
export const RENDERING_RULES = renderingRulesData;
