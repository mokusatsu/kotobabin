import { test, expect } from '@playwright/test';

test('sakurai independent full keyboard delivery loop',async({page},testInfo)=>{
 test.setTimeout(210000);await page.setViewportSize({width:1180,height:720});await page.goto('/');
 async function snap(label:string){console.log(`SAKURAI_LOOP ${label}\n${await page.locator('body').ariaSnapshot()}`);console.log('SAKURAI_RENDERED '+label+' '+JSON.stringify(await page.locator('body').innerText()));console.log('SAKURAI_DIM '+label+' '+await page.evaluate(()=>JSON.stringify({viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],scroll:[scrollX,scrollY],focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.slice(0,80)})));await page.screenshot({path:testInfo.outputPath(label+'.png')});}
 async function keyButton(name:RegExp){for(let i=0;i<50;i++){const focused=await page.evaluate(()=>({tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.trim()||''}));if(focused.tag==='BUTTON'&&name.test(focused.text)){console.log('SAKURAI_ACTIVATE '+focused.text);await page.keyboard.press('Enter');return;}await page.keyboard.press('Tab');}throw new Error('Keyboard could not reach '+name);}
 await expect(page.getByRole('button',{name:'配達をはじめる',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByRole('textbox',{name:'入力の確認'})).toBeFocused();await page.keyboard.type('a');await expect(page.getByRole('button',{name:'準備できました →'})).toBeEnabled();await keyButton(/準備できました/);await expect(page.getByRole('textbox',{name:'ローマ字を入力'})).toBeFocused();
 await page.keyboard.type('neko',{delay:80});await snap('01-neko-complete');await page.keyboard.press('Space');await page.waitForTimeout(600);await snap('02-first-delivery');
 await keyButton(/90秒の配達へ/);await expect(page.getByRole('textbox',{name:'ローマ字を入力'})).toBeFocused();
 await snap('03-main');await keyButton(/^→$/);await snap('03-main-goal');await keyButton(/^←$/);for(let j=0;j<30;j++){if(await page.getByRole('textbox',{name:'ローマ字を入力'}).evaluate(el=>el===document.activeElement))break;await page.keyboard.press('Tab');}await expect(page.getByRole('textbox',{name:'ローマ字を入力'})).toBeFocused();
 for(let i=0;i<12;i++){
  const region=page.getByRole('region').filter({has:page.getByRole('textbox',{name:'ローマ字を入力'})});
  const visibleLines=(await region.innerText()).split('\n').map(s=>s.trim());
  const guides=visibleLines.filter(line=>/^[a-z]+$/.test(line));
  expect(guides,'Exactly one visible romanization guide must be present').toHaveLength(1);
  console.log('SAKURAI_TYPE_VISIBLE_GUIDE '+guides[0]);if(i===5){await page.keyboard.type(guides[0][0]==='z'?'q':'z');await snap('03-main-wrong-input');}await page.keyboard.type(guides[0],{delay:65});await page.waitForTimeout(100);if(i>=5)await page.keyboard.press('Space');await page.waitForTimeout(250);if(i===4)await snap('03-main-five-auto-delivery');
 }
 await expect(page.getByText(/完成 12語/)).toBeVisible();
 expect((await page.locator('main').innerText()).match(/確定得点\s*(\d+)/)?.[1]).not.toBe('0');
 await snap('04-multiple-deliveries');
 await page.keyboard.press('Escape');await snap('05-main-pause');await page.waitForTimeout(2200);await snap('06-main-pause-stable');await page.keyboard.press('Enter');await snap('07-main-resume');
 await page.waitForTimeout(45000);await snap('08-main-45sec');await page.waitForTimeout(45000);await snap('09-result');
 await expect(page.getByRole('heading',{name:'ことばが、届きました。'})).toBeVisible();
 let visited=1;while(await page.getByRole('button',{name:'次の表示 →',exact:true}).isEnabled()){expect(visited).toBeLessThan(20);await keyButton(/^次の表示 →$/);visited++;await snap('09-result-panel-'+visited);}
 console.log('SAKURAI_RESULT_PANELS '+visited);
 while(await page.getByRole('button',{name:'← 前の表示',exact:true}).isEnabled()){await keyButton(/^← 前の表示$/);}
 await keyButton(/同じ問題でもう一度/);await expect(page.getByRole('textbox',{name:'ローマ字を入力'})).toBeFocused();await snap('10-result-enter');expect((await page.locator('main').innerText()).match(/確定得点\s*(\d+)/)?.[1]).toBe('0');await expect(page.getByText('完成 0語',{exact:true})).toBeVisible();
 await page.keyboard.press('F2');await snap('11-navigation');await keyButton(/^街の開発$/);await snap('12-town-confirm');await keyButton(/^終了して移動する$/);await expect(page.getByRole('heading',{name:'今の配達を終えて移動しますか？'})).toHaveCount(0);await snap('12-town');
 await page.setViewportSize({width:1180,height:820});await snap('13-town-820');
 await page.keyboard.press('F2');await keyButton(/^ホーム$/);await snap('14-home-820');
});
