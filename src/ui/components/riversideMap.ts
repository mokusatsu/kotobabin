import type { CityEconomy } from '@/economy/cityEconomy';
import type { LandscapeId } from '@/contracts/types';
import { assetUrl, el } from '../utils/dom';
import { placedDecorations } from '@/economy/decorations';
import { decorationImage, paintStack } from './spriteStack';
import townSites from './stackedTownSites.json';
import { LANDSCAPE_LABELS } from '../utils/format';
import { lifeFrame, paintLife, townActors, type TownSite } from './townLife';

const sites = {
  residential: [-78, -50], market: [35, -62], workshop: [85, -34],
  central_hub: [-27, -12], packaging: [-65, -6], research: [65, 1],
  synergy: [-42, 27], park: [-85, 56], station: [-12, 68], harbor: [69, 58],
} as const;
type RiversideSite = keyof typeof sites;

type Prop = { name: string; x: number; y: number; scale: number; lift: number; rotation: number };
type Pin = { prop: Prop; label: HTMLElement; hit: HTMLElement; id: TownSite; activityStage: number };
type Box = { x: number; y: number; w: number; h: number };
const scenery: Prop[] = [];
function prop(name: string, x: number, y: number, scale = 1, lift = 9, rotation = 0): Prop {
  return { name, x, y, scale, lift, rotation };
}
for (const [x, y] of [[-96, -43], [-99, -33], [-89, -70], [-58, -73], [-39, -77], [-48, -83],
[57, -80], [78, -67], [101, -41], [103, -4], [99, 10], [93, 23], [80, 71], [54, 76],
[-31, 75], [-48, 72], [-92, 27], [-101, 12], [-99, -2], [-49, 9], [-49, -4]]) {
  scenery.push(prop('alder', x, y, 0.76 + Math.abs(x % 4) * 0.07));
}
for (const [x, y] of [[-97, 50], [-62, 81], [-101, 35], [96, 47], [-55, -44]]) {
  scenery.push(prop('cherry', x, y, 0.82));
}
scenery.push(prop('bridge', -12, -26), prop('bridge', 34, 48), prop('skiff', 37, 66, 0.8, 4, 0.22),
  prop('skiff', 25, 13, 0.64, 4, -0.4), prop('cottage', -52, -63, 0.57), prop('cottage', 87, -61, 0.56));
for (const [x, y] of [[-97, -60], [-89, -65], [-76, -75], [62, -75], [95, -47], [98, -18], [-94, 20], [-53, 85]]) {
  scenery.push(prop('pine', x, y, 0.8));
}

