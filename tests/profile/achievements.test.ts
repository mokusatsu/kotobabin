import { describe, expect, it } from 'vitest';
import content from '../../spec/initial/data/words.json';
import catalog from '../../spec/initial/data/achievement_catalog.json';
import { initialCityState, type CityState } from '../../src/economy';
import { GameSession, type CourseId, type SessionMode, type Word } from '../../src/typing';
import {
  applyAchievementAction, applyAchievementCity, applyAchievementFacts, beginAchievementSession,
  createAchievementState, getAchievementViews, resetAchievementRecords, validateAchievementState,
  type AchievementState, type RecordContext,
} from '../../src/profile';

const words=content.words as Word[];
const word=words.find(w=>w.canonicalLength===6)!;
const context=(courseId:CourseId='relaxed',guideUsed=true):RecordContext=>({courseId,guideUsed,assisted:false,planId:`achievement-fixture-${courseId}`,contentVersion:'2.0.0',generatorVersion:'test-1',inputRuleVersion:'romaji-1.0.0',scoringVersion:'score-1'});
let sequence=0;
function round(count:number, options:{mode?:SessionMode;errors?:number;guide?:boolean;manual?:number[];course?:CourseId;state?:AchievementState;finish?:boolean}={}) {
  const fixed=context(options.course,options.guide??true);const mode=options.mode??'MAIN';
  const session=new GameSession({words:[word],sessionId:`achievement-${++sequence}`,mode,guideEnabled:fixed.guideUsed});
  let state=beginAchievementSession(options.state??createAchievementState(),{sessionId:session.sessionId,mode,context:fixed,atMs:0});
  const complete=(n:number)=>{
    for(let index=0;index<n;index++) {
      if(session.snapshot(0).awaitingWordChoice)session.repeatWord(0);
      if(index===0)for(let mistake=0;mistake<(options.errors??0);mistake++)session.input('z',0);
      for(const key of session.snapshot(0).remainingGuide)session.input(key,0);
      if(options.manual?.includes(index+1))session.deliver(0);
    }
  };
  complete(count);
  if(options.finish!==false) {if(mode==='MAIN')session.tick(90000);else session.endPractice(0);}
  const facts=session.drainEvents();state=applyAchievementFacts(state,facts,fixed);
  return {state,session,facts,fixed};
}
const has=(state:AchievementState,id:string)=>!!state.unlocks[id];

describe('normal achievements at actual-key thresholds',()=>{
  const cases:[string,number,number][]=[['C04',5,4],['C05',15,14],['C06',20,19],['D01',15,14],['D02',25,24],['D03',40,39],['D04',9,8],['D05',45,44],['D06',25,24],['H01',50,49],['H02',30,29],['H03',20,19],['H05',20,19]];
  for(const[id,positive,negative]of cases)it(`${id} accepts its threshold and rejects the preceding attainable value`,()=>{
    expect(has(round(positive,{guide:false}).state,id)).toBe(true);
    expect(has(round(negative,{guide:false}).state,id)).toBe(false);
  });
  for(const[id,count,goodErrors,badErrors]of [['C01',10,6,7],['C02',20,6,7],['C03',25,3,4]]as const)it(`${id} compares unrounded accuracy with completed-word eligibility`,()=>{
    expect(has(round(count,{errors:goodErrors}).state,id)).toBe(true);
    expect(has(round(count,{errors:badErrors}).state,id)).toBe(false);
    expect(has(round(count-1).state,id)).toBe(false);
  });
  it('excludes practice/tutorial from normal unlocks while retaining immediate all-mode facts',()=>{
    for(const mode of ['PRACTICE','TUTORIAL']as const){const state=round(50,{mode}).state;expect(has(state,'A01')).toBe(true);expect(has(state,'C04')).toBe(false);expect(has(state,'D04')).toBe(false);}
  });
});

