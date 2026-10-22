import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/lib/store';
import { MemoryAdapter } from '../src/lib/storage';
import { percentRead, currentRun, spineGeometry } from '../src/lib/books';
import { canCompleteSeries, isCaughtUp, seasonProgress, watchedCount } from '../src/lib/media';
import { normalizeData } from '../src/lib/normalize';
import {
  bookFinishes, booksFinishedCount, episodesWatched, goalProgress, moviesWatched, pagesLogged, readingDays, seriesCompleted, streaks, timeWatched, yearlyRecap,
} from '../src/lib/stats';
import { addDays, today } from '../src/lib/dates';

async function fresh() {
  const adapter = new MemoryAdapter();
  const s = new Store(adapter, 0);
  await s.init();
  return { s, adapter };
}

test('progress logging computes pages and percent without inventing sessions', async () => {
  const { s } = await fresh();
  const b = s.addBook({ title: 'Test Book', author: 'A. Writer', pages: 200, status: 'reading' });
  assert.equal(s.data.sessions.length, 0, 'adding a book must not create sessions');
  const r = s.logSession(b.id, { toPage: 50 });
  assert.ok(r.ok);
  const book = s.data.books[0];
  assert.equal(book.currentPage, 50);
  assert.equal(percentRead(book), 25);
  assert.equal(s.data.sessions.length, 1);
  assert.equal(s.data.sessions[0].pagesRead, 50);
  s.logSession(b.id, { pagesRead: 30 });
  assert.equal(s.data.books[0].currentPage, 80);
  assert.equal(s.data.sessions[1].pagesRead, 30);
  assert.ok(!s.logSession(b.id, { toPage: 999 }).ok, 'cannot go past the last page');
});

test('finishing, rereading keeps previous history', async () => {
  const { s } = await fresh();
  const b = s.addBook({ title: 'Loop', author: 'X', pages: 100, status: 'reading' });
  s.logSession(b.id, { toPage: 100, date: '2026-03-01' });
  s.setBookStatus(b.id, 'completed', { date: '2026-03-02' });
  assert.equal(s.data.books[0].runs.length, 1);
  assert.equal(s.data.books[0].runs[0].finishedAt, '2026-03-02');
  assert.ok(!s.logSession(b.id, { toPage: 10 }).ok, 'finished books refuse sessions');
  s.setBookStatus(b.id, 'reading', { date: '2026-06-01' });
  const book = s.data.books[0];
  assert.equal(book.runs.length, 2, 'reread adds a run');
  assert.equal(book.runs[0].outcome, 'completed');
  assert.equal(book.runs[0].finishedAt, '2026-03-02', 'old run untouched');
  assert.equal(book.currentPage, 0);
  assert.equal(currentRun(book)?.startedAt, '2026-06-01');
  s.logSession(b.id, { toPage: 40, date: '2026-06-02' });
  assert.equal(s.data.sessions.length, 2, 'old sessions preserved');
  s.setBookStatus(b.id, 'completed', { date: '2026-06-10' });
  assert.equal(bookFinishes(s.data).length, 2);
  assert.equal(bookFinishes(s.data, { kind: 'year', year: 2026 }).length, 2);
});

test('want/hold/abandoned never count as finished', async () => {
  const { s } = await fresh();
  s.addBook({ title: 'A', author: 'a', status: 'want' });
  s.addBook({ title: 'B', author: 'b', status: 'hold' });
  const c = s.addBook({ title: 'C', author: 'c', status: 'reading', pages: 100 });
  s.setBookStatus(c.id, 'abandoned');
  assert.equal(booksFinishedCount(s.data, { kind: 'all' }), 0);
  assert.equal(s.data.books.find((b) => b.id === c.id)?.runs[0].outcome, 'abandoned');
});

test('logging a session on a want-to-read book starts it', async () => {
  const { s } = await fresh();
  const b = s.addBook({ title: 'Sleeper', author: 'z', pages: 300, status: 'want' });
  s.logSession(b.id, { toPage: 20, date: '2026-01-05' });
  assert.equal(s.data.books[0].status, 'reading');
  assert.equal(s.data.books[0].runs[0].startedAt, '2026-01-05');
});

