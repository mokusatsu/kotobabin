import { test, expect } from '@playwright/test';

test('sakurai independent full keyboard delivery loop',async({page},testInfo)=>{
 test.setTimeout(210000);await page.setViewportSize({width:1180,height:720});await page.goto('/');
 async function snap(label:string){console.log(`SAKURAI_LOOP ${label}\n${await page.locator('body').ariaSnapshot()}`);console.log('SAKURAI_RENDERED '+label+' '+JSON.stringify(await page.locator('body').innerText()));console.log('SAKURAI_DIM '+label+' '+await page.evaluate(()=>JSON.stringify({viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],scroll:[scrollX,scrollY],focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.slice(0,80)})));await page.screenshot({path:testInfo.outputPath(label+'.png')});}
 async function keyButton(name:RegExp){for(let i=0;i<50;i++){const text=await page.evaluate(()=>document.activeElement?.textContent?.trim()||'');if(name.test(text)){await page.keyboard.press('Enter');return;}await page.keyboard.press('Tab');}throw new Error('Keyboard could not reach '+name);}
 await expect(page.getByRole('button',{name:'配達をはじめる',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByRole('textbox',{name:'入力の確認'})).toBeFocused();await page.keyboard.type('a');await expect(page.getByRole('button',{name:'準備できました →'})).toBeEnabled();await keyButton(/準備できました/);await expect(page.getByRole('textbox',{name:'ローマ字を入力'})).toBeFocused();
 await page.keyboard.type('neko',{delay:80});await snap('01-neko-complete');await page.keyboard.press('Space');await page.waitForTimeout(600);await snap('02-first-delivery');
 await keyButton(/90秒の配達へ/);await expect(page.getByRole('textbox',{name:'ローマ字を入力'})).toBeFocused();
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
 for(let panel=2;panel<=7;panel++){await keyButton(/^次の表示 →$/);await snap('09-result-panel-'+panel);}
 for(let panel=6;panel>=1;panel--){await keyButton(/^← 前の表示$/);}
 await keyButton(/同じ問題でもう一度/);await expect(page.getByRole('textbox',{name:'ローマ字を入力'})).toBeFocused();await snap('10-result-enter');
 await page.keyboard.press('F2');await snap('11-navigation');await keyButton(/^街の開発$/);await snap('12-town-confirm');await keyButton(/^終了して移動する$/);await expect(page.getByRole('heading',{name:'今の配達を終えて移動しますか？'})).toHaveCount(0);await snap('12-town');
 await page.setViewportSize({width:1180,height:820});await snap('13-town-820');
 await page.keyboard.press('F2');await keyButton(/^ホーム$/);await snap('14-home-820');
});
