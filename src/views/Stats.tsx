import { useMemo, useState } from 'react';
import { formatRuntime } from '../lib/media';
import { MEDIA_KIND_LABEL } from '../types';
import { useData } from '../lib/store';
import { activityByDay, bookFinishes, bookGenreCounts, episodesWatched, kindBreakdown, mediaGenreCounts, minutesLogged, monthlyRows, moviesWatched, pagesLogged, readingDays, seriesCompleted, streaks, timeWatched, undatedCompletions, viewingDays, yearlyRecap, yearsWithData, type Period } from '../lib/stats';
import { BarChart, Heatmap, HBars } from '../components/Charts';
import { Link } from '../components/Link';
import { bookPath, mediaPath } from '../lib/ui';
import { EmptyState, Segmented } from '../components/common';

export function Stats() {
  const data = useData();
  const years = useMemo(() => yearsWithData(data), [data]);
  const [year, setYear] = useState(years[0]);
  const [scope, setScope] = useState<'reading' | 'screen' | 'both'>('both');
  const [heat, setHeat] = useState<'all' | 'reading' | 'screen'>('all');
  const p: Period = { kind: 'year', year };
  const rows = useMemo(() => monthlyRows(data, year), [data, year]);
  const recap = useMemo(() => yearlyRecap(data, year), [data, year]);
  const rd = useMemo(() => readingDays(data), [data]);
  const vd = useMemo(() => viewingDays(data), [data]);
  const rs = streaks(rd);
  const vs = streaks(vd);
  const heatCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const [d, a] of activityByDay(data)) {
      const r = a.sessions + a.finished, s = a.episodes + a.viewings;
      const n = heat === 'reading' ? r : heat === 'screen' ? s : r + s;
      if (n) m.set(d, n);
    }
    return m;
  }, [data, heat]);
  const empty = data.books.length === 0 && data.media.length === 0;
  const finishes = bookFinishes(data, p);
  const mw = moviesWatched(data, p);
  const ew = episodesWatched(data, p);
  const tw = timeWatched(data, p);
  const undated = undatedCompletions(data);

  if (empty) return <div className="page"><header className="page-head"><div><p className="kicker">Statistics</p><h1 className="page-title">Your year in reading &amp; watching</h1></div></header><EmptyState title="No numbers yet" body="Statistics are computed only from what you record. Add a book or a title, log a session or an episode, and they’ll appear here." /></div>;

  const tile = (n: string | number, l: string, note?: string) => <div className="stat-tile"><strong>{n}</strong><span>{l}</span>{note && <small>{note}</small>}</div>;
  return (
    <div className="page stats-page">
      <header className="page-head">
        <div><p className="kicker">Statistics</p><h1 className="page-title">{year} in reading &amp; watching</h1></div>
        <div className="page-actions">
          <select className="select select-sm" aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y}>{y}</option>)}</select>
          <Segmented<'reading' | 'screen' | 'both'> label="Show" value={scope} onChange={setScope} options={[{ value: 'both', label: 'Both' }, { value: 'reading', label: 'Reading' }, { value: 'screen', label: 'Screen' }]} />
        </div>
      </header>

      <section className="stat-grid" aria-label={`${year} totals`}>
        {scope !== 'screen' && <>
          {tile(finishes.length, 'books finished', undated ? `${undated} more completed without a date` : undefined)}
          {tile(pagesLogged(data, p).toLocaleString(), 'pages logged', 'from your own sessions')}
          {tile(Math.round(minutesLogged(data, p) / 60 * 10) / 10 || 0, 'hours logged', 'only sessions with minutes')}
          {tile(rs.current, 'day reading streak', `longest ever: ${rs.longest}`)}
        </>}
        {scope !== 'reading' && <>
          {tile(mw.distinct, 'movies watched', mw.rewatches ? `+ ${mw.rewatches} rewatch${mw.rewatches === 1 ? '' : 'es'}` : undefined)}
          {tile(ew.dated, 'episodes watched', ew.undated ? `${ew.undated} more logged without a date` : undefined)}
          {tile(seriesCompleted(data, p).length, 'series completed', 'ended and fully watched')}
          {tile(formatRuntime(tw.minutes), 'screen time', tw.excluded ? `${tw.excluded} without a runtime excluded` : undefined)}
          {tile(vs.current, 'day watching streak', `longest ever: ${vs.longest}`)}
        </>}
      </section>

      <div className="chart-grid">
        {scope !== 'screen' && <section className="chart-card"><h2>Books finished by month</h2><BarChart label={`Books finished per month in ${year}`} data={rows.map((r) => ({ label: r.label, value: r.books }))} /></section>}
        {scope !== 'screen' && <section className="chart-card"><h2>Pages logged by month</h2><BarChart label={`Pages logged per month in ${year}`} data={rows.map((r) => ({ label: r.label, value: r.pages }))} /></section>}
        {scope !== 'reading' && <section className="chart-card"><h2>Movies by month</h2><BarChart label={`Movies per month in ${year}`} data={rows.map((r) => ({ label: r.label, value: r.movies }))} /></section>}
        {scope !== 'reading' && <section className="chart-card"><h2>Episodes by month</h2><BarChart label={`Episodes per month in ${year}`} data={rows.map((r) => ({ label: r.label, value: r.episodes }))} /></section>}
        {scope !== 'screen' && <section className="chart-card"><h2>Book genres</h2><HBars label="Book genres" data={bookGenreCounts(data, p).slice(0, 8)} /></section>}
        {scope !== 'reading' && <section className="chart-card"><h2>Screen genres</h2><HBars label="Screen genres" data={mediaGenreCounts(data, p).slice(0, 8)} /></section>}
        {scope !== 'reading' && <section className="chart-card"><h2>By type</h2><HBars label="Titles by type" data={kindBreakdown(data, p).filter((k) => k.titles || k.episodes).map((k) => ({ label: `${MEDIA_KIND_LABEL[k.kind]} (${k.kind === 'movie' ? 'films' : 'titles'})`, count: k.titles }))} /></section>}
      </div>

      <section className="chart-card wide">
        <div className="chart-head"><h2>Activity calendar</h2><Segmented<'all' | 'reading' | 'screen'> label="Calendar shows" value={heat} onChange={setHeat} options={[{ value: 'all', label: 'Combined' }, { value: 'reading', label: 'Reading' }, { value: 'screen', label: 'Screen' }]} /></div>
        <Heatmap year={year} counts={heatCounts} weekStartsOn={data.prefs.weekStartsOn} label={`Recorded ${heat === 'all' ? 'reading and watching' : heat} days`} />
      </section>

      <section className="recap" aria-label={`${year} recap`} data-testid="recap">
        <p className="kicker">Yearly recap</p>
        <h2>{year}, as recorded</h2>
        {recap.books + recap.movies + recap.episodes + recap.sessions === 0 ? <p className="muted">Nothing was recorded in {year}.</p> : (
          <ul className="recap-list">
            {recap.books > 0 && <li>You finished <b>{recap.books}</b> book{recap.books === 1 ? '' : 's'}{recap.pages ? <> and logged <b>{recap.pages.toLocaleString()}</b> pages</> : null}{recap.avgBookRating ? <>, averaging <b>{recap.avgBookRating.toFixed(1)}★</b></> : null}.</li>}
            {recap.longestBook && <li>The longest was <Link to={bookPath(recap.longestBook.book.id)}>{recap.longestBook.book.title}</Link> ({recap.longestBook.book.pages} pages).</li>}
            {recap.topBook && <li>Your highest-rated read: <Link to={bookPath(recap.topBook.book.id)}>{recap.topBook.book.title}</Link> ({recap.topBook.rating}★).</li>}
            {recap.topBookGenre && <li>Most-read genre: <b>{recap.topBookGenre}</b>.</li>}
            {(recap.movies > 0 || recap.episodes > 0) && <li>On screen: <b>{recap.movies}</b> movie{recap.movies === 1 ? '' : 's'}{recap.rewatches ? ` (plus ${recap.rewatches} rewatch${recap.rewatches === 1 ? '' : 'es'})` : ''}, <b>{recap.episodes}</b> episodes, <b>{recap.seriesCompleted}</b> series completed.</li>}
            {recap.topScreen && <li>Top-rated watch: <Link to={mediaPath(recap.topScreen.id)}>{recap.topScreen.title}</Link> ({recap.topScreen.rating}★).</li>}
            {recap.topScreenGenre && <li>Most-watched genre: <b>{recap.topScreenGenre}</b>.</li>}
            {recap.busiestMonth && <li>Your busiest month was <b>{recap.busiestMonth.label}</b>.</li>}
            {recap.longestStreak > 1 && <li>Longest streak of recorded days: <b>{recap.longestStreak}</b>.</li>}
          </ul>
        )}
      </section>

      <details className="definitions">
        <summary>How these numbers are counted</summary>
        <ul>
          <li><b>Books finished</b>: reading runs you marked completed, by finish date. A finished reread counts again. Paused, abandoned and unfinished books never count.</li>
          <li><b>Pages logged</b>: pages from reading sessions you logged, on the session date. Page progress edits without a session aren’t counted.</li>
          <li><b>Movies watched</b>: distinct films with a viewing in the period. Rewatches are listed separately.</li>
          <li><b>Episodes watched</b>: episodes checked off with a date. Episodes marked “already watched” without a date appear in totals but not in months or calendars.</li>
          <li><b>Series completed</b>: series that have ended and have every episode watched. A caught-up ongoing show isn’t complete; a finished season isn’t a finished series.</li>
          <li><b>Screen time</b>: runtime × viewings or episodes, only for titles with a runtime.</li>
          <li><b>Streaks</b>: consecutive days with a recorded session, finished book, episode or viewing. Nothing is filled in on days you didn’t record.</li>
        </ul>
      </details>
    </div>
  );
}
