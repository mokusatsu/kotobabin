import { WORDS_DATA } from '@/contracts/data';
import type { ConfirmedFact, DeliveryCommittedFact, RoundFinishedFact, WordCompletedFact } from '@/contracts/types';
import type { CityAchievementSnapshot } from './achievementEngine';
import {
  SECRET_DELIVERIES, SERIES_BY_ID, SERIES_DISTRICTS, SERIES_RESEARCH, SERIES_TOPICS, WORD_RANKS,
  type SeriesStamp,
} from './stampSeries';

export interface WordMastery {
  cleanSessions: number;
  bestMs?: number;
}

export interface RecordUpdates {
  speed: boolean;
  score: boolean;
}

interface RoundRecord {
  length: number;
  score: number;
  speedUpdates: number;
  scoreUpdates: number;
}

interface SessionProgress {
  seenCleanWords: Record<string, true>;
  cleanWords: WordCompletedFact[];
  deliveries: DeliveryCommittedFact[];
}

export interface SeriesProgressState {
  metrics: Record<string, number>;
  words: Record<string, WordMastery>;
  records: Record<string, RoundRecord>;
  orders: Record<string, true>;
  sessions: Record<string, SessionProgress>;
}

export function createSeriesProgress(): SeriesProgressState {
  return { metrics: {}, words: {}, records: {}, orders: {}, sessions: {} };
}

type Unlock = (stamp: SeriesStamp, value: number) => void;
const wordById = new Map(WORDS_DATA.words.map((word) => [word.id, word]));
const ZERO_RECORD_UPDATES: RecordUpdates = { speed: false, score: false };

export class SeriesProgress {
  private readonly state: SeriesProgressState;

  constructor(state?: SeriesProgressState) {
    this.state = state ? structuredClone(state) : createSeriesProgress();
  }

  snapshot(): SeriesProgressState {
    return structuredClone(this.state);
  }

  wordMastery(wordId: string): Readonly<WordMastery> | undefined {
    return this.state.words[wordId];
  }

  metric(id: string): number {
    return this.state.metrics[id] ?? 0;
  }

  applyFact(
    fact: ConfirmedFact, firstCompletion: boolean, orderKey: string | undefined, unlock: Unlock,
  ): RecordUpdates | undefined {
    if (fact.type === 'WordCompleted') {
      this.recordWord(fact, firstCompletion, unlock);
    } else if (fact.type === 'DeliveryCommitted' && fact.mode === 'MAIN' && fact.reason !== 'skip') {
      this.session(fact.sessionId).deliveries.push(fact);
    } else if (fact.type === 'PracticeSessionEnded') {
      delete this.state.sessions[fact.sessionId];
    } else if (fact.type === 'RoundFinished') {
      const session = this.state.sessions[fact.sessionId];
      delete this.state.sessions[fact.sessionId];
      return this.recordRound(fact, session, fact.comparisonKey ?? orderKey, unlock);
    }
    return undefined;
  }

  applyCity(city: CityAchievementSnapshot, unlock: Unlock): void {
    const set = (id: string, value: number) => this.recordMetric(id, value, unlock);
    for (const district of SERIES_DISTRICTS) {
      const state = city.districts[district];
      set(`stage_${district}`, state.stage);
      set(`shops_${district}`, state.shops);
      set(`crews_${district}`, state.crews ?? 0);
    }
    set('routes', city.openedRoutesCount);
    set('rails', city.railRoutesCount);
    set('packaging', city.packagingLevel);
    set('lifetime_materials', city.lifetimeArrivedMaterials);
    set('purchases', city.paidEquipmentPurchaseCount);
    set('restarts', city.cityRestartCount);
    for (const kind of SERIES_RESEARCH) set(`research_${kind}`, city.researchRanks[kind]);
    set('research_total', Object.values(city.researchRanks).reduce((sum, rank) => sum + rank, 0));
    set('all_stage_two', Number(SERIES_DISTRICTS.every((id) => city.districts[id].stage >= 2)));
    set('station_and_harbor', Number(city.districts.station.stage >= 4 && city.districts.harbor.stage >= 4));
    set('all_shops_five', Number(SERIES_DISTRICTS.every((id) => city.districts[id].shops >= 5)));
    set('rails_and_research', Number(city.railRoutesCount === SERIES_DISTRICTS.length && city.researchRanks.logistics >= 3));
  }

