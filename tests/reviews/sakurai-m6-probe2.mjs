import {chromium,webkit} from 'playwright';import fs from 'node:fs/promises';
const base=process.env.BASE_URL||process.argv[2],out=process.env.OUT_DIR||'/tmp/sakurai-m6-probe2';await fs.mkdir(out,{recursive:true});
for(const engine of (process.env.ENGINES||'chromium').split(',')){
 const b=await({chromium,webkit}[engine]).launch({headless:true}),c=await b.newContext({viewport:{width:1180,height:720}}),p=await c.newPage();const rows=[];
 async function snap(label){const d=await p.evaluate(()=>({text:document.body.innerText,controls:[...document.querySelectorAll('button,input,select,a')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({tag:e.tagName,text:e.innerText||e.getAttribute('aria-label')||'',type:e.type,disabled:e.disabled,rect:e.getBoundingClientRect().toJSON()})),focus:{tag:document.activeElement?.tagName,text:document.activeElement?.innerText,label:document.activeElement?.getAttribute('aria-label')}}));rows.push({label,...d});console.log('OBS',engine,label,JSON.stringify(d));await fs.writeFile(`${out}/${engine}.json`,JSON.stringify(rows,null,2));await p.screenshot({path:`${out}/${engine}-${label}.png`});return d;}
 async function enter(text){for(let i=0;i<40;i++){const f=await p.evaluate(()=>document.activeElement?.innerText);if(f===text){await p.keyboard.press('Enter');await p.waitForTimeout(300);return true;}await p.keyboard.press('Tab');}console.log('UNREACHED',text);return false;}
 await p.goto(base,{waitUntil:'networkidle'});
 for(const text of ['配達手帳','ことば図鑑']){await p.keyboard.press('F2');await snap(`menu-${text}`);if(await enter(text))await snap(text);await p.keyboard.press('Escape');await snap(`${text}-escape`);}
 await p.keyboard.press('F2');await enter('ホーム');let d=await snap('home');if(d.text.includes('ここで続ける')){await enter('ここで続ける');await snap('ownership-recovered');}
 await enter('配達をはじめる');d=await snap('play-start');
 const words=d.text.split(/\n/).map(s=>s.trim()).filter(s=>/^[a-z][a-z -]{0,100}$/.test(s));if(words.length){console.log('VISIBLE-TYPING',words.at(-1));await p.keyboard.type(words.at(-1),{delay:120});await snap('one-line');}
 await c.close();await b.close();}
