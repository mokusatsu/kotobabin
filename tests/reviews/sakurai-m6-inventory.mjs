import { chromium, webkit } from 'playwright';
import fs from 'node:fs/promises';
const base=process.env.BASE_URL || process.argv[2];
if(!base) throw new Error('BASE_URL required');
const out=process.env.OUT_DIR || '/tmp/sakurai-m6-inventory';
await fs.mkdir(out,{recursive:true});
for (const engine of (process.env.ENGINES||'chromium').split(',')) {
 const browser=await ({chromium,webkit}[engine]).launch({headless:true});
 for (const height of [720,820]) for(const reducedMotion of ['no-preference','reduce']) {
  const context=await browser.newContext({viewport:{width:1180,height},reducedMotion});
  const page=await context.newPage(); const records=[];
  const tag=`${engine}-${height}-${reducedMotion}`;
  page.on('pageerror',e=>records.push({error:String(e)}));
  await page.goto(base,{waitUntil:'networkidle'});
  async function snap(label){
   const data=await page.evaluate(()=>({text:document.body.innerText,controls:[...document.querySelectorAll('button,input,select,a,[role="button"]')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({tag:e.tagName,role:e.getAttribute('role'),text:e.innerText||e.getAttribute('aria-label')||'',type:e.type,disabled:e.disabled,rect:JSON.stringify(e.getBoundingClientRect())})),focus:{tag:document.activeElement?.tagName,text:document.activeElement?.innerText,label:document.activeElement?.getAttribute('aria-label')},dimensions:{w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}}));
   records.push({label,...data}); console.log(tag,label,JSON.stringify(data));
   await page.screenshot({path:`${out}/${tag}-${label}.png`});
  }
  await snap('initial');
  for(let i=1;i<=10;i++){await page.keyboard.press('Tab');await snap(`tab-${i}`);}
  await fs.writeFile(`${out}/${tag}.json`,JSON.stringify(records,null,2));
  await context.close();
 }
 await browser.close();
}
