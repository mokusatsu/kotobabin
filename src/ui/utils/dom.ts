declare const __ASSET_VERSION__: string | undefined;

const FALLBACK_ASSET_VERSION = Date.now().toString(36);

/**
 * Appends a build-unique cache-busting query parameter to local asset URLs.
 */
export function assetUrl(url: string): string {
  if (!url) {
    return url;
  }
  const isDebugSubpage =
    typeof window !== 'undefined' &&
    /\/debug(?:\/(?:index\.html)?)?$/.test(window.location.pathname);
  const resolved = isDebugSubpage && url.startsWith('./assets/') ? `.${url}` : url;
  if (
    !resolved.startsWith('./assets/') &&
    !resolved.startsWith('../assets/') &&
    !resolved.startsWith('/assets/')
  ) {
    return resolved;
  }
  if (resolved.includes('?')) {
    return resolved;
  }
  const version =
    typeof __ASSET_VERSION__ !== 'undefined' ? __ASSET_VERSION__ : FALLBACK_ASSET_VERSION;
  return `${resolved}?v=${version}`;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number | boolean | undefined | null>,
  ...children: (Node | string | number | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) {
        continue;
      }
      if (key === 'className') {
        node.className = String(value);
      } else if (key === 'disabled' && value === true) {
        (node as HTMLButtonElement).disabled = true;
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, String(value));
      }
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  }
  return node;
}

export function assetImg(
  src: string,
  alt: string,
  options: {
    className?: string;
    fallbackSrc?: string;
    width?: number;
    height?: number;
    decorative?: boolean;
  } = {},
): HTMLImageElement {
  const img = document.createElement('img');
  img.decoding = 'sync';
  img.src = assetUrl(src);
  img.alt = options.decorative ? '' : alt;
  if (options.decorative) {
    img.setAttribute('aria-hidden', 'true');
  }
  if (options.className) {
    img.className = options.className;
  }
  if (options.width) {
    img.width = options.width;
  }
  if (options.height) {
    img.height = options.height;
  }
  let triedFallback = false;
  img.addEventListener('error', () => {
    if (options.fallbackSrc && !triedFallback) {
      triedFallback = true;
      img.src = assetUrl(options.fallbackSrc);
      return;
    }
    img.style.display = 'none';
  });
  return img;
}

const keepaliveAssetUrls = new Set<string>();

export function ensurePersistentAssetKeepalive(urls: readonly string[]): void {
  if (typeof document === 'undefined' || !document.body) {
    return;
  }
  let host = document.getElementById('kb-asset-keepalive');
  if (!host) {
    keepaliveAssetUrls.clear();
    host = document.createElement('div');
    host.id = 'kb-asset-keepalive';
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
    document.body.appendChild(host);
  }
  for (const rel of urls) {
    const resolved = assetUrl(rel);
    if (keepaliveAssetUrls.has(resolved)) {
      continue;
    }
    keepaliveAssetUrls.add(resolved);
    const img = document.createElement('img');
    img.decoding = 'sync';
    img.loading = 'eager';
    img.alt = '';
    img.src = resolved;
    host.appendChild(img);
  }
}
