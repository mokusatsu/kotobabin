import { assetUrl } from '../utils/dom';

const decorationImages = new Map<string, Promise<HTMLImageElement>>();

export function decorationImage(id: string): Promise<HTMLImageElement> {
  let pending = decorationImages.get(id);
  if (!pending) {
    const image = new Image();
    image.src = assetUrl(`./assets/decorations/${id}.png`);
    pending = image.decode().then(() => {
      if (image.height !== 24 || image.width % image.height) throw new Error(`Invalid decoration strip: ${id}`);
      return image;
    });
    decorationImages.set(id, pending);
    pending.catch(() => decorationImages.delete(id));
  }
  return pending;
}

// Coordinates locate the centre of the ground slice. Leave the transform reset
// so the caller can composite another stack or paint map labels immediately.
export function paintStack(ctx: CanvasRenderingContext2D, image: HTMLImageElement, w: number,
  x: number, y: number, angle: number, scale: number, pitch = 0.56): void {
  const h = image.height;
  const c = Math.cos(angle) * scale, s = Math.sin(angle) * scale;
  for (let z = 0; z < image.width / w; z++) {
    ctx.setTransform(c, s * pitch, -s, c * pitch, x, y - z * 0.83 * scale);
    ctx.drawImage(image, z * w, 0, w, h, -w / 2, -h / 2, w, h);
  }
  ctx.resetTransform();
}
