import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import type { Book, BookStatus } from '../types';
import { BOOK_FORMAT_LABEL, BOOK_STATUS_LABEL, BOOK_STATUS_ORDER } from '../types';
import { currentRun, isAtEnd, percentRead, progressTotal, spineColor, spineGeometry } from '../lib/books';
import { formatDay, relativeDay, today } from '../lib/dates';
import { getStore, useData } from '../lib/store';
import { confirmAction, goBack, toast } from '../lib/ui';
import { BookForm } from './BookForm';
import { BookObject } from './BookObject';
import { Icon } from './Icon';
import { JournalComposer } from './JournalComposer';
import { ProgressBar, Rating, useMotion } from './common';

/* ------------------------------------------------ where the book came from */

export interface BookOrigin {
  id: string;
  rect: DOMRect;
  kind: 'spine' | 'cover';
}
let pendingOrigin: BookOrigin | undefined;
export function setBookOrigin(o: BookOrigin) {
  pendingOrigin = o;
}
function takeOrigin(id: string): BookOrigin | undefined {
  const o = pendingOrigin?.id === id ? pendingOrigin : undefined;
  pendingOrigin = undefined;
  return o;
}
/** The live position of a book's slot on the shelf (or gallery card), used as the return target. */
function liveOrigin(id: string): BookOrigin | undefined {
  const slot = document.querySelector<HTMLElement>(`[data-slot] [data-book-id="${CSS.escape(id)}"]`)?.parentElement;
  if (slot) return { id, rect: slot.getBoundingClientRect(), kind: 'spine' };
  const card = document.querySelector<HTMLElement>(`[data-gallery-id="${CSS.escape(id)}"] .gallery-cover`);
  if (card) return { id, rect: card.getBoundingClientRect(), kind: 'cover' };
  return undefined;
}

const REST_ANGLE = -68; // deg: the cover faces the reader with a sliver of spine showing

function useStageScale(book: Book) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return useMemo(() => {
    const g = spineGeometry(book);
    const narrow = size.w < 900;
    const targetH = narrow ? Math.max(210, Math.min(300, size.h * 0.32)) : Math.max(290, Math.min(470, size.h * 0.56));
    const maxCoverW = narrow ? size.w - 96 : Math.min(size.w * 0.36, 460);
    const scale = Math.max(1, Math.min(targetH / g.height, maxCoverW / g.depth));
    return { geometry: g, scale, stageH: g.height * scale + (narrow ? 40 : 90) };
  }, [book.id, book.pages, book.edition, size.w, size.h]);
}