  private recordMetric(id: string, value: number, unlock: Unlock): void {
    const previous = this.metric(id);
    this.state.metrics[id] = value;
    if (value <= previous) return;
    for (const stamp of SERIES_BY_ID.get(id)!.stamps) {
      if (previous < stamp.target && stamp.target <= value) unlock(stamp, value);
    }
  }

  private add(id: string, value: number, unlock: Unlock): void {
    if (value > 0) this.recordMetric(id, this.metric(id) + value, unlock);
  }

  private peak(id: string, value: number, unlock: Unlock): void {
    if (value > this.metric(id)) this.recordMetric(id, value, unlock);
  }

  private session(id: string): SessionProgress {
    return (this.state.sessions[id] ??= { seenCleanWords: {}, cleanWords: [], deliveries: [] });
  }

  private recordWord(fact: WordCompletedFact, firstCompletion: boolean, unlock: Unlock): void {
    this.add('lifetime_words', 1, unlock);
    if (fact.mode === 'PRACTICE') this.add('practice_words', 1, unlock);
    const word = wordById.get(fact.wordId);
    if (!word) return;

    if (firstCompletion) {
      this.add(`topic_words_${word.topicId}`, 1, unlock);
      if (SERIES_TOPICS.every((topic) => this.metric(`topic_words_${topic}`) >= 50)) {
        this.peak('every_topic', 1, unlock);
      }
    }
    if (fact.mistakes !== 0 || fact.mode === 'TUTORIAL') return;
    const session = this.session(fact.sessionId);
    if (fact.mode === 'MAIN') session.cleanWords.push(fact);
    const mastery = (this.state.words[word.id] ??= { cleanSessions: 0 });
    const elapsed = fact.inputElapsedMs;
    if (elapsed !== undefined && Number.isFinite(elapsed) && elapsed > 0 && elapsed < (mastery.bestMs ?? Infinity)) {
      mastery.bestMs = elapsed;
    }
    if (session.seenCleanWords[word.id]) return;

    session.seenCleanWords[word.id] = true;
    mastery.cleanSessions += 1;
    const count = mastery.cleanSessions;
    if (count === 1) {
      this.add(`topic_clean_${word.topicId}`, 1, unlock);
      this.add(`course_clean_${word.courseId}`, 1, unlock);
    }
    if (count === 5) this.add(`course_gold_${word.courseId}`, 1, unlock);
    if (WORD_RANKS.some((target) => count === target)) this.add(`mastery_${count}`, 1, unlock);
  }

  private recordRound(
    fact: RoundFinishedFact, session: SessionProgress | undefined, orderKey: string | undefined, unlock: Unlock,
  ): RecordUpdates | undefined {
    if (fact.mode !== 'MAIN' || !fact.completed || fact.elapsedMs !== 90_000) return undefined;

    if (fact.completedWordCount >= 5) {
      this.add('lifetime_rounds', 1, unlock);
      this.add(`rounds_${fact.courseId}`, 1, unlock);
      if (orderKey && !this.state.orders[orderKey]) {
        this.state.orders[orderKey] = true;
        this.add('orders', 1, unlock);
      }
    }
    if (fact.rescueUsed || fact.skips !== 0 || fact.completedWordCount === 0) return undefined;

    this.peak('clean_streak', fact.longestCleanStreak, unlock);
    this.peak(`course_words_${fact.courseId}`, fact.completedWordCount, unlock);
    if (!fact.guideUsed) this.peak('no_guide', fact.completedWordCount, unlock);

    const cleanWords = session?.cleanWords ?? [];
    const longWords = cleanWords.filter((word) => word.canonicalLength >= 20);
    if (fact.courseId === 'challenge') {
      this.add('long_words', longWords.length, unlock);
      if (longWords.length >= 5) this.peak('five_clean_long', 1, unlock);
    }
    if (new Set(cleanWords.map((word) => word.topicId)).size === SERIES_TOPICS.length) {
      this.peak('six_clean_topics', 1, unlock);
    }
    if (new Set(cleanWords.flatMap((word) => word.tags)).size === 5) this.peak('five_clean_tags', 1, unlock);
    this.recordDeliveries(fact, session?.deliveries ?? [], unlock);

    if (fact.completedWordCount < 10) return undefined;
    const speed = Math.floor(fact.totalCanonicalLength * 2 / 3);
    const keyCount = fact.correctKeyCount + fact.mistakeCount;
    const accuracy = keyCount > 0 ? Math.floor(100 * fact.correctKeyCount / keyCount) : 0;
    this.peak('speed', speed, unlock);
    this.peak(`course_speed_${fact.courseId}`, speed, unlock);
    this.peak('accuracy', accuracy, unlock);
    if (accuracy >= 98) this.peak('speed_accuracy', speed, unlock);
    if (fact.mistakeCount === 0) this.add('perfect_rounds', 1, unlock);
    return orderKey ? this.updateBest(fact, orderKey, unlock) : undefined;
  }