test('series: finishing released episodes of an ongoing show does not complete it', async () => {
  const { s } = await fresh();
  const m = s.addMedia({ title: 'Ongoing Show', kind: 'tv', format: 'series', status: 'watching', airing: 'ongoing', seasons: [{ number: 1, episodeCount: 3 }] });
  s.markNextEpisode(m.id, '2026-02-01');
  s.markNextEpisode(m.id, '2026-02-02');
  s.markNextEpisode(m.id, '2026-02-03');
  let show = s.data.media[0];
  assert.equal(watchedCount(show), 3);
  assert.ok(isCaughtUp(show));
  assert.equal(show.status, 'watching', 'ongoing show stays in watching');
  assert.ok(seasonProgress(show, 1).done, 'season is done');
  assert.ok(!canCompleteSeries(show));
  assert.ok(!s.setMediaStatus(m.id, 'completed').ok, 'cannot manually complete an ongoing show');
  const again = s.markNextEpisode(m.id);
  assert.ok(again.ok && again.value === 'caught-up');
  // a new episode drops in
  s.updateMedia(m.id, { seasons: [{ number: 1, episodeCount: 4 }] });
  show = s.data.media[0];
  assert.ok(!isCaughtUp(show));
  // the show ends
  s.markNextEpisode(m.id, '2026-02-10');
  s.updateMedia(m.id, { airing: 'ended' });
  assert.ok(s.setMediaStatus(m.id, 'completed', { date: '2026-02-11' }).ok);
  assert.equal(s.data.media[0].finishedAt, '2026-02-11');
});

test('series: ended show completes automatically on its last episode; adding episodes reopens it', async () => {
  const { s } = await fresh();
  const m = s.addMedia({ title: 'Short Drama', kind: 'kdrama', format: 'series', status: 'plan', airing: 'ended', seasons: [{ number: 1, episodeCount: 2 }] });
  s.markNextEpisode(m.id, '2026-04-01');
  assert.equal(s.data.media[0].status, 'watching');
  assert.equal(s.data.media[0].startedAt, '2026-04-01');
  s.markNextEpisode(m.id, '2026-04-02');
  assert.equal(s.data.media[0].status, 'completed');
  assert.equal(s.data.media[0].finishedAt, '2026-04-02');
  assert.equal(seriesCompleted(s.data, { kind: 'year', year: 2026 }).length, 1);
  s.setEpisode(m.id, 1, 2, false);
  assert.equal(s.data.media[0].status, 'watching', 'unchecking an episode reopens the series');
  assert.equal(seriesCompleted(s.data, { kind: 'all' }).length, 0);
});

test('multi-season order and season completion', async () => {
  const { s } = await fresh();
  const m = s.addMedia({ title: 'Two Seasons', kind: 'anime', format: 'series', status: 'watching', airing: 'ongoing', seasons: [{ number: 1, episodeCount: 2 }, { number: 2, episodeCount: 2 }] });
  s.markSeasonWatched(m.id, 1, '2026-05-01');
  assert.ok(seasonProgress(s.data.media[0], 1).done);
  assert.ok(!seasonProgress(s.data.media[0], 2).done);
  const r = s.markNextEpisode(m.id, '2026-05-02');
  assert.ok(r.ok && r.value !== 'caught-up' && r.value.season === 2 && r.value.episode === 1);
});

test('movies: rewatch history and counts', async () => {
  const { s } = await fresh();
  const m = s.addMedia({ title: 'Film', kind: 'movie', format: 'movie', runtime: 100, status: 'plan' });
  s.addViewing(m.id, '2026-01-10');
  s.addViewing(m.id, '2026-08-10', 'with friends');
  const film = s.data.media[0];
  assert.equal(film.viewings.length, 2);
  assert.equal(film.status, 'completed');
  const y = { kind: 'year', year: 2026 } as const;
  assert.deepEqual(moviesWatched(s.data, y), { distinct: 1, rewatches: 1, viewings: 2 });
  assert.equal(timeWatched(s.data, y).minutes, 200);
  s.removeViewing(m.id, film.viewings[1].id);
  assert.equal(moviesWatched(s.data, y).viewings, 1);
});

