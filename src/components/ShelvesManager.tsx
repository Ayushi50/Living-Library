import { useState } from 'react';
import { getStore, useData } from '../lib/store';
import { closeShelves, confirmAction, toast, useUi } from '../lib/ui';
import { Icon } from './Icon';
import { Modal } from './common';

export function ShelvesManager() {
  const { shelvesOpen } = useUi();
  const data = useData();
  const store = getStore();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const shelves = [...data.shelves].sort((a, b) => a.order - b.order);

  const add = () => {
    const r = store.addShelf(name);
    if (!r.ok) setError(r.error);
    else {
      setName('');
      setError('');
      toast('Shelf added');
    }
  };
  const commitRename = () => {
    if (!editing) return;
    const r = store.renameShelf(editing.id, editing.value);
    if (!r.ok) setError(r.error);
    else setError('');
    setEditing(null);
  };
  const remove = async (id: string, label: string) => {
    const count = data.books.filter((b) => b.shelfIds.includes(id)).length;
    const ok = await confirmAction({ title: `Remove the “${label}” shelf?`, body: count ? `The ${count} book${count === 1 ? '' : 's'} on it will stay in your library; they just won’t be on this shelf any more.` : 'The shelf is empty.', confirmLabel: 'Remove shelf' });
    if (ok) store.deleteShelf(id);
  };

  return (
    <Modal open={shelvesOpen} onClose={closeShelves} title="Your shelves" size="sm">
      <p className="muted">Shelves are your own collections: Favorites, Classics, Book Club… A book can sit on several at once. The order here is the order on the bookcase.</p>
      <ul className="shelf-manage">
        {shelves.map((s, i) => (
          <li key={s.id}>
            {editing?.id === s.id ? (
              <input className="input" autoFocus aria-label={`Rename ${s.name}`} value={editing.value} onChange={(e) => setEditing({ id: s.id, value: e.target.value })} onBlur={commitRename} onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(null); }} />
            ) : (
              <button className="shelf-manage-name" onClick={() => setEditing({ id: s.id, value: s.name })} aria-label={`Rename ${s.name}`}>{s.name}<small>{data.books.filter((b) => b.shelfIds.includes(s.id)).length}</small></button>
            )}
            <span className="shelf-manage-actions">
              <button className="icon-btn icon-btn-sm" onClick={() => store.moveShelf(s.id, -1)} disabled={i === 0} aria-label={`Move ${s.name} up`}><Icon name="arrowUp" size={15} /></button>
              <button className="icon-btn icon-btn-sm" onClick={() => store.moveShelf(s.id, 1)} disabled={i === shelves.length - 1} aria-label={`Move ${s.name} down`}><Icon name="arrowDown" size={15} /></button>
              <button className="icon-btn icon-btn-sm" onClick={() => remove(s.id, s.name)} aria-label={`Delete ${s.name}`}><Icon name="trash" size={15} /></button>
            </span>
          </li>
        ))}
        {shelves.length === 0 && <li className="muted">No shelves yet.</li>}
      </ul>
      <form className="add-shelf" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input" aria-label="New shelf name" placeholder="New shelf name" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
        <button className="btn btn-primary" type="submit" disabled={!name.trim()}>Add shelf</button>
      </form>
      {error && <p className="field-error" role="alert">{error}</p>}
    </Modal>
  );
}
