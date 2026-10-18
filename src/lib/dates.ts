// Calendar-day helpers. All "days" are local-time YYYY-MM-DD strings so that
// a session logged at 11pm lands on the day the reader experienced it.

export const pad = (n: number) => String(n).padStart(2, '0');

export function toDay(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const today = () => toDay();

export function parseDay(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(s: string, n: number): string {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return toDay(d);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}
export const yearOf = (day: string) => Number(day.slice(0, 4));
export const monthKey = (day: string) => day.slice(0, 7);
export const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDay(s).getTime());

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatDay(s?: string): string {
  if (!s || !isDay(s)) return '—';
  const d = parseDay(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeDay(s: string, now: string = today()): string {
  const diff = daysBetween(s, now);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  if (diff < 0 && diff > -7) return `in ${-diff} days`;
  return formatDay(s);
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const mins = Math.round((now.getTime() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return relativeDay(toDay(new Date(iso)), toDay(now));
}

export function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
}
