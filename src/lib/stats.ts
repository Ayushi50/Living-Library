// Statistics: pure functions over saved data. Definitions (also shown in the UI):
//  • Books finished  = reading runs marked completed with a finish date inside the period. A reread that
//    is finished counts again. Unfinished, paused and abandoned books never count.
//  • Pages read      = pages logged in reading sessions (the user's own entries), by session date.
//  • Movies watched  = distinct films with at least one viewing in the period (rewatches reported separately).
//  • Episodes watched= dated episode check-offs in the period. "Already watched" episodes without a date
//    are counted in totals only.
//  • Series completed= series whose status is completed (ended + every episode watched), by finish date.
//  • Time watched    = runtime × viewings/episodes, only for titles that have a runtime.
//  • Streak          = consecutive days with at least one recorded session or finished book.
import type { AppData, Book, Goal, Media, MediaKind, ReadingRun } from '../types';
import { addDays, daysBetween, monthsOfYear, today, yearOf } from './dates';
import { isSeries } from './media';

export type Period = { kind: 'all' } | { kind: 'year'; year: number } | { kind: 'month'; key: string };

export function inPeriod(day: string | undefined, p: Period): boolean {
  if (!day) return false;
  if (p.kind === 'all') return true;
  if (p.kind === 'year') return yearOf(day) === p.year;
  return day.startsWith(p.key);
}

/* ------------------------------------------------------------- reading */

export interface BookFinish {
  book: Book;
  run: ReadingRun;
  day: string;
  rating?: number;
}
export function bookFinishes(data: AppData, p: Period = { kind: 'all' }): BookFinish[] {
  const out: BookFinish[] = [];
  for (const book of data.books) {
    for (const run of book.runs) {
      if (run.outcome === 'completed' && run.finishedAt && inPeriod(run.finishedAt, p)) {
        out.push({ book, run, day: run.finishedAt, rating: run.rating ?? book.rating });
      }
    }
  }
  return out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}
/** Completed books/runs that have no finish date: they count toward all-time totals only. */
export function undatedCompletions(data: AppData): number {
  let n = 0;
  for (const book of data.books) for (const run of book.runs) if (run.outcome === 'completed' && !run.finishedAt) n++;
  return n;
}
export function booksFinishedCount(data: AppData, p: Period): number {
  return p.kind === 'all' ? bookFinishes(data).length + undatedCompletions(data) : bookFinishes(data, p).length;
}

export function sessionsIn(data: AppData, p: Period) {
  return data.sessions.filter((s) => inPeriod(s.date, p));
}
export function pagesLogged(data: AppData, p: Period): number {
  return sessionsIn(data, p).reduce((n, s) => n + (s.pagesRead ?? 0), 0);
}
export function minutesLogged(data: AppData, p: Period): number {
  return sessionsIn(data, p).reduce((n, s) => n + (s.minutes ?? 0), 0);
}
export function averageRating(items: { rating?: number }[]): number | undefined {
  const r = items.map((i) => i.rating).filter((x): x is number => typeof x === 'number');
  if (!r.length) return undefined;
  return Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100) / 100;
}
export function countBy<T>(items: T[], keys: (t: T) => string[]): { label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) for (const k of keys(it)) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
export function bookGenreCounts(data: AppData, p: Period) {
  return countBy(bookFinishes(data, p), (f) => f.book.genres);
}

export interface DayActivity {
  sessions: number;
  pages: number;
  finished: number;
  episodes: number;
  viewings: number;
}
const blank = (): DayActivity => ({ sessions: 0, pages: 0, finished: 0, episodes: 0, viewings: 0 });

/** Day → what was actually recorded that day. */
export function activityByDay(data: AppData): Map<string, DayActivity> {
  const m = new Map<string, DayActivity>();
  const get = (d: string) => {
    let x = m.get(d);
    if (!x) m.set(d, (x = blank()));
    return x;
  };
  for (const s of data.sessions) {
    const a = get(s.date);
    a.sessions++;
    a.pages += s.pagesRead ?? 0;
  }
  for (const f of bookFinishes(data)) get(f.day).finished++;
  for (const md of data.media) {
    for (const e of md.episodes) if (e.watchedAt) get(e.watchedAt).episodes++;
    for (const v of md.viewings) get(v.date).viewings++;
  }
  return m;
}
export function readingDays(data: AppData): Set<string> {
  const days = new Set<string>();
  for (const s of data.sessions) days.add(s.date);
  for (const f of bookFinishes(data)) days.add(f.day);
  return days;
}
export function viewingDays(data: AppData): Set<string> {
  const days = new Set<string>();
  for (const md of data.media) {
    for (const e of md.episodes) if (e.watchedAt) days.add(e.watchedAt);
    for (const v of md.viewings) days.add(v.date);
  }
  return days;
}