const sizes: Record<string, readonly [number, number]> = {
  terrain: [256, 216], bridge: [44, 16], alder: [28, 28], cherry: [28, 28], pine: [22, 22], skiff: [14, 24], cottage: [23, 30],
  'highland/granite-peak': [40,40], 'seaside/harbour-beacon': [24,24],
};
const townScenery = {
  highland: [
    ...[[-103,-56],[-99,-40],[-94,-73],[-60,-81],[-48,-88],[3,-88],[51,-71],[78,-65],[97,-56],[105,-18],
      [105,3],[101,35],[-108,45],[-99,18],[-71,82],[-58,85],[-53,68],[48,76]].map(([x,y]) => prop('pine',x,y,0.87)),
    prop('highland/granite-peak',-47,-84,0.94), prop('highland/granite-peak',-23,-90,0.75),
    prop('highland/granite-peak',67,-74,0.63), prop('bridge',-30,10,0.8,0,-0.55),
    prop('highland/residential-2',-52,-54,0.43), prop('highland/residential-2',42,-60,0.4),
  ],
  seaside: [
    ...[[-101,-65],[-84,-78],[-46,-76],[-31,-81],[4,-83],[39,-63],[-107,27],[-104,45],[-68,74],[-51,81]]
      .map(([x,y]) => prop('alder',x,y,0.68)),
    prop('cherry',-77,37,0.8), prop('cherry',-105,65,0.75), prop('skiff',91,44,0.8,0,0.9),
    prop('skiff',98,65,0.7,0,1.3), prop('skiff',83,-1,0.72,0,-0.3), prop('seaside/residential-2',-52,-34,0.4),
    prop('seaside/harbour-beacon',87,-21,0.9),
  ],
};
const elevations = new Map<string, Uint8Array>();
function readElevations(image: HTMLImageElement): Uint8Array {
  const surface = el('canvas', { width: 256, height: image.height });
  const ctx = surface.getContext('2d', { willReadFrequently: true })!;
  const heights = new Uint8Array(256 * image.height);
  for (let z = 0; z < image.width / 256; z++) {
    ctx.clearRect(0, 0, 256, image.height);
    ctx.drawImage(image, 256 * z, 0, 256, image.height, 0, 0, 256, image.height);
    const pixels = ctx.getImageData(0, 0, 256, image.height).data;
    for (let i = 0; i < heights.length; i++) if (pixels[i*4+3]) heights[i] = z;
  }
  return heights;
}
const frameSize = (name: string) => sizes[name.endsWith('/terrain') ? 'terrain' : name];
// Native bounds of each nonempty slice keep taps and labels close to narrow roofs and open plots.
type Slice = { x: number; y: number; halfW: number; halfH: number; z: number };
const silhouettes = new Map<string, Slice[]>();
const roofHeights = new WeakMap<HTMLImageElement, number>();
function measureSlices(image: HTMLImageElement) {
  const surface = el('canvas', { width: image.width, height: image.height });
  const ctx = surface.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  const slices: Slice[] = [];
  const size = image.height;
  for (let z = 0; z < image.width / size; z++) {
    // Sample the roof at the same local point used by the kitchen and workshop smoke.
    if (pixels[((size / 2 - 5) * image.width + z * size + size / 2) * 4 + 3]) roofHeights.set(image, z + 1);
    let left = size, top = size, right = 0, bottom = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!pixels[(y * image.width + z * size + x) * 4 + 3]) continue;
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    }
    if (right > left) slices.push({ x: (right + left - size) / 2, y: (bottom + top - size) / 2, halfW: (right - left) / 2, halfH: (bottom - top) / 2, z });
  }
  return slices;
}
const strips = new Map<string, Promise<HTMLImageElement>>();
function buildingStripName(landscape: LandscapeId, id: TownSite, level: number) {
  const prefix = landscape === 'riverside' ? '' : `${landscape}/`;
  return level ? `${prefix}${id}-${level}` : 'plot';
}

export async function loadBuildingModel(landscape: LandscapeId, id: TownSite, level: number) {
  const name = buildingStripName(landscape, id, level);
  const image = await strip(name);
  return { image, slices: silhouettes.get(name)! };
}

function strip(name: string) {
  let loading = strips.get(name);
  if (!loading) {
    const image = new Image();
    image.src = assetUrl(`./assets/${name.includes('/') ? name : 'riverside/' + name}.png`);
    loading = image.decode().then(() => {
      const size = frameSize(name);
      const [w, h] = size ?? [52, 52];
      if (image.width % w || image.height !== h) throw new Error(`Invalid slice strip: ${name}`);
      if (!size) silhouettes.set(name, measureSlices(image));
      if (name.endsWith('/terrain')) elevations.set(name, readElevations(image));
      return image;
    });
    strips.set(name, loading);
    loading.catch(() => strips.delete(name));
  }
  return loading;
}

const initialTurn = -0.38;
const views = new WeakMap<CityEconomy, { city: string; angle: number; zoom: number }>();
const pitch = 0.56;
const intersects = (a: Box, b: Box) => Math.abs(a.x - b.x) * 2 < a.w + b.w + 6 && Math.abs(a.y - b.y) * 2 < a.h + b.h + 6;

