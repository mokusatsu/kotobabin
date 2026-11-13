export interface IPadPaginationController { refresh(): void; destroy(): void }
interface PageItem { nodes: HTMLElement[] }
interface Panel { target: HTMLElement; nav: HTMLElement; items: PageItem[]; parents: HTMLElement[]; pages: number[][]; page: number; key: string; sourceKey?: string }
const focusable = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]';
const editing = 'input,select,textarea,[contenteditable="true"],[role="slider"],[role="tablist"]';
const fixed = '.section-heading,[data-save-status],.city-command-status,.catalogue-pagination,[data-ipad-fixed]';
const split = '.city-detail-layout,.city-district-nav,#district-detail,.district-detail-card,.district-resources,.plan-card,.unlock-requirements,.city-page-actions,.equipment-layout,.equipment-tabs,.equipment-main,.equipment-controls,#equipment-content,#equipment-district-summary,.equipment-district-card,.purchase-card,.transport-preview,.special-equipment-grid,.special-equipment-grid > article,.collection-counts,.catalogue-filters,#catalogue-results,.word-list,.save-recovery,.profile-management,.backup-preview,.condition-list';

/** Pure page grouping helper, independently testable without viewport or DOM APIs. */
export function packPages<T>(items: readonly T[], fits: (candidate: readonly T[]) => boolean): T[][] {
  const pages: T[][] = []; let current: T[] = [];
  for (const item of items) {
    const candidate = [...current, item];
    if (current.length && !fits(candidate)) { pages.push(current); current = [item]; }
    else current = candidate;
  }
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
}

/** Measured screen panels, not scroll containers. The game input is never moved or paginated.
 * Call refresh after replacing screen markup; MutationObserver also handles subsequent patches.
 * Optional hooks: data-paginate="name", data-page-items="selector", data-ipad-fixed.
 */