test('episodes without a date are not placed on the calendar', async () => {
  const { s } = await fresh();
  s.addMedia({ title: 'Binge', kind: 'tv', format: 'series', status: 'completed', airing: 'ended', runtime: 30, seasons: [{ number: 1, episodeCount: 4 }] });
  assert.equal(s.data.media[0].status, 'completed');
  assert.equal(s.data.media[0].episodes.length, 4);
  assert.ok(s.data.media[0].episodes.every((e) => e.watchedAt === undefined));
  assert.deepEqual(episodesWatched(s.data, { kind: 'year', year: 2026 }), { dated: 0, undated: 0 });
  assert.deepEqual(episodesWatched(s.data, { kind: 'all' }), { dated: 0, undated: 4 });
});

test('streaks come only from recorded activity', () => {
  const t = today();
  const days = new Set([addDays(t, -1), addDays(t, -2), addDays(t, -3), addDays(t, -10), addDays(t, -11)]);
  assert.deepEqual(streaks(days, t), { current: 3, longest: 3 });
  assert.deepEqual(streaks(new Set([addDays(t, -5)]), t), { current: 0, longest: 1 });
  assert.deepEqual(streaks(new Set(), t), { current: 0, longest: 0 });
  assert.equal(streaks(new Set([t]), t).current, 1);
});

test('goals and recap reflect saved records only', async () => {
  const { s } = await fresh();
  const b = s.addBook({ title: 'G', author: 'g', pages: 100, status: 'reading', genres: ['Fantasy'] });
  s.logSession(b.id, { toPage: 60, date: '2026-02-01' });
  s.logSession(b.id, { toPage: 100, date: '2026-02-03' });
  s.setBookStatus(b.id, 'completed', { date: '2026-02-03' });
  s.rateBook(b.id, 4.5);
  s.upsertGoal({ metric: 'books', scope: 'year', period: '2026', target: 10 });
  s.upsertGoal({ metric: 'pages', scope: 'month', period: '2026-02', target: 200 });
  const [g1, g2] = s.data.goals;
  assert.deepEqual(goalProgress(s.data, g1), { current: 1, target: 10, pct: 10 });
  assert.deepEqual(goalProgress(s.data, g2), { current: 100, target: 200, pct: 50 });
  const recap = yearlyRecap(s.data, 2026);
  assert.equal(recap.books, 1);
  assert.equal(recap.pages, 100);
  assert.equal(recap.avgBookRating, 4.5);
  assert.equal(recap.topBookGenre, 'Fantasy');
  assert.equal(recap.longestStreak, 1);
  assert.equal(yearlyRecap(s.data, 2025).books, 0);
  assert.equal(pagesLogged(s.data, { kind: 'month', key: '2026-03' }), 0);
  assert.deepEqual([...readingDays(s.data)].sort(), ['2026-02-01', '2026-02-03']);
});

test('data survives a reload through the storage adapter', async () => {
  const { s, adapter } = await fresh();
  const b = s.addBook({ title: 'Persist', author: 'p', pages: 100, status: 'reading' });
  s.logSession(b.id, { toPage: 42 });
  await s.flush();
  const s2 = new Store(adapter, 0);
  await s2.init();
  assert.equal(s2.data.books[0].title, 'Persist');
  assert.equal(s2.data.books[0].currentPage, 42);
  assert.equal(s2.data.sessions.length, 1);
});

test('import validates records and skips duplicates', async () => {
  const { s } = await fresh();
  s.addBook({ title: 'The Hobbit', author: 'J.R.R. Tolkien', status: 'want' });
  const { data, skipped } = normalizeData({
    books: [
      { title: 'the hobbit', author: 'J. R. R. Tolkien' },
      { title: 'Dune', author: 'Frank Herbert', pages: 600, status: 'completed' },
      { author: 'No Title' },
    ],
    media: [{ title: 'Spirited Away', kind: 'anime', format: 'movie', year: 2001 }],
  });
  assert.equal(skipped.length, 1, 'record without a title is rejected');
  const rep = s.importMerge(data, 'skip');
  assert.equal(rep.addedBooks, 1);
  assert.equal(rep.addedMedia, 1);
  assert.equal(rep.skippedDuplicates.length, 1);
  assert.equal(s.data.books.length, 2);
  const rep2 = s.importMerge(data, 'skip');
  assert.equal(rep2.addedBooks, 0);
  assert.equal(rep2.addedMedia, 0);
  assert.equal(s.data.books.length, 2);
});

