import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { Book } from '../types';
import { BOOK_STATUS_LABEL } from '../types';
import { percentRead, spineColor, spineGeometry, spineHasCustomColor, type SpineGeometry } from '../lib/books';
import { sampleCoverColor } from '../lib/cover';
import { getStore } from '../lib/store';
import { BookObject } from './BookObject';
import { Icon } from './Icon';
import { useMotion } from './common';

const GAP = 4;
const PAD = 28;
const WINDOW_AFTER = 70; // rows with more books than this render only the books near the viewport
const WAVE_AMPLITUDE = 7; // px
const MAX_IDLE_BOOKS = 80; // idle bobbing is skipped on very large rows

interface SlotProps {
  book: Book;
  geometry: SpineGeometry;
  index: number;
  pulled: boolean;
  tabbable: boolean;
  onOpen: (book: Book, rect: DOMRect) => void;
  onKey: (e: KeyboardEvent, index: number) => void;
}

const SpineSlot = memo(function SpineSlot({ book, geometry, index, pulled, tabbable, onOpen, onKey }: SlotProps) {
  const pct = percentRead(book);
  const label = `${book.title} by ${book.author}. ${BOOK_STATUS_LABEL[book.status]}${book.status === 'reading' ? `, ${pct}% read` : ''}${book.rating ? `, rated ${book.rating} of 5` : ''}`;
  return (
    <div className={`slot ${pulled ? 'is-pulled' : ''}`} data-slot data-i={index} style={{ '--i': index, '--w': `${geometry.width}px`, '--h': `${geometry.height}px`, '--d': `${geometry.depth}px` } as CSSProperties}>
      <span className="slot-gap" aria-hidden="true" />
      <span className="slot-shadow" aria-hidden="true" />
      <button
        type="button"
        className="book-btn"
        data-testid="spine"
        data-book-id={book.id}
        data-status={book.status}
        aria-label={label}
        title={`${book.title} — ${book.author}`}
        tabIndex={tabbable ? 0 : -1}
        onKeyDown={(e) => onKey(e, index)}
        onClick={(e) => onOpen(book, e.currentTarget.parentElement!.getBoundingClientRect())}
      />
      <div className="book-stage" aria-hidden="true">
        <BookObject book={book} geometry={geometry} className="is-shelf" />
      </div>
    </div>
  );
});

export interface ShelfRowProps {
  id: string;
  title: string;
  subtitle?: string;
  books: Book[];
  pulledId?: string;
  onOpen: (book: Book, rect: DOMRect) => void;
  emptyText?: string;
  actions?: ReactNode;
  revealId?: string;
}

