import type { DistrictId, LandscapeId } from '@/contracts/types';
import { el } from '../utils/dom';
import { DISTRICT_NAME_MAP } from '../utils/format';
import { loadBuildingModel } from './riversideMap';
import { paintStack } from './spriteStack';

export function buildingComparison(landscape: LandscapeId, district: DistrictId, stage: number, reducedMotion: boolean) {
  const completed = stage === 5;
  const before = completed ? 4 : stage;
  const levels = [before, before + 1];
  const region = el('div', { className: 'kb-building-comparison', role: 'group', 'aria-label': '建築前後の比較' });
  const canvases = levels.map((level, index) => {
    const state = index === 0 ? (completed ? '建築前' : '現在') : (completed ? '完成' : '建築後');
    const caption = `${state}　Lv.${level}${level === 0 ? '（更地）' : ''}`;
    const canvas = el('canvas', { width: 232, height: 156, role: 'img', 'aria-label': `${DISTRICT_NAME_MAP[district]}　${caption}` });
    region.append(el('figure', {}, canvas, el('figcaption', {}, caption)));
    return canvas;
  });
  const preferStill = () => reducedMotion || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const control = el('button', { type: 'button', className: 'kb-btn-secondary kb-building-turn', disabled: true },
    preferStill() ? '向きを変える' : '回転を止める');
  region.append(control);

  void Promise.all(levels.map(level => loadBuildingModel(landscape, district, level))).then(models => {
    if (!region.isConnected) return;
    const contexts = canvases.map(canvas => canvas.getContext('2d')!);
    // Frame occupied pixels across a full turn; transparent slice margins can be
    // much wider than the first cottage. Both models share the same ground line.
    const { width, height } = canvases[0];
    let radius = 0, above = 0, below = 0;
    for (const { slices } of models) {
      for (const slice of slices) {
        const reach = Math.hypot(Math.abs(slice.x) + slice.halfW, Math.abs(slice.y) + slice.halfH);
        radius = Math.max(radius, reach);
        above = Math.max(above, reach * 0.56 + slice.z * 0.83);
        below = Math.max(below, reach * 0.56 - slice.z * 0.83);
      }
    }
    const scale = Math.min((width - 16) / (2 * radius), (height - 16) / (above + below));
    const groundY = (height + (above - below) * scale) / 2;
    let angle = -0.48;
    let frame = 0;
    let previous = 0;
    const draw = () => {
      models.forEach(({ image }, i) => {
        const ctx = contexts[i];
        ctx.clearRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#75886735';
        ctx.beginPath();
        ctx.ellipse(width / 2, groundY + scale, radius * scale * 0.62, below * scale * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        paintStack(ctx, image, image.height, width / 2, groundY, angle, scale);
      });
    };
    const tick = (now: number) => {
      frame = 0;
      if (!region.isConnected) return;
      if (preferStill()) { control.textContent = '向きを変える'; return; }
      if (now - previous >= 40) {
        angle += Math.min(now - previous, 100) * Math.PI / 5600;
        previous = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    function start() {
      control.textContent = '回転を止める';
      previous = performance.now();
      frame = requestAnimationFrame(tick);
    }
    draw();
    if (!preferStill()) start();
    control.disabled = false;
    control.addEventListener('click', () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else if (preferStill()) {
        angle += Math.PI / 4;
        draw();
      } else {
        start();
        return;
      }
      control.textContent = preferStill() ? '向きを変える' : '回転を再開';
    });
  }).catch(() => region.replaceChildren(el('p', { className: 'kb-secondary' }, '建物の見本を読み込めませんでした。')));
  return region;
}
