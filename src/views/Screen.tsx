import { useMemo, useState } from 'react';
import type { Media, MediaKind, ViewStatus } from '../types';
import { MEDIA_KIND_LABEL, VIEW_STATUS_LABEL, VIEW_STATUS_ORDER } from '../types';
import { isSeries, mediaLabel, percentWatched, nextEpisode } from '../lib/media';
import { getStore, useData } from '../lib/store';
import { mediaPath, navigate, openAdd, toast } from '../lib/ui';
import { Icon } from '../components/Icon';
import { MediaDetail } from '../components/MediaDetail';
import { EmptyState, Poster, ProgressBar, Rating, Segmented } from '../components/common';

type Sort = 'added' | 'title' | 'year' | 'rating';

export function Screen({ mediaId }: { mediaId?: string }) {
  const data = useData();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<MediaKind | 'all'>('all');
  const [status, setStatus] = useState<ViewStatus | 'all'>('all');
  const [sort, setSort] = useState<Sort>('added');
  const [layout, setLayout] = useState<'posters' | 'list'>('posters');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const l = data.media.filter((m) => (kind === 'all' || m.kind === kind) && (status === 'all' || m.status === status) && (!needle || `${m.title} ${m.originalTitle ?? ''} ${m.genres.join(' ')} ${m.tags.join(' ')} ${m.cast.join(' ')}`.toLowerCase().includes(needle)));
    const by: Record<Sort, (a: Media, b: Media) => number> = {
      added: (a, b) => (a.addedAt < b.addedAt ? 1 : -1),
      title: (a, b) => a.title.localeCompare(b.title),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0),
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    };
    return [...l].sort(by[sort]);
  }, [data.media, q, kind, status, sort]);

  if (mediaId) return <MediaDetail mediaId={mediaId} />;

  const counts = (s: ViewStatus | 'all') => (s === 'all' ? data.media : data.media.filter((m) => m.status === s)).length;
  const quickWatch = (m: Media) => {
    const r = getStore().markNextEpisode(m.id);
    if (!r.ok) return toast(r.error, 'error');
    toast(r.value === 'caught-up' ? 'Already caught up with released episodes.' : `“${m.title}”: marked S${r.value.season}·E${r.value.episode} watched`);
  };
  const watching = data.media.filter((m) => m.status === 'watching');

  return (
    <div className="page screen-page">
      <header className="page-head">
        <div><p className="kicker">The Screening Room</p><h1 className="page-title">Your watchlist</h1></div>
        <div className="page-actions"><button className="btn btn-primary" onClick={() => openAdd('movie')} data-testid="add-media"><Icon name="plus" size={16} /> Add a title</button></div>
      </header>

      {data.media.length === 0 ? (
        <EmptyState title="The screen is dark" body="Log the films, series, K-dramas and anime you watch. Search online or enter details by hand; nothing is invented." action={<button className="btn btn-primary" onClick={() => openAdd('movie')}>Add your first title</button>} />
      ) : (
        <>
          {watching.length > 0 && status === 'all' && kind === 'all' && !q && (
            <section className="now-showing" aria-label="Now watching">
              <h2 className="section-title">Now watching</h2>
              <div className="now-row">
                {watching.map((m) => {
                  const n = isSeries(m) ? nextEpisode(m) : undefined;
                  return (
                    <article className="now-card" key={m.id}>
                      <button className="now-main" onClick={() => navigate(mediaPath(m.id))}>
                        <span className="now-poster"><Poster media={m} /></span>
                        <span className="now-text"><strong>{m.title}</strong><small>{isSeries(m) ? (n ? `Next: S${n.season}·E${n.episode}` : 'Caught up') : mediaLabel(m)}</small><ProgressBar value={percentWatched(m)} label={`${m.title} progress`} tone="rose" /></span>
                      </button>
                      {isSeries(m) && n && <button className="btn btn-sm" onClick={() => quickWatch(m)} aria-label={`Mark next episode of ${m.title} watched`}><Icon name="check" size={14} /> Watched it</button>}
                    </article>
                  );
                })}
              </div>
            </section>
          )}
          <div className="toolbar" role="search">
            <div className="toolbar-search"><Icon name="search" size={16} /><input aria-label="Filter your watchlist" placeholder="Filter by title, genre, cast, tag…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <div className="toolbar-chips" role="group" aria-label="Filter by type">
              {(['all', 'movie', 'tv', 'kdrama', 'anime'] as const).map((k) => <button key={k} className={`chip chip-toggle ${kind === k ? 'is-on' : ''}`} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'Everything' : MEDIA_KIND_LABEL[k]}</button>)}
            </div>
            <div className="toolbar-chips" role="group" aria-label="Filter by status">
              {(['all', ...VIEW_STATUS_ORDER] as const).map((s) => <button key={s} className={`chip chip-toggle ${status === s ? 'is-on' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>{s === 'all' ? 'All' : VIEW_STATUS_LABEL[s]} <small>{counts(s)}</small></button>)}
            </div>
            <div className="toolbar-row">
              <select className="select select-sm" aria-label="Sort titles" value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="added">Recently added</option><option value="title">Title</option><option value="year">Year</option><option value="rating">Rating</option></select>
              <Segmented<'posters' | 'list'> label="Layout" value={layout} onChange={setLayout} options={[{ value: 'posters', label: <><Icon name="grid" size={15} /> Posters</> }, { value: 'list', label: <><Icon name="list" size={15} /> List</> }]} />
            </div>
          </div>
          {list.length === 0 ? <EmptyState title="Nothing matches" body="Try clearing a filter." action={<button className="btn btn-ghost" onClick={() => { setQ(''); setKind('all'); setStatus('all'); }}>Clear filters</button>} /> : layout === 'posters' ? (
            <ul className="poster-grid" data-testid="poster-grid">
              {list.map((m) => (
                <li key={m.id}>
                  <button className="poster-card" onClick={() => navigate(mediaPath(m.id))} aria-label={`${m.title}, ${mediaLabel(m)}, ${VIEW_STATUS_LABEL[m.status]}`}>
                    <span className="poster-frame"><Poster media={m} /><span className={`badge badge-${m.status === 'plan' ? 'want' : m.status === 'watching' ? 'reading' : m.status}`}>{VIEW_STATUS_LABEL[m.status]}</span>{m.status === 'watching' && isSeries(m) && <span className="gallery-progress"><ProgressBar value={percentWatched(m)} tone="rose" label="Progress" /></span>}</span>
                    <span className="gallery-title">{m.title}</span>
                    <span className="gallery-author">{mediaLabel(m)}{m.year ? ` · ${m.year}` : ''}</span>
                    {m.rating ? <Rating value={m.rating} readOnly size={13} /> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="list-view media-list" role="table" aria-label="Titles">
              {list.map((m) => (
                <button key={m.id} className="list-row" role="row" onClick={() => navigate(mediaPath(m.id))}>
                  <span className="list-title" role="cell"><span className="list-thumb"><Poster media={m} /></span><span><strong>{m.title}</strong><small>{mediaLabel(m)}{m.year ? ` · ${m.year}` : ''}</small></span></span>
                  <span role="cell"><span className={`badge badge-${m.status === 'plan' ? 'want' : m.status === 'watching' ? 'reading' : m.status} badge-inline`}>{VIEW_STATUS_LABEL[m.status]}</span></span>
                  <span role="cell" className="list-progress">{isSeries(m) ? <small>{percentWatched(m)}%</small> : <small>{m.viewings.length ? `${m.viewings.length}×` : '—'}</small>}</span>
                  <span role="cell">{m.rating ? <Rating value={m.rating} readOnly size={13} /> : <small>—</small>}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
