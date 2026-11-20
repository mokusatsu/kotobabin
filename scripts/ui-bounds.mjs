// Runs in the browser through page.evaluate; keep all DOM helpers inside this function.
export function auditUiBounds(scopeSelector) {
  const root = document.querySelector(scopeSelector);
  if (!root) throw new Error(`Layout scope not found: ${scopeSelector}`);
  const tolerance = 0.75;
  const issues = [];
  const viewport = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const describe = (element) => element.getAttribute('data-testid') || element.id || `${element.tagName.toLowerCase()}.${[...element.classList].join('.')}`;
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.visibility === 'visible' && style.display !== 'none' && Number(style.opacity) > 0 && !element.closest('[hidden], dialog:not([open]), .kb-hidden-input');
  };
  const clipped = (rect, clip, x = true, y = true) => ({
    left: x ? Math.max(0, clip.left - rect.left) : 0,
    right: x ? Math.max(0, rect.right - clip.right) : 0,
    top: y ? Math.max(0, clip.top - rect.top) : 0,
    bottom: y ? Math.max(0, rect.bottom - clip.bottom) : 0,
  });
  const check = (element, rect, kind, text = '', includeSelf = false) => {
    const checkClip = (clip, ancestor, x, y) => {
      const missing = clipped(rect, clip, x, y);
      if (Object.values(missing).some((value) => value > tolerance)) {
        issues.push({ kind, element: describe(element), ancestor, text: text.trim().slice(0, 100), missing });
      }
    };
    checkClip(viewport, 'viewport', true, true);
    const modal = element.closest('dialog:modal');
    if (modal === element && !includeSelf) return;
    for (let parent = includeSelf ? element : element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const x = /^(auto|scroll|hidden|clip)$/.test(style.overflowX);
      const y = /^(auto|scroll|hidden|clip)$/.test(style.overflowY);
      if (x || y) {
        const bounds = parent.getBoundingClientRect();
        const left = bounds.left + parent.clientLeft;
        const top = bounds.top + parent.clientTop;
        checkClip({ left, top, right: left + parent.clientWidth, bottom: top + parent.clientHeight }, describe(parent), x, y);
      }
      if (parent === modal) break;
    }
  };
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (!visible(element)) continue;
    const rect = element.getBoundingClientRect();
    const isControl = element.matches('button, input, select, textarea, a[href], [role="button"]');
    if (isControl || element.matches('img, kbd')) check(element, rect, isControl ? 'control-clipped' : 'content-clipped');
    const style = getComputedStyle(element);
    if (style.outlineStyle !== 'none' && style.outlineStyle !== 'hidden' && Number.parseFloat(style.outlineWidth) > 0) {
      const extra = Math.max(0, Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset || 0));
      check(element, { left: rect.left - extra, right: rect.right + extra, top: rect.top - extra, bottom: rect.bottom + extra }, 'focus-clipped');
    }
    if (isControl && !element.disabled) {
      const dx = Math.min(8, rect.width / 4);
      const dy = Math.min(8, rect.height / 4);
      const points = [[rect.x + rect.width / 2, rect.y + rect.height / 2], [rect.left + dx, rect.top + dy], [rect.right - dx, rect.bottom - dy]];
      if (points.some(([x, y]) => { const top = document.elementFromPoint(x, y); return top !== element && !element.contains(top); })) {
        issues.push({ kind: 'control-covered', element: describe(element) });
      }
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode;
    const parent = text.parentElement;
    if (!parent || !text.textContent.trim() || !visible(parent) || parent.closest('script, style, svg, template, option')) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) {
      check(parent, rect, 'text-clipped', text.textContent, true);
      const control = parent.closest('button, kbd, a[href]');
      if (control && (root === control || root.contains(control))) {
        const missing = clipped(rect, control.getBoundingClientRect());
        if (Object.values(missing).some((value) => value > tolerance)) {
          issues.push({ kind: 'text-outside-control', element: describe(parent), ancestor: describe(control), text: text.textContent.trim().slice(0, 100), missing });
        }
      }
    }
  }
  return issues;
}
