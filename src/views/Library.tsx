import { useMemo, useState } from 'react';
import type { Book, BookStatus } from '../types';
import { BOOK_FORMAT_LABEL, BOOK_STATUS_LABEL, BOOK_STATUS_ORDER } from '../types';
import { completedRuns, percentRead } from '../lib/books';
import { formatDay } from '../lib/dates';
import { getStore, useData } from '../lib/store';
import { bookPath, navigate, openAdd, openShelves } from '../lib/ui';
import { BookDetail, setBookOrigin } from '../components/BookDetail';
import { Icon } from '../components/Icon';
import { ShelfRow } from '../components/ShelfRow';
import { BookCover, EmptyState, ProgressBar, Rating, Segmented } from '../components/common';

type SortKey = 'added' | 'title' | 'author' | 'rating' | 'pages' | 'progress' | 'finished';
const SORT_LABEL: Record<SortKey, string> = { added: 'Recently added', title: 'Title', author: 'Author', rating: 'Rating', pages: 'Page count', progress: 'Progress', finished: 'Date finished' };

function lastFinished(b: Book): string {
  return completedRuns(b).map((r) => r.finishedAt!).sort().pop() ?? '';
}
function sortBooks(books: Book[], key: SortKey, dir: 1 | -1): Book[] {
  const cmp: Record<SortKey, (a: Book, b: Book) => number> = {
    added: (a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0),
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    author: (a, b) => a.author.localeCompare(b.author, undefined, { sensitivity: 'base' }) || a.title.localeCompare(b.title),
    rating: (a, b) => (a.rating ?? 0) - (b.rating ?? 0),
    pages: (a, b) => (a.pages ?? 0) - (b.pages ?? 0),
    progress: (a, b) => percentRead(a) - percentRead(b),
    finished: (a, b) => lastFinished(a).localeCompare(lastFinished(b)),
  };
  // "added" and "finished" read naturally newest-first, so direction 1 means newest first for those.
  const natural = key === 'added' || key === 'finished' || key === 'rating' || key === 'pages' || key === 'progress' ? -1 : 1;
  return [...books].sort((a, b) => cmp[key](a, b) * natural * dir);
}

