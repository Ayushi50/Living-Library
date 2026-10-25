import { useMemo } from 'react';
import { buildDemo } from '../lib/demo';
import { formatDay, relativeTime, today, yearOf } from '../lib/dates';
import { currentRun, percentRead } from '../lib/books';
import { isSeries, nextEpisode, percentWatched, mediaLabel } from '../lib/media';
import { getStore, useData } from '../lib/store';
import { bookFinishes, goalProgress, moviesWatched, pagesLogged, seriesCompleted, episodesWatched, streaks, readingDays, viewingDays } from '../lib/stats';
import { bookPath, mediaPath, navigate, openAdd, openGoals, openSearch, toast } from '../lib/ui';
import { Icon } from '../components/Icon';
import { Link } from '../components/Link';
import { BookCover, Poster, ProgressBar } from '../components/common';
import { Ring } from '../components/Charts';
import { GOAL_METRIC_LABEL } from '../types';

function greeting(name: string) {
  const h = new Date().getHours();
  const g = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name.trim() ? `${g}, ${name.trim()}` : g;
}

export function Home() {
  const data = useData();
  const store = getStore();
  const year = yearOf(today());
  const p = { kind: 'year', year } as const;
  const empty = data.books.length === 0 && data.media.length === 0;

  const reading = useMemo(() => data.books.filter((b) => b.status === 'reading').sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)), [data.books]);
  const watching = useMemo(() => data.media.filter((m) => m.status === 'watching').sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)), [data.media]);
  const recent = useMemo(() => {
    const items = [
      ...bookFinishes(data).map((f) => ({ key: `b${f.book.id}${f.run.id}`, day: f.day, kind: 'Book', title: f.book.title, to: bookPath(f.book.id), rating: f.rating, node: <BookCover book={f.book} /> })),
      ...data.media.filter((m) => m.status === 'completed' && m.finishedAt).map((m) => ({ key: `m${m.id}`, day: m.finishedAt!, kind: mediaLabel(m), title: m.title, to: mediaPath(m.id), rating: m.rating, node: <Poster media={m} /> })),
    ];
    return items.sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 8);
  }, [data]);
  const goals = data.goals.filter((g) => (g.scope === 'year' ? Number(g.period) === year : g.period === today().slice(0, 7))).sort((a, b) => a.scope.localeCompare(b.scope));
  const activity = [...data.activity].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
  const shelves = [...data.shelves].sort((a, b) => a.order - b.order).map((s) => ({ s, n: data.books.filter((b) => b.shelfIds.includes(s.id)).length })).filter((x) => x.n > 0);
  const rs = streaks(readingDays(data));
  const vs = streaks(viewingDays(data));
  const quickNext = (id: string, title: string) => {
    const r = store.markNextEpisode(id);
    if (!r.ok) return toast(r.error, 'error');
    toast(r.value === 'caught-up' ? 'Already caught up.' : `“${title}”: S${r.value.season}·E${r.value.episode} watched`);
  };

  return (
    <div className="page home-page">
      <header className="home-hero">
        <p className="kicker">{formatDay(today())}</p>
        <h1 className="page-title">{greeting(data.prefs.displayName)}</h1>
        <div className="home-search">
          <button className="search-big" onClick={openSearch}><Icon name="search" size={18} /> Search your library, or add something new…</button>
          <div className="quick-add" role="group" aria-label="Quick add">
            <button className="btn" onClick={() => openAdd('book')}><Icon name="book" size={15} /> Book</button>
            <button className="btn" onClick={() => openAdd('movie')}><Icon name="film" size={15} /> Movie</button>
            <button className="btn" onClick={() => openAdd('tv')}><Icon name="tv" size={15} /> TV</button>
            <button className="btn" onClick={() => openAdd('kdrama')}>K-Drama</button>
            <button className="btn" onClick={() => openAdd('anime')}>Anime</button>
          </div>
        </div>
      </header>

      {empty ? (
        <section className="first-run" aria-label="Getting started">
          <h2>Your library is empty, and that’s fine.</h2>
          <p>Everything here is built from what you record. Add your first book or title above, or try the app with clearly labelled sample content you can remove at any time.</p>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => openAdd('book')}>Add your first book</button>
            <button className="btn" onClick={() => { store.loadDemo(buildDemo(store.data.shelves)); toast('Sample content loaded. Remove it any time from Settings.'); }} data-testid="load-demo">Load sample content</button>
          </div>
        </section>
      ) : (
        <>
          <section className="home-cols">
            <div className="home-col" aria-label="Continue where you left off">
              <h2 className="section-title">Currently reading</h2>
              {reading.length === 0 ? <p className="muted">Nothing in progress. <button className="link" onClick={() => navigate('/library')}>Pick something from your shelves.</button></p> : (
                <ul className="continue-list">
                  {reading.slice(0, 4).map((b) => {
                    const run = currentRun(b);
                    return (
                      <li key={b.id}>
                        <Link to={bookPath(b.id)} className="continue-item">
                          <span className="continue-cover"><BookCover book={b} /></span>
                          <span className="continue-text"><strong>{b.title}</strong><small>{b.author}</small><ProgressBar value={percentRead(b)} tone="gold" label={`${b.title} progress`} /><small>{b.currentPage} of {(b.progressUnit === 'chapter' ? b.totalChapters : b.pages) ?? '?'} {b.progressUnit === 'chapter' ? 'chapters' : 'pages'} · {percentRead(b)}%{run?.startedAt ? ` · started ${formatDay(run.startedAt)}` : ''}</small></span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {watching.length > 0 && <div className="home-col cinema" aria-label="Currently watching">
              <h2 className="section-title">Currently watching</h2>
              {(
                <ul className="continue-list">
                  {watching.slice(0, 4).map((m) => {
                    const n = isSeries(m) ? nextEpisode(m) : undefined;
                    return (
                      <li key={m.id} className="continue-with-action">
                        <Link to={mediaPath(m.id)} className="continue-item">
                          <span className="continue-cover poster"><Poster media={m} /></span>
                          <span className="continue-text"><strong>{m.title}</strong><small>{isSeries(m) ? (n ? `Next up: S${n.season}·E${n.episode}` : m.airing === 'ongoing' ? 'Caught up. Waiting for new episodes' : 'No episodes left') : mediaLabel(m)}</small><ProgressBar value={percentWatched(m)} tone="rose" label={`${m.title} progress`} /></span>
                        </Link>
                        {n && <button className="btn btn-sm" onClick={() => quickNext(m.id, m.title)} aria-label={`Mark next episode of ${m.title} watched`}><Icon name="check" size={14} /> Watched</button>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>}
          </section>

          <section className="year-strip" aria-label={`${year} so far`}>
            <h2 className="section-title">{year} so far</h2>
            <div className="stat-grid">
              <div className="stat-tile"><strong>{bookFinishes(data, p).length}</strong><span>books finished</span></div>
              <div className="stat-tile"><strong>{pagesLogged(data, p).toLocaleString()}</strong><span>pages logged</span></div>
              <div className="stat-tile"><strong>{moviesWatched(data, p).distinct}</strong><span>movies</span></div>
              <div className="stat-tile"><strong>{episodesWatched(data, p).dated}</strong><span>episodes</span></div>
              <div className="stat-tile"><strong>{seriesCompleted(data, p).length}</strong><span>series completed</span></div>
              <div className="stat-tile"><strong>{Math.max(rs.current, vs.current)}</strong><span>day streak</span></div>
            </div>
          </section>

          <section aria-label="Goals">
            <div className="section-head"><h2 className="section-title">Goals</h2><button className="btn btn-ghost btn-sm" onClick={openGoals}>{goals.length ? 'Manage goals' : 'Set a goal'}</button></div>
            {goals.length === 0 ? <p className="muted">No goals for this period. Set one to see your progress here.</p> : (
              <div className="goal-rings">
                {goals.map((g) => { const gp = goalProgress(data, g); return (
                  <div className="goal-ring" key={g.id}><Ring pct={gp.pct} label={`${GOAL_METRIC_LABEL[g.metric]}`}><b>{gp.current}</b><small>/ {g.target}</small></Ring><span>{GOAL_METRIC_LABEL[g.metric]}<small>{g.scope === 'year' ? `in ${g.period}` : 'this month'}</small></span></div>
                ); })}
              </div>
            )}
          </section>

          <section className="home-cols">
            <div className="home-col" aria-label="Recent completions">
              <h2 className="section-title">Recently finished</h2>
              {recent.length === 0 ? <p className="muted">Finished books and titles will appear here.</p> : (
                <ul className="recent-strip">{recent.map((r) => <li key={r.key}><Link to={r.to} className="recent-item"><span className="recent-cover">{r.node}</span><strong>{r.title}</strong><small>{r.kind} · {formatDay(r.day)}</small></Link></li>)}</ul>
              )}
            </div>
            <div className="home-col" aria-label="Recent activity">
              <h2 className="section-title">Recent activity</h2>
              {activity.length === 0 ? <p className="muted">Your recorded activity will appear here.</p> : (
                <ul className="activity-list">{activity.map((a) => <li key={a.id}><span>{a.label}</span><small>{relativeTime(a.at)}</small></li>)}</ul>
              )}
            </div>
          </section>

          {shelves.length > 0 && (
            <section aria-label="Collections">
              <h2 className="section-title">Collections</h2>
              <div className="chip-row">{shelves.map(({ s, n }) => <button key={s.id} className="chip chip-big" onClick={() => navigate('/library')}>{s.name} <small>{n}</small></button>)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
