import type { CSSProperties } from 'react';
import type { Book } from '../types';
import { percentRead, spineColor, spineGeometry, type SpineGeometry } from '../lib/books';
import { inkOn, shade } from '../lib/color';
import { BookCover } from './common';

/** Spines usually carry a surname, not a full name; long author names are shortened the same way. */
export function spineAuthor(author: string): string {
  const a = author.trim();
  if (a.length <= 10) return a;
  const parts = a.split(/[\s,]+/).filter(Boolean);
  return parts[parts.length - 1] ?? a;
}

export interface SpineText {
  fs: number; // title font size, px (unscaled)
  titleLen: number; // vertical length available to the title, px (unscaled)
  author: string;
}

/** Fits the title onto the spine: wraps to a second column on thicker books before shrinking the type. */
export function spineText(book: Pick<Book, 'title' | 'author'>, width: number, height: number): SpineText {
  const author = spineAuthor(book.author);
  const showAuthor = width >= 30;
  const base = Math.max(10, Math.min(18, width * 0.38));
  const fsAuthor = Math.max(8, base * 0.58);
  const authorLen = showAuthor ? Math.min(height * 0.3, author.length * fsAuthor * 0.92 + 6) : 0;
  const titleLen = Math.max(60, height - 92 - authorLen);
  const chars = Math.max(1, book.title.length);
  const perChar = 0.56; // average serif advance in em
  let fs = base;
  const fits = (f: number, lines: number) => (chars * perChar * f) / lines <= titleLen && lines * f * 1.1 <= width - 8;
  if (!fits(fs, 1)) {
    // try shrinking a little on one line, then two columns, then shrink further
    const one = Math.min(base, titleLen / (chars * perChar));
    if (one >= base * 0.78) fs = one;
    else if (width >= 38) fs = Math.max(9, Math.min(base * 0.9, ((titleLen * 2) / (chars * perChar)) * 0.96, (width - 8) / 2.2));
    else fs = Math.max(8.5, one);
  }
  return { fs, titleLen, author };
}

export function bookVars(book: Book, g: SpineGeometry, scale = 1): CSSProperties {
  const color = spineColor(book);
  const txt = spineText(book, g.width, g.height);
  const pct = book.status === 'reading' ? percentRead(book) : 0;
  return {
    '--w': `${g.width * scale}px`,
    '--h': `${g.height * scale}px`,
    '--d': `${g.depth * scale}px`,
    '--u': `${scale}`,
    '--fs': `${txt.fs * scale}px`,
    '--tl': `${txt.titleLen * scale}px`,
    '--spine': color,
    '--spine-dark': shade(color, -0.42),
    '--spine-light': shade(color, 0.2),
    '--spine-ink': inkOn(color),
    '--gilt': inkOn(color) === '#f7efdc' ? '#d9b866' : '#7a5a1c',
    '--p': `${pct}%`,
  } as CSSProperties;
}

const STATUS_MARK: Record<Book['status'], string> = { want: '', reading: 'reading', completed: 'done', hold: 'hold', abandoned: 'dropped' };

export function SpineArt({ book, showAuthor = true, g }: { book: Book; showAuthor?: boolean; g: SpineGeometry }) {
  const author = spineText(book, g.width, g.height).author;
  const mark = STATUS_MARK[book.status];
  return (
    <span className="spine-art">
      <span className="sp-band" />
      <span className="sp-title">{book.title}</span>
      {mark === 'done' && <span className="sp-seal" aria-hidden="true">★</span>}
      {showAuthor && <span className="sp-author">{author}</span>}
      <span className="sp-band" />
      {book.status === 'reading' && <span className="sp-progress" aria-hidden="true" />}
    </span>
  );
}

/**
 * A hardcover book as a real 3D box: spine (front), front cover (right side), back cover, page block
 * (fore-edge, top and bottom). The same markup is used at shelf size and at pull-out size; only the
 * CSS variables differ.
 */
export function BookObject({ book, geometry, scale = 1, className = '' }: { book: Book; geometry?: SpineGeometry; scale?: number; className?: string }) {
  const g = geometry ?? spineGeometry(book);
  const mark = STATUS_MARK[book.status];
  return (
    <div className={`book3d ${className}`} data-status={mark} style={bookVars(book, g, scale)}>
      <span className="face f-spine"><SpineArt book={book} showAuthor={g.width >= 30} g={g} /></span>
      <span className="face f-cover"><BookCover book={book} /><span className="cover-hinge" /><span className="cover-sheen" /></span>
      <span className="face f-backcover" />
      <span className="face f-foredge" />
      <span className="face f-top" />
      <span className="face f-bottom" />
      {book.status === 'reading' && <span className="ribbon" aria-hidden="true" />}
    </div>
  );
}