export function BookDetail({ bookId }: { bookId: string }) {
  const data = useData();
  const book = data.books.find((b) => b.id === bookId);
  const motion = useMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  const [editing, setEditing] = useState(false);
  const geo = useStageScale(book ?? ({ id: bookId, title: '', author: '' } as Book));

  const originFor = useCallback((): BookOrigin | undefined => liveOrigin(bookId), [bookId]);

  /* ---- open: the book slides out of its slot and turns to face the reader ---- */
  useLayoutEffect(() => {
    const el = bookRef.current;
    const stage = stageRef.current;
    const scrim = scrimRef.current;
    if (!el || !stage || !book) return;
    const origin = takeOrigin(bookId) ?? originFor();
    if (scrim) scrim.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: motion ? 320 : 1, easing: 'ease-out' });
    if (!motion || !origin || !el.animate) {
      el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 1 });
      return;
    }
    const sr = stage.getBoundingClientRect();
    const cx = sr.left + sr.width / 2;
    const cy = sr.top + sr.height / 2;
    const ox = origin.rect.left + origin.rect.width / 2;
    const oy = origin.rect.top + origin.rect.height / 2;
    const bigH = geo.geometry.height * geo.scale;
    const k = Math.max(0.05, origin.rect.height / bigH);
    const dx = ox - cx;
    const dy = oy - cy;
    const startAngle = origin.kind === 'spine' ? 0 : REST_ANGLE;
    el.animate(
      [
        { transform: `translate3d(${dx}px, ${dy}px, 0px) scale(${k}) rotateY(${startAngle}deg)`, offset: 0 },
        { transform: `translate3d(${dx * 0.55}px, ${dy * 0.55 - 36}px, ${origin.kind === 'spine' ? 190 : 60}px) scale(${(1 + k) / 2}) rotateY(${startAngle * 0.5 + REST_ANGLE * 0.5}deg)`, offset: 0.4 },
        { transform: `translate3d(0px, 0px, 0px) scale(1) rotateY(${REST_ANGLE}deg)`, offset: 1 },
      ],
      { duration: 760, easing: 'cubic-bezier(.22,.8,.24,1)' },
    );
    // run once for this book
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, !!book]);

  /* ---- close: the book returns to its place on the shelf ---- */
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const el = bookRef.current;
    const stage = stageRef.current;
    const scrim = scrimRef.current;
    const finish = () => goBack('/library');
    const origin = originFor();
    if (!motion || !el || !stage || !el.animate || !origin) {
      scrim?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: motion ? 180 : 1, fill: 'forwards' });
      setTimeout(finish, motion ? 170 : 0);
      return;
    }
    const sr = stage.getBoundingClientRect();
    const dx = origin.rect.left + origin.rect.width / 2 - (sr.left + sr.width / 2);
    const dy = origin.rect.top + origin.rect.height / 2 - (sr.top + sr.height / 2);
    const k = Math.max(0.05, origin.rect.height / (geo.geometry.height * geo.scale));
    const endAngle = origin.kind === 'spine' ? 0 : REST_ANGLE;
    scrim?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 480, delay: 160, fill: 'forwards', easing: 'ease-in' });
    stage.parentElement?.querySelector('.detail-record')?.animate?.([{ opacity: 1 }, { opacity: 0, transform: 'translateX(24px)' }], { duration: 200, fill: 'forwards' });
    const anim = el.animate(
      [
        { transform: `translate3d(0px, 0px, 0px) scale(1) rotateY(${REST_ANGLE}deg)`, offset: 0 },
        { transform: `translate3d(${dx * 0.45}px, ${dy * 0.45 - 30}px, 150px) scale(${(1 + k) / 2}) rotateY(${REST_ANGLE * 0.4}deg)`, offset: 0.55 },
        { transform: `translate3d(${dx}px, ${dy}px, 0px) scale(${k}) rotateY(${endAngle}deg)`, offset: 1 },
      ],
      { duration: 560, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' },
    );
    anim.onfinish = finish;
    anim.oncancel = finish;
  }, [geo, motion, originFor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing && !document.querySelector('.modal-scrim')) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, editing]);
  useEffect(() => {
    document.body.classList.add('is-locked');
    return () => document.body.classList.remove('is-locked');
  }, []);

  /* pointer tilt on the stage */
  const onStageMove = (e: RPointerEvent) => {
    if (!motion || e.pointerType !== 'mouse' || closingRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    const el = bookRef.current;
    if (el) {
      el.style.setProperty('--ty', `${(px * 14).toFixed(2)}deg`);
      el.style.setProperty('--tx', `${(-py * 8).toFixed(2)}deg`);
    }
  };
  const onStageLeave = () => {
    bookRef.current?.style.setProperty('--ty', '0deg');
    bookRef.current?.style.setProperty('--tx', '0deg');
  };

  if (!book) {
    return (
      <div className="detail-scrim" role="dialog" aria-modal="true" aria-label="Book not found">
        <div className="detail detail-missing">
          <h2>That book is no longer in your library.</h2>
          <button className="btn btn-primary" onClick={() => goBack('/library')}>Back to the shelf</button>
        </div>
      </div>
    );
  }

  const color = spineColor(book);
  return (
    <div ref={scrimRef} className="detail-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()} style={{ '--book-tint': color } as CSSProperties}>
      <article className="detail" role="dialog" aria-modal="true" aria-label={`${book.title}, book record`} data-testid="book-detail">
        <button className="icon-btn detail-close" onClick={close} aria-label="Close and return the book to the shelf" data-testid="close-detail"><Icon name="close" /></button>
        <div ref={stageRef} className="detail-stage" style={{ '--stage-h': `${geo.stageH}px` } as CSSProperties} onPointerMove={onStageMove} onPointerLeave={onStageLeave}>
          <div ref={bookRef} className="pulled" style={{ '--rest': `${REST_ANGLE}deg` } as CSSProperties}>
            <BookObject book={book} geometry={geo.geometry} scale={geo.scale} className="is-pulled" />
          </div>
          <div className="stage-shadow" aria-hidden="true" />
        </div>
        <BookRecord book={book} onEdit={() => setEditing(true)} onDeleted={() => goBack('/library')} />
      </article>
      <BookForm open={editing} onClose={() => setEditing(false)} book={book} />
    </div>
  );
}

/* =================================================================== record */

