import { useEffect, useRef, useState } from 'react';
import type { Book, Media, MediaKind } from '../types';
import { searchAnime, searchBooks, searchTmdb, tmdbConfigured, TMDB_ATTRIBUTION, type Hit } from '../lib/search';
import { useData } from '../lib/store';
import { closeAdd, navigate, openAdd, toast, useUi, type AddKind } from '../lib/ui';
import { bookPath } from '../lib/ui';
import { BookForm } from './BookForm';
import { Icon } from './Icon';
import { MediaForm } from './MediaForm';
import { Modal, Segmented } from './common';

const TABS: { value: AddKind; label: string }[] = [
  { value: 'book', label: 'Book' },
  { value: 'movie', label: 'Movie' },
  { value: 'tv', label: 'TV' },
  { value: 'kdrama', label: 'K-Drama' },
  { value: 'anime', label: 'Anime' },
];

type AnyHit = Hit<Partial<Book>> | Hit<Partial<Media>>;

export function AddFlow() {
  const { add } = useUi();
  const data = useData();
  const [kind, setKind] = useState<AddKind>(add.kind);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<AnyHit[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState<{ prefill?: Partial<Book> | Partial<Media> } | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    if (add.open) {
      setKind(add.kind);
      setQ('');
      setHits(null);
      setErrors([]);
      setForm(null);
    }
  }, [add.open, add.kind]);
  useEffect(() => {
    setHits(null);
    setErrors([]);
  }, [kind]);

  const needsKey = kind !== 'book' && kind !== 'anime' && !tmdbConfigured(data.prefs.tmdbKey);

  const run = async () => {
    const term = q.trim();
    if (!term) return;
    const id = ++reqId.current;
    setBusy(true);
    setErrors([]);
    const res = kind === 'book' ? await searchBooks(term) : kind === 'anime' ? await searchAnime(term) : await searchTmdb(term, kind as MediaKind, data.prefs.tmdbKey);
    if (id !== reqId.current) return; // a newer search superseded this one
    setHits(res.hits as AnyHit[]);
    setErrors(res.errors);
    setBusy(false);
  };

  const pick = async (h: AnyHit) => {
    let prefill = h.data;
    if ('enrich' in h && h.enrich) {
      try {
        prefill = { ...h.data, ...(await h.enrich()) } as typeof prefill;
      } catch {
        toast('Couldn’t fetch extra details; using the basics. You can fill in the rest.', 'error');
      }
    }
    setForm({ prefill });
  };

  const close = () => {
    setForm(null);
    closeAdd();
  };

  if (!add.open) return null;
  const isBook = kind === 'book';
  return (
    <>
      <Modal open={!form} onClose={close} size="lg" title="Add to your library">
        <div className="add-flow">
          <Segmented<AddKind> label="What are you adding?" value={kind} onChange={(v) => { setKind(v); openAdd(v); }} options={TABS} />
          <form className="add-search" role="search" onSubmit={(e) => { e.preventDefault(); void run(); }}>
            <input className="input" data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={isBook ? 'Title, author or ISBN' : 'Search by title'} aria-label="Search online" />
            <button className="btn btn-primary" type="submit" disabled={busy || !q.trim() || needsKey}>{busy ? 'Searching…' : 'Search'}</button>
          </form>
          {needsKey && <p className="notice">Searching films and series uses TMDB, which needs an API key. Add one in <button className="link" type="button" onClick={() => { close(); navigate('/settings'); }}>Settings</button>, or skip the search and enter it by hand.</p>}
          {errors.map((e) => <p key={e} className="notice is-error" role="alert"><Icon name="alert" size={15} /> {e}</p>)}
          {busy && <p className="muted" role="status">Looking…</p>}
          {hits && !busy && (
            hits.length === 0 ? (
              <p className="muted" role="status">{errors.length ? 'Nothing could be fetched.' : 'No matches.'} You can add it by hand below.</p>
            ) : (
              <ul className="hit-list" aria-label="Search results">
                {hits.map((h) => (
                  <li key={h.key}>
                    <button type="button" className="hit" onClick={() => void pick(h)}>
                      <span className="hit-img">{h.image ? <img src={h.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} /> : null}</span>
                      <span className="hit-text"><strong>{h.title}</strong><span>{h.subtitle}</span><em>{h.source}</em></span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
          <div className="add-manual">
            <button className="btn" type="button" onClick={() => setForm({})} data-testid="manual-entry"><Icon name="edit" size={15} /> Enter details by hand</button>
            <span className="attrib">{isBook ? 'Results from Open Library and Google Books.' : kind === 'anime' ? 'Results from AniList.' : TMDB_ATTRIBUTION}</span>
          </div>
        </div>
      </Modal>
      {isBook ? (
        <BookForm open={!!form} onClose={() => setForm(null)} prefill={form?.prefill as Partial<Book> | undefined} onSaved={(b) => { closeAdd(); navigate(bookPath(b.id)); }} />
      ) : (
        <MediaForm open={!!form} onClose={() => { setForm(null); }} kind={kind as MediaKind} prefill={form?.prefill as Partial<Media> | undefined} onSaved={() => closeAdd()} />
      )}
    </>
  );
}