describe('city achievement boundaries',()=>{
  const setStages=(c:CityState,n:number,stage:number)=>Object.values(c.districts).slice(0,n).forEach(d=>{d.open=true;d.stage=stage;});
  const cases:[string,(c:CityState)=>void,(c:CityState)=>void,{paidEquipmentPurchase?:boolean;researchPurchased?:boolean}?][]=[
    ['I01',c=>setStages(c,1,1),()=>{}],['I02',c=>setStages(c,1,2),c=>setStages(c,1,1)],
    ['I03',c=>setStages(c,3,1),c=>setStages(c,2,1)],['I04',c=>setStages(c,6,1),c=>setStages(c,5,1)],
    ['I05',c=>setStages(c,6,3),c=>{setStages(c,6,3);c.districts.harbor.stage=2;}],['I06',c=>setStages(c,6,5),c=>{setStages(c,6,5);c.districts.harbor.stage=4;}],
    ['J01',c=>{c.arrivedMicro=1n;},()=>{}],['J02',c=>{c.arrivedMicro=1000000000n;},c=>{c.arrivedMicro=999999999n;}],
    ['J03',c=>Object.values(c.districts).forEach(d=>d.open=true),c=>Object.values(c.districts).slice(0,5).forEach(d=>d.open=true)],
    ['J04',c=>{c.districts.residential.railway=true;},()=>{}],['J05',c=>Object.values(c.districts).forEach(d=>d.railway=true),c=>Object.values(c.districts).slice(0,5).forEach(d=>d.railway=true)],
    ['J06',c=>{c.cityArrivedMicro=c.arrivedMicro=100000000000n;},c=>{c.cityArrivedMicro=c.arrivedMicro=99999999999n;}],
    ['K01',()=>{},()=>{},{paidEquipmentPurchase:true}],['K02',c=>{c.packagingLevel=10;},c=>{c.packagingLevel=9;}],
    ['K03',c=>{c.districts.residential.shops=10;},c=>{c.districts.residential.shops=5;c.districts.market.shops=5;}],
    ['K04',c=>{c.synergies=['joint_delivery','sorting_network','tourism_service'];},c=>{c.synergies=['joint_delivery','sorting_network'];}],
    ['K05',c=>{c.citiesRestarted=1;},()=>{}],['K06',()=>{},c=>{c.blueprints=3;},{researchPurchased:true}],
  ];
  for(const[id,positive,negative,flags]of cases)it(`${id} checks exact current-city/lifetime/purchase conditions`,()=>{
    const yes=initialCityState();positive(yes);const no=initialCityState();negative(no);
    expect(has(applyAchievementCity(createAchievementState(),{city:yes,eventId:'yes',atMs:1,...flags}),id)).toBe(true);
    expect(has(applyAchievementCity(createAchievementState(),{city:no,eventId:'no',atMs:1}),id)).toBe(false);
  });
  it('deduplicates purchases and never combines district growth across cities',()=>{
    const first=initialCityState();setStages(first,3,1);let state=applyAchievementCity(createAchievementState(),{city:first,eventId:'buy',atMs:1,paidEquipmentPurchase:true});
    state=applyAchievementCity(state,{city:first,eventId:'buy',atMs:1,paidEquipmentPurchase:true});expect(state.paidEquipmentPurchases).toBe(1);
    const second=initialCityState();second.cityId='city-2';second.citySequence=2;Object.values(second.districts).slice(3).forEach(d=>{d.stage=1;d.open=true;});
    state=applyAchievementCity(state,{city:second,eventId:'new',atMs:2});expect(has(state,'I03')).toBe(true);expect(has(state,'I04')).toBe(false);
    expect(applyAchievementCity(state,{city:first,eventId:'stale',atMs:3})).toBe(state);
  });
});

