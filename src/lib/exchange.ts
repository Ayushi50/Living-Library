// JSON / CSV export and validated JSON import.
import type { AppData, Book, Media } from '../types';
import { SCHEMA_VERSION } from '../types';
import { normalizeData } from './normalize';
import { totalEpisodes, watchedCount } from './media';

export function exportJson(data: AppData): string {
  const { tmdbKey: _secret, ...prefs } = data.prefs; // never export a personal API key
  return JSON.stringify({ app: 'living-library', exportedAt: new Date().toISOString(), ...data, prefs, version: SCHEMA_VERSION }, null, 2);
}

export type ParsedImport = { ok: true; data: AppData; skipped: string[]; counts: { books: number; media: number; sessions: number; journal: number; shelves: number; goals: number } } | { ok: false; error: string };

export function parseImport(text: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file isn’t valid JSON. Choose a file exported from The Living Library.' };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'This doesn’t look like a Living Library export (expected an object).' };
  const r = raw as Record<string, unknown>;
  const known = ['books', 'media', 'sessions', 'journal', 'shelves', 'goals'];
  if (!known.some((k) => Array.isArray(r[k]))) return { ok: false, error: 'No books, titles, sessions or journal entries were found in this file.' };
  if (typeof r.version === 'number' && r.version > SCHEMA_VERSION) return { ok: false, error: `This file is from a newer version of the app (schema ${r.version}). Update the app and try again.` };
  const { data, skipped } = normalizeData(raw);
  return { ok: true, data, skipped, counts: { books: data.books.length, media: data.media.length, sessions: data.sessions.length, journal: data.journal.length, shelves: data.shelves.length, goals: data.goals.length } };
}

/** RFC 4180 quoting, plus a leading apostrophe on formula-looking cells so spreadsheets don't execute them. */
export function csvCell(v: unknown): string {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (head: string[], rows: unknown[][]) => [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function booksCsv(data: AppData): string {
  const shelf = (b: Book) => b.shelfIds.map((id) => data.shelves.find((s) => s.id === id)?.name).filter(Boolean).join('; ');
  return toCsv(
    ['Title', 'Author', 'Status', 'Format', 'Pages', 'Current page', 'Progress unit', 'Rating', 'Genres', 'Tags', 'Shelves', 'ISBN', 'Publisher', 'Year', 'Started', 'Finished', 'Times finished', 'Review', 'Added'],
    data.books.map((b) => [
      b.title, b.author, b.status, b.format, b.pages, b.currentPage, b.progressUnit, b.rating, b.genres.join('; '), b.tags.join('; '), shelf(b), b.isbn, b.publisher, b.year,
      b.runs[b.runs.length - 1]?.startedAt, b.runs.filter((r) => r.outcome === 'completed').map((r) => r.finishedAt).filter(Boolean).pop(), b.runs.filter((r) => r.outcome === 'completed').length, b.review, b.addedAt.slice(0, 10),
    ]),
  );
}
export function mediaCsv(data: AppData): string {
  return toCsv(
    ['Title', 'Type', 'Format', 'Year', 'Status', 'Rating', 'Seasons', 'Episodes released', 'Episodes watched', 'Airing', 'Viewings', 'Runtime (min)', 'Genres', 'Tags', 'Country', 'Started', 'Finished', 'Review', 'Added'],
    data.media.map((m: Media) => [
      m.title, m.kind, m.format, m.year, m.status, m.rating, m.seasons.length || '', m.format === 'series' ? totalEpisodes(m) : '', m.format === 'series' ? watchedCount(m) : '', m.format === 'series' ? m.airing : '', m.viewings.length || '',
      m.runtime, m.genres.join('; '), m.tags.join('; '), m.country, m.startedAt, m.finishedAt, m.review, m.addedAt.slice(0, 10),
    ]),
  );
}

export function download(filename: string, text: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([mime.startsWith('text/csv') ? '﻿' + text : text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
