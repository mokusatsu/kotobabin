import { expect, test } from '@playwright/test';

test('restores a current backup atomically, persists the previous state and invalidates old generations', async ({page}) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const source='/src/profile/repository.ts';
    const {ProfileRepository,createProfileDocument}=await import(source);
    const dbName=`kotobabin-restore-${crypto.randomUUID()}`;
    const repo=await ProfileRepository.open({dbName,tabId:'owner'});
    await repo.updateSettings({guide:false});
    const before=repo.snapshot;
    const imported=createProfileDocument(); imported.settings.fontScale=150;
    imported.metadata={...imported.metadata,ownerTabId:'foreign',generation:999,writeEpoch:999,revision:999};
    await repo.restoreData({repository:{current:imported}},{confirmed:true});
    const saved=repo.snapshot;
    let stale='';
    try { await repo.mutateDocument((document: typeof imported)=>document,{generation:before.metadata.generation}); }
    catch(error){stale=error instanceof Error ? error.constructor.name : String(error);}
    repo.close();
    const reopened=await ProfileRepository.open({dbName,tabId:'owner'});
    const reopenedSnapshot=reopened.snapshot; const backup=JSON.parse(reopened.exportData());
    const other=await ProfileRepository.open({dbName,tabId:'other'});
    let ownerError='';
    try {await other.restoreData(imported,{confirmed:true});}catch(error){ownerError=error instanceof Error ? error.constructor.name : String(error);}
    const status=reopened.status;
    reopened.close();other.close();indexedDB.deleteDatabase(dbName);
    return {before:before.metadata,saved:saved.metadata,settings:reopenedSnapshot.settings,backup,stale,ownerError,status};
  });
  expect(result.saved).toEqual({...result.before,revision:result.before.revision+1,generation:result.before.generation+1});
  expect(result.settings.fontScale).toBe(150);
  expect(result.backup.restoreBackups[0].persistedCurrent.settings.guide).toBe(false);
  expect(result.stale).toBe('GenerationMismatchError');
  expect(result.ownerError).toBe('OwnershipError');
  expect(result.status).toMatchObject({storage:'indexeddb',saveState:'saved'});
});

test('explicit recovery keeps corrupt data while preserving its valid metadata and claiming a new epoch',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const source='/src/profile/repository.ts';
    const {ProfileRepository,createProfileDocument}=await import(source);
    const dbName=`kotobabin-recover-${crypto.randomUUID()}`;
    const bad=createProfileDocument();bad.progress.totalCompleted=999;
    bad.metadata={...bad.metadata,ownerTabId:'old-tab',generation:7,revision:9,writeEpoch:3};
    await new Promise<void>((resolve,reject)=>{
      const req=indexedDB.open(dbName,4);
      req.onupgradeneeded=()=>req.result.createObjectStore('profile').put(bad,'current');
      req.onerror=()=>reject(req.error);req.onsuccess=()=>{req.result.close();resolve();};
    });
    const repo=await ProfileRepository.open({dbName,tabId:'recovery-owner'});
    let protectedError='';
    try{await repo.restoreData(createProfileDocument(),{confirmed:true});}catch(error){protectedError=error instanceof Error?error.constructor.name:String(error);}
    await repo.restoreData(createProfileDocument(),{confirmed:true,replaceProtectedData:true});
    const snapshot=repo.snapshot;repo.close();
    const reopened=await ProfileRepository.open({dbName,tabId:'recovery-owner'});
    const backup=JSON.parse(reopened.exportData());const status=reopened.status;reopened.close();indexedDB.deleteDatabase(dbName);
    return {protectedError,metadata:snapshot.metadata,backup,status};
  });
  expect(result.protectedError).toBe('RecoveryRequiredError');
  expect(result.metadata).toEqual({schemaVersion:4,ownerTabId:'recovery-owner',writeEpoch:4,revision:10,generation:8});
  expect(result.backup.restoreBackups[0].persistedCurrent.progress.totalCompleted).toBe(999);
  expect(result.backup.restoreBackups[0].originalInvalidData.progress.totalCompleted).toBe(999);
  expect(result.status).toMatchObject({storage:'indexeddb',saveState:'saved',recoveryRequired:false});
});

test('failed backup write aborts replacement and retains current profile and generation',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const source='/src/profile/repository.ts';
    const {ProfileRepository,createProfileDocument}=await import(source);
    const dbName=`kotobabin-restore-abort-${crypto.randomUUID()}`;
    const repo=await ProfileRepository.open({dbName,tabId:'owner'});await repo.updateSettings({guide:false});
    const before=repo.snapshot;
    const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){
      if(this.name==='profile'&&key==='restoreBackups'){this.transaction.abort();return {} as IDBRequest<IDBValidKey>;}
      return original.call(this,value,key);
    };
    let failed=false;
    try{await repo.restoreData(createProfileDocument(),{confirmed:true});}catch{failed=true;}finally{IDBObjectStore.prototype.put=original;}
    const after=repo.snapshot;repo.close();
    const reopened=await ProfileRepository.open({dbName,tabId:'owner'});const persisted=reopened.snapshot;
    const exported=JSON.parse(reopened.exportData());reopened.close();indexedDB.deleteDatabase(dbName);
    return {failed,before,after,persisted,backups:exported.restoreBackups};
  });
  expect(result.failed).toBe(true);expect(result.after).toEqual(result.before);expect(result.persisted).toEqual(result.before);expect(result.backups).toBeUndefined();
});
