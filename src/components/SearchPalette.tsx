import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { MEDIA_KIND_LABEL } from '../types';
import { useData } from '../lib/store';
import { bookPath, closeSearch, mediaPath, navigate, openAdd, useUi } from '../lib/ui';
import { Icon } from './Icon';
import { Modal } from './common';

interface Item { key: string; label: string; sub: string; to?: string; action?: () => void; icon: 'book' | 'film' | 'quote' | 'plus' }

export function SearchPalette() {
  const { searchOpen } = useUi();
  const data = useData();
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => { if (searchOpen) { setQ(''); setI(0); } }, [searchOpen]);

  const items = useMemo<Item[]>(() => {
    const n = q.trim().toLowerCase();
    const out: Item[] = [];
    if (n) {
      for (const b of data.books) if (`${b.title} ${b.author} ${b.isbn ?? ''} ${b.genres.join(' ')} ${b.tags.join(' ')}`.toLowerCase().includes(n)) out.push({ key: b.id, label: b.title, sub: `Book · ${b.author}`, to: bookPath(b.id), icon: 'book' });
      for (const m of data.media) if (`${m.title} ${m.originalTitle ?? ''} ${m.genres.join(' ')} ${m.tags.join(' ')} ${m.cast.join(' ')}`.toLowerCase().includes(n)) out.push({ key: m.id, label: m.title, sub: `${MEDIA_KIND_LABEL[m.kind]}${m.year ? ` · ${m.year}` : ''}`, to: mediaPath(m.id), icon: 'film' });
      for (const j of data.journal) if (`${j.text} ${j.attribution ?? ''} ${j.tags.join(' ')}`.toLowerCase().includes(n)) {
        const s = data.books.find((b) => b.id === j.bookId) ?? data.media.find((m) => m.id === j.mediaId);
        out.push({ key: j.id, label: j.text.length > 90 ? j.text.slice(0, 90) + '…' : j.text, sub: `${j.kind}${s ? ` · ${s.title}` : ''}`, to: j.bookId ? bookPath(j.bookId) : j.mediaId ? mediaPath(j.mediaId) : '/journal', icon: 'quote' });
      }
    }
    const term = q.trim();
    out.splice(30);
    out.push({ key: 'add-book', label: term ? `Search online for a book: “${term}”` : 'Add a book', sub: 'Open Library & Google Books, or enter by hand', action: () => openAdd('book'), icon: 'plus' });
    out.push({ key: 'add-screen', label: term ? `Add a movie or series: “${term}”` : 'Add a movie, series or anime', sub: 'Search online, or enter by hand', action: () => openAdd('movie'), icon: 'plus' });
    return out;
  }, [q, data]);

  useEffect(() => setI(0), [q]);
  useEffect(() => { list.current?.children[i]?.scrollIntoView({ block: 'nearest' }); }, [i]);
  const go = (it: Item) => { closeSearch(); if (it.to) navigate(it.to); else it.action?.(); };
  const onKey = (e: RKeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter' && items[i]) { e.preventDefault(); go(items[i]); }
  };
  return (
    <Modal open={searchOpen} onClose={closeSearch} label="Search your library" size="md">
      <div className="palette" onKeyDown={onKey}>
        <div className="palette-input"><Icon name="search" size={18} /><input data-autofocus role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={`pal-${i}`} aria-label="Search books, titles, quotes" placeholder="Search books, titles, quotes…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <ul id="palette-list" role="listbox" ref={list} className="palette-list">
          {items.map((it, idx) => (
            <li key={it.key} id={`pal-${idx}`} role="option" aria-selected={idx === i}>
              <button type="button" tabIndex={-1} className={`palette-item ${idx === i ? 'is-on' : ''}`} onMouseMove={() => setI(idx)} onClick={() => go(it)}><Icon name={it.icon} size={16} /><span><strong>{it.label}</strong><small>{it.sub}</small></span></button>
            </li>
          ))}
        </ul>
        <p className="palette-hint">↑↓ to move · Enter to open · Esc to close</p>
      </div>
    </Modal>
  );
}
