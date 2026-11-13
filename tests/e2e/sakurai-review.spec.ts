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