  private recordDeliveries(fact: RoundFinishedFact, deliveries: DeliveryCommittedFact[], unlock: Unlock): void {
    const sizes: number[] = [];
    let cargo = 0;
    let fullCount = 0;
    let streak = 0;
    let previousFullPosition = -1;
    for (const delivery of deliveries) {
      cargo += delivery.cargoCount;
      if (delivery.reason === 'full' && delivery.cargoCount === 5) {
        fullCount += 1;
        streak = delivery.precedingWordPosition === previousFullPosition + 5 && streak > 0 ? streak + 1 : 1;
        previousFullPosition = delivery.precedingWordPosition;
        sizes.push(5);
        this.peak('full_streak', streak, unlock);
      } else {
        previousFullPosition = -1;
        streak = 0;
        if (delivery.reason === 'manual' && delivery.cargoCount >= 1 && delivery.cargoCount <= 4) {
          sizes.push(delivery.cargoCount);
          this.add(`manual_${delivery.cargoCount}`, 1, unlock);
        }
      }
    }
    this.add('full_deliveries', fullCount, unlock);
    this.add('cargo_total', cargo, unlock);
    this.add(`cargo_${fact.districtId}`, cargo, unlock);
    if (new Set(sizes).size === 5) this.peak('all_sizes', 1, unlock);
    if (fact.mistakeCount === 0) this.peak('perfect_full', fullCount, unlock);
    for (const [id, , pattern] of SECRET_DELIVERIES) {
      if (sizes.some((_, start) => pattern.every((size, index) => size === sizes[start + index]))) {
        this.peak(id, 1, unlock);
      }
    }
    const initial = deliveries.slice(0, 5);
    if (initial.length === 5 && initial.every(
      (delivery, index) => delivery.reason === 'manual' && delivery.cargoCount === 4
        && delivery.precedingWordPosition === (index + 1) * 4,
    )) {
      this.peak('first_twenty_by_four', 1, unlock);
    }
  }

  private updateBest(fact: RoundFinishedFact, orderKey: string, unlock: Unlock): RecordUpdates {
    const key = JSON.stringify([fact.courseId, orderKey, fact.ruleVersion, fact.guideUsed]);
    const record = this.state.records[key];
    if (!record) {
      this.state.records[key] = {
        length: fact.totalCanonicalLength, score: fact.score, speedUpdates: 0, scoreUpdates: 0,
      };
      return ZERO_RECORD_UPDATES;
    }
    const speed = fact.totalCanonicalLength > record.length;
    const score = fact.score > record.score;
    if (speed) {
      record.length = fact.totalCanonicalLength;
      record.speedUpdates += 1;
      this.peak(`speed_pb_${fact.courseId}`, record.speedUpdates, unlock);
    }
    if (score) {
      record.score = fact.score;
      record.scoreUpdates += 1;
      this.peak('score_pb', record.scoreUpdates, unlock);
    }
    return { speed, score };
  }
}
