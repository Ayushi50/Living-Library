import { useMemo, useState } from 'react';
import type { JournalKind } from '../types';
import { getStore, useData } from '../lib/store';
import { toast } from '../lib/ui';
import { Icon } from './Icon';
import { Segmented, TagInput } from './common';

export const MOOD_SUGGESTIONS = ['love', 'grief', 'hope', 'tension', 'nostalgia', 'humour', 'wonder', 'courage', 'solitude', 'identity', 'power', 'justice', 'memory'];

export function JournalComposer({ bookId, mediaId, fixedSubject = false, compact = false, defaultKind = 'quote', onSaved }: { bookId?: string; mediaId?: string; fixedSubject?: boolean; compact?: boolean; defaultKind?: JournalKind; onSaved?: () => void }) {
  const data = useData();
  const [kind, setKind] = useState<JournalKind>(defaultKind);
  const [subject, setSubject] = useState(bookId ? `b:${bookId}` : mediaId ? `m:${mediaId}` : '');
  const [text, setText] = useState('');
  const [page, setPage] = useState('');
  const [who, setWho] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState('');
  const allTags = useMemo(() => [...new Set([...MOOD_SUGGESTIONS, ...data.journal.flatMap((j) => j.tags)])], [data.journal]);
  const isMedia = subject.startsWith('m:');

  const save = () => {
    const r = getStore().addJournal({
      kind,
      text,
      bookId: subject.startsWith('b:') ? subject.slice(2) : undefined,
      mediaId: isMedia ? subject.slice(2) : undefined,
      page: !isMedia && page.trim() && Number.isFinite(Number(page)) ? Math.max(0, Math.round(Number(page))) : undefined,
      attribution: who,
      tags,
    });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setText('');
    setPage('');
    setWho('');
    setTags([]);
    setError('');
    toast(kind === 'quote' ? 'Quote saved to your journal' : 'Saved to your journal');
    onSaved?.();
  };

  return (
    <form className={`composer ${compact ? 'is-compact' : ''}`} onSubmit={(e) => { e.preventDefault(); save(); }} aria-label="New journal entry">
      <div className="composer-top">
        <Segmented<JournalKind> label="Entry type" value={kind} onChange={setKind} options={[{ value: 'quote', label: 'Quote' }, { value: 'thought', label: 'Thought' }, { value: 'note', label: 'Note' }]} />
        {!fixedSubject && (
          <select aria-label="Book or title this entry belongs to" value={subject} onChange={(e) => setSubject(e.target.value)} className="select">
            <option value="">No book or title</option>
            <optgroup label="Books">{data.books.map((b) => <option key={b.id} value={`b:${b.id}`}>{b.title}</option>)}</optgroup>
            <optgroup label="Screen">{data.media.map((m) => <option key={m.id} value={`m:${m.id}`}>{m.title}</option>)}</optgroup>
          </select>
        )}
      </div>
      <textarea
        aria-label={kind === 'quote' ? 'Quote' : kind === 'thought' ? 'Your thought' : 'Note'}
        className={`composer-text ${kind === 'quote' ? 'is-quote' : ''}`}
        placeholder={kind === 'quote' ? 'Copy the line you want to keep…' : kind === 'thought' ? 'What are you thinking while you read?' : 'A private note or reflection…'}
        rows={compact ? 3 : 4}
        value={text}
        onChange={(e) => { setText(e.target.value); if (error) setError(''); }}
      />
      <div className="composer-row">
        {!isMedia && <input aria-label="Page number" className="input input-sm" inputMode="numeric" placeholder="Page" value={page} onChange={(e) => setPage(e.target.value.replace(/[^0-9]/g, ''))} />}
        {kind === 'quote' && <input aria-label={isMedia ? 'Who said it' : 'Speaker (optional)'} className="input" placeholder={isMedia ? 'Character / speaker' : 'Speaker (optional)'} value={who} onChange={(e) => setWho(e.target.value)} />}
        <div className="composer-tags"><TagInput label="Mood or theme tags" value={tags} onChange={setTags} suggestions={allTags} placeholder="Mood or theme…" /></div>
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}><Icon name="plus" size={16} /> Save</button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </form>
  );
}