export function installIPadPagination(root: HTMLElement): IPadPaginationController {
  const panels = new Map<HTMLElement, Panel>(); const positions = new Map<string, number>();
  const managed = new Set<HTMLElement>(); let frame = 0; let destroyed = false;
  const viewport = () => {
    const v = window.visualViewport;
    return { bottom: (v?.offsetTop ?? 0) + (v?.height ?? window.innerHeight), height: v?.height ?? window.innerHeight, top: v?.offsetTop ?? 0 };
  };
  const label = (target: HTMLElement) => target.dataset.paginate || target.querySelector('h1,h2')?.textContent?.trim() || '画面';
  function setText(element: Element | null, value: string) { if (element && element.textContent !== value) element.textContent = value; }
  function mark(element: HTMLElement) { managed.add(element); element.dataset.ipadManaged = 'true'; }
  function collect(target: HTMLElement): { items: PageItem[]; parents: HTMLElement[] } {
    const items: PageItem[] = []; const grouped = new Map<HTMLElement, PageItem>(); const reserved = new Set<HTMLElement>();
    // Keep displayed actual quantity, price, balance and the purchase action on the same panel.
    for (const card of target.querySelectorAll<HTMLElement>('.purchase-card')) {
      const nodes = ['.purchase-comparison', '#purchase-count', '#purchase-cost', '#purchase-balance', '[data-action="city-purchase"]']
        .map(selector => card.querySelector<HTMLElement>(selector)).map(node => node?.id === 'purchase-cost' ? node.parentElement : node)
        .filter((node): node is HTMLElement => !!node);
      if (nodes.length) { const group = { nodes }; grouped.set(nodes[0], group); for (const node of nodes) reserved.add(node); }
    }
    const explicit = target.dataset.pageItems;
    const add = (node: HTMLElement) => { mark(node); items.push({ nodes: [node] }); };
    if (explicit) {
      for (const node of target.querySelectorAll<HTMLElement>(explicit)) add(node);
    } else {
      const walk = (parent: HTMLElement) => {
        for (const node of Array.from(parent.children)) {
          if (!(node instanceof HTMLElement) || node.matches('[data-ipad-controls]') || node.matches(fixed)) continue;
          if (node.hidden && !managed.has(node)) continue;
          const group = grouped.get(node);
          if (group) { group.nodes.forEach(mark); items.push(group); continue; }
          if (reserved.has(node)) continue;
          if (node.matches('h2') && parent === target && target.matches('form')) { node.dataset.ipadFixed = 'true'; continue; }
          if (node.matches('[data-action="close-settings"],[data-action="cancel-profile-operation"]')) { node.dataset.ipadFixed = 'true'; continue; }
          if (node.matches('details')) {
            const summary = node.querySelector<HTMLElement>(':scope > summary');
            if (summary) add(summary);
            if (node instanceof HTMLDetailsElement && node.open) for (const child of Array.from(node.children)) if (child instanceof HTMLElement && child !== summary) add(child);
          } else if (node.matches(split) || (parent === target && node.matches('section,article,aside')) || node.matches('[data-page-children]')) walk(node);
          else add(node);
        }
      };
      walk(target);
    }
    const parents = new Set<HTMLElement>();
    for (const item of items) for (const node of item.nodes) {
      let parent = node.parentElement;
      while (parent && parent !== target) { parents.add(parent); mark(parent); parent = parent.parentElement; }
    }
    return { items, parents: [...parents].reverse() };
  }
  function show(panel: Panel, indices: readonly number[]) {
    const visible = new Set(indices); const nodes: HTMLElement[] = [];
    panel.items.forEach((item, index) => item.nodes.forEach(node => { node.hidden = !visible.has(index); if (!node.hidden) nodes.push(node); }));
    for (const parent of panel.parents) parent.hidden = !nodes.some(node => parent.contains(node)) && !parent.querySelector('[data-ipad-fixed]');
  }
  function update(panel: Panel) {
    const previous = panel.nav.querySelector<HTMLButtonElement>('[data-ipad-prev]')!;
    const next = panel.nav.querySelector<HTMLButtonElement>('[data-ipad-next]')!;
    previous.disabled = panel.page === 0; next.disabled = panel.page === panel.pages.length - 1;
    setText(panel.nav.querySelector('[data-ipad-count]'), `${label(panel.target)} · 表示 ${panel.page + 1} / ${panel.pages.length}`);
    panel.target.dataset.ipadPage = String(panel.page + 1); panel.target.dataset.ipadPages = String(panel.pages.length);
  }
  function go(panel: Panel, page: number, focus: boolean) {
    panel.page = Math.max(0, Math.min(page, panel.pages.length - 1)); positions.set(panel.key, panel.page);
    const active = document.activeElement; show(panel, panel.pages[panel.page]); update(panel);
    if (focus || (active instanceof HTMLElement && active.closest('[hidden]'))) {
      const first = panel.items.flatMap((item, index) => panel.pages[panel.page].includes(index) ? item.nodes : [])
        .flatMap(node => [node, ...node.querySelectorAll<HTMLElement>(focusable)]).find(node => node.matches(focusable) && !node.closest('[hidden]'));
      (first ?? panel.nav.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    }
  }
  function prepare(target: HTMLElement): Panel {
    const existing = panels.get(target); if (existing) return existing;
    const key = `${target.id}:${target.tagName}:${target.className}:${label(target)}`;
    const nav = document.createElement('nav'); nav.className = 'ipad-pagination'; nav.dataset.ipadControls = 'true';
    nav.setAttribute('aria-label', `${label(target)}の表示パネル`);
    nav.innerHTML = '<button type="button" class="button" data-ipad-prev>← 前の表示</button><span data-ipad-count role="status" aria-live="polite"></span><button type="button" class="button" data-ipad-next>次の表示 →</button>';
    target.append(nav); target.classList.add('ipad-page-host');
    const dialog = target.closest('dialog'); if (dialog) dialog.classList.add('ipad-dialog');
    const panel: Panel = { target, nav, items: [], parents: [], pages: [[]], page: positions.get(key) ?? 0, key };
    panels.set(target, panel); resize.observe(target);
    nav.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!button || button.disabled) return;
      go(panel, panel.page + (button.hasAttribute('data-ipad-next') ? 1 : -1), true);
    });
    return panel;
  }
  function measure(panel: Panel) {
    const sourceKey = panel.target.querySelector<HTMLElement>('[data-word-id]')?.dataset.wordId;
    if (panel.sourceKey !== undefined && sourceKey !== panel.sourceKey) panel.page = 0;
    panel.sourceKey = sourceKey;
    const collected = collect(panel.target); panel.items = collected.items; panel.parents = collected.parents;
    setText(panel.nav.querySelector('[data-ipad-count]'), `${label(panel.target)} · 表示 ${Math.max(1,panel.items.length)} / ${Math.max(1,panel.items.length)}`);
    const indices = panel.items.map((_, i) => i); const bottom = viewport().bottom - 12;
    const focused = document.activeElement;
    const focusedItem = panel.items.findIndex(item => item.nodes.some(node => node === focused || node.contains(focused)));
    const fits = (candidate: readonly number[]) => {
      show(panel, candidate);
      return panel.target.getBoundingClientRect().bottom <= bottom;
    };
    panel.pages = packPages(indices, fits);
    panel.target.dataset.ipadOverflow = String(panel.pages.some(page => !fits(page)));
    if (focusedItem >= 0) panel.page = panel.pages.findIndex(page => page.includes(focusedItem));
    go(panel, panel.page, false);
  }
  function refreshNow() {
    frame = 0; if (destroyed || !root.isConnected) return;
    const v = viewport(); root.style.setProperty('--ipad-viewport-height', `${v.height}px`); root.style.setProperty('--ipad-viewport-top', `${v.top}px`);
    const targets = [...root.querySelectorAll<HTMLElement>('.catalogue-page,.city-page,.equipment-page,dialog[open] > form,[data-paginate]')]
      .filter(target => !target.closest('.game-page') && !target.parentElement?.closest('.ipad-page-host,[data-paginate]'));
    root.toggleAttribute('data-ipad-layout', targets.length > 0);
    for (const element of managed) if (!root.contains(element)) managed.delete(element);
    for (const [target, panel] of panels) if (!root.contains(target)) { positions.set(panel.key, panel.page); resize.unobserve(target); panels.delete(target); }
    for (const target of targets) measure(prepare(target));
  }
  function refresh() { if (!destroyed && !frame) frame = requestAnimationFrame(refreshNow); }
  const mutations = new MutationObserver(records => { if (records.some(record => !(record.target instanceof Element && record.target.closest('[data-ipad-controls]')))) refresh(); }); mutations.observe(root, { childList: true, subtree: true });
  const resize = new ResizeObserver(refresh); resize.observe(root);
  let fontScale = root.style.getPropertyValue('--font-scale');
  const styles = new MutationObserver(() => { const next = root.style.getPropertyValue('--font-scale'); if (next !== fontScale) { fontScale = next; refresh(); } });
  styles.observe(root, { attributes: true, attributeFilter: ['style'] });
  const keys = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !(event.target instanceof HTMLElement) || event.target.closest(editing)) return;
    const target = event.target.closest<HTMLElement>('.ipad-page-host'); const panel = target && panels.get(target);
    if (!panel) return;
    const step = event.key === 'ArrowRight' || event.key === 'PageDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'PageUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault(); go(panel, panel.page + step, true);
  };
  root.addEventListener('keydown', keys); root.addEventListener('toggle', refresh, true);
  window.addEventListener('resize', refresh); window.visualViewport?.addEventListener('resize', refresh); window.visualViewport?.addEventListener('scroll', refresh);
  void document.fonts?.ready.then(refresh); refresh();
  return { refresh, destroy() {
    destroyed = true; cancelAnimationFrame(frame); mutations.disconnect(); resize.disconnect(); styles.disconnect();
    root.removeEventListener('keydown', keys); root.removeEventListener('toggle', refresh, true); window.removeEventListener('resize', refresh);
    window.visualViewport?.removeEventListener('resize', refresh); window.visualViewport?.removeEventListener('scroll', refresh);
    for (const panel of panels.values()) { panel.nav.remove(); panel.target.classList.remove('ipad-page-host'); }
    for (const element of managed) if (element.isConnected) { element.hidden = false; delete element.dataset.ipadManaged; }
    root.removeAttribute('data-ipad-layout');
  } };
}
