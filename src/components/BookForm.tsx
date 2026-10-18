import { useEffect, useMemo, useState } from 'react';
import type { Book, BookFormat, BookStatus } from '../types';
import { BOOK_FORMAT_LABEL, BOOK_STATUS_LABEL, BOOK_STATUS_ORDER } from '../types';
import { findDuplicateBook } from '../lib/books';
import { spineColorFor } from '../lib/color';
import { today } from '../lib/dates';
import { getStore, useData } from '../lib/store';
import { bookPath, navigate, toast } from '../lib/ui';
import { BookCover, Field, Modal, Rating, Segmented, TagInput } from './common';

interface Draft {
  title: string;
  author: string;
  coverUrl: string;
  isbn: string;
  edition: string;
  publisher: string;
  year: string;
  pages: string;
  format: BookFormat;
  progressUnit: 'page' | 'chapter';
  totalChapters: string;
  genres: string[];
  tags: string[];
  synopsis: string;
  status: BookStatus;
  startDate: string;
  finishDate: string;
  rating?: number;
  shelfIds: string[];
  spineColor: string;
  source?: Book['source'];
  externalId?: string;
}

const toDraft = (b?: Partial<Book>): Draft => ({
  title: b?.title ?? '',
  author: b?.author && b.author !== 'Unknown author' ? b.author : '',
  coverUrl: b?.coverUrl ?? '',
  isbn: b?.isbn ?? '',
  edition: b?.edition ?? '',
  publisher: b?.publisher ?? '',
  year: b?.year ? String(b.year) : '',
  pages: b?.pages ? String(b.pages) : '',
  format: b?.format ?? 'physical',
  progressUnit: b?.progressUnit ?? 'page',
  totalChapters: b?.totalChapters ? String(b.totalChapters) : '',
  genres: b?.genres ?? [],
  tags: b?.tags ?? [],
  synopsis: b?.synopsis ?? '',
  status: b?.status ?? 'want',
  startDate: today(),
  finishDate: today(),
  rating: b?.rating,
  shelfIds: b?.shelfIds ?? [],
  spineColor: b?.spineColor ?? '',
  source: b?.source,
  externalId: b?.externalId,
});

const numOrUndef = (s: string): number | undefined => (s.trim() && Number.isFinite(Number(s)) ? Number(s) : undefined);

