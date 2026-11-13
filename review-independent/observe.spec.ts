import { test } from '@playwright/test';
import fs from 'node:fs';
test('independent keyboard menu discovery',async({page},info)=>{
 const dir=`review-independent/output/${info.project.name}`;fs.mkdirSync(dir,{recursive:true});
 await page.goto('/');await page.waitForTimeout(700);
 async function shot(label:string){
 const observation=await page.evaluate(()=>{const vis=(e:Element)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};return {text:document.body.innerText,controls:[...document.querySelectorAll('button,a,input,select')].filter(vis).map(e=>({tag:e.tagName,text:(e as HTMLElement).innerText,aria:e.getAttribute('aria-label'),type:e.getAttribute('type'),value:(e as HTMLInputElement).value,rect:e.getBoundingClientRect().toJSON()})),leaf:[...document.querySelectorAll('main *')].filter(e=>vis(e)&&!e.children.length&&e.textContent?.trim()).map(e=>({tag:e.tagName,text:e.textContent,cls:e.className,rect:e.getBoundingClientRect().toJSON()})),viewport:{w:innerWidth,h:innerHeight},scroll:{w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight},active:{tag:document.activeElement?.tagName,text:(document.activeElement as HTMLElement)?.innerText,aria:document.activeElement?.getAttribute('aria-label')}}});
 fs.writeFileSync(`${dir}/${label}.json`,JSON.stringify(observation,null,2));console.log('UI_OBSERVATION '+label+' '+JSON.stringify(observation));await page.screenshot({path:`${dir}/${label}.png`});}
 async function keyTo(label:string){for(let i=0;i<90;i++){const a=await page.evaluate(()=>({text:(document.activeElement as HTMLElement)?.innerText?.trim(),aria:document.activeElement?.getAttribute('aria-label')}));if(a.text===label||a.aria===label){await page.keyboard.press('Enter');await page.waitForTimeout(350);return;}await page.keyboard.press('Tab');}throw new Error('Keyboard target not found: '+label);}
 await shot('home');await keyTo('住宅地の詳細');await shot('district');await page.keyboard.press('Escape');await shot('district-back');
 for(const label of ['配達手帳','ことば図鑑','設定','遊び方']){await page.keyboard.press('F2');await shot('navigation-'+label);await keyTo(label);await shot(label);await page.keyboard.press('Escape');}
 await page.keyboard.press('F2');await keyTo('ホーム');await keyTo('配達をはじめる');await page.waitForTimeout(1200);await shot('play-start');
});
