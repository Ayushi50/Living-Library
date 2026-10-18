import { useState } from 'react';
import type { JournalEntry } from '../types';
import { formatDay, toDay } from '../lib/dates';
import { getStore, useData } from '../lib/store';
import { bookPath, confirmAction, mediaPath, toast } from '../lib/ui';
import { Link } from './Link';
import { Icon } from './Icon';
import { TagInput } from './common';

const KIND_LABEL = { quote: 'Quote', thought: 'Thought', note: 'Note' } as const;

export function JournalCard({ entry, showSubject = true }: { entry: JournalEntry; showSubject?: boolean }) {
  const data = useData();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.text);
  const [tags, setTags] = useState(entry.tags);
  const [who, setWho] = useState(entry.attribution ?? '');
  const [page, setPage] = useState(entry.page ? String(entry.page) : '');
  const book = data.books.find((b) => b.id === entry.bookId);
  const media = data.media.find((m) => m.id === entry.mediaId);
  const subject = book ? { label: book.title, to: bookPath(book.id) } : media ? { label: media.title, to: mediaPath(media.id) } : undefined;

  const save = () => {
    if (!text.trim()) return toast('An entry can’t be empty.', 'error');
    getStore().updateJournal(entry.id, { text, tags, attribution: who.trim() || undefined, page: page.trim() && Number(page) >= 0 ? Math.round(Number(page)) : undefined });
    setEditing(false);
    toast('Entry updated');
  };
  const remove = async () => {
    if (await confirmAction({ title: 'Delete this entry?', body: 'It will be removed from your journal for good.', confirmLabel: 'Delete entry' })) {
      getStore().deleteJournal(entry.id);
      toast('Entry deleted');
    }
  };

  if (editing) {
    return (
      <article className="entry is-editing">
        <textarea className="paper-area" aria-label="Entry text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="composer-row">
          {!media && <input className="input input-sm" aria-label="Page" inputMode="numeric" placeholder="Page" value={page} onChange={(e) => setPage(e.target.value.replace(/\D/g, ''))} />}
          {entry.kind === 'quote' && <input className="input" aria-label="Speaker" placeholder="Speaker" value={who} onChange={(e) => setWho(e.target.value)} />}
          <div className="composer-tags"><TagInput label="Tags" value={tags} onChange={setTags} /></div>
        </div>
        <div className="entry-actions"><button className="btn btn-primary btn-sm" onClick={save}>Save</button><button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setText(entry.text); }}>Cancel</button></div>
      </article>
    );
  }
  return (
    <article className={`entry entry-${entry.kind}`}>
      {entry.kind === 'quote' ? <blockquote>{entry.text}</blockquote> : <p className="entry-text">{entry.text}</p>}
      <p className="entry-meta">
        <span className="entry-kind">{KIND_LABEL[entry.kind]}</span>
        {showSubject && subject && <> · <Link to={subject.to}>{subject.label}</Link></>}
        {entry.page ? ` · p. ${entry.page}` : ''}
        {entry.attribution ? ` · ${entry.attribution}` : ''}
        {` · ${formatDay(toDay(new Date(entry.createdAt)))}`}
      </p>
      {entry.tags.length > 0 && <p className="chip-row">{entry.tags.map((t) => <span className="chip" key={t}>{t}</span>)}</p>}
      <div className="entry-actions">
        <button className="icon-btn icon-btn-sm" aria-label="Edit entry" onClick={() => setEditing(true)}><Icon name="edit" size={15} /></button>
        <button className="icon-btn icon-btn-sm" aria-label="Delete entry" onClick={() => void remove()}><Icon name="trash" size={15} /></button>
      </div>
    </article>
  );
}