export function Library({ bookId }: { bookId?: string }) {
  const data = useData();
  const prefs = data.prefs;
  const store = getStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<BookStatus | 'all'>('all');
  const [format, setFormat] = useState<'all' | Book['format']>('all');
  const [shelf, setShelf] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('added');
  const [dir, setDir] = useState<1 | -1>(1);

  const shelves = useMemo(() => [...data.shelves].sort((a, b) => a.order - b.order), [data.shelves]);
  const filtering = q.trim() !== '' || status !== 'all' || format !== 'all' || shelf !== 'all';

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data.books.length };
    for (const b of data.books) c[b.status] = (c[b.status] ?? 0) + 1;
    return c;
  }, [data.books]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = data.books.filter((b) => {
      if (status !== 'all' && b.status !== status) return false;
      if (format !== 'all' && b.format !== format) return false;
      if (shelf === 'none' ? b.shelfIds.length > 0 : shelf !== 'all' && !b.shelfIds.includes(shelf)) return false;
      if (needle) {
        const hay = `${b.title} ${b.author} ${b.genres.join(' ')} ${b.tags.join(' ')} ${b.isbn ?? ''} ${b.publisher ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return sortBooks(list, sort, dir);
  }, [data.books, q, status, format, shelf, sort, dir]);

  const open = (book: Book, rect: DOMRect, kind: 'spine' | 'cover' = 'spine') => {
    setBookOrigin({ id: book.id, rect, kind });
    navigate(bookPath(book.id));
  };

  const rows = useMemo(() => {
    if (prefs.shelfGroup === 'status') {
      return BOOK_STATUS_ORDER.map((s) => ({ id: `status-${s}`, title: BOOK_STATUS_LABEL[s], books: filtered.filter((b) => b.status === s) })).filter((r) => r.books.length || !filtering);
    }
    if (prefs.shelfGroup === 'all') return [{ id: 'all', title: 'The whole collection', books: filtered }];
    const out = shelves.map((s) => ({ id: s.id, title: s.name, books: filtered.filter((b) => b.shelfIds.includes(s.id)) }));
    const loose = filtered.filter((b) => !b.shelfIds.length);
    // Empty shelves stay out of the bookcase (they're still in the shelf manager) to keep it minimal.
    const result = out.filter((r) => r.books.length);
    if (loose.length) result.push({ id: 'unshelved', title: result.length ? 'Not yet shelved' : 'Your books', books: loose });
    return result;
  }, [filtered, shelves, prefs.shelfGroup, filtering]);

  const empty = data.books.length === 0;

  return (
    <div className="page library-page">
      <header className="page-head">
        <div>
          <p className="kicker">The Library</p>
          <h1 className="page-title">Your shelves</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={openShelves}><Icon name="shelf" size={16} /> Shelves</button>
          <button className="btn btn-primary" onClick={() => openAdd('book')} data-testid="add-book"><Icon name="plus" size={16} /> Add a book</button>
        </div>
      </header>

      <div className="toolbar" role="search">
        <div className="toolbar-search">
          <Icon name="search" size={16} />
          <input aria-label="Filter your library" placeholder="Filter by title, author, genre, tag…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="icon-btn icon-btn-sm" onClick={() => setQ('')} aria-label="Clear filter"><Icon name="close" size={14} /></button>}
        </div>
        <div className="toolbar-chips" role="group" aria-label="Filter by status">
          {(['all', ...BOOK_STATUS_ORDER] as const).map((s) => (
            <button key={s} className={`chip chip-toggle ${status === s ? 'is-on' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
              {s === 'all' ? 'All' : BOOK_STATUS_LABEL[s]} <small>{counts[s] ?? 0}</small>
            </button>
          ))}
        </div>
        <div className="toolbar-row">
          <select className="select select-sm" aria-label="Filter by shelf" value={shelf} onChange={(e) => setShelf(e.target.value)}>
            <option value="all">All shelves</option>
            {shelves.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            <option value="none">Not on a shelf</option>
          </select>
          <select className="select select-sm" aria-label="Filter by format" value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
            <option value="all">Any format</option>
            {(Object.keys(BOOK_FORMAT_LABEL) as Book['format'][]).map((f) => <option key={f} value={f}>{BOOK_FORMAT_LABEL[f]}</option>)}
          </select>
          <select className="select select-sm" aria-label="Sort books" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </select>
          <button className="icon-btn" onClick={() => setDir((d) => (d === 1 ? -1 : 1))} aria-label={dir === 1 ? 'Reverse sort order' : 'Restore sort order'} title="Reverse order"><Icon name={dir === 1 ? 'arrowDown' : 'arrowUp'} size={16} /></button>
          {prefs.shelfView === 'shelf' && (
            <Segmented<'shelf' | 'status' | 'all'> label="Group shelves by" value={prefs.shelfGroup} onChange={(v) => store.setPrefs({ shelfGroup: v })} options={[{ value: 'shelf', label: 'My shelves' }, { value: 'status', label: 'Status' }, { value: 'all', label: 'All' }]} />
          )}
          <Segmented<'shelf' | 'gallery' | 'list'> label="Browsing mode" value={prefs.shelfView} onChange={(v) => store.setPrefs({ shelfView: v })} options={[{ value: 'shelf', label: <><Icon name="shelf" size={15} /> <span>Bookshelf</span></>, title: 'Physical bookshelf' }, { value: 'gallery', label: <><Icon name="grid" size={15} /> <span>Covers</span></>, title: 'Cover gallery' }, { value: 'list', label: <><Icon name="list" size={15} /> <span>List</span></>, title: 'Compact list' }]} />
        </div>
      </div>

      {empty ? (
        <EmptyState title="The shelves are bare" body="Add your first book and watch it take its place. Search by title, or enter one by hand — no account or API keys needed." action={<button className="btn btn-primary" onClick={() => openAdd('book')}>Add your first book</button>} />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nothing matches those filters" body="Try clearing the search or choosing a different status." action={<button className="btn btn-ghost" onClick={() => { setQ(''); setStatus('all'); setFormat('all'); setShelf('all'); }}>Clear filters</button>} />
      ) : prefs.shelfView === 'shelf' ? (
        <div className="bookcase" data-testid="bookcase">
          {rows.map((r) => (
            <ShelfRow key={r.id} id={r.id} title={r.title} books={r.books} pulledId={bookId} revealId={bookId} onOpen={(b, rect) => open(b, rect)} emptyText={r.id === 'all' ? undefined : filtering ? 'No books here match your filters.' : 'Empty for now. Put books here from a book’s record, or while adding one.'} />
          ))}
        </div>
      ) : prefs.shelfView === 'gallery' ? (
        <ul className="gallery" data-testid="gallery">
          {filtered.map((b) => (
            <li key={b.id} data-gallery-id={b.id}>
              <button className="gallery-item" onClick={(e) => open(b, e.currentTarget.querySelector('.gallery-cover')!.getBoundingClientRect(), 'cover')} aria-label={`${b.title} by ${b.author}, ${BOOK_STATUS_LABEL[b.status]}`}>
                <span className="gallery-cover">
                  <BookCover book={b} />
                  {b.status !== 'want' && <span className={`badge badge-${b.status}`}>{BOOK_STATUS_LABEL[b.status]}</span>}
                  {b.status === 'reading' && <span className="gallery-progress"><ProgressBar value={percentRead(b)} tone="gold" label={`${b.title} progress`} /></span>}
                </span>
                <span className="gallery-title">{b.title}</span>
                <span className="gallery-author">{b.author}</span>
                {b.rating ? <Rating value={b.rating} readOnly size={13} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="list-view" role="table" aria-label="Books" data-testid="list-view">
          <div className="list-row list-head" role="row">
            <span role="columnheader">Title</span><span role="columnheader">Status</span><span role="columnheader">Progress</span><span role="columnheader">Rating</span><span role="columnheader">Pages</span><span role="columnheader">Finished</span>
          </div>
          {filtered.map((b) => (
            <button key={b.id} className="list-row" role="row" onClick={(e) => open(b, e.currentTarget.getBoundingClientRect(), 'spine')}>
              <span className="list-title" role="cell"><span className="list-thumb"><BookCover book={b} /></span><span><strong>{b.title}</strong><small>{b.author}</small></span></span>
              <span role="cell"><span className={`badge badge-${b.status} badge-inline`}>{BOOK_STATUS_LABEL[b.status]}</span></span>
              <span role="cell" className="list-progress">{b.status === 'reading' || b.status === 'hold' ? <><ProgressBar value={percentRead(b)} label="Progress" tone="gold" /><small>{percentRead(b)}%</small></> : <small>{b.status === 'completed' ? '100%' : '—'}</small>}</span>
              <span role="cell">{b.rating ? <Rating value={b.rating} readOnly size={13} /> : <small>—</small>}</span>
              <span role="cell">{b.pages ?? '—'}</span>
              <span role="cell">{formatDay(lastFinished(b) || undefined)}</span>
            </button>
          ))}
        </div>
      )}
      {bookId && <BookDetail key={bookId} bookId={bookId} />}
    </div>
  );
}
