/* global chrome, devicePixelRatio, scrollX, scrollY, URL */
import {chromium} from '@playwright/test';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
const r=createInterface({input:process.stdin,terminal:false}); console.log('Ready for private zoom audit JSON.');
const {url,token}=JSON.parse(await new Promise(resolve=>r.once('line',resolve)));r.close();
const extension=fileURLToPath(new URL('./browser-zoom-extension',import.meta.url)),u=new URL(url);
const proxyURL=process.env.HTTPS_PROXY??process.env.HTTP_PROXY; const p=proxyURL?new URL(proxyURL):null;
const proxy=p?{server:p.origin,username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:undefined;
const results=[];
async function state(page,name){
 const v=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,doc:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],scroll:[scrollX,scrollY],maps:[...document.querySelectorAll('.compact-world-preview svg,.town-map')].map(e=>{const b=e.getBoundingClientRect();return {kind:e.matches('.town-map')?'world':'district',label:e.getAttribute('aria-label'),width:b.width,height:b.height,visible:b.width>0&&b.height>0}}),headings:[...document.querySelectorAll('h1,h2')].map(e=>e.textContent),text:document.body.innerText,controls:[...document.querySelectorAll('button,input,select,[role=menuitem]')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(e).visibility!=='hidden'}).map(e=>{const b=e.getBoundingClientRect();return {text:e.getAttribute('aria-label')||e.innerText||e.id,disabled:e.disabled,bounds:[b.x,b.y,b.width,b.height]}})}));
 results.push({name,...v});console.log(JSON.stringify({name,width:v.width,height:v.height,dpr:v.dpr,doc:v.doc,overflowControls:v.controls.filter(e=>e.bounds[0]<-1||e.bounds[1]<-1||e.bounds[0]+e.bounds[2]>v.width+1||e.bounds[1]+e.bounds[3]>v.height+1).map(e=>e.text),headings:v.headings,maps:v.maps}));return v;
}
async function activate(page,name){const target=page.getByRole('button',{name,exact:true}).or(page.getByRole('textbox',{name,exact:true})).or(page.getByRole('searchbox',{name,exact:true}));for(let i=0;i<100;i++){for(const el of await target.all()){if(await el.isVisible()&&await el.evaluate(e=>e===document.activeElement)){if(await el.evaluate(e=>e.tagName==='INPUT'&&!['radio','checkbox'].includes(e.type)))return;await page.keyboard.press('Enter');await page.waitForTimeout(250);return;}}await page.keyboard.press('Tab')}throw Error('Unreachable '+name)}
async function menu(page,name){await page.keyboard.press('F2'); for(let i=0;i<9;i++){const text=await page.evaluate(()=>document.activeElement?.textContent);if(text?.includes(name)){await page.keyboard.press('Enter');await page.waitForTimeout(250);return;}await page.keyboard.press('ArrowDown')}throw Error('Menu not reached '+name)}
for(const viewport of [{width:1920,height:1440},{width:2360,height:1640},{width:1280,height:900}]){
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,viewport,proxy,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
 try{
 await context.route('**/*',route=>{const target=new URL(route.request().url());if(target.origin!==u.origin)return route.abort();return route.continue({headers:{...route.request().headers(),'OAI-Sites-Authorization':`Bearer ${token}`}})});
 const page=await context.newPage();await page.goto(url);await page.getByRole('heading',{name:'配達に出かけよう'}).waitFor();
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const zoom=await worker.evaluate(async target=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url?.startsWith(target));await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id)},url);
 if(zoom!==2)throw Error('Native browser zoom failed');await page.waitForTimeout(500);
 await state(page,`${viewport.width}-home-zoom200`);
 for(const item of ['配達手帳','ことば図鑑','設定','ホーム']) {await menu(page,item);await state(page,`${viewport.width}-${item}-zoom200`);if(item==='設定')await page.keyboard.press('Escape')}

 if(viewport.width>1280){
 await activate(page,'配達をはじめる');await activate(page,'入力の確認');await page.keyboard.type('a');await activate(page,'準備できました →');await activate(page,'ローマ字を入力');await page.keyboard.type('neko');await page.keyboard.press('Space');await activate(page,'90秒の配達へ →');await state(page,`${viewport.width}-main-ready-zoom200`);await page.keyboard.type('a');await page.keyboard.press('Escape');await state(page,`${viewport.width}-paused-zoom200`);
 }else{
 const start=page.getByRole('button',{name:'配達をはじめる',exact:true});if(!await start.isDisabled())throw Error('Narrow MAIN guard missing');await activate(page,'ことばの練習');await state(page,'1280-practice-entry-zoom200');
 for(let i=0;i<12&&!await page.getByRole('searchbox',{name:'ことば・読みで検索',exact:true}).isVisible();i++)await activate(page,'次の表示 →');await activate(page,'ことば・読みで検索');await page.keyboard.type('neko');await page.keyboard.press('Control+a');await page.keyboard.insertText('猫');
 for(let i=0;i<12&&!await page.getByRole('button',{name:'猫を練習',exact:true}).isVisible();i++)await activate(page,'次の表示 →');
 await activate(page,'猫を練習');await activate(page,'入力の確認');await page.keyboard.type('a');await activate(page,'準備できました →');await activate(page,'ローマ字を入力');await page.keyboard.type('neko');await state(page,'1280-practice-word-completed-zoom200');if(!(await page.locator('#practice-progress').innerText()).includes('1/3'))throw Error('Narrow practice did not complete a word');

 }
 }finally{await context.close()}
}
await mkdir('work/browser-zoom/evidence',{recursive:true});await writeFile('work/browser-zoom/evidence/observations.json',JSON.stringify(results,null,2));

const failed=results.filter(v=>v.dpr!==2||(v.width>=768&&(v.doc[0]!==v.width||v.doc[1]!==v.height||v.controls.some(e=>e.bounds[0]<-1||e.bounds[1]<-1||e.bounds[0]+e.bounds[2]>v.width+1||e.bounds[1]+e.bounds[3]>v.height+1)))||v.maps.some(m=>m.kind==='world'&&m.visible&&(m.width<799.9||m.height<499.9)));
console.log(JSON.stringify({states:results.length,nativeZoom:2,failed:failed.map(v=>v.name)}));
if(failed.length)process.exitCode=1;
