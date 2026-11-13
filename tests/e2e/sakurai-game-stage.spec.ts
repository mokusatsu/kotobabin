import { test, expect } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

// Independent rendered-UI review. All application input uses the real keyboard.
// No imports from application code, injected state, focus(), clicks or clock mocks.
async function activeName(page: Page) {
  return page.evaluate(() => {
    let el = document.activeElement as HTMLElement | null;
    const id = el?.getAttribute('aria-activedescendant');
    if (id) el = document.getElementById(id) || el;
    return (el?.getAttribute('aria-label') || el?.innerText || el?.getAttribute('placeholder') || '').trim();
  });
}
async function press(page: Page, key: string) {
  console.log('KEY', key, 'FROM', await activeName(page));
  await page.keyboard.press(key);
}
async function reach(page: Page, label: string | RegExp) {
  const options = {name:label,exact:typeof label==='string'};
  const target = page.getByRole('button',options).or(page.getByRole('textbox',options)).or(page.getByRole('menuitem',options));
  for (let i = 0; i < 120; i++) {
    for(const el of await target.all()) {
      if(await el.isVisible() && await el.evaluate(e=>e===document.activeElement)) {
        console.log('REACHED',await activeName(page)); return;
      }
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Keyboard Tab could not reach ${label}; active=${await activeName(page)}`);
}
async function activate(page: Page, label: string | RegExp) {
  await reach(page, label); await press(page, 'Enter');
  await page.waitForTimeout(250);
}
async function record(page: Page, name: string, info: TestInfo) {
  const snapshot = await page.evaluate(() => {
    const visible = (e: Element) => { const r=e.getBoundingClientRect(); const s=getComputedStyle(e); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    return {
      text: document.body.innerText,
      viewport: { width: innerWidth, height: innerHeight, scrollX, scrollY,
        documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight },
      controls: [...document.querySelectorAll('button,input,select,[role="button"],[role="menuitem"],[role="textbox"]')].filter(visible).map(e => {
        const r=e.getBoundingClientRect(); return {role:e.getAttribute('role')||e.tagName.toLowerCase(),label:e.getAttribute('aria-label')||(e as HTMLElement).innerText||e.getAttribute('placeholder'),disabled:(e as HTMLButtonElement).disabled,rect:{x:r.x,y:r.y,w:r.width,h:r.height}};
      }),
      illustrations:[...document.querySelectorAll('svg,img,canvas')].filter(visible).map(e=>({tag:e.tagName,label:e.getAttribute('aria-label')||e.getAttribute('alt'),rect:((r)=>({x:r.x,y:r.y,w:r.width,h:r.height}))(e.getBoundingClientRect())}))
    };
  });
  console.log('OBSERVATION', name, JSON.stringify(snapshot));
  await info.attach(name+'.json',{body:JSON.stringify(snapshot,null,2),contentType:'application/json'});
  await info.attach(name+'.png',{body:await page.screenshot(),contentType:'image/png'});
  expect.soft(snapshot.viewport.scrollX, name+' horizontal scroll position').toBe(0);
  expect.soft(snapshot.viewport.scrollY, name+' vertical scroll position').toBe(0);
  expect.soft(snapshot.viewport.documentWidth, name+' page width').toBeLessThanOrEqual(snapshot.viewport.width);
  expect.soft(snapshot.viewport.documentHeight, name+' page height').toBeLessThanOrEqual(snapshot.viewport.height);
  for(const c of snapshot.controls) {
    expect.soft(c.rect.y, name+' control top '+c.label).toBeGreaterThanOrEqual(-1);
    expect.soft(c.rect.y+c.rect.h, name+' control bottom '+c.label).toBeLessThanOrEqual(snapshot.viewport.height+1);
  }
  return snapshot;
}
async function menu(page: Page, label: string) {
  await press(page,'F2');
  for(let i=0;i<12;i++) {
    if((await activeName(page)).includes(label)) {await press(page,'Enter');await page.waitForTimeout(250);return;}
    await press(page,'ArrowDown');
  }
  throw new Error('F2 menu cannot select '+label);
}

async function displayedGuide(page: Page) {
  const input=page.getByRole('textbox',{name:'ローマ字を入力'});
  return input.evaluate(e=>{
    let p=e.parentElement;
    for(let i=0;p&&i<5;i++,p=p.parentElement){
      const lines=(p.innerText||'').split('\n').map(s=>s.trim());
      const a=lines.find(s=>/^[a-z][a-z '-]{1,45}$/.test(s)&&!['input','romaji'].includes(s));
      if(a)return a;
    }
    return '';
  });
}

for(const height of [720,820]) test.describe('independent game review '+height,()=>{
  test.use({viewport:{width:1180,height},reducedMotion:height===820?'reduce':'no-preference'});
  test('world construction delivery score reward retry',async({page},info)=>{
    test.setTimeout(240000);
    await page.goto('/');
    await record(page,'01-first-world',info);
    await activate(page,'住宅地の詳細');
    await record(page,'02-entire-district',info);
    const districtButtons = await page.getByRole('button').allTextContents();
    console.log('DISTRICT_VISIBLE_BUTTONS',JSON.stringify(districtButtons));
    const plot=page.getByRole('button',{name:/住宅地、空き区画/});
    if(await plot.count()) {
      const label=await plot.first().getAttribute('aria-label')||await plot.first().innerText();
      await activate(page,label);
      const plan=await record(page,'03-plot-plan',info);
      const build=plan.controls.find(c=>!c.disabled&&/建てる|建築する|建設する|開発する/.test(c.label||''));
      if(build) {await activate(page,build.label);await record(page,'04-built-map',info);}
      else console.log('REVIEW_BLOCKER no visible affordable construction action after plot selection');
    } else console.log('REVIEW_BLOCKER no residential empty plot control visible');
    await menu(page,'街の設備');
    const equipment=await record(page,'05-equipment',info);
    const equip=equipment.controls.find(c=>!c.disabled&&/設置|増強|導入|購入|強化/.test(c.label||''));
    if(equip) {await activate(page,equip.label);await record(page,'06-equipped-map',info);}
    else console.log('REVIEW_BLOCKER no visible affordable equipment action');
    await menu(page,'ホーム');
    await activate(page,'配達をはじめる');
    await reach(page,'入力の確認');await page.keyboard.type('a');
    await activate(page,'準備できました →');
    await reach(page,'ローマ字を入力');await page.keyboard.type('neko');
    await press(page,'Space');
    await activate(page,'90秒の配達へ →');
    const start=Date.now();
    await record(page,'07-delivery-start',info);
    // Read the displayed prompt, then type its alphabet guide. This is perception,
    // not a word list imported from the game or an injected answer.
    let delivered=0;const seen:string[]=[];
    let prefilled:{guide:string;prefix:string}|null=null;
    while(Date.now()-start<96000) {
      if(await page.getByText('ことばが、届きました。',{exact:true}).isVisible().catch(()=>false)) break;
      const input=page.getByRole('textbox',{name:'ローマ字を入力'});
      if(await input.isVisible().catch(()=>false)) {
        const prompt=await displayedGuide(page);
        if(prompt){
          console.log('DISPLAYED_GUIDE',prompt);seen.push(prompt);
          await reach(page,'ローマ字を入力');
          const remaining=prefilled?.guide===prompt?prompt.slice(prefilled.prefix.length):prompt;
          prefilled=null;
          await page.keyboard.type(remaining,{delay:45});
          await page.waitForTimeout(150);await press(page,'Space');delivered++;
          if(delivered===1||delivered===5) {
            const transitionStart=Date.now();
            await record(page,'08-dispatch-'+delivered+'-departure',info);
            const next=await displayedGuide(page);
            if(next && await input.isVisible()) {
              await reach(page,'ローマ字を入力');
              const prefix=next[0];await page.keyboard.type(prefix);
              console.log('TYPING_DURING_DISPATCH',JSON.stringify({elapsedMs:Date.now()-transitionStart,nextGuide:next,typed:prefix,visibleValue:await input.inputValue()}));
              prefilled={guide:next,prefix};
            }
            await page.waitForTimeout(180);
            await record(page,'08-dispatch-'+delivered+'-transit',info);
            await page.waitForTimeout(650);
            await record(page,'08-dispatch-'+delivered+'-arrival',info);
            console.log('DISPATCH_OBSERVED_MS',Date.now()-transitionStart);
          }
        }else if(delivered===0){await record(page,'08-prompt-unreadable',info);break;}
      }
      await page.waitForTimeout(450);
    }
    console.log('REAL_ELAPSED_MS',Date.now()-start,'TYPED_GUIDES',JSON.stringify(seen));
    await expect(page.getByText('ことばが、届きました。',{exact:true})).toBeVisible({timeout:100000});
    console.log('RESULT_ELAPSED_MS',Date.now()-start);
    await record(page,'09-separate-score',info);
    const view=page.getByRole('button',{name:'届いた切手を見る',exact:true});
    if(await view.isVisible())await activate(page,'届いた切手を見る');
    else await activate(page,'今回の配達を振り返る');
    await record(page,'10-sealed-reward',info);
    let reveals=0;
    for(let i=0;i<12;i++) {
      const open=page.getByRole('button',{name:'封筒を開く',exact:true});
      if(await open.isVisible()) {
        await activate(page,'封筒を開く');
        await record(page,'11-earned-item-'+(++reveals),info);
        const revealText=await page.locator('body').innerText();
        console.log('REVEALED_UI_TEXT',revealText);
        // Only use a shortening key if its visible help advertises that action.
        if(/Enter[^\n]*(?:短縮|すぐ表示)|(?:短縮|すぐ表示)[^\n]*Enter/.test(revealText)) {
          await press(page,'Enter');await page.waitForTimeout(250);
          await record(page,'11-shortened-item-'+reveals,info);
        }
      }
      if(await page.getByRole('button',{name:'次の切手へ',exact:true}).isVisible())await activate(page,'次の切手へ');
      else if(await page.getByRole('button',{name:'結果をまとめる',exact:true}).isVisible()){await activate(page,'結果をまとめる');break;}
      else break;
    }
    console.log('INDIVIDUAL_REVEALS',reveals);
    await record(page,'12-reward-summary',info);
    const retryStart=Date.now();
    await activate(page,'同じ問題でもう一度');
    await expect(page.getByRole('textbox',{name:'ローマ字を入力'})).toBeVisible();
    console.log('RETRY_RETURN_MS',Date.now()-retryStart);
    await record(page,'13-retry',info);
    expect.soft(delivered,'at least one actually typed delivery').toBeGreaterThan(0);
    expect.soft(reveals,'individual earned reward shown').toBeGreaterThan(0);
  });
});