it('earns all 72 from confirmed typing, fixed collections, qualified rounds and city facts; grants exactly 40 milestone rewards',()=>{
  let state=createAchievementState();const fixed=context();
  const practice=new GameSession({words:[word],mode:'PRACTICE',sessionId:'complete-catalogue'});
  state=beginAchievementSession(state,{sessionId:practice.sessionId,mode:'PRACTICE',context:fixed,atMs:0});
  const ordered=[...content.collectionSets['kotobabin-ja-240-v1'],...content.collectionSets['kotobabin-ja-960-v2'].filter(id=>!content.collectionSets['kotobabin-ja-240-v1'].includes(id))];
  const completed=new Set<string>();
  for(const id of ordered) {
    const selected=words.find(w=>w.id===id)!;
    practice.nextPracticeWord(0,selected);
    for(const key of practice.snapshot(0).remainingGuide)practice.input(key,0);
    state=applyAchievementFacts(state,practice.drainEvents(),fixed);completed.add(id);
    for(const[achievement,target]of [['E01',10],['E02',50],['E03',150],['L01',300],['L02',480],['L03',960]]as const)expect(has(state,achievement)).toBe(completed.size>=target);
    expect(has(state,'E04')).toBe(content.collectionSets['kotobabin-ja-240-v1'].every(key=>completed.has(key)));
    for(const[achievement,set]of [['L04','kotobabin-ja-relaxed-v2'],['L05','kotobabin-ja-standard-v2'],['L06','kotobabin-ja-challenge-v2']]as const)expect(has(state,achievement)).toBe(content.collectionSets[set].every(key=>completed.has(key)));
  }
  for(const selected of words.slice(0,5))for(let repeat=0;repeat<2;repeat++) {
    practice.nextPracticeWord(0,selected);for(const key of practice.snapshot(0).remainingGuide)practice.input(key,0);
    state=applyAchievementFacts(state,practice.drainEvents(),fixed);
  }
  practice.endPractice(0);state=applyAchievementFacts(state,practice.drainEvents(),fixed);
  for(let index=0;index<10;index++) {
    const course=courses[index%3];const selected=words.find(w=>w.courseId===course&&w.canonicalLength>=6)!;
    const c=context(course,false);const main=new GameSession({words:[selected],sessionId:`complete-round-${index}`,guideEnabled:false});
    state=beginAchievementSession(state,{sessionId:main.sessionId,mode:'MAIN',context:c,atMs:0});
    for(let n=1;n<=50;n++) {
      for(const key of main.snapshot(0).remainingGuide)main.input(key,0);
      if(n===2||n===6)main.deliver(0);
      state=applyAchievementFacts(state,main.drainEvents(),c);
      expect(has(state,'G03')).toBe(state.measuredProgress.totalCompleted>=1000);
    }
    main.tick(90000);state=applyAchievementFacts(state,main.drainEvents(),c);
    expect(has(state,'G06')).toBe(index===9);
  }
  const city=initialCityState();for(const district of Object.values(city.districts)){district.stage=5;district.open=true;district.shops=10;district.railway=true;}
  city.packagingLevel=10;city.arrivedMicro=city.cityArrivedMicro=100000000000n;city.citiesRestarted=1;city.synergies=['joint_delivery','sorting_network','tourism_service'];
  state=applyAchievementCity(state,{city,eventId:'all-city-conditions',atMs:90000,paidEquipmentPurchase:true,researchPurchased:true});
  expect(Object.keys(state.unlocks).sort()).toEqual(catalog.achievements.map(a=>a.id).sort());
  expect(catalog.rewards.filter(r=>state.rewards[r.id])).toHaveLength(40);
  expect(Object.keys(state.rewards)).toHaveLength(184);
  expect(getAchievementViews(state)).toHaveLength(72);expect(getAchievementViews(state).every(view=>view.earned&&!view.provisional)).toBe(true);
  expect(validateAchievementState(state)).toBe(true);
  expect(applyAchievementCity(state,{city,eventId:'all-city-conditions',atMs:90000,paidEquipmentPurchase:true,researchPurchased:true})).toEqual(state);
},30000);
const courses:CourseId[]=['relaxed','standard','challenge'];

