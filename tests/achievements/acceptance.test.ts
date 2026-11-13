import { expect, test } from 'vitest';
import { createAchievementState, applyAchievementCity, beginAchievementSession, getAchievementViews, type AchievementState } from '../../src/profile/achievements';
import { initialCityState } from '../../src/economy';

test('K02 uses current packaging level10 without an unrelated paid-purchase-history requirement', () => {
 const city=initialCityState(0);city.packagingLevel=10;
 const next=applyAchievementCity(createAchievementState(),{eventId:'observe-valid-current-m3-city',atMs:0,city});
 expect(next.unlocks.K01).toBeUndefined();
 expect(next.unlocks.K02).toBeDefined();
});

test('current-city district collection does not merge two incomplete cities; lifetime arrivals do', () => {
 const first=initialCityState(0);first.districts.residential.stage=1;first.districts.market.stage=1;
 first.arrivedMicro=500000000n;first.cityArrivedMicro=500000000n;
 const before=applyAchievementCity(createAchievementState(),{eventId:'old-city',atMs:0,city:first});
 expect(before.unlocks.I03).toBeUndefined();expect(before.unlocks.J02).toBeUndefined();
 const second=initialCityState(0);second.cityId='city-2';second.citySequence=2;second.districts.workshop.stage=1;
 second.arrivedMicro=1000000000n;second.cityArrivedMicro=500000000n;
 const next=applyAchievementCity(before,{eventId:'new-city',atMs:1,city:second});
 expect(next.unlocks.I03).toBeUndefined();expect(next.unlocks.J02).toBeDefined();
 expect(applyAchievementCity(next,{eventId:'old-city-late',atMs:2,city:first})).toEqual(next);
});

test('free default crews and stage-one shop are not paid equipment; a retried real purchase counts once', () => {
 const city=initialCityState(0);city.districts.residential.stage=1;city.districts.residential.shops=1;
 let state=applyAchievementCity(createAchievementState(),{eventId:'free',atMs:0,city});
 expect(state.unlocks.I01).toBeDefined();expect(state.unlocks.K01).toBeUndefined();
 state=applyAchievementCity(state,{eventId:'purchase-1',atMs:1,city,paidEquipmentPurchase:true});
 const replay=applyAchievementCity(state,{eventId:'purchase-1',atMs:1,city,paidEquipmentPurchase:true});
 expect(replay.paidEquipmentPurchases).toBe(1);expect(replay).toEqual(state);
 expect(replay.unlocks.K01).toBeDefined();
});

import { GameSession, type Word } from '../../src/typing';
import content from '../../spec/initial/data/words.json';
const context={courseId:'relaxed' as const,planId:'qa',contentVersion:'2.0.0',generatorVersion:'qa',inputRuleVersion:'romaji-1.0.0',scoringVersion:'1',guideUsed:true,assisted:false};

test('unbounded historical progress does not acquire a denominator of one',()=>{
 const view=getAchievementViews(createAchievementState()).find(v=>v.id==='C01')!;
 const best=view.progress.find(p=>p.key==='best_eligible_accuracy')!;
 expect(best.target).toBeNull();expect(best.displayText).not.toContain('/1');
});

test('F02 live practice progress belongs to the current target, not the globally most practiced word',()=>{
 let state=createAchievementState();state.measuredProgress.totalCompleted=5;
 state.measuredProgress.words.living_r02={completed:5,cleanCompleted:5,practiceCompleted:5,practiceCleanCompleted:5};
 const session=new GameSession({words:[content.words.find(w=>w.id==='living_r01') as Word],mode:'PRACTICE',sessionId:'practice-cat'});
 state=beginAchievementSession(state,{sessionId:session.sessionId,mode:'PRACTICE',context,atMs:0});
 const view=getAchievementViews(state,session.snapshot(0),session.sessionId).find(v=>v.id==='F02')!;
 expect(view.progress.find(p=>p.key==='same_word_practice_clean_count')!.current).toBe(0);
 expect(view.progress.some(p=>p.displayText.includes('猫'))).toBe(true);
});

import catalog from '../../spec/initial/data/achievement_catalog.json';
function seedUnlocks(selected: string[]): AchievementState {
 const state=createAchievementState();
 for(const id of selected) {
  const definition=catalog.achievements.find(a=>a.id===id)!;
  state.unlocks[id]={acquiredAtMs:0,evidenceEventId:`fixture-${id}`,conditionRevision:catalog.catalog_version,mode:'MAIN'};
  for(const key of [definition.stamp_asset_id,definition.title_id])state.rewards[key]={acquiredAtMs:0,evidenceEventId:`fixture-${id}`};
 }
 return state;
}

test('48 total achievements and the original A-H collection award are independent',()=>{
 const selected=catalog.achievements.filter(a=>a.id!=='A01'&&a.id!=='I01'&&a.id!=='J01').slice(0,47).map(a=>a.id);
 const city=initialCityState(0);city.districts.residential.stage=1;
 const state=applyAchievementCity(seedUnlocks(selected),{eventId:'48th',atMs:1,city});
 expect(Object.keys(state.unlocks)).toHaveLength(48);
 expect(state.rewards.reward_total_48_board).toBeDefined();
 expect(state.rewards.reward_first_collection_board).toBeUndefined();
 expect(state.rewards.reward_first_collection_stamp).toBeUndefined();
 const original=catalog.achievements.filter(a=>a.family_id<='H').map(a=>a.id);
 const first=applyAchievementCity(seedUnlocks(original),{eventId:'first-series',atMs:2,city:initialCityState(0)});
 expect(first.rewards.reward_total_48_board).toBeDefined();
 expect(first.rewards.reward_first_collection_board).toBeDefined();
 expect(first.rewards.reward_first_collection_stamp).toBeDefined();
});

test('a simultaneous23-to25 unlock crosses the24 threshold once and keeps its full reward set',()=>{
 const selected=catalog.achievements.filter(a=>a.id!=='I01'&&a.id!=='J01').slice(0,23).map(a=>a.id);
 const city=initialCityState(0);city.districts.residential.stage=1;city.arrivedMicro=1n;city.cityArrivedMicro=1n;
 const next=applyAchievementCity(seedUnlocks(selected),{eventId:'two-unlocks',atMs:1,city});
 expect(Object.keys(next.unlocks)).toHaveLength(25);
 for(const id of ['reward_total_24_album','reward_total_24_postcard','reward_total_24_thanks'])expect(next.rewards[id]).toBeDefined();
 const replay=applyAchievementCity(next,{eventId:'two-unlocks',atMs:1,city});
 expect(replay).toEqual(next);
 expect(new Set(next.unreadRewards).size).toBe(next.unreadRewards.length);
});

test('all72 achievements own exactly40 supplemental rewards and the total remains72',()=>{
 const next=applyAchievementCity(seedUnlocks(catalog.achievements.map(a=>a.id)),{eventId:'complete',atMs:1,city:initialCityState(0)});
 expect(Object.keys(next.unlocks)).toHaveLength(72);
 expect(catalog.rewards.every(reward=>!!next.rewards[reward.id])).toBe(true);
 expect(Object.keys(next.rewards)).toHaveLength(72*2+40);
 expect(getAchievementViews(next).every(view=>view.earned)).toBe(true);
});
