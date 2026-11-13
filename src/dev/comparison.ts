import { CourseGenerator, GameSession, RomajiEngine, type CourseId, type SessionFact, type SessionSnapshot, type Word } from '../typing';
import { sessionRules, type SessionRules } from '../config/game-parameters';

export type DevEvent = 'none' | 'complete' | 'manual' | 'full' | 'mistake' | 'skip' | 'deadline';
export interface DevConditions {
  courseId: CourseId;
  wordId: string | null;
  customWord?: { display: string; reading: string };
  seed: number;
  cargoCount: number;
  remainingMs: number;
  imePaused: boolean;
  event: DevEvent;
  rules: Partial<SessionRules>;
}
export interface Comparison {
  session: GameSession;
  rules: Readonly<SessionRules>;
  nowMs: number;
  planId: string;
  facts: SessionFact[];
  operations: string[];
  imePaused: boolean;
}

/** Only public engine operations construct a comparison; no runtime/repository is imported. */
export function createComparison(words: Word[], conditions: DevConditions): Comparison {
  const rules = sessionRules(conditions.rules);
  if (!Number.isInteger(conditions.seed) || conditions.seed < 0 || conditions.seed > 0xffff_ffff) throw new Error('seedは0〜4294967295の整数です。');
  if (!Number.isInteger(conditions.cargoCount) || conditions.cargoCount < 0 || conditions.cargoCount > rules.maxCargo) throw new Error('再現する荷物数は0〜最大荷物数です。');
  if (!Number.isInteger(conditions.remainingMs) || conditions.remainingMs < 0 || conditions.remainingMs > rules.roundDurationMs) throw new Error('残り時間は0〜制限時間の整数msです。');
  let selected: Word | undefined;
  if (conditions.customWord) {
    const display = conditions.customWord.display.trim(), reading = conditions.customWord.reading.trim();
    if (!display || !reading) throw new Error('カスタム語の表示と読みを入力してください。');
    selected = { id: 'development-custom', display, reading, canonicalLength: new RomajiEngine(reading).canonicalLength,
      courseId: conditions.courseId, topicId: 'development', difficultyBand: 'easy', tags: [] };
  } else if (conditions.wordId) {
    selected = words.find(word => word.id === conditions.wordId);
    if (!selected) throw new Error('選んだ語が見つかりません。');
  }
  const generator = selected ? undefined : new CourseGenerator(words, { seed: conditions.seed, courseId: conditions.courseId });
  const session = new GameSession({ ...(selected ? { words: [selected] } : { generator }), mode: 'MAIN', sessionId: `development-${crypto.randomUUID()}`, rules });
  const operations: string[] = [];
  const complete = () => {
    const snapshot = session.snapshot(0);
    const guide = snapshot.remainingGuide;
    for (const character of guide) session.input(character, 0);
    operations.push(`語を完成: ${snapshot.currentWord.id} / ${guide}`);
  };
  for (let count = 0; count < conditions.cargoCount; count++) complete();
  if (conditions.event === 'complete') complete();
  if (conditions.event === 'manual') {
    if (session.snapshot(0).cargoCount === 0) complete();
    session.deliver(0); operations.push('手動配達');
  }
  if (conditions.event === 'full' && conditions.cargoCount < rules.maxCargo) {
    for (let count = conditions.cargoCount; count < rules.maxCargo; count++) complete();
  }
  if (conditions.event === 'mistake') {
    const current = session.snapshot(0);
    const wrong = [...'abcdefghijklmnopqrstuvwxyz'].find(character => {
      const probe = new RomajiEngine(current.currentWord.reading);
      for (const accepted of current.acceptedInput) probe.input(accepted);
      return !probe.input(character).accepted;
    });
    if (!wrong) throw new Error('この語で誤打条件を構築できません。');
    session.input(wrong, 0); operations.push(`誤打: ${wrong}`);
  }
  let nowMs = rules.roundDurationMs - conditions.remainingMs;
  if (conditions.event === 'deadline') nowMs = rules.roundDurationMs;
  if (nowMs > 0 && session.snapshot(0).phase === 'READY') {
    const key = session.snapshot(0).remainingGuide[0];
    session.input(key, 0); operations.push(`時計開始の準備入力: ${key}`);
  }
  session.tick(nowMs);
  session.pause(nowMs);
  if (conditions.event === 'skip' && session.snapshot(nowMs).phase !== 'RESULT') { session.skip(nowMs); operations.push('救済スキップ'); }
  if (conditions.imePaused) operations.push('IME入力確認が必要な停止条件（OSイベント試験ではありません）');
  return { session, rules, nowMs, planId: generator?.plan.id ?? (conditions.customWord ? '固定カスタム語（seed不使用）' : `固定語 ${selected!.id}（seed不使用）`),
    facts: session.drainEvents(), operations, imePaused: conditions.imePaused };
}
export function factSummary(fact: SessionFact): string {
  if (fact.type === 'WordCompleted') return `${fact.type} ${fact.wordId} / ${fact.clean ? '無誤打' : '誤打あり'} / 基準長${fact.canonicalLength}`;
  if (fact.type === 'DeliveryCommitted') return `${fact.type} ${fact.reason} / 荷物${fact.cargoCount} / ボーナス${fact.bonus}`;
  if (fact.type === 'RoundFinished') return `${fact.type} / ${fact.completed ? '期限完走' : '途中終了'} / 得点${fact.result.score}`;
  return `${fact.type} / ${fact.sessionId}:${fact.factSequence}`;
}
export function comparisonExport(comparison: Comparison, snapshot: SessionSnapshot) {
  return { kind: 'kotobabin-development-comparison', normalRecord: false, rules: comparison.rules, planId: comparison.planId,
    operations: [...comparison.operations], facts: [...comparison.facts], snapshot };
}
