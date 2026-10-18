import type { AppData, Book, ReadingRun } from '../types';
import { hashString, spineColorFor } from './color';

export function currentRun(book: Book): ReadingRun | undefined {
  for (let i = book.runs.length - 1; i >= 0; i--) if (book.runs[i].outcome === 'reading') return book.runs[i];
  return undefined;
}
export function latestRun(book: Book): ReadingRun | undefined {
  return book.runs[book.runs.length - 1];
}
export function completedRuns(book: Book): ReadingRun[] {
  return book.runs.filter((r) => r.outcome === 'completed' && r.finishedAt);
}

/** Total units for progress: pages, or chapters when tracking by chapter. */
export function progressTotal(book: Book): number | undefined {
  const t = book.progressUnit === 'chapter' ? book.totalChapters : book.pages;
  return t && t > 0 ? t : undefined;
}
/** Reading percentage 0..100 for the active run. Completed books are 100 when viewed as finished. */
export function percentRead(book: Book): number {
  if (book.status === 'completed') return 100;
  const total = progressTotal(book);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((book.currentPage / total) * 100)));
}
export function isAtEnd(book: Book): boolean {
  const total = progressTotal(book);
  return !!total && book.currentPage >= total;
}

export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export function findDuplicateBook(data: AppData, candidate: Pick<Book, 'title' | 'author' | 'isbn'>, ignoreId?: string): Book | undefined {
  const isbn = candidate.isbn?.replace(/[^0-9Xx]/g, '');
  const tk = normalizeKey(candidate.title);
  const ak = normalizeKey(candidate.author);
  return data.books.find((b) => {
    if (b.id === ignoreId) return false;
    const bi = b.isbn?.replace(/[^0-9Xx]/g, '');
    if (isbn && bi && isbn === bi) return true;
    return normalizeKey(b.title) === tk && normalizeKey(b.author) === ak;
  });
}

/* ------------------------------------------------------- spine geometry */

export interface SpineGeometry {
  width: number; // spine thickness in px
  height: number; // book height in px
  depth: number; // front-to-back size in px (cover width)
  hasEstimatedPages: boolean;
}

/**
 * Proportions come from the book's own data. Thickness follows page count (or a modest default when
 * unknown), height follows binding words in the edition and a small deterministic jitter so that
 * shelves never look cloned.
 */
export function spineGeometry(book: Book): SpineGeometry {
  const h = hashString(book.id || book.title);
  const known = book.pages && book.pages > 0 ? book.pages : undefined;
  const pages = known ?? 280;
  const width = Math.round(Math.max(24, Math.min(80, 20 + Math.sqrt(pages) * 3.1 + ((h >> 3) % 5))));
  const ed = (book.edition ?? '').toLowerCase();
  let height = 214;
  if (/mass market|pocket|paperback|pb\b/.test(ed)) height = 196;
  if (/hardcover|hardback|hb\b|first edition|collector|deluxe/.test(ed)) height = 232;
  if (pages > 700) height += 12;
  if (pages < 160) height -= 14;
  height += (h % 15) - 7;
  const depth = Math.round(height * (0.64 + ((h >> 5) % 6) / 100));
  return { width, height: Math.round(height), depth, hasEstimatedPages: !known };
}

export function spineColor(book: Book): string {
  return book.spineColor || book.autoColor || spineColorFor(book.title + book.author);
}
export function spineHasCustomColor(book: Book): boolean {
  return !!book.spineColor;
}
