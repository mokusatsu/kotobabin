import { describe, expect, it } from 'vitest';
import {
  advanceResultStage, createResultStage, finishResultAnimation, renderResultStage,
  skipAllResultStage, skipResultAnimation, type ResultStageOptions,
} from '../../src/ui/result-stage';
const options:ResultStageOptions={result:{score:2070,baseScore:1500,bonusScore:570,completedWords:20,accuracy:97.4,canonicalKpm:180,courseName:'ふつう',assisted:false,guideUsed:true},newAchievementIds:['A01','A02'],reducedMotion:false,onAction:()=>{}};

describe('deterministic result presentation with confirmed award IDs',()=>{
  it('preserves actual acquisition order and deduplicates without mutating the source',()=>{
    const actual=['C02','A01','C02','B01'];const state=createResultStage(actual);
    expect(state.queue).toEqual(['C02','A01','B01']);expect(actual).toEqual(['C02','A01','C02','B01']);
    expect(()=>createResultStage(['not-a-real-achievement'])).toThrow('known confirmed');
  });
  it('shows every actual stamp once in order, with an explicit envelope before each reveal',()=>{
    let state=createResultStage(['A01','A02','B01']);const revealed:string[]=[];const phases:string[]=[state.phase];
    while(state.phase!=='summary'){state=advanceResultStage(state);phases.push(state.phase);if(state.phase==='reveal')revealed.push(state.queue[state.index]);}
    expect(phases).toEqual(['score','sealed','reveal','sealed','reveal','sealed','reveal','summary']);expect(revealed).toEqual(['A01','A02','B01']);
    expect(advanceResultStage(state)).toBe(state);expect(state.queue).toEqual(['A01','A02','B01']);
  });
  it('animation timers never advance or consume an award, and Escape skips the current visual only',()=>{
    const score=createResultStage(['A01','A02']);expect(finishResultAnimation(score)).toEqual({...score,animating:false});
    const sealed=advanceResultStage(score);expect(finishResultAnimation(sealed).phase).toBe('sealed');
    const revealed=skipResultAnimation(sealed);expect(revealed).toMatchObject({phase:'reveal',index:0,animating:false});expect(revealed.queue).toEqual(['A01','A02']);
    expect(skipResultAnimation(revealed)).toBe(revealed);
  });
  it('explicit all-skip goes to a truthful summary without deleting or changing any reward IDs',()=>{
    const actual=Object.freeze(['A01','B05','F06']);const initial=createResultStage(actual);const summary=skipAllResultStage(initial);
    expect(summary.phase).toBe('summary');expect(summary.queue).toEqual(actual);expect(initial.phase).toBe('score');
    expect(renderResultStage(summary,{...options,newAchievementIds:actual})).toContain('>3<small>枚');
  });
  it('reduced motion reveals each next stamp immediately, still requiring explicit advancement',()=>{
    let state=createResultStage(['A01','A02'],true);expect(state.animating).toBe(false);
    state=advanceResultStage(state);expect(state).toMatchObject({phase:'reveal',index:0,animating:false});
    state=advanceResultStage(state);expect(state).toMatchObject({phase:'reveal',index:1,animating:false});
    expect(advanceResultStage(state).phase).toBe('summary');
  });
  it('zero awards skips envelope/reveal stages without inventing a consolation prize',()=>{
    const state=createResultStage([]);expect(renderResultStage(state,{...options,newAchievementIds:[]})).toContain('新しい切手の獲得はありません');
    expect(advanceResultStage(state).phase).toBe('summary');expect(advanceResultStage(state).queue).toEqual([]);
  });
  it('reveals real names/conditions/title rewards, with actual art when available and no fake rarity',()=>{
    const state=advanceResultStage(advanceResultStage(createResultStage(['A01'])));const html=renderResultStage(state,options);
    expect(html).toContain('はじめのことば');expect(html).toContain('語を1語完成する');expect(html).toContain('称号「はじめのことば」を獲得');expect(html).toContain('stamp_a01.webp');
    expect(html).not.toMatch(/SSR|排出率|大当たり|レア度|paper-card|data-paginate/);
  });
  it('never displays an internal production code as the title of unfinished stamp art',()=>{
    const state=advanceResultStage(advanceResultStage(createResultStage(['L06'])));const html=renderResultStage(state,options);
    expect(html).toContain('文の図鑑');expect(html).toContain('切手の絵柄は制作中');expect(html).not.toContain('<strong>L06</strong>');
  });
  it('resumes the exact in-memory queue without replaying animations or changing rewards',()=>{
    const revealed=advanceResultStage(advanceResultStage(createResultStage(['A01','A02'])));
    const resumed=createResultStage(['A01','A02'],false,revealed);
    expect(resumed).toMatchObject({phase:'reveal',index:0,animating:false});
    expect(advanceResultStage(resumed)).toMatchObject({phase:'sealed',index:1});
    expect(()=>createResultStage(['A02','A01'],false,revealed)).toThrow('original confirmed award queue');
    const sealed=advanceResultStage(createResultStage(['A01']));
    expect(createResultStage(['A01'],true,sealed)).toMatchObject({phase:'reveal',animating:false,reducedMotion:true});
    expect(()=>createResultStage([],false,{...revealed,queue:[]})).toThrow('original confirmed award queue');
  });

  it('only requests presentation rendering; no action or optional sound callbacks run in pure rendering',()=>{
    let actions=0;let sounds=0;const model=createResultStage(['A01']);const before=structuredClone(model);
    renderResultStage(model,{...options,onAction:()=>actions++,onPresentationEvent:()=>sounds++});
    expect(model).toEqual(before);expect(actions).toBe(0);expect(sounds).toBe(0);
  });
});