function useDraftText(value: string | undefined, save: (v: string | undefined) => void) {
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  return { text, setText, commit: () => (text.trim() !== (value ?? '').trim() ? save(text.trim() || undefined) : undefined) };
}

function BookRecord({ book, onEdit, onDeleted }: { book: Book; onEdit: () => void; onDeleted: () => void }) {
  const data = useData();
  const store = getStore();
  const pct = percentRead(book);
  const total = progressTotal(book);
  const unit = book.progressUnit === 'chapter' ? 'chapter' : 'page';
  const run = currentRun(book);
  const sessions = useMemo(() => data.sessions.filter((s) => s.bookId === book.id).sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1)), [data.sessions, book.id]);
  const entries = useMemo(() => data.journal.filter((j) => j.bookId === book.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [data.journal, book.id]);
  const shelves = [...data.shelves].sort((a, b) => a.order - b.order);
  const [toPage, setToPage] = useState('');
  const [minutes, setMinutes] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');
  const notes = useDraftText(book.notes, (v) => store.updateBook(book.id, { notes: v }));
  const review = useDraftText(book.review, (v) => store.updateBook(book.id, { review: v }));

  const quick = (n: number) => {
    const r = store.logSession(book.id, { pagesRead: n });
    if (!r.ok) setErr(r.error);
    else setErr('');
  };
  const logSession = () => {
    const to = toPage.trim() === '' ? undefined : Number(toPage);
    const mins = minutes.trim() === '' ? undefined : Number(minutes);
    if ((to !== undefined && !Number.isFinite(to)) || (mins !== undefined && !Number.isFinite(mins))) {
      setErr('Enter numbers only.');
      return;
    }
    const r = store.logSession(book.id, { toPage: to, minutes: mins, date, note });
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setErr('');
    setToPage('');
    setMinutes('');
    setNote('');
    toast('Session logged');
  };
  const setStatus = (s: BookStatus) => {
    const r = store.setBookStatus(book.id, s);
    if (!r.ok) toast(r.error, 'error');
    else if (s === 'completed') toast('Marked as finished. Add a rating or review below.');
  };
  const remove = async () => {
    const ok = await confirmAction({ title: `Delete “${book.title}”?`, body: 'This removes the book, its reading sessions, and any quotes or notes saved from it. This can’t be undone.', confirmLabel: 'Delete book' });
    if (!ok) return;
    store.deleteBook(book.id);
    toast('Book deleted');
    onDeleted();
  };
  const toggleShelf = (id: string) => store.setBookShelves(book.id, book.shelfIds.includes(id) ? book.shelfIds.filter((x) => x !== id) : [...book.shelfIds, id]);

  const lastRun = book.runs[book.runs.length - 1];
  const rereads = book.runs.filter((r) => r.outcome === 'completed').length;

  const primaryAction = (() => {
    switch (book.status) {
      case 'want':
        return <button className="btn btn-primary" onClick={() => setStatus('reading')}>Start reading</button>;
      case 'hold':
        return <button className="btn btn-primary" onClick={() => setStatus('reading')}>Resume reading</button>;
      case 'abandoned':
        return <button className="btn btn-primary" onClick={() => setStatus('reading')}>Pick it back up</button>;
      case 'completed':
        return <button className="btn btn-ghost" onClick={() => setStatus('reading')}>Start a reread</button>;
      default:
        return null;
    }
  })();

  return (
    <div className="detail-record" data-testid="book-record">
      <header className="record-head">
        <p className="kicker">
          <select className="status-select" aria-label="Reading status" value={book.status} onChange={(e) => setStatus(e.target.value as BookStatus)} data-testid="status-select">
            {BOOK_STATUS_ORDER.map((s) => <option key={s} value={s}>{BOOK_STATUS_LABEL[s]}</option>)}
          </select>
          {rereads > 1 && <span className="kicker-note">Read {rereads} times</span>}
        </p>
        <h1 className="record-title">{book.title}</h1>
        <p className="record-author">by {book.author}</p>
        <p className="record-meta">
          {[book.year, book.publisher, book.edition, BOOK_FORMAT_LABEL[book.format], book.pages ? `${book.pages} pages` : undefined, book.isbn ? `ISBN ${book.isbn}` : undefined].filter(Boolean).join('  ·  ')}
        </p>
        <div className="record-rate">
          <Rating value={book.rating} onChange={(v) => store.rateBook(book.id, v)} />
          {!book.rating && <span className="muted">Not rated yet</span>}
        </div>
      </header>

      <section className="record-section progress-card" aria-labelledby="prog-h">
        <h2 id="prog-h" className="section-label">Reading progress</h2>
        <div className="progress-figure">
          <span className="pct" data-testid="percent">{pct}<small>%</small></span>
          <span className="progress-text">
            {book.status === 'completed'
              ? `Finished ${formatDay(lastRun?.finishedAt)}`
              : total
                ? `${unit} ${book.currentPage} of ${total}`
                : book.currentPage ? `${unit} ${book.currentPage}` : 'Not started'}
            {book.status === 'reading' && run?.startedAt && <em> · started {relativeDay(run.startedAt)}</em>}
          </span>
        </div>
        <ProgressBar value={pct} label="Reading progress" tone="gold" />

        {(book.status === 'reading' || book.status === 'hold' || book.status === 'want' || book.status === 'abandoned') && (
          <div className="progress-controls">
            {book.status === 'reading' && book.progressUnit === 'page' && (
              <div className="quick-row" role="group" aria-label="Quick progress">
                {[10, 25, 50].map((n) => <button key={n} className="btn btn-sm" onClick={() => quick(n)} data-testid={`quick-${n}`}>+{n} pages</button>)}
              </div>
            )}
            {book.status === 'reading' && (
              <>
                <div className="log-row">
                  <label className="visually-hidden" htmlFor="to-page">{unit === 'chapter' ? 'Chapter reached' : 'Page reached'}</label>
                  <input id="to-page" className="input input-sm" inputMode="numeric" placeholder={unit === 'chapter' ? 'Chapter' : 'Page'} value={toPage} onChange={(e) => { setToPage(e.target.value.replace(/[^0-9]/g, '')); setErr(''); }} onKeyDown={(e) => e.key === 'Enter' && logSession()} data-testid="to-page" />
                  <button className="btn btn-primary btn-sm" onClick={logSession} data-testid="log-session">Log session</button>
                  <button className="btn btn-link btn-sm" onClick={() => setMore((m) => !m)} aria-expanded={more}>{more ? 'Fewer options' : 'Date, minutes, note'}</button>
                </div>
                {more && (
                  <div className="log-more">
                    <label>Date<input type="date" className="input" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
                    <label>Minutes<input className="input input-sm" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))} /></label>
                    <label className="grow">Note<input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></label>
                  </div>
                )}
              </>
            )}
            {err && <p className="field-error" role="alert">{err}</p>}
            {book.status === 'reading' && isAtEnd(book) && (
              <p className="finish-nudge" role="status">You’ve reached the last {unit}. <button className="btn btn-primary btn-sm" onClick={() => setStatus('completed')} data-testid="finish-book">Mark as finished</button></p>
            )}
            {book.status === 'reading' && !isAtEnd(book) && (
              <button className="btn btn-link btn-sm" onClick={() => setStatus('completed')} data-testid="finish-early">I’ve finished this book</button>
            )}
          </div>
        )}
        <div className="progress-actions">{primaryAction}</div>
      </section>

      <section className="record-section" aria-labelledby="shelves-h">
        <h2 id="shelves-h" className="section-label">On shelves</h2>
        <div className="chip-row">
          {shelves.map((s) => (
            <button key={s.id} className={`chip chip-toggle ${book.shelfIds.includes(s.id) ? 'is-on' : ''}`} aria-pressed={book.shelfIds.includes(s.id)} onClick={() => toggleShelf(s.id)}>{s.name}</button>
          ))}
          {!shelves.length && <span className="muted">No shelves yet.</span>}
        </div>
      </section>

      {book.synopsis && (
        <section className="record-section">
          <h2 className="section-label">Synopsis</h2>
          <p className="synopsis">{book.synopsis}</p>
        </section>
      )}
      {(book.genres.length > 0 || book.tags.length > 0) && (
        <section className="record-section">
          <div className="chip-row">
            {book.genres.map((g) => <span key={g} className="chip">{g}</span>)}
            {book.tags.map((g) => <span key={g} className="chip chip-quiet">#{g}</span>)}
          </div>
        </section>
      )}

      <section className="record-section" aria-labelledby="hist-h">
        <h2 id="hist-h" className="section-label">Reading history</h2>
        {book.runs.length === 0 ? (
          <p className="muted">No reading recorded yet.</p>
        ) : (
          <ol className="runs">
            {[...book.runs].reverse().map((r, idx) => {
              const n = book.runs.length - idx;
              return (
                <li key={r.id}>
                  <span className="run-n">{book.runs.length > 1 ? `Read ${n}` : 'Read'}</span>
                  <label className="run-date">Started<input type="date" max={today()} value={r.startedAt ?? ''} onChange={(e) => store.updateRun(book.id, r.id, { startedAt: e.target.value || undefined })} /></label>
                  {r.outcome === 'completed' && <label className="run-date">Finished<input type="date" max={today()} value={r.finishedAt ?? ''} onChange={(e) => store.updateRun(book.id, r.id, { finishedAt: e.target.value || undefined })} /></label>}
                  {r.outcome === 'abandoned' && <label className="run-date">Set aside<input type="date" max={today()} value={r.endedAt ?? ''} onChange={(e) => store.updateRun(book.id, r.id, { endedAt: e.target.value || undefined })} /></label>}
                  <span className={`run-outcome is-${r.outcome}`}>{r.outcome === 'reading' ? (book.status === 'hold' ? 'On hold' : 'In progress') : r.outcome === 'completed' ? 'Finished' : 'Set aside'}{r.rating ? ` · ★${r.rating}` : ''}</span>
                </li>
              );
            })}
          </ol>
        )}
        {sessions.length > 0 && (
          <details className="sessions">
            <summary>{sessions.length} logged session{sessions.length === 1 ? '' : 's'}</summary>
            <ul>
              {sessions.slice(0, 40).map((s) => (
                <li key={s.id}>
                  <span>{formatDay(s.date)}</span>
                  <span>{s.pagesRead ? `${s.pagesRead} pp` : ''}{s.toPage !== undefined ? ` → ${s.toPage}` : ''}{s.minutes ? ` · ${s.minutes} min` : ''}{s.note ? ` · ${s.note}` : ''}</span>
                  <button className="icon-btn icon-btn-sm" aria-label={`Delete session on ${formatDay(s.date)}`} onClick={async () => { if (await confirmAction({ title: 'Delete this session?', body: 'Progress on the book will stay as it is.', confirmLabel: 'Delete session' })) store.deleteSession(s.id); }}><Icon name="trash" size={14} /></button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="record-section" aria-labelledby="notes-h">
        <h2 id="notes-h" className="section-label">Private notes</h2>
        <textarea className="paper-area" aria-label="Private notes" rows={3} placeholder="Marginalia, reminders, loose thoughts…" value={notes.text} onChange={(e) => notes.setText(e.target.value)} onBlur={notes.commit} />
      </section>

      {(book.status === 'completed' || book.review) && (
        <section className="record-section" aria-labelledby="rev-h">
          <h2 id="rev-h" className="section-label">Review</h2>
          <textarea className="paper-area" aria-label="Review" rows={4} placeholder="What did you make of it, now that it’s finished?" value={review.text} onChange={(e) => review.setText(e.target.value)} onBlur={review.commit} />
        </section>
      )}

      <section className="record-section" aria-labelledby="q-h">
        <h2 id="q-h" className="section-label">Quotes &amp; thoughts</h2>
        {entries.length === 0 && <p className="muted">Nothing saved from this book yet.</p>}
        <ul className="entry-list">
          {entries.map((e) => (
            <li key={e.id} className={`entry kind-${e.kind}`}>
              <blockquote>{e.text}</blockquote>
              <p className="entry-meta">{e.kind === 'quote' ? 'Quote' : e.kind === 'thought' ? 'Thought' : 'Note'}{e.page ? ` · p. ${e.page}` : ''}{e.attribution ? ` · ${e.attribution}` : ''}{e.tags.length ? ` · ${e.tags.join(', ')}` : ''}
                <button className="icon-btn icon-btn-sm" aria-label="Delete entry" onClick={async () => { if (await confirmAction({ title: 'Delete this entry?', confirmLabel: 'Delete' })) store.deleteJournal(e.id); }}><Icon name="trash" size={14} /></button>
              </p>
            </li>
          ))}
        </ul>
        <JournalComposer bookId={book.id} fixedSubject compact />
      </section>

      <footer className="record-foot">
        <button className="btn btn-ghost" onClick={onEdit} data-testid="edit-book"><Icon name="edit" size={16} /> Edit details</button>
        <button className="btn btn-ghost btn-danger" onClick={remove} data-testid="delete-book"><Icon name="trash" size={16} /> Delete</button>
      </footer>
    </div>
  );
}
