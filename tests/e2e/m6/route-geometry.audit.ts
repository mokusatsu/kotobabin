import { expect, test } from '@playwright/test';
import { beginMain, typeCurrentGuide } from '../helpers';

test('actual shipment anchors stay within the painted road while input continues', async ({ page }, info) => {
  await page.setViewportSize({ width: 1180, height: 720 });
  await beginMain(page);
  const [observations] = await Promise.all([page.evaluate(async () => {
    const observations = [];
    const stop = performance.now() + 4200;
    while (performance.now() < stop) {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const observation = (() => {
      const scene = document.querySelector<HTMLElement>('#delivery-scene')!;
      const lane = scene.querySelector<HTMLElement>('.delivery-action-lane')!;
      const svg = scene.querySelector<SVGSVGElement>('.delivery-scene-art')!;
      const path = svg.querySelector<SVGPathElement>('path[stroke="#658276"]')!;
      const matrix = path.getScreenCTM()!;
      const length = path.getTotalLength();
      const points = Array.from({ length: 501 }, (_, index) => {
        const point = path.getPointAtLength(length * index / 500);
        return new DOMPoint(point.x, point.y).matrixTransform(matrix);
      });
      return {
        time: performance.now(), scene: scene.getBoundingClientRect().toJSON(), lane: lane.getBoundingClientRect().toJSON(),
        svg: svg.getBoundingClientRect().toJSON(), matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
        arrived: scene.dataset.arrivedMicro, queued: scene.dataset.queuedMicro,
        vehicles: [...scene.querySelectorAll<HTMLElement>('[data-delivery-transport]')].map(node => {
          const rectangle = node.getBoundingClientRect();
          const anchor = { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height * 160 / 192 };
          const nearest = points.reduce((best, point) => Math.hypot(point.x - anchor.x, point.y - anchor.y) < Math.hypot(best.x - anchor.x, best.y - anchor.y) ? point : best);
          return { ...node.dataset, style: node.getAttribute('style'), computed: { left: getComputedStyle(node).left, top: getComputedStyle(node).top, transform: getComputedStyle(node).transform },
            rect: rectangle.toJSON(), anchor, nearest: { x: nearest.x, y: nearest.y }, distance: Math.hypot(nearest.x - anchor.x, nearest.y - anchor.y),
            offsetParent: (node.offsetParent as HTMLElement)?.className, parent: node.parentElement?.getBoundingClientRect().toJSON() };
        }),
      };
      })();
      observations.push(observation);
    }
    return observations;
  }), (async () => {
    await typeCurrentGuide(page);
    await page.keyboard.press('Space');
    await expect(page.locator('#delivery-scene')).toHaveAttribute('data-dispatches', '1');
    const nextGuide = (await page.locator('#romaji-guide > span:not(.accepted)').allTextContents()).join('');
    await page.keyboard.type(nextGuide[0]);
    await expect(page.locator('#game-input')).toBeFocused();
  })()]);
  await page.screenshot({ path: info.outputPath('route-after.png') });
  await info.attach('route-geometry.json', { body: JSON.stringify(observations, null, 2), contentType: 'application/json' });
  const vehicles = observations.flatMap(observation => observation.vehicles);
  console.log('ROUTE_GEOMETRY', JSON.stringify({ maxDistance: Math.max(...vehicles.map(vehicle => vehicle.distance)), observations }));
  expect(vehicles.length).toBeGreaterThan(0);
  expect(new Set(vehicles.map(vehicle => vehicle.state))).toEqual(new Set(['in-transit', 'arrived']));
  // The 46-unit painted road plus three 7px visual lanes has ample allowance at this viewport.
  // A shipment more than 48px from its nearest road point is visibly outside every lane.
  expect(vehicles.filter(vehicle => vehicle.distance > 48)).toEqual([]);
  await expect(page.locator('#game-input')).toBeFocused();
});
