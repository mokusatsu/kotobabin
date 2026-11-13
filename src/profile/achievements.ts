import { createProfileDocument, validateProfileDocument } from './repository';
import catalog from '../../spec/initial/data/achievement_catalog.json';
import words from '../../spec/initial/data/words.json';
import economyConfig from '../../spec/initial/data/economy_config.json';
import type { CityState } from '../economy';
import type { SessionFact, SessionMode, SessionSnapshot } from '../typing';
import { applySessionFact, comparisonKey, createProfileProgress, practiceQualifiedWordIds, type ProfileProgress, type RecordBest, type RecordContext } from './index';

export const achievementCatalog = catalog;
export type AchievementId = string;
export interface AchievementProgressLine { key:string; label:string; current:number; target:number|null; unit:string; displayText:string }
export interface AchievementView {
  id:string; name:string; familyId:string; condition:string; scope:string; hidden:boolean; hiddenHint:string|null;
  hiddenRevealed:boolean; earned:boolean; unread:boolean; provisional:boolean; ineligible:boolean; eligibleModes:string;
  progress:AchievementProgressLine[];
}
export interface AchievementAcquisition { acquiredAtMs:number; evidenceEventId:string }
export interface AchievementUnlock extends AchievementAcquisition { conditionRevision:string; mode:SessionMode|'CITY' }
export type EquipmentSlot = 'titleId'|'frameId'|'ornamentId'|'homeBackgroundId';
export interface CosmeticSelection {
  titleId:string|null; frameId:string|null; ornamentId:string|null;
  /** Optional addition to the current format. An absent choice means no background. */
  homeBackgroundId?:string|null;
  /** Existing current-format data is retained but these viewing objects have no equipment UI. */
  postcardId?:string|null; boardId?:string|null; albumId?:string|null;
}
export type AchievementAction =
  | {type:'target';id:string|null} | {type:'reveal';id:string}
  | {type:'read';achievementIds:string[];rewardKeys?:string[]}
  | {type:'equip';slot:EquipmentSlot;id:string|null}
  | {type:'notifications';mode:'live'|'result'};
