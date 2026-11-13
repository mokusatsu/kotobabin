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
