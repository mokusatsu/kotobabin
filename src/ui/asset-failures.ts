/** Keep the labelled DOM surface when an illustration cannot load. */
export function installAssetFailureFallback(root: HTMLElement): () => void {
  const abort = new AbortController();
  const imageTarget = (event: Event) => {
    const element = event.target as Element | null;
    const tag = element?.tagName?.toLowerCase();
    return element && (tag === 'img' || tag === 'image') && root.contains(element) ? element : null;
  };
  root.addEventListener('error', event => {
    const image = imageTarget(event);
    if (!image) return;
    image.classList.add('asset-load-failed');
    if (import.meta.env.DEV) console.warn('Illustration unavailable:', image.getAttribute('src') ?? image.getAttribute('href'));
  }, { capture: true, signal: abort.signal });
  root.addEventListener('load', event => imageTarget(event)?.classList.remove('asset-load-failed'), { capture: true, signal: abort.signal });
  return () => abort.abort();
}