interface AchievementSession {
  sessionId:string; mode:SessionMode; context:RecordContext; qualifiedWordIds:string[];
  baselines:Record<string,RecordBest>; completedWords:number; canonicalLength:number; correctKeys:number; mistakes:number;
  score:number; skips:number; guideUsed:boolean; currentCleanStreak:number; maxCleanStreak:number;
  manual:number[]; full:number; fullAfterTwo:boolean; fourCandidate:number|null; fourThenClean:boolean; qualifiedClean:boolean;
  phase:'active'|'completed'|'aborted';
}
interface AchievementCity {
  cityId:string; sequence:number; clockMs:number; arrivedMicro:string; cityArrivedMicro:string;
  districts:Record<string,{stage:number;open:boolean;railway:boolean;shops:number}>;
  packagingLevel:number; synergies:string[]; citiesRestarted:number;
}
export interface AchievementState {
  version:1;
  /** Only facts observed after this catalogue started; prior results never synthesize facts. */
  measuredProgress:ProfileProgress;
  sessions:Record<string,AchievementSession>;
  unlocks:Record<string,AchievementUnlock>; rewards:Record<string,AchievementAcquisition>;
  unreadAchievements:string[]; unreadRewards:string[]; revealedIds:string[];
  targetId:string|null; equipped:CosmeticSelection; notificationMode:'live'|'result';
  manualDeliveries:number; groupedDeliveries:number; fullDeliveries:number; deliveredCargo:number;
  completedRounds:number; fiveWordRounds:number; orderCompletions:Record<string,number>;
  fiveWordCourses:string[]; skilledCourses:string[]; bestNormalStreak:number; bestPracticeStreak:number;
  bestNormalCanonicalLength:number; bestAccuracies:Record<string,number>;
  city:AchievementCity|null; countedCityEvents:string[]; paidEquipmentPurchases:number; researchPurchases:number;
}
const ids = new Set(catalog.achievements.map(a=>a.id));
const rewardIds = new Set([...catalog.achievements.flatMap(a=>[a.stamp_asset_id,a.title_id]),...catalog.rewards.map(r=>r.id)]);
const wordById = new Map(words.words.map(word=>[word.id,word]));
const districtNames:Record<string,string>=Object.fromEntries(economyConfig.districts.map(d=>[d.id,d.name]));
const slotKinds:Record<EquipmentSlot,string[]>={titleId:['title'],frameId:['frame'],ornamentId:['ornament'],homeBackgroundId:['home_panel']};
function rewardFitsSlot(slot:EquipmentSlot,id:string):boolean {
  const kind=catalog.achievements.some(a=>a.title_id===id)?'title':catalog.rewards.find(r=>r.id===id)?.kind;
  return !!kind&&slotKinds[slot].includes(kind);
}
const courses = ['relaxed','standard','challenge'];
const topics = [...new Set(words.words.map(word=>word.topicId))];
export function createAchievementState():AchievementState {
  return {version:1,measuredProgress:createProfileProgress(),sessions:{},unlocks:{},rewards:{},unreadAchievements:[],unreadRewards:[],revealedIds:[],targetId:null,
    equipped:{titleId:null,frameId:null,ornamentId:null,homeBackgroundId:null},notificationMode:'live',manualDeliveries:0,groupedDeliveries:0,
    fullDeliveries:0,deliveredCargo:0,completedRounds:0,fiveWordRounds:0,orderCompletions:{},fiveWordCourses:[],skilledCourses:[],bestNormalStreak:0,
    bestPracticeStreak:0,bestNormalCanonicalLength:0,bestAccuracies:{},city:null,countedCityEvents:[],paidEquipmentPurchases:0,researchPurchases:0};
}
export function achievementOrderKey(c:RecordContext):string {
  return JSON.stringify([c.courseId,c.planId,c.contentVersion,c.generatorVersion,c.inputRuleVersion,c.scoringVersion]);
}
export function beginAchievementSession(state:AchievementState, options:{sessionId:string;mode:SessionMode;context:RecordContext;atMs:number}):AchievementState {
  if (state.sessions[options.sessionId] || state.measuredProgress.factCursors[options.sessionId]) return state;
  const next={...state,sessions:{...state.sessions}};
  next.sessions[options.sessionId]={sessionId:options.sessionId,mode:options.mode,context:structuredClone(options.context),qualifiedWordIds:practiceQualifiedWordIds(state.measuredProgress),
    baselines:structuredClone(state.measuredProgress.bestByComparison),completedWords:0,canonicalLength:0,correctKeys:0,mistakes:0,score:0,skips:0,guideUsed:options.context.guideUsed,
    currentCleanStreak:0,maxCleanStreak:0,manual:[0,0,0,0,0],full:0,fullAfterTwo:false,fourCandidate:null,fourThenClean:false,qualifiedClean:false,phase:'active'};
  return next;
}
const accuracyAtLeast=(c:number,m:number,threshold:number)=>c+m>0 && 100*c>=threshold*(c+m);
const speedAtLeast=(length:number,threshold:number)=>length*60000>=threshold*90000;
function roundConditions(s:AchievementSession):Record<string,boolean> {
  const c=s.completedWords;const accuracy=(p:number)=>accuracyAtLeast(s.correctKeys,s.mistakes,p);const speed=(p:number)=>speedAtLeast(s.canonicalLength,p);
  const baseline=s.baselines[comparisonKey({...s.context,guideUsed:s.guideUsed,assisted:false})];
  return {
    B01:s.manual[1]+s.manual[2]>0,B02:s.manual[3]+s.manual[4]>0,B03:s.full>=2,B04:s.manual.some(Boolean)&&s.full>0,B05:s.fullAfterTwo,B06:s.fourThenClean,
    C01:c>=10&&accuracy(90),C02:c>=20&&accuracy(95),C03:c>=25&&accuracy(98),C04:s.maxCleanStreak>=5,C05:s.maxCleanStreak>=15,C06:s.maxCleanStreak>=20,
    D01:speed(60),D02:speed(100),D03:speed(160),
    D04:s.score>=1000||(c>=10&&baseline?.growthBestScore!=null&&s.score>baseline.growthBestScore),
    D05:speed(180)||(c>=10&&baseline?.growthBestCanonicalLength!=null&&(s.canonicalLength-baseline.growthBestCanonicalLength)*60000>=10*90000),
    D06:c>=20&&speed(100)&&accuracy(95),F06:s.qualifiedClean,
    H01:speed(200)&&accuracy(95),H02:s.maxCleanStreak>=30,H03:s.full>=4,H04:s.manual[2]>0&&s.manual[4]>0&&s.full>0,H05:!s.guideUsed&&c>=20&&accuracy(95),
  };
}
function acquire(state:AchievementState,id:string,atMs:number,eventId:string,mode:SessionMode|'CITY'):void {
  if (state.unlocks[id]) return;
  const definition=catalog.achievements.find(a=>a.id===id)!;
  state.unlocks[id]={acquiredAtMs:atMs,evidenceEventId:eventId,conditionRevision:catalog.catalog_version,mode};
  state.unreadAchievements.push(id);
  for (const key of [definition.stamp_asset_id,definition.title_id]) {
    state.rewards[key]={acquiredAtMs:atMs,evidenceEventId:eventId};state.unreadRewards.push(key);
  }
}
function supplementalRewardEligible(state:Pick<AchievementState,'unlocks'>,rewardId:string):boolean {
  const total=Object.keys(state.unlocks).length;
  let eligible=false;
  const family=/^reward_family_([a-l])_(postcard|foil_board)$/.exec(rewardId);
  const totalReward=/^reward_total_(\d+)_/.exec(rewardId);
  if (family) eligible=Object.keys(state.unlocks).filter(id=>id.startsWith(family[1].toUpperCase())).length >= (family[2]==='postcard'?3:6);
  else if (totalReward) eligible=total>=Number(totalReward[1]);
  else if (rewardId.startsWith('reward_first_collection_')) eligible=catalog.achievements.filter(a=>a.family_id<='H').every(a=>!!state.unlocks[a.id]);
  else if (rewardId.startsWith('reward_complete_72_')) eligible=total===72;
  return eligible;
}
function addRewards(state:AchievementState,atMs:number,eventId:string):void {
  for (const reward of catalog.rewards) {
    const eligible=supplementalRewardEligible(state,reward.id);
    if (eligible&&!state.rewards[reward.id]) {state.rewards[reward.id]={acquiredAtMs:atMs,evidenceEventId:eventId};state.unreadRewards.push(reward.id);}
  }
}
function globalConditions(state:AchievementState):Record<string,boolean> {
  const p=state.measuredProgress;const completed=Object.keys(p.words).filter(id=>p.words[id].completed>0);const distinct=new Set(completed);
  const practice=Object.entries(p.words);const qualified=practice.filter(([,v])=>v.practiceCleanCompleted>=3).length;
  const tagged=(tag:string)=>practice.some(([id,v])=>v.practiceCleanCompleted>0&&wordById.get(id)?.tags.includes(tag));
  const fixed=(key:keyof typeof words.collectionSets)=>words.collectionSets[key].filter(id=>distinct.has(id)).length;
  return {
    A01:p.totalCompleted>=1,A02:state.manualDeliveries>=1,A03:state.groupedDeliveries>=1,A04:state.fullDeliveries>=1,A05:state.completedRounds>=1,A06:Object.values(state.orderCompletions).some(n=>n>=2),
    E01:completed.length>=10,E02:completed.length>=50,E03:completed.length>=150,E04:fixed('kotobabin-ja-240-v1')===240,
    E05:topics.every(topic=>completed.filter(id=>wordById.get(id)?.topicId===topic).length>=5),E06:courses.every(course=>state.fiveWordCourses.includes(course)),
    F01:practice.some(([,v])=>v.practiceCompleted>0),F02:qualified>=1,F03:['n','sokuon','yoon','long_mark'].every(tagged),F04:qualified>=5,F05:state.bestPracticeStreak>=5,
    G01:p.totalCompleted>=50,G02:p.totalCompleted>=250,G03:p.totalCompleted>=1000,G04:state.deliveredCargo>=50,G05:state.deliveredCargo>=250,G06:state.fiveWordRounds>=10,
    H06:courses.every(course=>state.skilledCourses.includes(course)),
    L01:fixed('kotobabin-ja-960-v2')>=300,L02:fixed('kotobabin-ja-960-v2')>=480,L03:fixed('kotobabin-ja-960-v2')===960,
    L04:fixed('kotobabin-ja-relaxed-v2')===240,L05:fixed('kotobabin-ja-standard-v2')===300,L06:fixed('kotobabin-ja-challenge-v2')===420,
  };
}
function cityConditions(state:AchievementState):Record<string,boolean> {
  const city=state.city;if(!city)return {};
  const districts=Object.values(city.districts);const count=(stage:number)=>districts.filter(d=>d.stage>=stage).length;
  return {I01:count(1)>0,I02:(city.districts.residential?.stage??0)>=2,I03:count(1)>=3,I04:count(1)===6,I05:count(3)===6,I06:count(5)===6,
    J01:BigInt(city.arrivedMicro)>0n,J02:BigInt(city.arrivedMicro)>=1000_000000n,J03:districts.filter(d=>d.open).length===6,J04:districts.some(d=>d.railway),J05:districts.filter(d=>d.railway).length===6,J06:BigInt(city.cityArrivedMicro)>=100000_000000n,
    K01:state.paidEquipmentPurchases>0,K02:city.packagingLevel>=10,K03:districts.some(d=>d.shops>=10),K04:city.synergies.length>=3,K05:city.citiesRestarted>0,K06:state.researchPurchases>0};
}
/** Copy only branches written by acquisition; existing evidence is immutable. */
function copyAcquisitions(state:AchievementState):AchievementState {
  return {...state,unlocks:{...state.unlocks},rewards:{...state.rewards},
    unreadAchievements:[...state.unreadAchievements],unreadRewards:[...state.unreadRewards]};
}
export function applyAchievementFacts(state:AchievementState,facts:readonly SessionFact[],context:RecordContext):AchievementState {
  const next={...copyAcquisitions(state),sessions:{...state.sessions},orderCompletions:{...state.orderCompletions},
    bestAccuracies:{...state.bestAccuracies},fiveWordCourses:[...state.fiveWordCourses],skilledCourses:[...state.skilledCourses]};
  const copiedSessions=new Set<string>();
  for(const fact of facts) {
    if(fact.factSequence<=(next.measuredProgress.factCursors[fact.sessionId]??0))continue;
    if(!next.sessions[fact.sessionId]) throw new Error('Achievement session must be frozen at READY before applying facts');
    if(!copiedSessions.has(fact.sessionId)) {
      const previous=next.sessions[fact.sessionId];
      next.sessions[fact.sessionId]={...previous,manual:[...previous.manual]};
      copiedSessions.add(fact.sessionId);
    }
    const s=next.sessions[fact.sessionId];s.guideUsed ||= fact.guideUsed;
    if(fact.type==='WordCompleted') {
      s.completedWords++;s.canonicalLength+=fact.canonicalLength;s.correctKeys+=fact.acceptedKeys;s.mistakes+=fact.mistakes;s.score+=fact.canonicalLength*10;
      s.currentCleanStreak=fact.clean?s.currentCleanStreak+1:0;s.maxCleanStreak=Math.max(s.maxCleanStreak,s.currentCleanStreak);
      if(s.fourCandidate===fact.position&&fact.clean)s.fourThenClean=true;
      s.fourCandidate=null;
      if(fact.clean&&s.qualifiedWordIds.includes(fact.wordId))s.qualifiedClean=true;
      if(s.mode==='PRACTICE')next.bestPracticeStreak=Math.max(next.bestPracticeStreak,s.maxCleanStreak);
    } else if(fact.type==='DeliveryCommitted') {
      s.score+=fact.bonus;
      if(fact.reason==='manual') {s.manual[fact.cargoCount]++;next.manualDeliveries++;if(fact.cargoCount>=2)next.groupedDeliveries++;if(fact.cargoCount===4)s.fourCandidate=fact.position+1;}
      if(fact.reason==='full') {s.full++;next.fullDeliveries++;next.groupedDeliveries++;if(s.manual[2]>0)s.fullAfterTwo=true;}
      if(fact.reason==='manual'||fact.reason==='full')next.deliveredCargo+=fact.cargoCount;
    } else if(fact.type==='WordSkipped') {s.currentCleanStreak=0;s.fourCandidate=null;if(s.mode==='MAIN')s.skips++;}
    else if(fact.type==='RoundFinished'||fact.type==='PracticeSessionEnded') {
      const r=fact.result;s.completedWords=r.completedWords;s.canonicalLength=r.canonicalLengthSum;s.correctKeys=r.correctKeys;s.mistakes=r.mistakes;s.score=r.score;s.skips=r.skips;s.guideUsed ||= r.guideUsed;
      s.currentCleanStreak=r.currentCleanStreak;s.maxCleanStreak=Math.max(s.maxCleanStreak,r.maxCleanStreak);
      const completed=fact.type==='RoundFinished'&&fact.completed&&s.mode==='MAIN';s.phase=completed?'completed':'aborted';
      if(completed&&s.completedWords>0) {next.completedRounds++;if(s.completedWords>=5)next.fiveWordRounds++;const key=achievementOrderKey(s.context);next.orderCompletions[key]=(next.orderCompletions[key]??0)+1;}
      if(completed&&s.skips===0) {
        for(const [id,eligible]of Object.entries(roundConditions(s)))if(eligible)acquire(next,id,fact.confirmedAtMs,fact.eventId,fact.mode);
        next.bestNormalStreak=Math.max(next.bestNormalStreak,s.maxCleanStreak);next.bestNormalCanonicalLength=Math.max(next.bestNormalCanonicalLength,s.canonicalLength);
        for(const [id,count]of [['C01',10],['C02',20],['C03',25]]as const)if(s.completedWords>=count&&s.correctKeys+s.mistakes>0)next.bestAccuracies[id]=Math.max(next.bestAccuracies[id]??0,100*s.correctKeys/(s.correctKeys+s.mistakes));
        if(s.completedWords>=5&&!next.fiveWordCourses.includes(s.context.courseId))next.fiveWordCourses.push(s.context.courseId);
        if(s.completedWords>=20&&accuracyAtLeast(s.correctKeys,s.mistakes,95)&&!next.skilledCourses.includes(s.context.courseId))next.skilledCourses.push(s.context.courseId);
      }
    }
    next.measuredProgress=applySessionFact(next.measuredProgress,fact,context);
    for(const[id,eligible]of Object.entries(globalConditions(next)))if(eligible)acquire(next,id,fact.confirmedAtMs,fact.eventId,fact.mode);
    addRewards(next,fact.confirmedAtMs,fact.eventId);
  }
  // Detailed session summaries follow the same latest-thirty policy as results.
  const finished=Object.keys(next.sessions).filter(id=>next.sessions[id].phase!=='active');
  for(const id of finished.slice(0,Math.max(0,finished.length-30)))delete next.sessions[id];
  return next;
}
export function applyAchievementCity(state:AchievementState,event:{eventId:string;atMs:number;city:CityState;paidEquipmentPurchase?:boolean;researchPurchased?:boolean}):AchievementState {
  const city=event.city;
  if(state.city&&(city.citySequence<state.city.sequence||(city.citySequence===state.city.sequence&&city.clockMs<state.city.clockMs)))return state;
  const next={...copyAcquisitions(state),countedCityEvents:[...state.countedCityEvents]};
  next.city={cityId:city.cityId,sequence:city.citySequence,clockMs:city.clockMs,arrivedMicro:city.arrivedMicro.toString(),cityArrivedMicro:city.cityArrivedMicro.toString(),
    districts:Object.fromEntries(Object.entries(city.districts).map(([id,d])=>[id,{stage:d.stage,open:d.open,railway:d.railway,shops:d.shops}])),packagingLevel:city.packagingLevel,synergies:[...city.synergies],citiesRestarted:city.citiesRestarted};
  if((event.paidEquipmentPurchase||event.researchPurchased)&&!next.countedCityEvents.includes(event.eventId)) {
    next.countedCityEvents.push(event.eventId);if(event.paidEquipmentPurchase)next.paidEquipmentPurchases++;if(event.researchPurchased)next.researchPurchases++;
  }
  for(const[id,eligible]of Object.entries(cityConditions(next)))if(eligible)acquire(next,id,event.atMs,event.eventId,'CITY');
  addRewards(next,event.atMs,event.eventId);return next;
}
export function resetAchievementRecords(state:AchievementState):AchievementState {
  const next=structuredClone(state);next.measuredProgress.recentRounds=[];next.measuredProgress.bestByComparison={};
  for(const session of Object.values(next.sessions))session.baselines={};
  return next;
}

