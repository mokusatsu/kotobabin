/** Runs read-only inside the actual browser. No screenshot color inference or application state changes. */
export function collectContrast() {
  type Color = [number, number, number, number];
  const color = (value: string): Color | null => {
    const parts = /^rgba?\(([^)]+)\)$/.exec(value)?.[1].split(/[,/ ]+/).filter(Boolean).map(Number);
    return parts && parts.length >= 3 && parts.every(Number.isFinite) ? [parts[0], parts[1], parts[2], parts[3] ?? 1] : null;
  };
  const composite = (top: Color, bottom: Color): Color => {
    const alpha = top[3] + bottom[3] * (1 - top[3]);
    return [0, 1, 2].map(index => (top[index] * top[3] + bottom[index] * bottom[3] * (1 - top[3])) / alpha).concat(alpha) as Color;
  };
  const luminance = (c: Color) => c.slice(0, 3).map(value => { const s = value / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const selector = (element: Element): string => {
    if (element.id) return `#${element.id}`;
    const classes = [...element.classList].slice(0, 3).map(name => `.${name}`).join('');
    const local = element.tagName.toLowerCase() + classes;
    return element.parentElement && element.parentElement !== document.body ? `${element.parentElement.id ? '#' + element.parentElement.id : element.parentElement.tagName.toLowerCase() + [...element.parentElement.classList].slice(0, 2).map(name => '.' + name).join('')} > ${local}` : local;
  };
  const visible = (element: Element) => {
    const rect = element.getBoundingClientRect(); const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight && style.visibility === 'visible' && style.display !== 'none';
  };
  const intersects = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
  const surfaces = [...document.querySelectorAll('img,svg,canvas,*')].filter(visible).filter(element => ['IMG', 'svg', 'CANVAS'].includes(element.tagName) || window.getComputedStyle(element).backgroundImage !== 'none');
  const modal = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);
  const root = modal ?? document.body;
  const candidates: { element: HTMLElement; text: string; rect: DOMRect; pseudo?: string }[] = [];
  const walker = document.createTreeWalker(root, 4);
  while (walker.nextNode()) {
    const node = walker.currentNode; const parent = node.parentElement;
    if (!parent || !node.textContent?.trim() || ['SCRIPT', 'STYLE', 'OPTION'].includes(parent.tagName)) continue;
    const range = document.createRange(); range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width && rect.height) candidates.push({ element: parent, text: node.textContent.trim().slice(0, 100), rect });
  }
  for (const element of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type=radio]):not([type=checkbox]):not([type=range]):not([type=file]),select')) {
    candidates.push({ element, text: element.value || (element instanceof HTMLInputElement ? element.placeholder || '[empty input style]' : '[select]'), rect: element.getBoundingClientRect(), pseudo: element instanceof HTMLInputElement && !element.value && element.placeholder ? '::placeholder' : undefined });
  }
  const results = []; let excluded = 0;
  for (const item of candidates) {
    const element = item.element;
    if (!visible(element) || !intersects(item.rect, new DOMRect(0, 0, innerWidth, innerHeight)) || element.closest('svg,[aria-hidden="true"],[inert],button:disabled,input:disabled,select:disabled,[aria-disabled="true"],.sr-only') || element.closest('label')?.control?.disabled) { excluded++; continue; }
    const style = window.getComputedStyle(element, item.pseudo); const foreground = color(style.color); const reasons: string[] = [];
    const layers: { selector: string; color: Color }[] = []; let boundary: Element | null = null;
    // Group opacity/filter above an otherwise opaque control still changes the painted colors.
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const computed = window.getComputedStyle(ancestor);
      if (Number(computed.opacity) !== 1) reasons.push(`opacity:${selector(ancestor)}`);
      if (computed.filter !== 'none' || computed.mixBlendMode !== 'normal' || computed.backdropFilter !== 'none') reasons.push(`filter/blend:${selector(ancestor)}`);
    }
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const computed = window.getComputedStyle(ancestor); const background = color(computed.backgroundColor);
      if (computed.backgroundImage !== 'none') reasons.push(`background-image:${selector(ancestor)}`);
      if (Number(computed.opacity) !== 1) reasons.push(`opacity:${selector(ancestor)}`);
      if (computed.filter !== 'none' || computed.mixBlendMode !== 'normal' || computed.backdropFilter !== 'none') reasons.push(`filter/blend:${selector(ancestor)}`);
      for (const pseudo of ['::before', '::after']) {
        const pseudoStyle = window.getComputedStyle(ancestor, pseudo);
        const pseudoColor = color(pseudoStyle.backgroundColor);
        if (pseudoStyle.content !== 'none' && pseudoStyle.content !== 'normal' && (pseudoStyle.backgroundImage !== 'none' || (pseudoColor?.[3] ?? 0) > 0)) reasons.push(`painted-pseudo:${selector(ancestor)}${pseudo}`);
      }
      if (!background) reasons.push(`unparsed-background:${selector(ancestor)}`);
      else layers.push({ selector: selector(ancestor), color: background });
      if (background?.[3] === 1) { boundary = ancestor; break; }
    }
    // An opaque nearest ancestor shields background images outside its subtree. Otherwise overlapping artwork is uncertain,
    // including pointer-events:none surfaces that elementsFromPoint would omit.
    for (const surface of surfaces) if (surface !== element && !surface.contains(element) && (!boundary || boundary.contains(surface)) && intersects(item.rect, surface.getBoundingClientRect())) reasons.push(`overlapping-art:${selector(surface)}`);
    let background: Color = [255, 255, 255, 1];
    for (const layer of [...layers].reverse()) background = composite(layer.color, background);
    let ratio: number | null = null;
    if (!foreground) reasons.push('unparsed-foreground');
    if (foreground && !reasons.length) {
      const rendered = composite(foreground, background); const a = luminance(rendered); const b = luminance(background);
      ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    }
    results.push({ selector: selector(element), text: item.text, tag: element.tagName, foreground: style.color, background, layers, ratio,
      status: ratio === null ? 'unmeasured' : ratio >= 4.5 ? 'pass' : 'low', reasons: [...new Set(reasons)], fontSize: style.fontSize, fontWeight: style.fontWeight, inputStyle: item.text === '[empty input style]',
      rect: { x: item.rect.x, y: item.rect.y, width: item.rect.width, height: item.rect.height } });
  }
  return { viewport: { width: innerWidth, height: innerHeight }, excluded, results };
}
