import { expect, test } from 'vitest';
import { createAppRuntime } from '../../src/app/runtime';
import { ProfileRepository, type RecordContext } from '../../src/profile';
import { GameSession, type Word } from '../../src/typing';
import words from '../../spec/initial/data/words.json';

test('explicitly abandoned terminal marks the persisted achievement session aborted without replaying discarded facts', async()=>{
 const repository=await ProfileRepository.open({indexedDB:null});
 const runtime=await createAppRuntime(repository,{now:()=>0,wallNow:()=>0});
 const context:RecordContext={courseId:'relaxed',planId:'qa',contentVersion:'2.0.0',generatorVersion:'qa',inputRuleVersion:'romaji-1.0.0',scoringVersion:'1',guideUsed:true,assisted:false};
 try {
  const game=new GameSession({mode:'PRACTICE',words:[words.words.find(w=>w.id==='living_r02') as Word],sessionId:'abandoned'});
  runtime.beginSession(game.sessionId,'PRACTICE',undefined,context);
  for(const key of 'inu')game.input(key,0);runtime.applyFacts(game.drainEvents(),context);await repository.refresh();
  game.repeatWord(0);for(const key of 'inu')game.input(key,0);game.drainEvents();
  repository.takeover=async()=>{};
  await runtime.takeOver({discardUnsaved:true});
  game.endPractice(0,'replaced');runtime.applyFacts(game.drainEvents(),context);await repository.refresh();
  expect(runtime.achievements.measuredProgress.totalCompleted).toBe(1);
  expect(runtime.achievements.measuredProgress.factCursors.abandoned).toBe(3);
  expect(runtime.achievements.sessions.abandoned.phase).toBe('aborted');
 }finally{runtime.close();}
});
