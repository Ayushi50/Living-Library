import { useMemo, useState } from 'react';
import type { JournalKind } from '../types';
import { MONTHS_LONG, toDay } from '../lib/dates';
import { useData } from '../lib/store';
import { JournalCard } from '../components/JournalList';
import { JournalComposer } from '../components/JournalComposer';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/common';

export function Journal() {
  const data = useData();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<JournalKind | 'all'>('all');
  const [tag, setTag] = useState('');
  const [subject, setSubject] = useState('');
  const [order, setOrder] = useState<'new' | 'old'>('new');

  const tags = useMemo(() => [...new Set(data.journal.flatMap((j) => j.tags))].sort(), [data.journal]);
  const reviews = useMemo(() => [...data.books.filter((b) => b.review?.trim()).map((b) => ({ id: b.id, title: b.title, text: b.review!, rating: b.rating })), ...data.media.filter((m) => m.review?.trim()).map((m) => ({ id: m.id, title: m.title, text: m.review!, rating: m.rating }))], [data.books, data.media]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const name = (j: (typeof data.journal)[number]) => data.books.find((b) => b.id === j.bookId)?.title ?? data.media.find((m) => m.id === j.mediaId)?.title ?? '';
    return data.journal
      .filter((j) => (kind === 'all' || j.kind === kind) && (!tag || j.tags.includes(tag)) && (!subject || j.bookId === subject || j.mediaId === subject))
      .filter((j) => !needle || `${j.text} ${j.attribution ?? ''} ${j.tags.join(' ')} ${name(j)}`.toLowerCase().includes(needle))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1) * (order === 'new' ? 1 : -1));
  }, [data, q, kind, tag, subject, order]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const j of list) {
      const day = toDay(new Date(j.createdAt));
      const key = day.slice(0, 7);
      m.set(key, [...(m.get(key) ?? []), j]);
    }
    return [...m.entries()];
  }, [list]);

  const subjects = useMemo(() => {
    const ids = new Set(data.journal.map((j) => j.bookId ?? j.mediaId).filter(Boolean) as string[]);
    return [...data.books, ...data.media].filter((x) => ids.has(x.id)).map((x) => ({ id: x.id, title: x.title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [data]);

  return (
    <div className="page journal-page">
      <header className="page-head"><div><p className="kicker">The Journal</p><h1 className="page-title">Quotes, thoughts &amp; notes</h1></div></header>
      <JournalComposer />
      {data.journal.length === 0 ? (
        <EmptyState title="Nothing written yet" body="Save a line you loved, a half-formed thought, or a note to your future self. Entries link back to the book or title they came from." />
      ) : (
        <>
          <div className="toolbar" role="search">
            <div className="toolbar-search"><Icon name="search" size={16} /><input aria-label="Search the journal" placeholder="Search text, speaker, tags, titles…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="toolbar-row">
              <select className="select select-sm" aria-label="Entry type" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="all">All types</option><option value="quote">Quotes</option><option value="thought">Thoughts</option><option value="note">Notes</option></select>
              <select className="select select-sm" aria-label="Mood or theme" value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Any mood or theme</option>{tags.map((t) => <option key={t}>{t}</option>)}</select>
              <select className="select select-sm" aria-label="Book or title" value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">Any book or title</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
              <select className="select select-sm" aria-label="Order" value={order} onChange={(e) => setOrder(e.target.value as typeof order)}><option value="new">Newest first</option><option value="old">Oldest first</option></select>
            </div>
          </div>
          {list.length === 0 && <EmptyState title="No entries match" body="Try a different search or clear a filter." action={<button className="btn btn-ghost" onClick={() => { setQ(''); setKind('all'); setTag(''); setSubject(''); }}>Clear filters</button>} />}
          {groups.map(([key, items]) => (
            <section key={key} className="journal-month" aria-label={`${MONTHS_LONG[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`}>
              <h2 className="month-title">{MONTHS_LONG[Number(key.slice(5)) - 1]} <small>{key.slice(0, 4)}</small></h2>
              <div className="entries">{items.map((j) => <JournalCard key={j.id} entry={j} />)}</div>
            </section>
          ))}
        </>
      )}
      {reviews.length > 0 && (
        <section className="journal-month" aria-label="Your reviews">
          <h2 className="month-title">Reviews <small>{reviews.length}</small></h2>
          <p className="muted">Reviews are written on each book or title’s page; they are listed here for reading.</p>
          <div className="entries">{reviews.filter((r) => !q.trim() || `${r.title} ${r.text}`.toLowerCase().includes(q.trim().toLowerCase())).map((r) => <article className="entry" key={r.id}><p className="entry-text">{r.text}</p><p className="entry-meta"><span className="entry-kind">Review</span> · {r.title}{r.rating ? ` · ${r.rating}★` : ''}</p></article>)}</div>
        </section>
      )}
    </div>
  );
}