describe('reward ownership, actions and inspectable progress',()=>{
  it('separates any 48 achievements from completion of the original A–H series',()=>{
    const state=createAchievementState();
    const acquired={acquiredAtMs:1,evidenceEventId:'fixture-unlock'};
    const seed=(id:string)=>{
      const definition=catalog.achievements.find(a=>a.id===id)!;
      state.unlocks[id]={...acquired,conditionRevision:catalog.catalog_version,mode:definition.scope==='街'?'CITY':'MAIN'};
      state.rewards[definition.title_id]={...acquired};state.rewards[definition.stamp_asset_id]={...acquired};
    };
    catalog.achievements.filter(a=>a.family_id<='G'||a.family_id==='I').forEach(a=>seed(a.id));
    const city=initialCityState();let next=applyAchievementCity(state,{city,eventId:'milestones',atMs:2});
    expect(Object.keys(next.unlocks)).toHaveLength(48);expect(next.rewards.reward_total_48_board).toBeDefined();expect(next.rewards.reward_first_collection_board).toBeUndefined();
    for(const a of catalog.achievements.filter(a=>a.family_id==='H')) {
      next.unlocks[a.id]={...acquired,conditionRevision:catalog.catalog_version,mode:'MAIN'};next.rewards[a.title_id]={...acquired};next.rewards[a.stamp_asset_id]={...acquired};
    }
    next=applyAchievementCity(next,{city,eventId:'first-series',atMs:3});expect(next.rewards.reward_first_collection_board).toBeDefined();expect(next.rewards.reward_first_collection_stamp).toBeDefined();
  });

  it('changes read/reveal/target/appearance preferences without awarding facts or auto-equipping',()=>{
    const original=round(1).state;expect(original.equipped.titleId).toBeNull();
    let next=applyAchievementAction(original,{type:'reveal',id:'F06'});
    next=applyAchievementAction(next,{type:'target',id:'F06'});
    next=applyAchievementAction(next,{type:'notifications',mode:'result'});
    next=applyAchievementAction(next,{type:'equip',slot:'titleId',id:'title_a01'});
    next=applyAchievementAction(next,{type:'read',achievementIds:['A01'],rewardKeys:['title_a01','stamp_a01']});
    expect(next.targetId).toBe('F06');expect(next.notificationMode).toBe('result');expect(next.equipped.titleId).toBe('title_a01');expect(next.unreadAchievements).not.toContain('A01');
    expect(next.unlocks).toEqual(original.unlocks);expect(next.rewards).toEqual(original.rewards);expect(next.measuredProgress).toEqual(original.measuredProgress);
    expect(getAchievementViews(next).find(v=>v.id==='F06')?.hiddenRevealed).toBe(true);expect(original.revealedIds).toEqual([]);
    expect(()=>applyAchievementAction(next,{type:'equip',slot:'frameId',id:'title_a01'})).toThrow('slot');
    expect(()=>applyAchievementAction(next,{type:'equip',slot:'titleId',id:'title_h06'})).toThrow('owned');
    expect(()=>applyAchievementAction(next,{type:'target',id:'M01'})).toThrow('Unknown');expect(validateAchievementState(next)).toBe(true);
  });

  it('keeps current mistakes and sticky guide use live while retaining established provisional conditions',()=>{
    const fixed=context('relaxed',false);const game=new GameSession({words:[word],guideEnabled:false,sessionId:'live-progress'});
    let state=beginAchievementSession(createAchievementState(),{sessionId:game.sessionId,mode:'MAIN',context:fixed,atMs:0});
    for(let n=0;n<5;n++)for(const key of game.snapshot(0).remainingGuide)game.input(key,0);
    state=applyAchievementFacts(state,game.drainEvents(),fixed);game.input('z',0);game.setGuideEnabled(true,0);game.setGuideEnabled(false,0);
    const views=getAchievementViews(state,game.snapshot(0));const streak=views.find(v=>v.id==='C04')!;
    expect(streak.provisional).toBe(true);expect(streak.progress.find(p=>p.key==='current_clean_streak')?.current).toBe(0);
    expect(views.find(v=>v.id==='H05')?.ineligible).toBe(true);
    expect(views.find(v=>v.id==='C01')?.progress.find(p=>p.key==='accuracy_percent')?.current).toBe(Math.floor(100*30/31*10)/10);
    expect(views.find(v=>v.id==='C01')?.progress.find(p=>p.key==='best_eligible_accuracy')?.target).toBeNull();
  });

  it('shows the current practice word instead of an unrelated most-practiced word, and names per-word progress',()=>{
    const practiced=round(5,{mode:'PRACTICE',finish:false});const other=words.find(w=>w.id!==word.id)!;
    practiced.session.nextPracticeWord(0,other);
    const views=getAchievementViews(practiced.state,practiced.session.snapshot(0));
    expect(views.find(v=>v.id==='F02')?.progress[0].current).toBe(0);expect(views.find(v=>v.id==='F02')?.progress[0].displayText).toContain(other.display);
    expect(views.find(v=>v.id==='F04')?.progress.some(p=>p.label===word.display&&p.current===5)).toBe(true);
    const city=initialCityState();city.synergies=['joint_delivery'];const next=applyAchievementCity(practiced.state,{city,eventId:'joint',atMs:1});
    expect(getAchievementViews(next).find(v=>v.id==='K04')?.progress.find(p=>p.key==='synergy_1')?.current).toBe(1);
  });

  it('deletes growth comparisons and frozen baselines without revoking earned rewards or measured practice',()=>{
    const previous=round(10).state;const next=beginAchievementSession(previous,{sessionId:'frozen-after-record',mode:'MAIN',context:context(),atMs:0});
    expect(Object.keys(next.sessions['frozen-after-record'].baselines).length).toBeGreaterThan(0);
    const reset=resetAchievementRecords(next);expect(reset.measuredProgress.bestByComparison).toEqual({});expect(reset.measuredProgress.recentRounds).toEqual([]);
    expect(reset.sessions['frozen-after-record'].baselines).toEqual({});expect(reset.unlocks).toEqual(next.unlocks);expect(reset.rewards).toEqual(next.rewards);
    expect(reset.measuredProgress.words).toEqual(next.measuredProgress.words);expect(validateAchievementState(reset)).toBe(true);
  });

  it('rejects malformed persisted achievement state and never reinterprets it as an empty successful save',()=>{
    const state=round(5,{mode:'PRACTICE'}).state;expect(validateAchievementState(state)).toBe(true);
    for(const corrupt of [
      {...state,version:2},{...state,deliveredCargo:-1},{...state,targetId:'M01'},
      {...state,unreadAchievements:['A99']},{...state,notificationMode:'daily'},
      {...state,equipped:{...state.equipped,titleId:'title_h06'}},
      {...state,unlocks:{...state.unlocks,A99:{acquiredAtMs:1,evidenceEventId:'bad',mode:'MAIN',conditionRevision:'1'}}},
      {...state,measuredProgress:{...state.measuredProgress,totalCompleted:999}},
      {...createAchievementState(),rewards:{title_a01:{acquiredAtMs:0,evidenceEventId:'forged'}},equipped:{...state.equipped,titleId:'title_a01'}},
      {...createAchievementState(),rewards:{stamp_a01:{acquiredAtMs:0,evidenceEventId:'forged'}}},
    ])expect(validateAchievementState(corrupt)).toBe(false);
  });
});
