import { useMemo, useState } from 'react';
import type { Media, ViewStatus } from '../types';
import { VIEW_STATUS_LABEL, VIEW_STATUS_ORDER } from '../types';
import { formatDay, today } from '../lib/dates';
import { formatRuntime, isCaughtUp, isSeries, isWatched, mediaLabel, nextEpisode, percentWatched, seasonProgress, totalEpisodes, watchedCount } from '../lib/media';
import { getStore, useData } from '../lib/store';
import { confirmAction, goBack, toast } from '../lib/ui';
import { Icon } from './Icon';
import { JournalCard } from './JournalList';
import { JournalComposer } from './JournalComposer';
import { MediaForm } from './MediaForm';
import { Poster, ProgressBar, Rating, Segmented, TagInput } from './common';

export function MediaDetail({ mediaId }: { mediaId: string }) {
  const data = useData();
  const media = data.media.find((m) => m.id === mediaId);
  const [editing, setEditing] = useState(false);
  const [season, setSeason] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const entries = useMemo(() => data.journal.filter((j) => j.mediaId === mediaId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [data.journal, mediaId]);
  const store = getStore();

  if (!media) {
    return (
      <div className="page"><div className="empty"><h3>That title isn’t in your archive</h3><p>It may have been deleted.</p><button className="btn" onClick={() => goBack('/screen')}>Back to the archive</button></div></div>
    );
  }
  const m: Media = media;
  const series = isSeries(m);
  const activeSeason = season ?? m.seasons.find((s) => !seasonProgress(m, s.number).done)?.number ?? m.seasons[0]?.number ?? 1;
  const seasonInfo = m.seasons.find((s) => s.number === activeSeason);
  const next = series ? nextEpisode(m) : undefined;
  const watched = series ? watchedCount(m) : 0;
  const total = series ? totalEpisodes(m) : 0;

  const report = (r: { ok: boolean; error?: string }) => { if (!r.ok) toast((r as { error: string }).error, 'error'); };
  const watchNext = () => {
    const r = store.markNextEpisode(m.id, date);
    if (!r.ok) return toast(r.error, 'error');
    if (r.value === 'caught-up') toast(m.airing === 'ended' ? 'No unwatched episodes left.' : 'You’re caught up with every released episode.');
    else toast(`Marked S${r.value.season}·E${r.value.episode} watched`);
  };
  const changeStatus = (s: ViewStatus) => {
    if (m.format === 'movie' && s === 'completed') { store.addViewing(m.id, date); return; }
    report(store.setMediaStatus(m.id, s));
  };
  const setEp = (s: number, e: number, on: boolean) => report(store.setEpisode(m.id, s, e, on, date));
  const setAiring = (airing: Media['airing']) => {
    store.updateMedia(m.id, { airing });
    if (airing === 'ended') {
      const cur = getStore().data.media.find((x) => x.id === m.id)!;
      if (cur.status === 'watching' && isCaughtUp(cur)) { report(store.setMediaStatus(m.id, 'completed')); toast('Series ended and every episode is watched, so it’s now complete.'); }
    }
  };
  const addSeason = () => {
    const n = Math.max(0, ...m.seasons.map((s) => s.number)) + 1;
    store.updateMedia(m.id, { seasons: [...m.seasons, { number: n, episodeCount: 0 }] });
    setSeason(n);
  };
  const setCount = (num: number, count: number) => store.updateMedia(m.id, { seasons: m.seasons.map((s) => (s.number === num ? { ...s, episodeCount: Math.max(0, Math.min(999, count)) } : s)) });
  const remove = async () => {
    if (await confirmAction({ title: `Delete “${m.title}”?`, body: 'This removes the title, its watch history, and any quotes or notes saved from it. This can’t be undone.', confirmLabel: 'Delete title' })) {
      goBack('/screen');
      setTimeout(() => store.deleteMedia(m.id), 0);
      toast('Title deleted');
    }
  };

  return (
    <div className="media-detail" data-testid="media-detail">
      <div className="md-backdrop" style={m.backdropUrl ? { backgroundImage: `url("${m.backdropUrl}")` } : undefined} aria-hidden="true" />
      <div className="page">
        <button className="btn btn-ghost btn-sm md-back" onClick={() => goBack('/screen')}><Icon name="chevL" size={15} /> Archive</button>
        <header className="md-hero">
          <div className="md-poster"><Poster media={m} /></div>
          <div className="md-head">
            <p className="kicker">{mediaLabel(m)}{m.year ? ` · ${m.year}` : ''}{m.country ? ` · ${m.country}` : ''}</p>
            <h1 className="page-title">{m.title}</h1>
            {m.originalTitle && <p className="md-orig">{m.originalTitle}</p>}
            <p className="md-meta">
              {series ? `${m.seasons.length} season${m.seasons.length === 1 ? '' : 's'} · ${total} episode${total === 1 ? '' : 's'} released${m.airing === 'ongoing' ? ' · still airing' : m.airing === 'ended' ? ' · ended' : ''}` : formatRuntime(m.runtime)}
              {series && m.runtime ? ` · ${m.runtime} min each` : ''}
              {m.director ? ` · ${m.kind === 'movie' ? 'Directed' : 'Created'} by ${m.director}` : ''}{m.studio ? ` · ${m.studio}` : ''}
            </p>
            {m.genres.length > 0 && <p className="chip-row">{m.genres.map((g) => <span className="chip" key={g}>{g}</span>)}</p>}
            <div className="md-controls">
              <label className="md-status"><span className="field-label">Status</span>
                <select className="select" aria-label="Viewing status" value={m.status} onChange={(e) => changeStatus(e.target.value as ViewStatus)}>
                  {VIEW_STATUS_ORDER.map((s) => <option key={s} value={s}>{VIEW_STATUS_LABEL[s]}</option>)}
                </select>
              </label>
              <div><span className="field-label">Rating</span><Rating value={m.rating} onChange={(v) => store.updateMedia(m.id, { rating: v })} /></div>
              <label><span className="field-label">Date for next check-off</span><input type="date" className="input" max={today()} value={date} onChange={(e) => setDate(e.target.value || today())} /></label>
            </div>
            <div className="md-actions">
              {series ? (
                <button className="btn btn-primary" onClick={watchNext} data-testid="watch-next" disabled={!next}>
                  <Icon name="play" size={14} /> {next ? `Watched S${next.season}·E${next.episode}` : m.airing === 'ended' ? 'No episodes left' : 'Caught up: nothing new yet'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => { const r = store.addViewing(m.id, date, note); report(r); if (r.ok) { setNote(''); toast(m.viewings.length ? 'Rewatch logged' : 'Marked as watched'); } }} data-testid="log-viewing"><Icon name="play" size={14} /> {m.viewings.length ? 'Log a rewatch' : 'Mark as watched'}</button>
              )}
              <button className="btn btn-ghost" onClick={() => setEditing(true)}><Icon name="edit" size={15} /> Edit details</button>
              <button className="btn btn-ghost btn-danger" onClick={() => void remove()}><Icon name="trash" size={15} /> Delete</button>
            </div>
          </div>
        </header>

        {series && (
          <section className="md-card" aria-label="Episode tracker">
            <div className="md-card-head">
              <h2>Episodes</h2>
              <span className="muted">{watched} of {total} watched{total ? ` · ${percentWatched(m)}%` : ''}</span>
            </div>
            <ProgressBar value={total ? (watched / total) * 100 : 0} label="Series progress" tone="rose" />
            {m.status === 'watching' && isCaughtUp(m) && m.airing !== 'ended' && <p className="notice">You’re caught up. This show is still airing (or its status is unknown), so it stays in “Currently Watching” and isn’t counted as complete.</p>}
            <div className="field" style={{ marginTop: 12 }}>
              <span className="field-label">Airing status</span>
              <Segmented<Media['airing']> label="Airing status" value={m.airing} onChange={setAiring} options={[{ value: 'ongoing', label: 'Still airing' }, { value: 'ended', label: 'Ended' }, { value: 'unknown', label: 'Not sure' }]} />
            </div>
            <div className="season-tabs" role="tablist" aria-label="Seasons">
              {m.seasons.map((s) => {
                const p = seasonProgress(m, s.number);
                return (
                  <button key={s.number} role="tab" aria-selected={s.number === activeSeason} className={`season-tab ${s.number === activeSeason ? 'is-on' : ''}`} onClick={() => setSeason(s.number)}>
                    {s.title ?? `Season ${s.number}`} <small>{p.watched}/{p.total}{p.done ? ' ✓' : ''}</small>
                  </button>
                );
              })}
              <button className="season-tab" onClick={addSeason}><Icon name="plus" size={13} /> Season</button>
            </div>
            {seasonInfo ? (
              <div role="tabpanel">
                <div className="season-tools">
                  <label>Episodes released <input className="input input-sm" type="number" min={0} max={999} aria-label={`Episodes in season ${activeSeason}`} value={seasonInfo.episodeCount} onChange={(e) => setCount(activeSeason, Number(e.target.value) || 0)} /></label>
                  <button className="btn btn-sm" onClick={() => report(store.markSeasonWatched(m.id, activeSeason, date))} disabled={seasonInfo.episodeCount === 0 || seasonProgress(m, activeSeason).done}>Mark season watched</button>
                  {seasonProgress(m, activeSeason).done && <span className="badge badge-completed badge-inline">Season complete</span>}
                </div>
                {seasonInfo.episodeCount === 0 ? <p className="muted">No episodes released yet for this season. Set how many are out above.</p> : (
                  <ul className="ep-grid" aria-label={`Season ${activeSeason} episodes`}>
                    {Array.from({ length: seasonInfo.episodeCount }, (_, i) => i + 1).map((e) => {
                      const on = isWatched(m, activeSeason, e);
                      const log = m.episodes.find((x) => x.season === activeSeason && x.episode === e);
                      return (
                        <li key={e}>
                          <button className={`ep ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => setEp(activeSeason, e, !on)} title={on ? `Watched ${log?.watchedAt ? formatDay(log.watchedAt) : '(date unknown)'}` : 'Not watched'} aria-label={`Episode ${e}, ${on ? 'watched' : 'not watched'}`}>{e}</button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : <p className="muted">Add a season to start tracking episodes.</p>}
          </section>
        )}

        {!series && (
          <section className="md-card" aria-label="Viewings">
            <div className="md-card-head"><h2>Viewing history</h2><span className="muted">{m.viewings.length === 0 ? 'Not watched yet' : m.viewings.length === 1 ? 'Watched once' : `Watched ${m.viewings.length} times (${m.viewings.length - 1} rewatch${m.viewings.length === 2 ? '' : 'es'})`}</span></div>
            <label className="field"><span className="field-label">Note for the next viewing (optional)</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where, with whom, why now…" /></label>
            {m.viewings.length > 0 && (
              <ul className="viewing-list">
                {[...m.viewings].sort((a, b) => (a.date < b.date ? 1 : -1)).map((v) => (
                  <li key={v.id}><span>{formatDay(v.date)}</span>{v.note && <em>{v.note}</em>}
                    <button className="icon-btn icon-btn-sm" aria-label={`Remove viewing on ${formatDay(v.date)}`} onClick={async () => { if (await confirmAction({ title: 'Remove this viewing?', body: 'The film returns to “Plan to Watch” if it was the only one.', confirmLabel: 'Remove' })) store.removeViewing(m.id, v.id); }}><Icon name="trash" size={14} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {m.synopsis && <section className="md-card"><h2>Synopsis</h2><p className="prose">{m.synopsis}</p>{m.cast.length > 0 && <p className="muted"><b>Cast:</b> {m.cast.join(', ')}</p>}</section>}

        <section className="md-card">
          <h2>Your review &amp; notes</h2>
          <label className="field"><span className="field-label">Review</span><textarea className="paper-area" rows={4} defaultValue={m.review ?? ''} key={`r-${m.id}`} onBlur={(e) => e.target.value !== (m.review ?? '') && store.updateMedia(m.id, { review: e.target.value.trim() || undefined })} placeholder="What did you make of it?" /></label>
          <label className="field"><span className="field-label">Private notes</span><textarea className="paper-area" rows={3} defaultValue={m.notes ?? ''} key={`n-${m.id}`} onBlur={(e) => e.target.value !== (m.notes ?? '') && store.updateMedia(m.id, { notes: e.target.value.trim() || undefined })} /></label>
          <div className="field"><span className="field-label">Favourite characters</span><TagInput label="Favourite characters" value={m.favoriteCharacters} onChange={(v) => store.updateMedia(m.id, { favoriteCharacters: v })} placeholder="Add a character and press Enter" /></div>
          <div className="field"><span className="field-label">Your tags</span><TagInput label="Tags" value={m.tags} onChange={(v) => store.updateMedia(m.id, { tags: v })} placeholder="Mood, theme, who you watched with…" /></div>
        </section>

        <section className="md-card" aria-label="Quotes and scenes">
          <h2>Quotes, scenes &amp; thoughts</h2>
          <JournalComposer mediaId={m.id} fixedSubject compact />
          <div className="entries">{entries.length === 0 ? <p className="muted">Nothing saved from this title yet.</p> : entries.map((e) => <JournalCard key={e.id} entry={e} showSubject={false} />)}</div>
        </section>

        {m.startedAt || m.finishedAt ? <p className="muted md-dates">{m.startedAt ? `Started ${formatDay(m.startedAt)}` : ''}{m.startedAt && m.finishedAt ? ' · ' : ''}{m.finishedAt ? `Finished ${formatDay(m.finishedAt)}` : ''}</p> : null}
      </div>
      <MediaForm open={editing} onClose={() => setEditing(false)} kind={m.kind} media={m} />
    </div>
  );
}
