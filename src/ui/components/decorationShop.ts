import type { CityEconomy } from '@/economy/cityEconomy';
import { DECORATIONS, decorationCost, type Decoration } from '@/economy/decorations';
import { el } from '../utils/dom';
import { decorationImage, paintStack } from './spriteStack';

function turntable(item: Decoration, still: boolean): HTMLElement {
  const canvas = el('canvas', { width: 144, height: 94, role: 'img', 'aria-label': item.name });
  const figure = el('div', { className: 'kb-decoration-preview' }, canvas);
  let angle = -0.48;
  void decorationImage(item.id).then(image => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = 2.5;
    const baseline = canvas.height / 2 + (image.width / image.height - 1) * scale * 0.83 / 2;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#778d6630';
      ctx.beginPath();
      ctx.ellipse(canvas.width / 2, baseline + 3, 26, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      paintStack(ctx, image, image.height, canvas.width / 2, baseline, angle, scale);
    };
    draw();
    if (still) {
      const rotate = el('button', { type: 'button', className: 'kb-decoration-turn', 'aria-label': '見本を回す' }, '⟳');
      rotate.addEventListener('click', () => { angle += Math.PI / 4; draw(); });
      figure.append(rotate);
    } else {
      const start = performance.now();
      const tick = (now: number) => {
        if (!canvas.isConnected) return;
        angle = -0.48 + (now - start) * Math.PI / 4500;
        draw();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }).catch(() => figure.replaceChildren('見本を読み込めませんでした'));
  return figure;
}

export function updateDecorationPurchase(button: HTMLButtonElement, economy: CityEconomy): void {
  const item = DECORATIONS[economy.landscape].find(entry => entry.id === button.dataset.decoration);
  if (!item) return;
  const level = economy.decorationLevels[item.id] ?? 0;
  if (level >= item.spots.length) {
    button.disabled = true;
    if (button.textContent !== 'Lv.5 配置完了') button.textContent = 'Lv.5 配置完了';
    return;
  }
  const price = BigInt(decorationCost(item, level));
  const affordable = economy.coinsMicro >= price * economy.unit;
  button.disabled = !affordable;
  const amount = price.toLocaleString('ja-JP');
  const label = affordable ? `1つ配置する（${amount} コイン）` : `コイン不足（${amount} コイン必要）`;
  if (button.textContent !== label) button.textContent = label;
}

export function decorationShop(economy: CityEconomy, selected: string, reducedMotion: boolean,
  selectItem: (id: string) => void, buy: (id: string) => void): HTMLElement {
  const items = DECORATIONS[economy.landscape];
  let current = items.find(item => item.id === selected) ?? items[0];
  const choices = el('div', { className: 'kb-decoration-choices', role: 'group', 'aria-label': '景観アイテム' });
  const display = el('div', { className: 'kb-decoration-display' });
  const description = el('span', { className: 'kb-small kb-secondary' });
  const name = el('strong', { className: 'kb-h2' });
  const level = el('strong', { className: 'kb-decoration-level', 'aria-live': 'polite' });
  const button = el('button', { type: 'button', className: 'kb-btn-primary', 'data-testid': 'decoration-buy' });
  const update = () => {
    const item = current;
    name.textContent = item.name;
    for (const choice of choices.querySelectorAll('button')) {
      choice.setAttribute('aria-pressed', String(choice.dataset.item === item.id));
    }
    const count = economy.decorationLevels[item.id] ?? 0;
    button.dataset.decoration = item.id;
    description.textContent = item.location;
    level.textContent = `Lv.${count} / 5 ・ ${count}個配置済み`;
    display.replaceChildren(turntable(item, reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
    updateDecorationPurchase(button, economy);
  };
  for (const item of items) {
    const choice = el('button', { type: 'button', className: 'kb-pill-btn', 'data-item': item.id }, item.name);
    choice.addEventListener('click', () => { current = item; selectItem(item.id); update(); });
    choices.append(choice);
  }
  button.addEventListener('click', () => buy(current.id));
  update();
  return el('div', { className: 'kb-decoration-shop', 'data-testid': 'decoration-shop' }, choices,
    el('div', { className: 'kb-decoration-detail' }, display,
      el('div', { className: 'kb-decoration-choice' }, name, description, level), button));
}