export function BookForm({ open, onClose, book, prefill, onSaved }: { open: boolean; onClose: () => void; book?: Book; prefill?: Partial<Book>; onSaved?: (b: Book) => void }) {
  const data = useData();
  const editing = !!book;
  const [d, setD] = useState<Draft>(() => toDraft(book ?? prefill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dupAck, setDupAck] = useState(false);
  useEffect(() => {
    if (open) {
      setD(toDraft(book ?? prefill));
      setErrors({});
      setDupAck(false);
    }
    // reset whenever the dialog is (re)opened for a different subject
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, book?.id, prefill]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: '' }));
  };
  const genreSuggestions = useMemo(() => [...new Set(data.books.flatMap((b) => b.genres))].sort(), [data.books]);
  const tagSuggestions = useMemo(() => [...new Set(data.books.flatMap((b) => b.tags))].sort(), [data.books]);
  const dup = !editing && d.title.trim() ? findDuplicateBook(data, { title: d.title, author: d.author || 'Unknown author', isbn: d.isbn }) : undefined;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!d.title.trim()) e.title = 'Every book needs a title.';
    if (d.pages.trim() && !(Number(d.pages) >= 1)) e.pages = 'Enter a page count of 1 or more.';
    if (d.year.trim() && !(Number(d.year) >= 0 && Number(d.year) <= 2200)) e.year = 'Enter a valid year.';
    if (d.coverUrl.trim() && !/^(https?:\/\/|data:image\/)/i.test(d.coverUrl.trim())) e.coverUrl = 'Use a full image address starting with https://';
    if (d.progressUnit === 'chapter' && d.totalChapters.trim() && !(Number(d.totalChapters) >= 1)) e.totalChapters = 'Enter the number of chapters.';
    if (d.status === 'completed' && d.startDate && d.finishDate && d.finishDate < d.startDate && !editing) e.finishDate = 'Finished before it was started?';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    if (dup && !dupAck) {
      setDupAck(false);
      setErrors((e) => ({ ...e, title: 'This looks like a book you already have.' }));
      return;
    }
    const patch: Partial<Book> = {
      title: d.title.trim(),
      author: d.author.trim() || 'Unknown author',
      coverUrl: d.coverUrl.trim() || undefined,
      isbn: d.isbn.trim() || undefined,
      edition: d.edition.trim() || undefined,
      publisher: d.publisher.trim() || undefined,
      year: numOrUndef(d.year),
      pages: numOrUndef(d.pages),
      format: d.format,
      progressUnit: d.progressUnit,
      totalChapters: d.progressUnit === 'chapter' ? numOrUndef(d.totalChapters) : undefined,
      genres: d.genres,
      tags: d.tags,
      synopsis: d.synopsis.trim() || undefined,
      rating: d.rating,
      shelfIds: d.shelfIds,
      spineColor: d.spineColor || undefined,
      source: d.source ?? 'manual',
      externalId: d.externalId,
    };
    const store = getStore();
    if (editing && book) {
      store.updateBook(book.id, patch);
      if (d.status !== book.status) {
        const r = store.setBookStatus(book.id, d.status);
        if (!r.ok) toast(r.error, 'error');
      }
      toast('Book updated');
      onSaved?.(getStore().data.books.find((b) => b.id === book.id)!);
    } else {
      const added = store.addBook({ ...patch, title: patch.title!, status: d.status }, { startDate: d.status === 'want' ? undefined : d.startDate, finishDate: d.finishDate });
      toast(`“${added.title}” is on the shelf`);
      onSaved?.(added);
    }
    onClose();
  };

  const toggleShelf = (id: string) => set('shelfIds', d.shelfIds.includes(id) ? d.shelfIds.filter((x) => x !== id) : [...d.shelfIds, id]);
  const shelves = [...data.shelves].sort((a, b) => a.order - b.order);
  const previewColor = d.spineColor || spineColorFor(d.title + (d.author || 'Unknown author'));
  const needsDates = !editing && d.status !== 'want';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit book details' : prefill ? 'Review before shelving' : 'Add a book'}
      footer={
        <>
          {dup && (
            <p className="dup-note" role="status">
              Already in your library: <button type="button" className="link" onClick={() => { onClose(); navigate(bookPath(dup.id)); }}>{dup.title}</button>.{' '}
              <label className="check"><input type="checkbox" checked={dupAck} onChange={(e) => setDupAck(e.target.checked)} /> Add another copy anyway</label>
            </p>
          )}
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={submit} data-testid="save-book">{editing ? 'Save changes' : 'Place on shelf'}</button>
        </>
      }
    >
      <form className="form-grid" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <div className="form-cover">
          <div className="form-cover-frame">
            <BookCover book={{ id: 'preview', title: d.title || 'Untitled', author: d.author, coverUrl: d.coverUrl.trim() || undefined, spineColor: previewColor, autoColor: undefined }} />
          </div>
          <Field label="Cover image address" error={errors.coverUrl} hint="Optional. Without one, a designed cover is used.">
            <input className="input" value={d.coverUrl} onChange={(e) => set('coverUrl', e.target.value)} placeholder="https://…" inputMode="url" />
          </Field>
          <Field label="Spine colour" hint="Leave on automatic to follow the cover.">
            <div className="color-row">
              <input type="color" aria-label="Spine colour" value={d.spineColor || previewColor} onChange={(e) => set('spineColor', e.target.value)} />
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('spineColor', '')} disabled={!d.spineColor}>Automatic</button>
            </div>
          </Field>
        </div>
        <div className="form-main">
          <Field label="Title" error={errors.title}>
            <input className="input" data-autofocus value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="The title as printed" maxLength={300} />
          </Field>
          <Field label="Author">
            <input className="input" value={d.author} onChange={(e) => set('author', e.target.value)} placeholder="Author name" maxLength={200} />
          </Field>
          <div className="grid-3">
            <Field label="Publisher"><input className="input" value={d.publisher} onChange={(e) => set('publisher', e.target.value)} /></Field>
            <Field label="Year" error={errors.year}><input className="input" inputMode="numeric" value={d.year} onChange={(e) => set('year', e.target.value)} /></Field>
            <Field label="Pages" error={errors.pages} hint="Sets the book’s thickness on the shelf.">
              <input className="input" inputMode="numeric" value={d.pages} onChange={(e) => set('pages', e.target.value)} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="ISBN"><input className="input" value={d.isbn} onChange={(e) => set('isbn', e.target.value)} placeholder="10 or 13 digits" /></Field>
            <Field label="Edition" hint="Words like “hardcover” or “paperback” change the book’s height."><input className="input" value={d.edition} onChange={(e) => set('edition', e.target.value)} placeholder="e.g. Hardcover, 2nd ed." /></Field>
          </div>
          <div className="grid-2">
            <div className="field">
              <span className="field-label">Format</span>
              <Segmented<BookFormat> label="Format" value={d.format} onChange={(v) => set('format', v)} options={(Object.keys(BOOK_FORMAT_LABEL) as BookFormat[]).map((f) => ({ value: f, label: BOOK_FORMAT_LABEL[f] }))} />
            </div>
            <div className="field">
              <span className="field-label">Track progress by</span>
              <Segmented<'page' | 'chapter'> label="Progress unit" value={d.progressUnit} onChange={(v) => set('progressUnit', v)} options={[{ value: 'page', label: 'Page' }, { value: 'chapter', label: 'Chapter' }]} />
            </div>
          </div>
          {d.progressUnit === 'chapter' && (
            <Field label="Total chapters" error={errors.totalChapters}><input className="input input-sm" inputMode="numeric" value={d.totalChapters} onChange={(e) => set('totalChapters', e.target.value)} /></Field>
          )}
          <Field label="Genres"><TagInput label="Genres" value={d.genres} onChange={(v) => set('genres', v)} suggestions={genreSuggestions} placeholder="Type a genre and press Enter" /></Field>
          <Field label="Tags"><TagInput label="Tags" value={d.tags} onChange={(v) => set('tags', v)} suggestions={tagSuggestions} placeholder="Your own tags" /></Field>
          <Field label="Synopsis"><textarea className="input" rows={4} value={d.synopsis} onChange={(e) => set('synopsis', e.target.value)} /></Field>
          <div className="grid-2">
            <Field label="Status">
              <select className="select" value={d.status} onChange={(e) => set('status', e.target.value as BookStatus)}>
                {BOOK_STATUS_ORDER.map((s) => <option key={s} value={s}>{BOOK_STATUS_LABEL[s]}</option>)}
              </select>
            </Field>
            <div className="field">
              <span className="field-label">Rating</span>
              <Rating value={d.rating} onChange={(v) => set('rating', v)} />
            </div>
          </div>
          {needsDates && (
            <div className="grid-2">
              <Field label={d.status === 'abandoned' ? 'Started (optional)' : 'Started'}><input type="date" className="input" max={today()} value={d.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
              {(d.status === 'completed' || d.status === 'abandoned') && (
                <Field label={d.status === 'completed' ? 'Finished' : 'Set aside on'} error={errors.finishDate}><input type="date" className="input" max={today()} value={d.finishDate} onChange={(e) => set('finishDate', e.target.value)} /></Field>
              )}
            </div>
          )}
          <div className="field">
            <span className="field-label">Shelves</span>
            <div className="chip-row">
              {shelves.length === 0 && <span className="muted">No shelves yet. Create some from the Library page.</span>}
              {shelves.map((s) => (
                <button type="button" key={s.id} className={`chip chip-toggle ${d.shelfIds.includes(s.id) ? 'is-on' : ''}`} aria-pressed={d.shelfIds.includes(s.id)} onClick={() => toggleShelf(s.id)}>{s.name}</button>
              ))}
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}