export function applyAchievementAction(state:AchievementState,action:AchievementAction):AchievementState {
  const next=structuredClone(state);
  const validId=(id:string)=>{if(!ids.has(id))throw new Error('Unknown achievement ID');};
  switch(action.type) {
    case 'target':if(action.id!==null)validId(action.id);next.targetId=action.id;break;
    case 'reveal':validId(action.id);if(!next.revealedIds.includes(action.id))next.revealedIds.push(action.id);break;
    case 'read':
      action.achievementIds.forEach(validId);
      for(const key of action.rewardKeys??[])if(!rewardIds.has(key))throw new Error('Unknown reward key');
      next.unreadAchievements=next.unreadAchievements.filter(id=>!action.achievementIds.includes(id));
      next.unreadRewards=next.unreadRewards.filter(key=>!action.rewardKeys?.includes(key));break;
    case 'notifications':if(action.mode!=='live'&&action.mode!=='result')throw new Error('Unknown notification mode');next.notificationMode=action.mode;break;
    case 'equip': {
      if(!Object.hasOwn(slotKinds,action.slot))throw new Error('Unknown equipment slot');
      if(action.id!==null) {
        if(!next.rewards[action.id])throw new Error('Reward is not owned');
        if(!rewardFitsSlot(action.slot,action.id))throw new Error('Reward does not fit this equipment slot');
      }
      next.equipped[action.slot]=action.id;break;
    }
    default:throw new Error('Unknown achievement action');
  }
  return next;
}
export const revealAchievement=(state:AchievementState,id:string)=>applyAchievementAction(state,{type:'reveal',id});
export const markAchievementsRead=(state:AchievementState,achievementIds:string[])=>applyAchievementAction(state,{type:'read',achievementIds});
export const markRewardsRead=(state:AchievementState,rewardKeys:string[])=>applyAchievementAction(state,{type:'read',achievementIds:[],rewardKeys});
export const setAchievementTarget=(state:AchievementState,id:string|null)=>applyAchievementAction(state,{type:'target',id});
export const equipAchievementReward=(state:AchievementState,slot:EquipmentSlot,id:string|null)=>applyAchievementAction(state,{type:'equip',slot,id});
export const setAchievementNotifications=(state:AchievementState,mode:'live'|'result')=>applyAchievementAction(state,{type:'notifications',mode});

