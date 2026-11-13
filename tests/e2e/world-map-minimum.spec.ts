import {test, expect} from '@playwright/test';
import {assertViewportFits, tabTo} from './keyboard';

test('minimum world map switches to a six-district game scene and keeps keyboard selection on resize',async({page})=>{
 await page.setViewportSize({width:1920,height:1080});await page.goto('/');
 const world=page.locator('.town-map'); const compact=page.locator('.compact-world-map');
 await expect(world).toBeVisible();const full=await world.boundingBox();expect(full!.width).toBeGreaterThanOrEqual(800);expect(full!.height).toBeGreaterThanOrEqual(500);
 const normal=world.locator('[data-district-id="residential"]');await tabTo(page,normal);
 await page.setViewportSize({width:960,height:720});await expect(world).toBeHidden();await expect(compact).toBeVisible();
 const selected=compact.locator('[data-district-id="residential"]');await expect(selected).toBeFocused();
 await assertViewportFits(page);
 const buttons=compact.getByRole('button');await expect(buttons).toHaveCount(6);
 for(const button of await buttons.all()) {await tabTo(page,button);const box=await button.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);}
 const art=compact.locator('svg');await expect(art).toHaveAttribute('viewBox','330 70 540 405');await expect(art.locator('[data-district-core="residential"]')).toHaveAttribute('data-stage','0');
 await tabTo(page,selected);await page.setViewportSize({width:1920,height:1080});await expect(world).toBeVisible();await expect(compact).toBeHidden();await expect(normal).toBeFocused();
 await page.setViewportSize({width:960,height:720});await expect(selected).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.locator('.district-map[data-district-id="residential"]')).toBeVisible();await assertViewportFits(page);
 await page.keyboard.press('Escape');await expect(compact).toBeVisible();await assertViewportFits(page);
});