// Find the closest label position with room for its focus ring and the other buildings.
function labelBox(anchor: Box, w: number, h: number, width: number, height: number, obstacles: Box[]): Box {
  const origin = anchor.y + anchor.h / 2 + h / 2 + 4;
  let best: Box = { x: anchor.x, y: origin, w, h };
  let score = Infinity;
  for (let row = -10; row <= 10; row++) {
    for (let col = -10; col <= 10; col++) {
      const x = Math.max(w / 2 + 8, Math.min(width - w / 2 - 8, anchor.x + col * w * 0.38));
      const y = Math.max(h / 2 + 8, Math.min(height - h / 2 - 8, origin + row * h * 0.68));
      const distance = (x - anchor.x) ** 2 + (y - anchor.y - anchor.h * 0.18) ** 2;
      if (distance >= score) continue;
      const candidate = { x, y, w, h };
      const penalty = obstacles.reduce((v, obstacle) => v + (intersects(candidate, obstacle) ? width * width : 0), 0);
      if (distance + penalty < score) {
        best = candidate;
        score = distance + penalty;
      }
    }
  }
  // At high zoom the closest free gap can lie between grid samples or beyond the plot.
  if (score >= width * width) {
    const gapX = [w / 2 + 8, width - w / 2 - 8, anchor.x];
    const gapY = [h / 2 + 8, height - h / 2 - 8, origin];
    for (const box of obstacles) {
      const dx = (w + box.w) / 2 + 4;
      const dy = (h + box.h) / 2 + 4;
      gapX.push(box.x - dx, box.x + dx);
      gapY.push(box.y - dy, box.y + dy);
    }
    for (const x of gapX) {
      if (x < w / 2 + 8 || x > width - w / 2 - 8) continue;
      for (const y of gapY) {
        if (y < h / 2 + 8 || y > height - h / 2 - 8) continue;
        const distance = (x - anchor.x) ** 2 + (y - origin) ** 2;
        const candidate = { x, y, w, h };
        if (distance < score && !obstacles.some(box => intersects(candidate, box))) {
          best = candidate;
          score = distance;
        }
      }
    }
  }
  return best;
}

type Stamp = { stamp: HTMLCanvasElement; left: number; top: number; depth: number };
type TownBackdrop = { key: string; background: HTMLCanvasElement; sprites: Stamp[] };
const backdrops = new WeakMap<CityEconomy, TownBackdrop>();

