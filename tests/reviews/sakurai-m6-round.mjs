import {chromium,webkit} from 'playwright';import fs from 'node:fs/promises';
const base=process.env.BASE_URL||process.argv[2],out=process.env.OUT_DIR||'/tmp/sakurai-m6-round';await fs.mkdir(out,{recursive:true});
for(const engine of (process.env.ENGINES||'chromium').split(',')){
 const b=await({chromium,webkit}[engine]).launch({headless:true});for(const height of [720,820])for(const reducedMotion of ['no-preference','reduce']){const tag=`${engine}-${height}-${reducedMotion}`,c=await b.newContext({viewport:{width:1180,height},reducedMotion}),p=await c.newPage();const rows=[];
 async function snap(label){const d=await p.evaluate(()=>({text:document.body.innerText,dimensions:{w:innerWidth,h:innerHeight,sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight},images:[...document.images].filter(e=>e.getClientRects().length).map(e=>({alt:e.alt,src:e.getAttribute('src'),naturalWidth:e.naturalWidth,rect:e.getBoundingClientRect().toJSON()})),controls:[...document.querySelectorAll('button,input,select,a')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({tag:e.tagName,text:e.innerText||e.getAttribute('aria-label')||'',type:e.type,disabled:e.disabled,rect:e.getBoundingClientRect().toJSON()})),focus:{tag:document.activeElement?.tagName,text:document.activeElement?.innerText,label:document.activeElement?.getAttribute('aria-label')}}));rows.push({label,...d});console.log('OBS',tag,label,JSON.stringify(d));await fs.writeFile(`${out}/${tag}.json`,JSON.stringify(rows,null,2));await p.screenshot({path:`${out}/${tag}-${label}.png`});return d;}
 async function enter(text){for(let i=0;i<40;i++){const f=await p.evaluate(()=>document.activeElement?.innerText);if(f===text){await p.keyboard.press('Enter');await p.waitForTimeout(300);return true;}await p.keyboard.press('Tab');}console.log('UNREACHED',text);return false;}
 await p.goto(base,{waitUntil:'networkidle'});
 await p.keyboard.press('F2');await enter('配達手帳');await snap('handbook-before');await enter('コレクション');let before=await snap('collection-before');
 // Sub-controls are selected only after their text has appeared in the live collection.
 for(let i=0;i<3;i++){const opt=before.controls.find(x=>x.tag==='BUTTON'&&!x.disabled&&/見本|プレビュー|未獲得/.test(x.text));if(!opt)break;await enter(opt.text);before=await snap(`collection-before-detail-${i}`);await p.keyboard.press('Escape');before=await snap(`collection-before-return-${i}`);}
 await p.keyboard.press('Escape');
 await p.keyboard.press('F2');await enter('ホーム');let d=await snap('home');if(d.text.includes('ここで続ける')){await enter('ここで続ける');await snap('ownership-recovered');}
 await enter('配達をはじめる');d=await snap('play-start');
 if(d.text.includes('半角英字の a')){await p.keyboard.type('a');await snap('prepare-confirmed');await enter('準備できました →');}
 d=await snap('round-entered');const deadline=Date.now()+100000;const marks=new Set();
 while(Date.now()<deadline){const text=await p.locator('body').innerText();if(/今回|結果|おつかれ/.test(text)&&!text.includes('残り'))break;
 const words=text.split(/\n/).map(s=>s.trim()).filter(s=>/^[a-z][a-z -]{0,100}$/.test(s));if(words.length){console.log('VISIBLE-TYPING',tag,JSON.stringify(words));await p.keyboard.type(words.at(-1),{delay:140});}else await p.waitForTimeout(400);
 const elapsed=Math.floor((100000-(deadline-Date.now()))/1000);for(const t of [1,5,20,60,89,95])if(elapsed>=t&&!marks.has(t)){marks.add(t);await snap(`round-${t}s`);}}
 d=await snap('result-first');
 for(let i=0;i<20;i++){const opt=d.controls.find(x=>x.tag==='BUTTON'&&!x.disabled&&/開|次|受け取|つづ|進む|まとめ/.test(x.text)&&!/表示|画面移動/.test(x.text));if(!opt)break;await enter(opt.text);d=await snap(`reveal-${i}`);}
 await p.keyboard.press('F2');await enter('配達手帳');await snap('handbook-after');await enter('コレクション');d=await snap('collection-after');
 for(let i=0;i<4;i++){const opt=d.controls.find(x=>x.tag==='BUTTON'&&!x.disabled&&/見本|プレビュー|獲得|切手/.test(x.text)&&!/切手と目標|履歴/.test(x.text));if(!opt)break;await enter(opt.text);d=await snap(`collection-after-detail-${i}`);await p.keyboard.press('Escape');d=await snap(`collection-after-return-${i}`);}
 await c.close();}await b.close();}
