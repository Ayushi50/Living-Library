import { useRef, useState } from 'react';
import { buildDemo } from '../lib/demo';
import { booksCsv, download, exportJson, mediaCsv, parseImport, type ParsedImport } from '../lib/exchange';
import { toDay } from '../lib/dates';
import { getStore, useData } from '../lib/store';
import { confirmAction, openGoals, openShelves, toast } from '../lib/ui';
import { Segmented } from '../components/common';
import { Icon } from '../components/Icon';

export function Settings() {
  const data = useData();
  const store = getStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<(ParsedImport & { ok: true }) | null>(null);
  const [importError, setImportError] = useState('');
  const [fileName, setFileName] = useState('');
  const [mode, setMode] = useState<'skip' | 'replace' | 'overwrite'>('skip');
  const [report, setReport] = useState<string[]>([]);
  const demoCount = data.books.filter((b) => b.isDemo).length + data.media.filter((m) => m.isDemo).length;

  const onFile = async (f?: File) => {
    setParsed(null); setImportError(''); setReport([]);
    if (!f) return;
    setFileName(f.name);
    if (f.size > 25 * 1024 * 1024) return setImportError('That file is larger than 25 MB, which is far beyond a normal export.');
    const r = parseImport(await f.text());
    if (r.ok) setParsed(r); else setImportError(r.error);
  };
  const runImport = async () => {
    if (!parsed) return;
    if (mode === 'overwrite') {
      if (!(await confirmAction({ title: 'Replace your whole library?', body: 'Everything currently saved here will be replaced by the contents of this file. Export a backup first if you are unsure.', confirmLabel: 'Replace everything' }))) return;
      store.replaceAll({ ...parsed.data, prefs: data.prefs });
      setReport([`Replaced your library with ${parsed.counts.books} books and ${parsed.counts.media} titles.`]);
    } else {
      const r = store.importMerge(parsed.data, mode === 'replace' ? 'replace' : 'skip');
      setReport([
        `Added ${r.addedBooks} book(s), ${r.addedMedia} title(s), ${r.addedSessions} session(s), ${r.addedJournal} journal entr${r.addedJournal === 1 ? 'y' : 'ies'}.`,
        ...(r.replacedBooks + r.replacedMedia ? [`Replaced ${r.replacedBooks + r.replacedMedia} existing item(s).`] : []),
        ...(r.skippedDuplicates.length ? [`Skipped ${r.skippedDuplicates.length} duplicate(s): ${r.skippedDuplicates.slice(0, 5).join('; ')}${r.skippedDuplicates.length > 5 ? '…' : ''}`] : []),
      ]);
    }
    toast('Import finished');
    setParsed(null);
    if (fileRef.current) fileRef.current.value = '';
  };
  const reset = async () => {
    if (!(await confirmAction({ title: 'Erase everything?', body: 'This deletes every book, title, session, journal entry and goal saved in this browser. Export a backup first if you might want them back.', confirmLabel: 'Erase everything' }))) return;
    if (!(await confirmAction({ title: 'Really erase everything?', body: 'This is your last chance. It cannot be undone.', confirmLabel: 'Yes, erase it all' }))) return;
    store.resetAll();
    toast('The library has been cleared');
  };

  return (
    <div className="page settings-page">
      <header className="page-head"><div><h1 className="page-title">Settings</h1></div></header>

      <section className="set-card">
        <h2>Appearance</h2>
        <div className="field"><span className="field-label">Theme</span><Segmented<'light' | 'dark' | 'system'> label="Theme" value={data.prefs.theme} onChange={(v) => store.setPrefs({ theme: v })} options={[{ value: 'light', label: 'Parchment' }, { value: 'dark', label: 'After hours' }, { value: 'system', label: 'Match system' }]} /></div>
        <details className="settings-disclosure">
          <summary>More preferences</summary>
          <label className="field"><span className="field-label">Your name (for the greeting)</span><input className="input" value={data.prefs.displayName} maxLength={40} onChange={(e) => store.setPrefs({ displayName: e.target.value })} /></label>
          <div className="field"><span className="field-label">Motion</span><Segmented<'system' | 'reduce' | 'full'> label="Motion" value={data.prefs.motion} onChange={(v) => store.setPrefs({ motion: v })} options={[{ value: 'system', label: 'Follow system' }, { value: 'reduce', label: 'Reduced' }, { value: 'full', label: 'Full' }]} /><p className="field-hint">Reduced motion removes the shelf wave, idle movement and the pull-out flight; books simply appear and open.</p></div>
          <div className="field"><span className="field-label">Calendar week starts on</span><Segmented<'0' | '1'> label="Week start" value={String(data.prefs.weekStartsOn) as '0' | '1'} onChange={(v) => store.setPrefs({ weekStartsOn: Number(v) as 0 | 1 })} options={[{ value: '1', label: 'Monday' }, { value: '0', label: 'Sunday' }]} /></div>
        </details>
      </section>

      <section className="set-card">
        <h2>Goals &amp; shelves</h2>
        <div className="page-actions"><button className="btn" onClick={openGoals}>Manage goals</button><button className="btn" onClick={openShelves}><Icon name="shelf" size={15} /> Manage shelves</button></div>
      </section>

      <section className="set-card" aria-label="Back up and restore">
        <h2>Your data</h2>
        <div className="settings-data-summary">
          <p className="muted">{data.books.length} books · {data.media.length} titles · {data.sessions.length} sessions · {data.journal.length} journal entries</p>
          <button className="btn" onClick={() => { download(`living-library-${toDay()}.json`, exportJson(data)); toast('Backup downloaded'); }} data-testid="export-json"><Icon name="download" size={15} /> Export backup</button>
        </div>
        <details className="settings-disclosure">
          <summary>Import or export specific lists</summary>
          <div className="page-actions">
            <button className="btn" onClick={() => download(`books-${toDay()}.csv`, booksCsv(data), 'text/csv')} disabled={!data.books.length}><Icon name="download" size={15} /> Books (CSV)</button>
            <button className="btn" onClick={() => download(`screen-${toDay()}.csv`, mediaCsv(data), 'text/csv')} disabled={!data.media.length}><Icon name="download" size={15} /> Screen archive (CSV)</button>
          </div>
          <hr />
          <h3>Import</h3>
          <label className="field"><span className="field-label">Choose a Living Library JSON export</span><input ref={fileRef} type="file" accept="application/json,.json" className="input" onChange={(e) => void onFile(e.target.files?.[0])} data-testid="import-file" /></label>
          {importError && <p className="notice is-error" role="alert"><Icon name="alert" size={15} /> {importError}</p>}
          {parsed && (
            <div className="import-preview" role="status">
              <p><b>{fileName}</b> contains {parsed.counts.books} books, {parsed.counts.media} titles, {parsed.counts.sessions} sessions, {parsed.counts.journal} journal entries and {parsed.counts.goals} goals.</p>
              {parsed.skipped.length > 0 && <p className="notice">{parsed.skipped.length} record(s) were invalid and will be ignored: {parsed.skipped.slice(0, 3).join('; ')}{parsed.skipped.length > 3 ? '…' : ''}</p>}
              <div className="field"><span className="field-label">If an item already exists</span>
                <Segmented<'skip' | 'replace' | 'overwrite'> label="Duplicate handling" value={mode} onChange={setMode} options={[{ value: 'skip', label: 'Keep mine, skip duplicates' }, { value: 'replace', label: 'Replace with imported' }, { value: 'overwrite', label: 'Replace whole library' }]} />
              </div>
              <div className="page-actions"><button className="btn btn-primary" onClick={() => void runImport()} data-testid="run-import">Import</button><button className="btn btn-ghost" onClick={() => { setParsed(null); if (fileRef.current) fileRef.current.value = ''; }}>Cancel</button></div>
            </div>
          )}
          {report.length > 0 && <ul className="import-report" role="status">{report.map((r) => <li key={r}>{r}</li>)}</ul>}
        </details>
      </section>

      <details className="set-card settings-more">
        <summary>More options</summary>
        <section className="settings-subsection">
          <h2>Sample content</h2>
          <p className="muted">Demo books and titles are labelled as samples and can be removed together without touching anything you added.</p>
          <div className="page-actions">
            <button className="btn" disabled={data.demoLoaded} onClick={() => { store.loadDemo(buildDemo(store.data.shelves)); toast('Sample content loaded'); }}>Load sample content</button>
            <button className="btn btn-danger" disabled={!data.demoLoaded} onClick={async () => { if (await confirmAction({ title: 'Remove all sample content?', body: `${demoCount} sample item(s) and their sessions and notes will be removed. Your own entries stay.`, confirmLabel: 'Remove sample content' })) { store.removeDemo(); toast('Sample content removed'); } }} data-testid="remove-demo">Remove sample content</button>
          </div>
        </section>
        <section className="settings-subsection danger-zone">
          <h2>Danger zone</h2>
          <button className="btn btn-danger" onClick={() => void reset()} data-testid="reset-all">Erase everything…</button>
        </section>
      </details>
    </div>
  );
}