function viewedSession(state:AchievementState,live?:SessionSnapshot,sessionId?:string):AchievementSession|undefined {
  const original=sessionId?state.sessions[sessionId]:Object.values(state.sessions).at(-1);
  if(!original)return undefined;
  // Only the scalar display projection below changes; nested session data stays read-only.
  const s={...original};
  if(live&&live.mode===s.mode&&(!sessionId||state.sessions[sessionId]===original)) {
    s.completedWords=live.completedWords;s.correctKeys=live.correctKeys;s.mistakes=live.mistakes;s.canonicalLength=live.canonicalLengthSum;
    s.score=live.score;s.skips=live.skips;s.guideUsed ||= live.guideUsed;s.currentCleanStreak=live.currentCleanStreak;s.maxCleanStreak=live.maxCleanStreak;
  }
  return s;
}
interface DisplayWordMetrics {
  completed:number; topicCounts:Record<string,number>; fixedCounts:Record<string,number>;
  practiceTotal:number; maxPracticeClean:number; qualified:number; minQualifiedClean:number;
  practicedTags:Set<string>; practiceEntries:[string,ProfileProgress['words'][string]][];
}
const immutableWordMetrics=new WeakMap<ProfileProgress['words'],DisplayWordMetrics>();
/** Only frozen maps whose counter records are also frozen can be reused safely. */
function displayWordMetrics(counters:ProfileProgress['words']):DisplayWordMetrics {
  const cached=immutableWordMetrics.get(counters);if(cached)return cached;
  const practiceEntries=Object.entries(counters);const completed=new Set<string>();
  const topicCounts:Record<string,number>={};const practicedTags=new Set<string>();
  let practiceTotal=0,maxPracticeClean=0,qualified=0,minQualifiedClean=Infinity;
  for(const[id,value]of practiceEntries) {
    const word=wordById.get(id);
    if(value.completed>0) {completed.add(id);if(word)topicCounts[word.topicId]=(topicCounts[word.topicId]??0)+1;}
    practiceTotal+=value.practiceCompleted;maxPracticeClean=Math.max(maxPracticeClean,value.practiceCleanCompleted);
    if(value.practiceCleanCompleted>=3) {qualified++;minQualifiedClean=Math.min(minQualifiedClean,value.practiceCleanCompleted);}
    if(value.practiceCleanCompleted>0)for(const tag of word?.tags??[])practicedTags.add(tag);
  }
  const fixedCounts=Object.fromEntries(Object.entries(words.collectionSets).map(([key,ids])=>[key,ids.filter(id=>completed.has(id)).length]));
  practiceEntries.sort((a,b)=>b[1].practiceCleanCompleted-a[1].practiceCleanCompleted);
  const value={completed:completed.size,topicCounts,fixedCounts,practiceTotal,maxPracticeClean,qualified,
    minQualifiedClean:qualified?minQualifiedClean:0,practicedTags,practiceEntries};
  if(Object.isFrozen(counters)&&practiceEntries.every(([,entry])=>Object.isFrozen(entry)))immutableWordMetrics.set(counters,value);
  return value;
}
function metrics(state:AchievementState,aggregate:DisplayWordMetrics,s?:AchievementSession,live?:SessionSnapshot):Record<string,number|string|boolean> {
  const p=state.measuredProgress;
  const fixed=(key:keyof typeof words.collectionSets)=>aggregate.fixedCounts[key];
  const tagged=(tag:string)=>aggregate.practicedTags.has(tag);
  const baseline=s?.baselines[comparisonKey({...s.context,guideUsed:s.guideUsed,assisted:false})];
  const city=state.city;const ds=Object.values(city?.districts??{});
  const accuracy=s&&s.correctKeys+s.mistakes>0?100*s.correctKeys/(s.correctKeys+s.mistakes):0;
  const values:Record<string,number|string|boolean>={
    lifetime_completed_words:p.totalCompleted,manual_delivery_count:state.manualDeliveries,grouped_delivery_count:state.groupedDeliveries,full_delivery_count:state.fullDeliveries,
    completed_rounds:state.completedRounds,completed_words:s?.completedWords??0,same_order_completed_rounds:s?state.orderCompletions[achievementOrderKey(s.context)]??0:Math.max(0,...Object.values(state.orderCompletions)),order_display:s?`この問題順で${state.orderCompletions[achievementOrderKey(s.context)]??0}/2便完走`:'問題順を選んで配達を始めよう',
    small_manual_deliveries:s?(s.manual[1]+s.manual[2]):0,large_manual_deliveries:s?(s.manual[3]+s.manual[4]):0,full_deliveries_in_round:s?.full??0,
    manual_deliveries_in_round:s?s.manual.reduce((a,b)=>a+b,0):0,manual_two_seen:!!s?.manual[2],full_after_manual_two:s?.fullAfterTwo??false,manual_four_seen:!!s?.manual[4],immediate_next_word_clean:s?.fourThenClean??false,
    normal_completion:s?.phase==='completed'&&s.skips===0,accuracy_percent:accuracy,best_eligible_accuracy:0,
    current_clean_streak:s?.currentCleanStreak??0,session_max_clean_streak:s?.maxCleanStreak??0,historical_best_clean_streak:state.bestNormalStreak,
    standard_keystrokes_per_minute:(s?.canonicalLength??0)*60000/90000,historical_best_speed:state.bestNormalCanonicalLength*60000/90000,
    score:s?.score??0,comparison_best_score:baseline?.growthBestScore??'比較元なし',comparison_best_speed:baseline?.growthBestCanonicalLength==null?'比較元なし':baseline.growthBestCanonicalLength*60000/90000,
    comparison_completed_words:s?.completedWords??0,record_improvement:!!s&&s.completedWords>=10&&baseline?.growthBestScore!=null&&s.score>baseline.growthBestScore,
    speed_improvement:s&&baseline?.growthBestCanonicalLength!=null?(s.canonicalLength-baseline.growthBestCanonicalLength)*60000/90000:0,
    distinct_completed_words:aggregate.completed,first_edition_completed_words:fixed('kotobabin-ja-240-v1'),qualified_topic_count:topics.filter(topic=>(aggregate.topicCounts[topic]??0)>=5).length,
    practice_completed_words:aggregate.practiceTotal,same_word_practice_clean_count:s?.mode==='PRACTICE'&&s.phase==='active'&&live?.mode==='PRACTICE'&&live.phase!=='RESULT'?(p.words[live.currentWord.id]?.practiceCleanCompleted??0):aggregate.maxPracticeClean,
    element_n:tagged('n'),element_sokuon:tagged('sokuon'),element_youon:tagged('yoon'),element_choon:tagged('long_mark'),
    qualified_element_count:['n','sokuon','yoon','long_mark'].filter(tagged).length,qualified_practice_words:aggregate.qualified,per_word_clean_count:aggregate.minQualifiedClean,
    qualified_word_practice_count:s?.qualifiedWordIds.length?3:0,qualified_word_clean_in_round:s?.qualifiedClean??false,qualified_word_set:s?.qualifiedWordIds.map(id=>wordById.get(id)?.display??'ことば').join('、')||'対象語なし',
    lifetime_delivered_cargo:state.deliveredCargo,five_word_completed_rounds:state.fiveWordRounds,manual_two:!!s?.manual[2],manual_four:!!s?.manual[4],full_five:(s?.full??0)>0,guide_never_shown:!!s&&!s.guideUsed,
    highest_district_stage:Math.max(0,...ds.map(d=>d.stage)),residential_stage:city?.districts.residential?.stage??0,qualified_district_count:ds.filter(d=>d.stage>=1).length,qualified_district_count_3:ds.filter(d=>d.stage>=3).length,qualified_district_count_5:ds.filter(d=>d.stage>=5).length,
    arrival_observed:!!city&&BigInt(city.arrivedMicro)>0n,lifetime_arrived_materials:city?Number(BigInt(city.arrivedMicro)/100000n)/10:0,
    current_city_arrived_materials:city?Number(BigInt(city.cityArrivedMicro)/100000n)/10:0,opened_routes:ds.filter(d=>d.open).length,route_status:city?Object.entries(city.districts).map(([key,d])=>`${districtNames[key]}：${d.open?'開通':'未開通'}`).join('、'):'未開通',
    rail_route_count:ds.filter(d=>d.railway).length,rail_status:city?Object.entries(city.districts).map(([key,d])=>`${districtNames[key]}：${d.railway?'鉄道':'道路'}`).join('、'):'鉄道なし',
    paid_equipment_purchase_seen:state.paidEquipmentPurchases>0,packing_level:city?.packagingLevel??0,maximum_shops_in_one_district:Math.max(0,...ds.map(d=>d.shops)),shops_by_district:city?Object.entries(city.districts).map(([key,d])=>`${districtNames[key]}：${d.shops}軒`).join('、'):'店舗なし',
    synergy_count:city?.synergies.length??0,city_restart_count:city?.citiesRestarted??0,research_purchase_count:state.researchPurchases,
    fixed_set_completed_words:fixed('kotobabin-ja-960-v2'),fixed_set_relaxed:fixed('kotobabin-ja-relaxed-v2'),fixed_set_standard:fixed('kotobabin-ja-standard-v2'),fixed_set_challenge:fixed('kotobabin-ja-challenge-v2'),
  };
  topics.forEach((topic,i)=>{values[`topic_${i+1}`]=aggregate.topicCounts[topic]??0;});
  courses.forEach((course,i)=>{values[`course_${i+1}`]=state.fiveWordCourses.includes(course);});
  for(const[district,d]of Object.entries(city?.districts??{}))values[`district_${district}_stage`]=d.stage;
  ['joint_delivery','sorting_network','tourism_service'].forEach((key,i)=>{values[`synergy_${i+1}`]=city?.synergies.includes(key)??false;});
  return values;
}
/** Only these catalogue fields vary by achievement; shared aggregates are computed once. */
function achievementMetric(state:AchievementState,id:string,key:string,values:Record<string,number|string|boolean>):number|string|boolean {
  if(key==='best_eligible_accuracy')return state.bestAccuracies[id]??0;
  if(key==='historical_best_clean_streak'&&id==='F05')return state.bestPracticeStreak;
  if(key==='qualified_district_count'&&(id==='I05'||id==='I06'))return values[id==='I05'?'qualified_district_count_3':'qualified_district_count_5'];
  if(key==='fixed_set_completed_words') {
    if(id==='L04')return values.fixed_set_relaxed;
    if(id==='L05')return values.fixed_set_standard;
    if(id==='L06')return values.fixed_set_challenge;
  }
  if(id==='H06'&&/^course_[123]$/.test(key))return state.skilledCourses.includes(courses[Number(key.slice(-1))-1]);
  return values[key]??0;
}
export function getAchievementViews(state:AchievementState,liveSession?:SessionSnapshot,sessionId?:string):AchievementView[] {
  const s=viewedSession(state,liveSession,sessionId);const conditions=s?roundConditions(s):{};
  if(s) {
    conditions.E06=courses.every(course=>state.fiveWordCourses.includes(course)||(course===s.context.courseId&&s.completedWords>=5));
    conditions.H06=courses.every(course=>state.skilledCourses.includes(course)||(course===s.context.courseId&&s.completedWords>=20&&accuracyAtLeast(s.correctKeys,s.mistakes,95)));
  }
  // Live guide/streak/key values are always recomputed; only immutable word totals are shared.
  const aggregate=displayWordMetrics(state.measuredProgress.words);
  const values=metrics(state,aggregate,s,liveSession);
  const practiceEntries=aggregate.practiceEntries;
  return catalog.achievements.map(definition=>{
    const earned=!!state.unlocks[definition.id];const normal=definition.scope==='通常';const practice=definition.scope==='練';const route=definition.scope==='街';
    const ineligible=!earned&&((normal&&!!s&&(s.mode!=='MAIN'||s.skips>0||s.phase==='aborted'||(definition.id==='H05'&&s.guideUsed)))||(practice&&!!s&&s.mode!=='PRACTICE'));
    const progress=definition.progress_fields.map(field=>{
      const raw=achievementMetric(state,definition.id,field.key,values);const current=typeof raw==='number'?Math.floor(raw*10)/10:typeof raw==='boolean'?Number(raw):0;
      const target=typeof field.target==='number'?field.target:typeof field.target==='boolean'||(field.target!==null&&typeof field.target==='object')?1:null;
      const displayText=field.key==='accuracy_percent'&&(!s||s.correctKeys+s.mistakes===0)?`${field.label}：計測なし（終了時に${target}%以上）`:typeof raw==='string'?`${field.label}：${raw}`:field.key==='normal_completion'?(ineligible?'今回は対象外':s?.phase==='completed'?'完走で確定':'スキップせず90秒完走で確定'):
        `${field.label}：${typeof raw==='boolean'?(raw?'達成':'未達'):`${current}${target===null?'':`/${target}`}${field.unit}`}`;
      return {key:field.key,label:field.label,current,target,unit:field.unit,displayText};
    });
    if(definition.id==='E06'||definition.id==='H06') {
      const required=definition.id==='E06'?5:20;
      const achieved=definition.id==='E06'?state.fiveWordCourses:state.skilledCourses;
      courses.forEach((course,index)=>{
        const line=progress.find(p=>p.key===`course_${index+1}`);if(!line)return;
        const threshold=`${required}語以上${definition.id==='H06'?'・正確率95%以上':''}で完走`;
        const active=s?.context.courseId===course&&s.phase==='active'&&s.mode==='MAIN';
        const current=active?`今回 ${s.completedWords}/${required}語${definition.id==='H06'?`・正確率${Math.floor(1000*s.correctKeys/Math.max(1,s.correctKeys+s.mistakes))/10}%`:''}。90秒完走で確定`:'適格な完走記録はまだありません';
        line.displayText=`${line.label}：${achieved.includes(course)?'条件を満たして完走済み':`${threshold}。${current}`}`;
      });
    }
    if(definition.id==='K03'&&state.city) {
      const leader=Object.entries(state.city.districts).sort((a,b)=>b[1].shops-a[1].shops)[0];
      if(leader)progress[0].displayText=`${districtNames[leader[0]]}の店：${leader[1].shops}/10軒`;
    }
    if(definition.id==='F02') {
      const wordId=s?.mode==='PRACTICE'&&s.phase==='active'&&liveSession?.mode==='PRACTICE'&&liveSession.phase!=='RESULT'?liveSession.currentWord.id:practiceEntries[0]?.[0];
      if(wordId)progress[0].displayText=`${wordById.get(wordId)?.display??'ことば'}の無誤打練習：${values.same_word_practice_clean_count}/3回`;
    }
    if(definition.id==='F04') {
      const practiced=practiceEntries.filter(([,v])=>v.practiceCompleted>0);
      const perWord=progress.find(p=>p.key==='per_word_clean_count');
      if(perWord)perWord.displayText=practiced.length?'ことばごとの無誤打練習回数':'まだ練習したことばはありません';
      for(const[id,p]of practiced)progress.push({key:`practice_word_${id}`,label:wordById.get(id)?.display??'ことば',current:p.practiceCleanCompleted,target:3,unit:'回',displayText:`${wordById.get(id)?.display??'ことば'}：${p.practiceCleanCompleted}/3回`});
    }
    return {id:definition.id,name:definition.name,familyId:definition.family_id,condition:definition.condition,scope:definition.scope,hidden:definition.hidden,hiddenHint:definition.hidden_hint,
      hiddenRevealed:!definition.hidden||earned||state.revealedIds.includes(definition.id),earned,unread:state.unreadAchievements.includes(definition.id),
      provisional:!earned&&!ineligible&&normal&&s?.phase==='active'&&!!conditions[definition.id],ineligible,eligibleModes:route?'街の確定成果':practice?'練習・復習':normal?'スキップなしの本編完走':definition.scope==='便'?'本編完走（救済可）':'すべての遊び方',progress};
  });
}