export function ShelfRow({ id, title, subtitle, books, pulledId, onOpen, emptyText, actions, revealId }: ShelfRowProps) {
  const motion = useMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<[number, number]>([0, Math.min(books.length, WINDOW_AFTER)]);
  const [focusIdx, setFocusIdx] = useState(0);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const [entered, setEntered] = useState(false);
  const [rising, setRising] = useState(false);
  const [live, setLive] = useState(false);

  const geoms = useMemo(() => books.map(spineGeometry), [books]);
  const lefts = useMemo(() => {
    const out: number[] = [];
    let x = PAD;
    for (const g of geoms) {
      out.push(x);
      x += g.width + GAP;
    }
    return { lefts: out, total: x + PAD };
  }, [geoms]);
  const windowed = books.length > WINDOW_AFTER;

  /* ---- windowing + edge arrows ---- */
  const syncRange = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < lefts.total - 4);
    if (!windowed) return;
    const buffer = el.clientWidth;
    const from = el.scrollLeft - buffer;
    const to = el.scrollLeft + el.clientWidth + buffer;
    let s = 0;
    while (s < books.length && lefts.lefts[s] + geoms[s].width < from) s++;
    let e = s;
    while (e < books.length && lefts.lefts[e] < to) e++;
    setRange((r) => (r[0] === s && r[1] === e ? r : [s, e]));
  }, [windowed, books.length, lefts, geoms]);

  useLayoutEffect(() => {
    syncRange();
  }, [syncRange]);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(syncRange);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncRange]);

  /* ---- browsing motion: the staggered rise-and-fall wave while scrolling ---- */
  const wave = useRef({ amp: 0, raf: 0, last: 0, t: 0 });
  const runWave = useCallback(() => {
    const w = wave.current;
    if (w.raf) return;
    const tick = (now: number) => {
      const el = scrollerRef.current;
      const track = trackRef.current;
      if (!el || !track) {
        w.raf = 0;
        return;
      }
      const dt = Math.min(48, now - (w.t || now));
      w.t = now;
      w.amp *= Math.pow(0.9, dt / 16);
      const x = el.scrollLeft;
      const quiet = w.amp < 0.02;
      const slots = track.querySelectorAll<HTMLElement>('[data-slot]');
      slots.forEach((s) => {
        const i = Number(s.dataset.i);
        s.style.setProperty('--wave', quiet ? '0px' : `${(w.amp * WAVE_AMPLITUDE * Math.sin(x / 90 - i * 0.8)).toFixed(2)}px`);
      });
      if (quiet) {
        w.amp = 0;
        w.raf = 0;
        w.t = 0;
        return;
      }
      w.raf = requestAnimationFrame(tick);
    };
    w.raf = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => cancelAnimationFrame(wave.current.raf), []);

  const rafSync = useRef(0);
  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const w = wave.current;
    const dx = Math.abs(el.scrollLeft - w.last);
    w.last = el.scrollLeft;
    if (motion) {
      w.amp = Math.min(1, w.amp + Math.min(0.5, dx / 80));
      runWave();
    }
    if (!rafSync.current) rafSync.current = requestAnimationFrame(() => {
      rafSync.current = 0;
      syncRange();
    });
  }, [motion, runWave, syncRange]);

  /* ---- first appearance: books settle onto the shelf in a short stagger ---- */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setEntered(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        setLive(en.isIntersecting);
        if (en.isIntersecting && !entered) {
          setEntered(true);
          if (motion) {
            setRising(true);
            setTimeout(() => setRising(false), 1400);
          }
        }
      }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, [entered, motion]);

  /* ---- sample cover colours for visible books ---- */
  useEffect(() => {
    let cancelled = false;
    for (let i = range[0]; i < Math.min(range[1], books.length); i++) {
      const b = books[i];
      if (b.coverUrl && !b.autoColor && !spineHasCustomColor(b)) {
        void sampleCoverColor(b.coverUrl).then((c) => {
          if (c && !cancelled) getStore().setAutoColor(b.id, c);
        });
      }
    }
    return () => {
      cancelled = true;
    };
  }, [books, range]);

  /* ---- navigation ---- */
  const scrollToIndex = useCallback((i: number, smooth = true) => {
    const el = scrollerRef.current;
    if (!el || !geoms[i]) return;
    const target = lefts.lefts[i] + geoms[i].width / 2 - el.clientWidth / 2;
    el.scrollTo({ left: Math.max(0, target), behavior: smooth && motion ? 'smooth' : 'auto' });
  }, [geoms, lefts, motion]);

  useEffect(() => {
    if (!revealId) return;
    const i = books.findIndex((b) => b.id === revealId);
    if (i >= 0) {
      scrollToIndex(i, false);
      setFocusIdx(i);
    }
    // only when the revealed book changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealId]);

  const page = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: motion ? 'smooth' : 'auto' });
  };

  const focusSlot = (i: number) => {
    setFocusIdx(i);
    scrollToIndex(i);
    let tries = 0;
    const attempt = () => {
      const btn = trackRef.current?.querySelector<HTMLElement>(`[data-slot][data-i="${i}"] .book-btn`);
      if (btn) btn.focus({ preventScroll: true });
      else if (tries++ < 12) requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  };
  const onKey = useCallback((e: KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = Math.min(books.length - 1, index + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = books.length - 1;
    else return;
    e.preventDefault();
    if (next !== index) focusSlot(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [books.length, scrollToIndex]);

  /* ---- mouse drag-to-scroll on the shelf background ---- */
  const drag = useRef<{ x: number; left: number; id: number } | null>(null);
  const onPointerDown = (e: RPointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || (e.target as HTMLElement).closest('.book-btn')) return;
    const el = scrollerRef.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, id: e.pointerId };
    el.setPointerCapture?.(e.pointerId);
    el.classList.add('is-dragging');
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (d && scrollerRef.current) scrollerRef.current.scrollLeft = d.left - (e.clientX - d.x);
  };
  const endDrag = () => {
    drag.current = null;
    scrollerRef.current?.classList.remove('is-dragging');
  };

  const [start, end] = windowed ? range : [0, books.length];
  const slots: ReactNode[] = [];
  for (let i = start; i < end && i < books.length; i++) {
    const b = books[i];
    slots.push(<SpineSlot key={b.id} book={b} geometry={geoms[i]} index={i} pulled={pulledId === b.id} tabbable={i === focusIdx} onOpen={onOpen} onKey={onKey} />);
  }
  const leadWidth = windowed && start > 0 ? lefts.lefts[start] - PAD : 0;
  const tailWidth = windowed && end < books.length ? lefts.total - PAD - (lefts.lefts[end - 1] + geoms[end - 1].width + GAP) : 0;

  return (
    <section ref={sectionRef} className={`shelf ${entered ? 'is-seen' : ''} ${rising ? 'is-rising' : ''} ${live && books.length <= MAX_IDLE_BOOKS ? 'is-live' : ''}`} aria-label={`${title}, ${books.length} ${books.length === 1 ? 'book' : 'books'}`} data-shelf-id={id}>
      <header className="shelf-head">
        <h3 className="shelf-name">{title}</h3>
        <span className="shelf-count">{books.length} {books.length === 1 ? 'volume' : 'volumes'}</span>
        {subtitle && <span className="shelf-sub">{subtitle}</span>}
        <span className="shelf-actions">{actions}</span>
      </header>
      <div className="shelf-case">
        <div className="shelf-wall" aria-hidden="true" />
        {books.length > 0 ? (
          <>
            <div
              ref={scrollerRef}
              className="shelf-scroller"
              onScroll={onScroll}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              role="group"
              aria-label={`${title} — use the arrow keys to move between books`}
            >
              <div ref={trackRef} className="shelf-track" style={{ width: windowed ? lefts.total : undefined }}>
                {leadWidth > 0 && <span style={{ flex: `0 0 ${leadWidth}px` }} aria-hidden="true" />}
                {slots}
                {tailWidth > 0 && <span style={{ flex: `0 0 ${tailWidth}px` }} aria-hidden="true" />}
              </div>
            </div>
            <button type="button" className="shelf-arrow left" onClick={() => page(-1)} disabled={!canLeft} aria-label={`Scroll ${title} left`}><Icon name="chevL" /></button>
            <button type="button" className="shelf-arrow right" onClick={() => page(1)} disabled={!canRight} aria-label={`Scroll ${title} right`}><Icon name="chevR" /></button>
          </>
        ) : (
          <div className="shelf-empty">
            <div className="ghosts" aria-hidden="true">
              {[150, 190, 168, 205, 176, 158].map((h, i) => <span key={i} style={{ height: h, width: 24 + ((i * 7) % 14) }} />)}
            </div>
            <p>{emptyText ?? 'This shelf is waiting for its first book.'}</p>
          </div>
        )}
        <div className="shelf-board" aria-hidden="true" />
      </div>
    </section>
  );
}

export { spineColor };