function rasterizeTown(objects: Prop[], sheets: Map<string, HTMLImageElement>, terrain: string,
  width: number, height: number, angle: number, scale: number, project: (p: Prop) => { x: number; y: number }) {
  const background = el('canvas', { width, height });
  const ctx = background.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const pos = project(prop(terrain, 0, 0, 1, 0));
  paintStack(ctx, sheets.get(terrain)!, 256, pos.x, pos.y, angle, scale, pitch);
  const sin = Math.sin(angle), cos = Math.cos(angle);
  ctx.fillStyle = '#344e4638';
  ctx.globalCompositeOperation = 'source-atop';
  for (const item of objects) {
    if (['plot', 'bridge', 'skiff'].includes(item.name) || item.name.startsWith('decor-')) continue;
    const pos = project(item);
    const radius = (sizes[item.name] ? 9 : 17) * item.scale * scale;
    ctx.beginPath();
    ctx.ellipse(pos.x + radius * 0.34, pos.y + radius * 0.17, radius, radius * pitch, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // Rasterize each visible stack once per camera position. Moving figures can then
  // pass behind trees and buildings without repainting their individual slices.
  const sprites = objects.flatMap(p => {
    const image = sheets.get(p.name)!;
    const w = frameSize(p.name)?.[0] ?? image.height;
    const pos = project(p), turn = angle + p.rotation, s = scale * p.scale;
    const c = Math.abs(Math.cos(turn)), r = Math.abs(Math.sin(turn));
    const dx = (w * c + image.height * r) * s / 2 + 1;
    const dy = (w * r + image.height * c) * s * pitch / 2 + 1;
    const left = Math.max(0, Math.floor(pos.x - dx)), right = Math.min(width, Math.ceil(pos.x + dx));
    const top = Math.max(0, Math.floor(pos.y - dy - (image.width / w - 1) * 0.83 * s));
    const bottom = Math.min(height, Math.ceil(pos.y + dy));
    if (right <= left || bottom <= top) return [];
    const stamp = el('canvas', { width: right - left, height: bottom - top });
    const buffer = stamp.getContext('2d')!;
    buffer.imageSmoothingEnabled = false;
    paintStack(buffer, image, w, pos.x - left, pos.y - top, turn, s, pitch);
    return [{ stamp, left, top, depth: p.x * sin + p.y * cos }];
  });
  return { background, sprites };
}

export function stackedTownScene(map: HTMLElement, economy: CityEconomy, spotlight: boolean, reducedMotion: boolean) {
  const canvas = el('canvas', { className: 'kb-river-canvas', width: 672, height: 375, 'aria-hidden': 'true' });
  const pins: Pin[] = [];
  const landscape = economy.landscape;
  const terrainName = landscape === 'riverside' ? 'terrain' : `${landscape}/terrain`;
  const landscapeProps = landscape === 'riverside' ? scenery : townScenery[landscape];
  const townName = LANDSCAPE_LABELS[landscape];
  map.dataset.landscape = landscape;
  const waterPlants = new Set(['lilies', 'duckhouse', 'fishtrap', 'reeds']);
  const decorations = placedDecorations(economy.landscape, economy.decorationLevels).map(({ item, x, y }) =>
    prop(`decor-${item.id}`, x, y, 0.56, waterPlants.has(item.id) ? 4 : 10, item.angle));
  const title = el('span', { className: 'kb-river-title' }, townName);
  const controls = el('div', { className: 'kb-river-controls', role: 'group', 'aria-label': '地図の視点' });
  const previous = views.get(economy);
  const view = !spotlight && previous?.city === economy.cityId ? previous : { city: economy.cityId, angle: initialTurn, zoom: 100 };
  if (!spotlight) views.set(economy, view);
  let images: Map<string, HTMLImageElement> | undefined;
  let scheduled = 0;
  let animation = 0;
  const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let width = 0, height = 0;
  let dimensions: { w: number; h: number }[] = [];
  map.classList.add('kb-riverside-map');
  map.prepend(canvas, title);

  function draw() {
    scheduled = 0;
    if (!images || !map.isConnected || !map.clientWidth || !map.clientHeight) return;
    if (width !== map.clientWidth || height !== map.clientHeight) {
      width = map.clientWidth;
      height = map.clientHeight;
      dimensions = pins.map(({ label }) => ({ w: label.offsetWidth, h: label.offsetHeight }));
    }
    const { angle, zoom } = view;
    const scale = canvas.width / 318 * (zoom / 100);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const heights = elevations.get(terrainName);
    const ground = (x: number, y: number) => heights ? heights[(108 + Math.round(y)) * 256 + 128 + Math.round(x)] + 1 : 9;
    const projectPoint = (x: number, y: number, lift: number) => ({
      x: canvas.width / 2 + (x * cos - y * sin) * scale,
      y: canvas.height * 0.56 + ((x * sin + y * cos) * pitch - lift * 0.83) * scale,
    });
    const project = (p: Prop) => projectPoint(p.x, p.y, heights && p.name !== terrainName
      ? ground(p.x, p.y) + (p.name === 'bridge' ? 7 : 0) : p.lift);
    const sheets = images;
    const objects = [...landscapeProps, ...decorations, ...pins.map(pin => pin.prop)];
    const byDepth = (a: Prop, b: Prop) => (a.x - b.x) * sin + (a.y - b.y) * cos;
    objects.sort(byDepth);
    const hitOrder = pins.map(pin => pin.prop).sort(byDepth);
    // The home screen also refreshes when its counters change. Keep the stacks
    // until the camera, buildings or decorations actually change.
    const key = [terrainName, angle, zoom, ...decorations.map(p => p.name), ...pins.map(pin => pin.prop.name)].join('|');
    let backdrop = backdrops.get(economy);
    if (!backdrop || backdrop.key !== key) {
      backdrop = { key, ...rasterizeTown(objects, sheets, terrainName, canvas.width, canvas.height, angle, scale, project) };
      backdrops.set(economy, backdrop);
    }
    const { background, sprites } = backdrop;
    const actors = townActors(landscape, pins.map(({ id, activityStage, prop: p }) => ({
      id, stage: activityStage, x: p.x, y: p.y,
      roof: (roofHeights.get(sheets.get(p.name)!) ?? 14) * p.scale,
    })));
    const lines = new Path2D();
    const cssX = width / canvas.width, cssY = height / canvas.height;
    const buildings = pins.map(({ prop: p }) => {
      const pos = project(p);
      const s = p.scale * scale;
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const slice of silhouettes.get(p.name)!) {
        const x = pos.x + (slice.x * cos - slice.y * sin) * s;
        const y = pos.y + ((slice.x * sin + slice.y * cos) * pitch - slice.z * 0.83) * s;
        const dx = (Math.abs(cos) * slice.halfW + Math.abs(sin) * slice.halfH) * s;
        const dy = (Math.abs(sin) * slice.halfW + Math.abs(cos) * slice.halfH) * s * pitch;
        left = Math.min(left, x - dx);
        right = Math.max(right, x + dx);
        top = Math.min(top, y - dy);
        bottom = Math.max(bottom, y + dy);
      }
      return { x: (left + right) / 2 * cssX, y: (top + bottom) / 2 * cssY, w: (right - left) * cssX, h: (bottom - top) * cssY };
    });
    const obstacles = [...buildings, { x: 66, y: 20, w: 124, h: 36 }];
    if (!spotlight) obstacles.push({
      x: controls.offsetLeft + controls.offsetWidth / 2, y: controls.offsetTop + controls.offsetHeight / 2,
      w: controls.offsetWidth + 8, h: controls.offsetHeight + 8,
    }, { x: 78, y: height - 16, w: 156, h: 32 });
    const targetIndex = spotlight ? pins.findIndex(pin => pin.label.classList.contains('is-onboard-target')) : -1;
    const guideAbove = spotlight && map.querySelector('.kb-upgrade-map-coach[data-pointer="down"]');
    const targetBox = targetIndex < 0 ? null : {
      x: buildings[targetIndex].x, y: height * (guideAbove ? 0.68 : 0.30), ...dimensions[targetIndex],
    };
    if (targetBox) obstacles.push(targetBox);
    const placements = [...pins.entries()];
    if (zoom > 100) {
      placements.sort(([a], [b]) => dimensions[b].w * dimensions[b].h - dimensions[a].w * dimensions[a].h);
    }
    for (const [i, pin] of placements) {
      const b = buildings[i];
      Object.assign(pin.hit.style, {
        left: `${b.x - b.w / 2}px`, top: `${b.y - b.h / 2}px`,
        width: `${b.w}px`, height: `${b.h}px`, zIndex: String(1 + hitOrder.indexOf(pin.prop))
      });
      const offscreen = b.x + b.w / 2 <= 0 || b.x - b.w / 2 >= width ||
        b.y + b.h / 2 <= 0 || b.y - b.h / 2 >= height;
      pin.label.style.visibility = offscreen ? 'hidden' : '';
      if (offscreen) continue;
      const dim = dimensions[i];
      const box = i === targetIndex && targetBox ? targetBox
        : labelBox(b, dim.w, dim.h, width, height, obstacles);
      obstacles.push(box);
      Object.assign(pin.label.style, { left: `${box.x}px`, top: `${box.y}px` });
      if (i === targetIndex) {
        map.style.setProperty('--kb-spotlight-x', `${box.x / width * 100}%`);
        map.style.setProperty('--kb-spotlight-y', `${box.y / height * 100}%`);
      }
      // A survey line links each nameplate to its plot at every camera angle.
      const dx = box.x - b.x, dy = box.y - b.y;
      const edge = Math.min(b.w / (2 * Math.abs(dx)), b.h / (2 * Math.abs(dy)), 1);
      lines.moveTo((b.x + dx * edge) / cssX, (b.y + dy * edge) / cssY);
      lines.lineTo(box.x / cssX, box.y / cssY);
    }
    map.dataset.riverAngle = angle.toFixed(4);
    window.clearTimeout(animation);
    const front = canvas.getContext('2d')!;
    const windX = cos - 0.25 * sin, windY = (sin + 0.25 * cos) * pitch;
    let paintedStill = false;
    const animate = () => {
      if (!map.isConnected) return;
      const still = reducedMotion || spotlight || motionPreference?.matches;
      if (!reducedMotion && !spotlight) animation = window.setTimeout(animate, still || document.hidden ? 500 : 90);
      if ((!still && document.hidden) || (still && paintedStill)) return;
      front.clearRect(0, 0, canvas.width, canvas.height);
      front.drawImage(background, 0, 0);
      const frame = lifeFrame(actors, still ? 2 : performance.now() / 1000, sin, cos, ground, projectPoint);
      let index = 0;
      for (const sprite of sprites) {
        while (index < frame.length && frame[index].depth < sprite.depth) {
          paintLife(front, frame[index++], scale, landscape, windX, windY);
        }
        front.drawImage(sprite.stamp, sprite.left, sprite.top);
      }
      for (; index < frame.length; index++) paintLife(front, frame[index], scale, landscape, windX, windY);
      front.strokeStyle = '#5a715dc4';
      front.stroke(lines);
      paintedStill = Boolean(still);
    };
    animate();
  }
  const refresh = () => { if (!scheduled) scheduled = requestAnimationFrame(draw); };
  function rotate(value: number) {
    view.angle = value % (2 * Math.PI);
    refresh();
  }
  if (!spotlight) {
    for (const [label, step] of [['左に回す', -1], ['右に回す', 1]] as const) {
      const icon = el('img', { src: assetUrl('./assets/ui_icon/map_rotate.webp'), alt: '', width: 24, height: 24,
        draggable: 'false', className: step < 0 ? 'kb-turn-counterclockwise' : undefined });
      const btn = el('button', { type: 'button', 'aria-label': label, title: label, 'data-testid': `river-turn-${step < 0 ? 'left' : 'right'}` }, icon);
      btn.addEventListener('click', () => rotate(view.angle + step * Math.PI / 6));
      controls.append(btn);
    }
    const slider = el('input', {
      type: 'range', min: 75, max: 400, step: 5, value: view.zoom, 'aria-label': '地図のズーム',
      'aria-orientation': 'vertical', 'aria-valuetext': `${view.zoom}%`, 'data-testid': 'river-zoom',
    });
    slider.addEventListener('input', () => {
      view.zoom = slider.valueAsNumber;
      slider.setAttribute('aria-valuetext', `${view.zoom}%`);
      refresh();
    });
    slider.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !e.isPrimary) return;
      map.classList.add('is-map-gesturing');
      slider.setPointerCapture(e.pointerId);
    });
    slider.addEventListener('lostpointercapture', () => map.classList.remove('is-map-gesturing'));
    controls.append(el('div', { className: 'kb-river-zoom' }, slider));
    map.append(controls, el('span', { className: 'kb-river-hint' }, '左右にドラッグで回転'));
    let gesture: { id: number; start: number; angle: number; dragged: boolean } | undefined;
    let suppressClick = false;
    map.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !e.isPrimary) return;
      suppressClick = false;
      if (controls.contains(e.target as Node)) return;
      gesture = { id: e.pointerId, start: e.clientX, angle: view.angle, dragged: false };
      map.classList.add('is-map-gesturing');
      (e.target as Element).setPointerCapture(e.pointerId);
    });
    map.addEventListener('pointermove', e => {
      if (!gesture || gesture.id !== e.pointerId) return;
      const delta = e.clientX - gesture.start;
      if (!gesture.dragged && Math.abs(delta) < 6) return;
      gesture.dragged = true;
      rotate(gesture.angle + delta / map.clientWidth * Math.PI * 2);
    });
    const end = (e: PointerEvent) => {
      if (gesture?.id !== e.pointerId) return;
      suppressClick = gesture.dragged;
      gesture = undefined;
      map.classList.remove('is-map-gesturing');
    };
    map.addEventListener('pointerup', end);
    map.addEventListener('pointercancel', end);
    map.addEventListener('lostpointercapture', end);
    map.addEventListener('click', e => {
      if (suppressClick && e.detail) {
        e.preventDefault();
        e.stopImmediatePropagation();
        suppressClick = false;
      }
    }, true);
  }
  return {
    add(id: RiversideSite, stage: number, label: HTMLElement, button?: HTMLButtonElement, district = false, activityStage = stage) {
      const [x, y] = (landscape === 'riverside' ? sites : townSites[landscape])[id];
      const level = Math.min(5, Math.max(0, Math.floor(stage)));
      const item = prop(buildingStripName(landscape, id, level), x, y, id === 'central_hub' ? 0.9 : 0.8);
      label.classList.add('kb-river-pin');
      const hit = el('div', {
        className: 'kb-river-hit', 'aria-hidden': 'true', 'data-river-site': id,
        'data-river-stage': level, 'data-map-building': district && level ? id : undefined,
      });
      if (button) {
        hit.addEventListener('click', () => button.click());
      } else hit.style.pointerEvents = 'none';
      map.append(hit);
      pins.push({ prop: item, label, hit, id, activityStage });
    },
    load() {
      if (typeof requestAnimationFrame !== 'function' || typeof Image.prototype.decode !== 'function') return;
      const names = new Set([terrainName, ...landscapeProps.map(p => p.name), ...decorations.map(p => p.name), ...pins.map(pin => pin.prop.name)]);
      void Promise.all([...names].map(async name =>
        [name, await (name.startsWith('decor-') ? decorationImage(name.slice(6)) : strip(name))] as const)).then(entries => {
        images = new Map(entries);
        map.dataset.decorationCount = String(decorations.length);
        refresh();
      }).catch(() => {
        title.textContent = `${townName}（地図を読み込めませんでした）`;
      });
    },
    refresh,
  };
}