const isRecord=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>!['__proto__','constructor','prototype'].includes(key));
const nonnegative=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
const count=(value:unknown):value is number=>nonnegative(value)&&Number.isSafeInteger(value);
const text=(value:unknown):value is string=>typeof value==='string'&&value.length>0;
const list=(value:unknown,predicate:(item:unknown)=>boolean):value is string[]=>Array.isArray(value)&&value.every(predicate)&&new Set(value).size===value.length;
/** Only at persisted/imported data boundaries, never on individual keystrokes. */
export function validateAchievementState(value:unknown):value is AchievementState {
  if(!isRecord(value)||value.version!==1||!validateProfileDocument({...createProfileDocument(),progress:value.measuredProgress}))return false;
  if(!isRecord(value.sessions)||!isRecord(value.unlocks)||!isRecord(value.rewards)||!isRecord(value.equipped)||!isRecord(value.orderCompletions)||!isRecord(value.bestAccuracies))return false;
  if(!['manualDeliveries','groupedDeliveries','fullDeliveries','deliveredCargo','completedRounds','fiveWordRounds','bestNormalStreak','bestPracticeStreak','bestNormalCanonicalLength','paidEquipmentPurchases','researchPurchases'].every(key=>count(value[key])))return false;
  if(!Object.values(value.orderCompletions).every(count)||!Object.values(value.bestAccuracies).every(v=>nonnegative(v)&&v<=100))return false;
  if(!list(value.unreadAchievements,id=>typeof id==='string'&&ids.has(id)&&!!(value.unlocks as Record<string,unknown>)[id])
    ||!list(value.unreadRewards,id=>typeof id==='string'&&rewardIds.has(id)&&!!(value.rewards as Record<string,unknown>)[id])
    ||!list(value.revealedIds,id=>typeof id==='string'&&ids.has(id))||!list(value.countedCityEvents,text)
    ||!list(value.fiveWordCourses,course=>typeof course==='string'&&courses.includes(course))||!list(value.skilledCourses,course=>typeof course==='string'&&courses.includes(course))
    ||!(value.targetId===null||(typeof value.targetId==='string'&&ids.has(value.targetId)))||!['live','result'].includes(value.notificationMode as string))return false;
  const acquisition=(v:unknown)=>isRecord(v)&&nonnegative(v.acquiredAtMs)&&text(v.evidenceEventId);
  for(const[id,unlock]of Object.entries(value.unlocks)) {
    if(!ids.has(id)||!acquisition(unlock)||!isRecord(unlock)||!text(unlock.conditionRevision)||!['MAIN','PRACTICE','TUTORIAL','CITY'].includes(unlock.mode as string))return false;
    const scope=catalog.achievements.find(a=>a.id===id)!.scope;
    if((scope==='街'&&unlock.mode!=='CITY')||(scope==='練'&&unlock.mode!=='PRACTICE')||((scope==='通常'||scope==='便')&&unlock.mode!=='MAIN')||(scope==='全'&&unlock.mode==='CITY'))return false;
  }
  for(const id of Object.keys(value.unlocks)) {const a=catalog.achievements.find(a=>a.id===id)!;if(!value.rewards[a.stamp_asset_id]||!value.rewards[a.title_id])return false;}
  for(const[id,reward]of Object.entries(value.rewards)) {
    if(!rewardIds.has(id)||!acquisition(reward))return false;
    const achievement=catalog.achievements.find(a=>a.title_id===id||a.stamp_asset_id===id);
    if(achievement&&!value.unlocks[achievement.id])return false;
  }
  for(const slot of ['titleId','frameId','ornamentId','homeBackgroundId']as const) {
    const id=value.equipped[slot];
    if(slot==='homeBackgroundId'&&id===undefined)continue;
    if(id!==null&&(typeof id!=='string'||!value.rewards[id]))return false;
    // Retain a previously saved evening-panel choice without moving or applying it as an ornament.
    const retainedPanel=slot==='ornamentId'&&catalog.rewards.some(r=>r.id===id&&r.kind==='home_panel');
    if(id!==null&&!retainedPanel&&!rewardFitsSlot(slot,id as string))return false;
  }
  for(const[slot,kinds]of Object.entries({postcardId:['postcard'],boardId:['foil_board','memorial_board'],albumId:['album']})) {
    const id=value.equipped[slot];if(id===undefined||id===null)continue;
    if(typeof id!=='string'||!value.rewards[id]||!catalog.rewards.some(r=>r.id===id&&kinds.includes(r.kind)))return false;
  }
  for(const[sessionId,session]of Object.entries(value.sessions)) {
    if(!text(sessionId)||!isRecord(session)||session.sessionId!==sessionId||!['MAIN','PRACTICE','TUTORIAL'].includes(session.mode as string)||!['active','completed','aborted'].includes(session.phase as string)||!isRecord(session.context)||!isRecord(session.baselines))return false;
    if(!['completedWords','canonicalLength','correctKeys','mistakes','score','skips','currentCleanStreak','maxCleanStreak','full'].every(key=>count(session[key]))
      ||!['guideUsed','fullAfterTwo','fourThenClean','qualifiedClean'].every(key=>typeof session[key]==='boolean')
      ||!(session.fourCandidate===null||count(session.fourCandidate))||!Array.isArray(session.manual)||session.manual.length!==5||!session.manual.every(count)
      ||!list(session.qualifiedWordIds,id=>typeof id==='string'&&wordById.has(id)))return false;
    const c=session.context;
    if(!courses.includes(c.courseId as string)||!['planId','contentVersion','generatorVersion','inputRuleVersion','scoringVersion'].every(key=>text(c[key]))||typeof c.guideUsed!=='boolean'||typeof c.assisted!=='boolean')return false;
    if(!validateProfileDocument({...createProfileDocument(),progress:{...createProfileProgress(),bestByComparison:session.baselines}}))return false;
  }
  if(value.city!==null) {
    const c=value.city;if(!isRecord(c)||!text(c.cityId)||!count(c.sequence)||!count(c.clockMs)||!count(c.packagingLevel)||c.packagingLevel>50||!count(c.citiesRestarted)
      ||typeof c.arrivedMicro!=='string'||!/^\d+$/.test(c.arrivedMicro)||typeof c.cityArrivedMicro!=='string'||!/^\d+$/.test(c.cityArrivedMicro)
      ||!list(c.synergies,id=>typeof id==='string'&&['joint_delivery','sorting_network','tourism_service'].includes(id))||!isRecord(c.districts))return false;
    const districts=['residential','market','workshop','park','station','harbor'];
    if(Object.keys(c.districts).length!==6||!districts.every(id=>Object.hasOwn(c.districts as object,id)))return false;
    for(const d of Object.values(c.districts))if(!isRecord(d)||!count(d.stage)||d.stage>5||typeof d.open!=='boolean'||typeof d.railway!=='boolean'||!count(d.shops))return false;
  }
  return true;
}
