// Spine colours: deterministic from the book, overridable by the user, and sampled from the cover when possible.

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Library-leather palette: burgundy, plum, espresso, forest, navy, ochre, rose, teal, slate. */
export const SPINE_PALETTE = [
  '#6b1d2e', '#4a1f3d', '#3b2a20', '#2f4a3a', '#243a5a', '#8a6a2a',
  '#a04c5a', '#2d5757', '#46465a', '#7a3b22', '#5b4a2e', '#38203a',
  '#1f3b3f', '#8c3b3b', '#53603a', '#3c2f4f',
];

export function spineColorFor(seed: string): string {
  return SPINE_PALETTE[hashString(seed) % SPINE_PALETTE.length];
}

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [90, 30, 40];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** amt in -1..1: negative darkens, positive lightens. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  return rgbToHex(r + (t - r) * p, g + (t - g) * p, b + (t - b) * p);
}
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Ink colour that stays readable on the given background. */
export function inkOn(hex: string): string {
  return luminance(hex) > 0.42 ? '#2a1a14' : '#f7efdc';
}
/** Pull a sampled cover colour into the leather range: not too light, not too grey. */
export function tameColor(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let out = hex;
  if (max - min < 24) out = shade(hex, -0.1); // greyish: keep, slightly deepen
  if (luminance(out) > 0.5) out = shade(out, -0.35);
  return out;
}
