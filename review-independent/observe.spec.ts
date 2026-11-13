import { test } from '@playwright/test';
import fs from 'node:fs';
test('independent UI inventory',async({page},info)=>{
 const dir=`review-independent/output/${info.project.name}`;fs.mkdirSync(dir,{recursive:true});
 await page.goto('/');await page.waitForTimeout(1200);
 async function shot(label:string){
 const observation=await page.evaluate(()=>({text:document.body.innerText,buttons:[...document.querySelectorAll('button,a,input,select')].map(e=>({tag:e.tagName,text:(e as HTMLElement).innerText,aria:e.getAttribute('aria-label'),type:e.getAttribute('type')})),viewport:{w:innerWidth,h:innerHeight},scroll:{w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight},active:document.activeElement?.outerHTML}));
 fs.writeFileSync(`${dir}/${label}.json`,JSON.stringify(observation,null,2));console.log('UI_OBSERVATION '+label+' '+JSON.stringify(observation));await page.screenshot({path:`${dir}/${label}.png`});}
 await shot('home');for(let i=0;i<8;i++){await page.keyboard.press('Tab');console.log('TAB '+i+' '+await page.evaluate(()=>document.activeElement?.outerHTML));}
});
