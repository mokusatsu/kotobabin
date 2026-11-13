import {test,expect} from '@playwright/test';
import fs from 'node:fs';
test('latest source short keyboard review',async({page},info)=>{
 const dir=`review-independent/output/${info.project.name}`;fs.mkdirSync(dir,{recursive:true});const actions:unknown[]=[];
 async function key(k:string){await page.keyboard.press(k);actions.push(k);}
 async function target(label:string){for(let i=0;i<120;i++){const a=await page.evaluate(()=>({t:(document.activeElement as HTMLElement)?.innerText?.trim(),a:document.activeElement?.getAttribute('aria-label')}));if(a.t===label||a.a===label){await key('Enter');await page.waitForTimeout(200);return;}await key('Tab');}throw Error('Missing keyboard target '+label);}
 async function shot(name:string){const d=await page.evaluate(()=>({text:document.body.innerText,viewport:{w:innerWidth,h:innerHeight},scroll:{w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,x:scrollX,y:scrollY},active:{text:(document.activeElement as HTMLElement)?.innerText,aria:document.activeElement?.getAttribute('aria-label')},controls:[...document.querySelectorAll('button,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>1&&r.height>1}).map(e=>({text:(e as HTMLElement).innerText,aria:e.getAttribute('aria-label'),value:(e as HTMLInputElement).value,checked:(e as HTMLInputElement).checked,rect:e.getBoundingClientRect().toJSON()}))}));fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(d,null,2));console.log('UI_OBSERVATION '+info.project.name+' '+name+' '+JSON.stringify(d));await page.screenshot({path:`${dir}/${name}.png`});return d;}
 await page.goto('/');await page.waitForTimeout(700);await key('F2');await target('設定');
 for(let i=0;i<100;i++){if(await page.locator('input[value="150"]').isChecked())break;const is=await page.evaluate(()=>document.activeElement?.tagName==='INPUT'&&['100','125'].includes((document.activeElement as HTMLInputElement).value));if(is){await key('ArrowRight');await page.waitForTimeout(150);}else await key('Tab');}
 expect(await page.locator('input[value="150"]').isChecked()).toBeTruthy();await shot('settings150');await key('Escape');await shot('home150');
 await target('住宅地の詳細');await shot('district150');await key('Escape');await shot('home-return150');
 await key('F2');await target('配達手帳');await shot('handbook150');
 await target('次の表示 →');await shot('handbook150-display2');await key('Escape');await key('F2');await target('配達手帳');await shot('handbook150-reentry');
 fs.writeFileSync(`${dir}/actions.json`,JSON.stringify(actions,null,2));
});
