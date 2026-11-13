import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';

test('independent real-key E2E with natural 90-second game', async ({page}, info) => {
  const dir = `review-independent/output/${info.project.name}`;
  fs.mkdirSync(dir, {recursive:true});
  const actions: unknown[] = [];
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const start = Date.now();
  const log = (action: string, detail: unknown = '') => actions.push({elapsed:Date.now()-start,action,detail});
  async function key(key: string) { await page.keyboard.press(key); log('key',key); }
  async function focusByTab(label: string) {
    for (let i=0;i<120;i++) {
      const active = await page.evaluate(() => ({text:(document.activeElement as HTMLElement)?.innerText?.trim(), aria:document.activeElement?.getAttribute('aria-label')}));
      if (active.text===label || active.aria===label) {log('tab target',label);return;}
      await key('Tab');
    }
    throw new Error(`Keyboard target not found: ${label}`);
  }
  async function activate(label:string) {await focusByTab(label);await key('Enter');await page.waitForTimeout(250);}
  async function shot(label:string) {
    const observation=await page.evaluate(()=>{
      const visible=(e:Element)=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none'};
      return {
        text:document.body.innerText,
        controls:[...document.querySelectorAll('button,a,input,select')].filter(visible).map(e=>({tag:e.tagName,text:(e as HTMLElement).innerText,aria:e.getAttribute('aria-label'),type:e.getAttribute('type'),value:(e as HTMLInputElement).value,checked:(e as HTMLInputElement).checked,disabled:(e as HTMLInputElement).disabled,rect:e.getBoundingClientRect().toJSON()})),
        leaf:[...document.querySelectorAll('main *,[role=dialog] *')].filter(e=>visible(e)&&!e.children.length&&e.textContent?.trim()).map(e=>({tag:e.tagName,text:e.textContent,cls:typeof e.className==='string'?e.className:'',font:getComputedStyle(e).fontSize,rect:e.getBoundingClientRect().toJSON()})),
        viewport:{w:innerWidth,h:innerHeight}, scroll:{w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,x:scrollX,y:scrollY},
        active:{tag:document.activeElement?.tagName,text:(document.activeElement as HTMLElement)?.innerText,aria:document.activeElement?.getAttribute('aria-label')}
      };
    });
    fs.writeFileSync(`${dir}/${label}.json`,JSON.stringify(observation,null,2));
    console.log('UI_OBSERVATION '+info.project.name+' '+label+' '+JSON.stringify({text:observation.text,viewport:observation.viewport,scroll:observation.scroll,active:observation.active,controls:observation.controls.map(({tag,text,aria,value,checked,disabled})=>({tag,text,aria,value,checked,disabled}))}));
    await page.screenshot({path:`${dir}/${label}.png`});
    return observation;
  }
  async function navigate(label:string) {await key('F2');await activate(label);}
  async function pages(label:string) {
    const initial=await shot(label+'-1');
    const match=initial.text.match(/表示\s+(\d+)\s*\/\s*(\d+)/);
    const count=match?Number(match[2]):1;
    for(let n=2;n<=count && n<=30;n++) {await activate('次の表示 →');await shot(label+'-'+n);}
    log('display pages completed',{label,count});
  }
  try {
    await page.goto('/');await page.waitForTimeout(700);
    await shot('home100');await activate('住宅地の詳細');await shot('district100');await key('Escape');await shot('district-back100');
    await navigate('配達手帳');await pages('handbook100');await key('Escape');await navigate('配達手帳');await shot('handbook-reentry100');
    await activate('コレクション');await shot('handbook-collection100');await activate('獲得の履歴');await shot('handbook-history100');await key('Escape');
    await navigate('ことば図鑑');await shot('catalogue100');await activate('次の表示 →');await shot('catalogue-display2-100');await key('Escape');
    await navigate('設定');await pages('settings100');await key('Escape');
    await navigate('設定');
    for(let i=0;i<80;i++) {
      if(await page.locator('input[value="150"]').isChecked()) break;
      const isSize=await page.evaluate(()=>document.activeElement?.tagName==='INPUT'&&['100','125'].includes((document.activeElement as HTMLInputElement).value));
      if(isSize) {await key('ArrowRight');await page.waitForTimeout(150);} else await key('Tab');
    }
    await shot('settings150');
    expect(await page.locator('input[value="150"]').isChecked()).toBeTruthy();
    await key('Escape');await shot('home150');await activate('住宅地の詳細');await shot('district150');await key('Escape');
    await navigate('配達手帳');await pages('handbook150');await key('Escape');await navigate('配達手帳');await shot('handbook-reentry150');await key('Escape');
    await navigate('ことば図鑑');await shot('catalogue150');await activate('次の表示 →');await shot('catalogue-display2-150');await key('Escape');
    await navigate('ホーム');await activate('配達をはじめる');await shot('input-check150');await page.keyboard.type('a');log('typed input check','a');await activate('準備できました →');await page.waitForTimeout(800);await shot('tutorial150');
    await activate('導入を飛ばして本編へ');await page.waitForTimeout(800);await shot('normal-ready150');
    await focusByTab('ローマ字を入力');
    const gameStart=Date.now();let count=0;let completed=0;let previousWord='';let shipmentObserved=false;let checkpoint=0;
    while(Date.now()-gameStart<100000) {
      const next=await page.locator('.next-key').first().textContent({timeout:300}).catch(()=>null);
      if(!next || !/^[a-z-]$/.test(next.trim())) {await page.waitForTimeout(150);if(Date.now()-gameStart>88000)break;continue;}
      const word=await page.locator('.prompt-word').innerText();
      if(previousWord && word!==previousWord){completed++;log('completed word',previousWord);
        if(!shipmentObserved){await key('Space');await shot('shipment-at-dispatch150');await page.waitForTimeout(700);await shot('shipment-moving150');await page.waitForTimeout(1600);await shot('shipment-arrival150');shipmentObserved=true;}
      }
      previousWord=word;
      await key(next.trim());count++;await page.waitForTimeout(125);
      const elapsed=Date.now()-gameStart;
      if(elapsed>checkpoint*20000){await shot('normal-progress150-'+checkpoint);checkpoint++;}
    }
    log('natural game duration',{duration:Date.now()-gameStart,typedKeys:count,completedTransitions:completed});
    await page.waitForTimeout(800);await shot('result-first150');
    let retry=false;
    for(let n=0;n<30;n++){
      const current=await shot('result-step150-'+n);
      const retryControl=current.controls.find(c=>c.tag==='BUTTON'&&!c.disabled&&/もう一度|再挑戦|もう一便|もう一回/.test(c.text||''));
      if(retryControl){await activate(retryControl.aria||retryControl.text.trim());retry=true;await page.waitForTimeout(700);await shot('retry150');break;}
      await key('Enter');await page.waitForTimeout(650);
    }
    log('retry observed',retry);expect(retry).toBeTruthy();
    expect(errors).toEqual([]);
  } finally {fs.writeFileSync(`${dir}/actions.json`,JSON.stringify({actions,errors},null,2));}
});
