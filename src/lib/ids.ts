export function uid(prefix = 'id'): string {
  const c = globalThis.crypto as Crypto | undefined;
  const rnd = c && 'randomUUID' in c ? c.randomUUID().replace(/-/g, '').slice(0, 14) : Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return `${prefix}_${rnd}`;
}
export const nowIso = () => new Date().toISOString();