test('deleting a book removes its sessions and journal entries', async () => {
  const { s } = await fresh();
  const b = s.addBook({ title: 'Gone', author: 'x', pages: 50, status: 'reading' });
  s.logSession(b.id, { toPage: 10 });
  s.addJournal({ kind: 'quote', text: 'A line', bookId: b.id, page: 10 });
  s.deleteBook(b.id);
  assert.equal(s.data.sessions.length, 0);
  assert.equal(s.data.journal.length, 0);
  assert.equal(s.data.books.length, 0);
});

test('demo content can be loaded and fully removed', async () => {
  const { s } = await fresh();
  const mine = s.addBook({ title: 'Mine', author: 'me', status: 'want' });
  const { buildDemo } = await import('../src/lib/demo');
  s.loadDemo(buildDemo());
  assert.ok(s.data.books.length > 5 && s.data.demoLoaded);
  assert.ok(s.data.books.filter((b) => b.isDemo).length === s.data.books.length - 1);
  s.removeDemo();
  assert.equal(s.data.books.length, 1);
  assert.equal(s.data.books[0].id, mine.id);
  assert.equal(s.data.media.length, 0);
  assert.equal(s.data.sessions.length, 0);
  assert.equal(s.data.demoLoaded, false);
});

test('spine geometry varies with page count and stays bounded', () => {
  const mk = (pages: number | undefined, id: string, edition?: string) => spineGeometry({ id, title: id, pages, edition } as never);
  const thin = mk(120, 'a');
  const thick = mk(900, 'b');
  assert.ok(thick.width > thin.width + 20);
  assert.ok(thin.width >= 24 && thick.width <= 80);
  assert.ok(mk(undefined, 'c').hasEstimatedPages);
  assert.ok(mk(300, 'd', 'Hardcover').height > mk(300, 'd', 'Mass market paperback').height);
});

test('saves are serialized and a conflict blocks further saves until reload', async () => {
  const { SaveConflictError } = await import('../src/lib/storage');
  const order: string[] = [];
  let failNext = false;
  const adapter = {
    name: 'slow',
    load: async () => ({ data: null }),
    save: async (d: { prefs: { displayName?: string } }) => {
      if (failNext) throw new SaveConflictError();
      await new Promise((r) => setTimeout(r, order.length === 0 ? 30 : 0));
      order.push(String(d.prefs.displayName));
    },
  };
  const s = new Store(adapter as never, 0);
  await s.init();
  s.setPrefs({ displayName: 'first' });
  const f1 = s.flush();
  await new Promise((r) => setTimeout(r, 5)); // first save is now in flight
  s.setPrefs({ displayName: 'second' });
  await Promise.all([f1, s.flush()]);
  assert.deepEqual(order, ['first', 'second']);

  failNext = true;
  s.setPrefs({ displayName: 'third' });
  await s.flush();
  assert.match(s.meta.saveError ?? '', /another device/);
  failNext = false;
  await s.flush();
  assert.equal(order.length, 2); // still blocked
  await s.reload();
  assert.equal(s.meta.saveError, undefined);
});


test('identical data is not uploaded again and failed saves retry on their own', async () => {
  let saves = 0;
  let failures = 1;
  const adapter = {
    name: 'flaky',
    load: async () => ({ data: null }),
    save: async () => {
      if (failures-- > 0) throw new Error('offline');
      saves++;
    },
  };
  const s = new Store(adapter as never, 0);
  await s.init();
  s.setPrefs({ displayName: 'A' });
  await s.flush();
  assert.match(s.meta.saveError ?? '', /retrying/);
  await s.flush(); // manual retry, as the banner button does
  assert.equal(saves, 1);
  assert.equal(s.meta.saveError, undefined);

  s.setPrefs({ displayName: 'B' });
  s.setPrefs({ displayName: 'A' }); // back to the saved state
  await s.flush();
  assert.equal(saves, 1);
});