export function streaks(days: Set<string>, now: string = today()): { current: number; longest: number } {
  if (!days.size) return { current: 0, longest: 0 };
  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (daysBetween(sorted[i - 1], sorted[i]) === 1) run++;
    else run = 1;
    if (run > longest) longest = run;
  }
  let cursor = days.has(now) ? now : days.has(addDays(now, -1)) ? addDays(now, -1) : undefined;
  let current = 0;
  while (cursor && days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

/* ------------------------------------------------------------- viewing */

export interface Viewing {
  media: Media;
  day: string;
}
export function filmViewings(data: AppData, p: Period): Viewing[] {
  const out: Viewing[] = [];
  for (const m of data.media) for (const v of m.viewings) if (inPeriod(v.date, p)) out.push({ media: m, day: v.date });
  return out;
}
export function moviesWatched(data: AppData, p: Period): { distinct: number; rewatches: number; viewings: number } {
  const v = filmViewings(data, p);
  const distinct = new Set(v.map((x) => x.media.id)).size;
  return { distinct, rewatches: v.length - distinct, viewings: v.length };
}
export function episodesWatched(data: AppData, p: Period): { dated: number; undated: number } {
  let dated = 0;
  let undated = 0;
  for (const m of data.media) {
    for (const e of m.episodes) {
      if (e.watchedAt) {
        if (inPeriod(e.watchedAt, p)) dated++;
      } else if (p.kind === 'all') undated++;
    }
  }
  return { dated, undated };
}
export function seriesCompleted(data: AppData, p: Period): Media[] {
  return data.media.filter((m) => isSeries(m) && m.status === 'completed' && (p.kind === 'all' ? true : inPeriod(m.finishedAt, p)));
}
/** Minutes watched where a runtime is known, plus how many watches had to be left out. */
export function timeWatched(data: AppData, p: Period): { minutes: number; excluded: number } {
  let minutes = 0;
  let excluded = 0;
  for (const m of data.media) {
    if (m.format === 'movie') {
      const n = m.viewings.filter((v) => inPeriod(v.date, p)).length;
      if (!n) continue;
      if (m.runtime) minutes += n * m.runtime;
      else excluded += n;
    } else {
      const n = m.episodes.filter((e) => (e.watchedAt ? inPeriod(e.watchedAt, p) : p.kind === 'all')).length;
      if (!n) continue;
      if (m.runtime) minutes += n * m.runtime;
      else excluded += n;
    }
  }
  return { minutes, excluded };
}
/** Titles finished or watched in the period, for genre breakdowns. */
export function watchedTitles(data: AppData, p: Period): Media[] {
  const seen = new Set<string>();
  const out: Media[] = [];
  for (const m of data.media) {
    const hit = m.format === 'movie' ? m.viewings.some((v) => inPeriod(v.date, p)) : m.status === 'completed' && (p.kind === 'all' || inPeriod(m.finishedAt, p));
    if (hit && !seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}
export function mediaGenreCounts(data: AppData, p: Period) {
  return countBy(watchedTitles(data, p), (m) => m.genres);
}
export const KIND_ORDER: MediaKind[] = ['anime', 'kdrama', 'tv', 'movie'];
/** Completed titles and episodes by kind: anime vs K-drama vs other TV vs films. */
export function kindBreakdown(data: AppData, p: Period): { kind: MediaKind; titles: number; episodes: number }[] {
  return KIND_ORDER.map((kind) => {
    const items = data.media.filter((m) => m.kind === kind);
    const titles = watchedTitles({ ...data, media: items }, p).length;
    let episodes = 0;
    for (const m of items) for (const e of m.episodes) if (e.watchedAt ? inPeriod(e.watchedAt, p) : p.kind === 'all') episodes++;
    return { kind, titles, episodes };
  });
}

/* ------------------------------------------------------------ combined */

export interface MonthRow {
  key: string;
  label: string;
  books: number;
  pages: number;
  sessions: number;
  movies: number;
  episodes: number;
  series: number;
}
const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthlyRows(data: AppData, year: number): MonthRow[] {
  return monthsOfYear(year).map((key, i) => {
    const p: Period = { kind: 'month', key };
    return {
      key,
      label: MONTH_LABEL[i],
      books: bookFinishes(data, p).length,
      pages: pagesLogged(data, p),
      sessions: sessionsIn(data, p).length,
      movies: moviesWatched(data, p).distinct,
      episodes: episodesWatched(data, p).dated,
      series: seriesCompleted(data, p).length,
    };
  });
}

export function yearsWithData(data: AppData): number[] {
  const ys = new Set<number>([yearOf(today())]);
  for (const f of bookFinishes(data)) ys.add(yearOf(f.day));
  for (const s of data.sessions) ys.add(yearOf(s.date));
  for (const m of data.media) {
    for (const v of m.viewings) ys.add(yearOf(v.date));
    for (const e of m.episodes) if (e.watchedAt) ys.add(yearOf(e.watchedAt));
    if (m.finishedAt) ys.add(yearOf(m.finishedAt));
  }
  return [...ys].sort((a, b) => b - a);
}

export interface Recap {
  year: number;
  books: number;
  pages: number;
  sessions: number;
  movies: number;
  rewatches: number;
  episodes: number;
  seriesCompleted: number;
  minutesWatched: number;
  minutesExcluded: number;
  avgBookRating?: number;
  avgScreenRating?: number;
  longestBook?: BookFinish;
  topBook?: BookFinish;
  topScreen?: Media;
  topBookGenre?: string;
  topScreenGenre?: string;
  busiestMonth?: { label: string; total: number };
  longestStreak: number;
}
export function yearlyRecap(data: AppData, year: number): Recap {
  const p: Period = { kind: 'year', year };
  const finishes = bookFinishes(data, p);
  const mw = moviesWatched(data, p);
  const rows = monthlyRows(data, year);
  const busiest = rows.map((r) => ({ label: r.label, total: r.books + r.movies + r.episodes + r.sessions })).sort((a, b) => b.total - a.total)[0];
  const tw = timeWatched(data, p);
  const rated = finishes.filter((f) => f.rating !== undefined).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const titles = watchedTitles(data, p);
  const ratedScreen = titles.filter((m) => m.rating !== undefined).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const yearDays = new Set([...readingDays(data), ...viewingDays(data)].filter((d) => yearOf(d) === year));
  return {
    year,
    books: finishes.length,
    pages: pagesLogged(data, p),
    sessions: sessionsIn(data, p).length,
    movies: mw.distinct,
    rewatches: mw.rewatches,
    episodes: episodesWatched(data, p).dated,
    seriesCompleted: seriesCompleted(data, p).length,
    minutesWatched: tw.minutes,
    minutesExcluded: tw.excluded,
    avgBookRating: averageRating(finishes),
    avgScreenRating: averageRating(titles),
    longestBook: [...finishes].filter((f) => f.book.pages).sort((a, b) => (b.book.pages ?? 0) - (a.book.pages ?? 0))[0],
    topBook: rated[0],
    topScreen: ratedScreen[0],
    topBookGenre: bookGenreCounts(data, p)[0]?.label,
    topScreenGenre: mediaGenreCounts(data, p)[0]?.label,
    busiestMonth: busiest && busiest.total > 0 ? busiest : undefined,
    longestStreak: streaks(yearDays, `${year}-12-31`).longest,
  };
}

/* --------------------------------------------------------------- goals */

export function goalProgress(data: AppData, g: Goal): { current: number; target: number; pct: number } {
  const p: Period = g.scope === 'year' ? { kind: 'year', year: Number(g.period) } : { kind: 'month', key: g.period };
  let current = 0;
  if (g.metric === 'books') current = bookFinishes(data, p).length;
  else if (g.metric === 'pages') current = pagesLogged(data, p);
  else if (g.metric === 'movies') current = moviesWatched(data, p).distinct;
  else current = episodesWatched(data, p).dated;
  return { current, target: g.target, pct: Math.min(100, Math.round((current / g.target) * 100)) };
}
