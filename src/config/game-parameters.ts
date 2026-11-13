/** Formal defaults. Only isolated development comparisons pass different session rules. */
export interface SessionRules {
  roundDurationMs: number;
  pointPerCanonicalKey: number;
  maxCargo: number;
  cargoRateNumerators: readonly number[];
  cargoRateDenominator: number;
  reviewWordLimit: number;
}
export const DEFAULT_SESSION_RULES: Readonly<SessionRules> = Object.freeze({
  roundDurationMs: 90_000, pointPerCanonicalKey: 10, maxCargo: 5,
  cargoRateNumerators: Object.freeze([1, 2, 3, 4, 5]), cargoRateDenominator: 5, reviewWordLimit: 10,
});
/** Constructor boundary: copy comparison values so later form edits cannot change a live session. */
export function sessionRules(overrides: Partial<SessionRules> = {}): Readonly<SessionRules> {
  const rules = { ...DEFAULT_SESSION_RULES, ...overrides,
    cargoRateNumerators: [...(overrides.cargoRateNumerators ?? DEFAULT_SESSION_RULES.cargoRateNumerators)] };
  const integer = (value: number, minimum: number, maximum: number) => Number.isInteger(value) && value >= minimum && value <= maximum;
  if (!integer(rules.roundDurationMs, 60_000, 120_000)) throw new Error('制限時間は60000〜120000msの整数です。');
  if (!integer(rules.pointPerCanonicalKey, 1, 1000)) throw new Error('基準1打点は1〜1000の整数です。');
  if (!integer(rules.maxCargo, 3, 5)) throw new Error('最大荷物数は3〜5です。');
  if (!integer(rules.reviewWordLimit, 3, 10)) throw new Error('復習語数上限は3〜10です。');
  if (!integer(rules.cargoRateDenominator, 1, 100) || rules.cargoRateNumerators.length !== rules.maxCargo
    || rules.cargoRateNumerators.some((value, index, values) => !integer(value, 0, rules.cargoRateDenominator) || (index > 0 && value < values[index - 1]))
    || rules.cargoRateNumerators.at(-1) !== rules.cargoRateDenominator) {
    throw new Error('荷物数係数は最大荷物数と同じ件数の単調増加表にし、最後の値を分母と一致させてください。');
  }
  return Object.freeze({ ...rules, cargoRateNumerators: Object.freeze(rules.cargoRateNumerators) });
}
/** Presentation defaults are not scoring rules. A budget is never an artificial wait. */
export const GAME_PRESENTATION_DEFAULTS = Object.freeze({
  deliveryHoldMs: 50, deliveryFxMs: Object.freeze([250, 350, 450]), retryUiBudgetMs: 300,
  maxSoundVoices: 8, maxParticles: 60, achievementToastMs: 1200, achievementToastIntervalMs: 10_000,
  // Summary preview only: never cap the user's all-earned individual reveal sequence.
  resultStampLimit: 3,
});
export const GAME_PARAMETERS = [
  { name: '制限時間', id: 'roundDurationMs', initial: `${DEFAULT_SESSION_RULES.roundDurationMs}ms`, range: '60000〜120000ms', binding: 'GameSession' },
  { name: '基準1打点', id: 'pointPerCanonicalKey', initial: `${DEFAULT_SESSION_RULES.pointPerCanonicalKey}点`, range: '比較用1〜1000点', binding: 'GameSession' },
  { name: '最大荷物数', id: 'maxCargo', initial: `${DEFAULT_SESSION_RULES.maxCargo}個`, range: '3〜5個', binding: 'GameSession' },
  { name: '荷物数係数', id: 'cargoRateNumerators', initial: `${DEFAULT_SESSION_RULES.cargoRateNumerators.join(',')} / 分母${DEFAULT_SESSION_RULES.cargoRateDenominator}`, range: '単調増加・満載で1.0', binding: 'GameSession' },
  { name: '配達の静止時間', id: 'deliveryHoldMs', initial: `${GAME_PRESENTATION_DEFAULTS.deliveryHoldMs}ms`, range: '0〜80ms・絵のみ', binding: '仕様値・演出への接続は別途' },
  { name: '配達演出時間', id: 'deliveryFxMs', initial: `${GAME_PRESENTATION_DEFAULTS.deliveryFxMs.join(',')}ms`, range: '150〜500ms・入力を待たせない', binding: '仕様値・演出への接続は別途' },
  { name: '再挑戦UI待ち', id: 'retryUiBudgetMs', initial: `${GAME_PRESENTATION_DEFAULTS.retryUiBudgetMs}ms以下`, range: '人為的な待ちを追加しない', binding: '仕様値・UIへの接続は別途' },
  { name: '効果音同時数', id: 'maxSoundVoices', initial: String(GAME_PRESENTATION_DEFAULTS.maxSoundVoices), range: '4〜12', binding: '仕様値・音への接続は別途' },
  { name: '描画粒子上限', id: 'maxParticles', initial: String(GAME_PRESENTATION_DEFAULTS.maxParticles), range: '0〜100', binding: '仕様値・描画への接続は別途' },
  { name: '復習語数上限', id: 'reviewWordLimit', initial: `${DEFAULT_SESSION_RULES.reviewWordLimit}語`, range: '3〜10語', binding: 'GameSession' },
  { name: '実績通知時間', id: 'achievementToastMs', initial: `${GAME_PRESENTATION_DEFAULTS.achievementToastMs}ms以下`, range: '語の境目・入力を待たせない', binding: '仕様値・通知への接続は別途' },
  { name: '実績通知開始間隔', id: 'achievementToastIntervalMs', initial: `${GAME_PRESENTATION_DEFAULTS.achievementToastIntervalMs}ms以上`, range: '超過分は結果へ', binding: '仕様値・通知への接続は別途' },
  { name: '結果の新切手見本枠', id: 'resultStampLimit', initial: `${GAME_PRESENTATION_DEFAULTS.resultStampLimit}枚`, range: 'まとめの見本枠。個別開封数は制限しない', binding: '仕様値・後続の個別全件演出を優先' },
] as const;
