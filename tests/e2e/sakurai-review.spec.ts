import { test } from '@playwright/test';

// Independent black-box exploration: only rendered UI/DOM, no application internals.
test('sakurai independent first encounter keyboard exploration', async ({page}, testInfo) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:1180,height:720});
  await page.goto('/');
  async function capture(label:string) {
    console.log(`SAKURAI_STATE ${label}\n${await page.locator('body').ariaSnapshot()}`);
    console.log('SAKURAI_LAYOUT '+label+' '+JSON.stringify(await page.evaluate(()=>({viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],scroll:[scrollX,scrollY],focus:{tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,120)},controls:Array.from(document.querySelectorAll('button,input,select,a')).map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,text:el.textContent?.trim(),aria:el.getAttribute('aria-label'),box:[r.x,r.y,r.width,r.height]}})}))));
    await page.screenshot({path:testInfo.outputPath(label+'.png')});
  }
  await capture('01-first');
  for(let i=1;i<=4;i++) {await page.keyboard.press('Enter');await page.waitForTimeout(650);await capture(`02-enter-${i}`);}
  await page.keyboard.press('Escape'); await capture('03-escape');
  for(let i=1;i<=5;i++) {await page.keyboard.press('Tab');await capture(`04-tab-${i}`);}
});

test('sakurai independent active delivery discovery', async ({page},testInfo)=>{
  test.setTimeout(150000);
  await page.setViewportSize({width:1180,height:720}); await page.goto('/');
  async function snap(label:string){console.log(`SAKURAI_ACTIVE ${label}\n${await page.locator('body').ariaSnapshot()}`);console.log('SAKURAI_ACTIVE_FOCUS '+label+' '+await page.evaluate(()=>JSON.stringify({tag:document.activeElement?.tagName,text:document.activeElement?.textContent,aria:document.activeElement?.getAttribute('aria-label')})));await page.screenshot({path:testInfo.outputPath(label+'.png')});}
  async function keyButton(name:RegExp){for(let i=0;i<45;i++){const text=await page.evaluate(()=>document.activeElement?.textContent?.trim()||'');if(name.test(text)){await page.keyboard.press('Enter');return;}await page.keyboard.press('Tab');}throw new Error('Keyboard could not reach '+name);}
  await page.keyboard.press('Enter');await page.keyboard.type('a');await snap('01-check-a');
  await keyButton(/準備できました/);await page.waitForTimeout(4000);await snap('02-ready');
  await page.keyboard.type('z');await snap('03-wrong-z');
  await page.keyboard.press('Escape');await snap('04-escape');
  await page.waitForTimeout(2200);await snap('05-pause-after-2200ms');
  await page.keyboard.press('Enter');await page.waitForTimeout(1200);await snap('06-enter-resume');
  await page.waitForTimeout(45000);await snap('07-after-45sec');
  await page.waitForTimeout(45000);await snap('08-after-90sec');
  await page.keyboard.press('Enter');await snap('09-result-enter');
  await page.keyboard.press('F2');await snap('10-navigation');
});

test('sakurai independent full keyboard delivery loop',async({page},testInfo)=>{
 test.setTimeout(210000);await page.setViewportSize({width:1180,height:720});await page.goto('/');
 async function snap(label:string){console.log(`SAKURAI_LOOP ${label}\n${await page.locator('body').ariaSnapshot()}`);console.log('SAKURAI_RENDERED '+label+' '+JSON.stringify(await page.locator('body').innerText()));console.log('SAKURAI_DIM '+label+' '+await page.evaluate(()=>JSON.stringify({viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],scroll:[scrollX,scrollY],focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.slice(0,80)})));await page.screenshot({path:testInfo.outputPath(label+'.png')});}
 async function keyButton(name:RegExp){for(let i=0;i<50;i++){const text=await page.evaluate(()=>document.activeElement?.textContent?.trim()||'');if(name.test(text)){await page.keyboard.press('Enter');return;}await page.keyboard.press('Tab');}throw new Error('Keyboard could not reach '+name);}
 await page.keyboard.press('Enter');await page.keyboard.type('a');await keyButton(/準備できました/);await page.waitForTimeout(500);
 await page.keyboard.type('neko',{delay:80});await snap('01-neko-complete');await page.keyboard.press('Space');await page.waitForTimeout(600);await snap('02-first-delivery');
 if((await page.locator('body').innerText()).includes('はじめの配達')){await page.keyboard.press('Escape');await keyButton(/導入を飛ばして本編へ/);await page.waitForTimeout(600);}
 await snap('03-main');
 const kana='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ'.split('');
 const roma='a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro wa wo nn ga gi gu ge go za ji zu ze zo da ji zu de do ba bi bu be bo pa pi pu pe po'.split(' ');const map=Object.fromEntries(kana.map((k,i)=>[k,roma[i]]));
 for(let i=0;i<12;i++){
  const region=page.getByRole('region').filter({has:page.getByRole('textbox',{name:'ローマ字を入力'})});
  const paras=await region.locator('p').allTextContents();const reading=paras.find(p=>/^[ぁ-んー]+$/.test(p.trim()))?.trim();
  if(!reading||[...reading].some(k=>!map[k])){console.log('SAKURAI_UNMAPPED '+JSON.stringify(paras));break;}
  const typed=[...reading].map(k=>map[k]).join('');console.log('SAKURAI_TYPE '+reading+' '+typed);await page.keyboard.type(typed,{delay:65});await page.waitForTimeout(100);await page.keyboard.press('Space');await page.waitForTimeout(250);
 }
 await snap('04-multiple-deliveries');
 await page.keyboard.press('Escape');await snap('05-main-pause');await page.waitForTimeout(2200);await snap('06-main-pause-stable');await page.keyboard.press('Enter');await snap('07-main-resume');
 await page.waitForTimeout(45000);await snap('08-main-45sec');await page.waitForTimeout(45000);await snap('09-result');
 await page.keyboard.press('Enter');await page.waitForTimeout(700);await snap('10-result-enter');
 await page.keyboard.press('F2');await snap('11-navigation');await keyButton(/^街の開発$/);await snap('12-town');
 await page.setViewportSize({width:1180,height:820});await snap('13-town-820');
 await page.keyboard.press('F2');await keyButton(/^ホーム$/);await snap('14-home-820');
});
