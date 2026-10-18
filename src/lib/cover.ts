// Samples a dominant colour from a cover image (when the host allows cross-origin pixel reads).
// Failures are remembered so we never retry a blocked image.
import { tameColor, rgbToHex } from './color';

const cache = new Map<string, string | null>();
let chain: Promise<unknown> = Promise.resolve();

export function sampleCoverColor(url: string): Promise<string | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  const run = () =>
    new Promise<string | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      const done = (v: string | null) => {
        cache.set(url, v);
        resolve(v);
      };
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 24;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          if (!ctx) return done(null);
          ctx.drawImage(img, 0, 0, 24, 24);
          const { data } = ctx.getImageData(0, 0, 24, 24);
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            const max = Math.max(data[i], data[i + 1], data[i + 2]);
            const min = Math.min(data[i], data[i + 1], data[i + 2]);
            if (a < 200 || max > 242 || max < 14) continue; // skip transparent, paper-white, pure black
            const w = 1 + (max - min) / 64; // favour saturated pixels
            r += data[i] * w; g += data[i + 1] * w; b += data[i + 2] * w; n += w;
          }
          if (!n) return done(null);
          done(tameColor(rgbToHex(r / n, g / n, b / n)));
        } catch {
          done(null); // tainted canvas
        }
      };
      img.onerror = () => done(null);
      img.src = url;
    });
  const next = chain.then(run, run);
  chain = next;
  return next;
}
