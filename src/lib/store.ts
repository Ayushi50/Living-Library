// The single source of truth. All mutations go through methods on `Store`, which keep the
// business rules (reading runs, rereads, episode completion, activity log) in one testable place.
import { useSyncExternalStore } from 'react';
import type {
  Activity, ActivityType, AppData, Book, BookStatus, EpisodeLog, Goal, GoalMetric, JournalEntry, Media, Preferences, ReadingSession, ViewStatus,
} from '../types';
import { currentRun, findDuplicateBook, progressTotal } from './books';
import { today, toDay } from './dates';
import { nowIso, uid } from './ids';
import { canCompleteSeries, findDuplicateMedia, isCaughtUp, isSeries, nextEpisode, totalEpisodes } from './media';
import { emptyData, normalizeBook, normalizeData, normalizeMedia, reconcileBookRuns } from './normalize';
import { SaveConflictError, type StorageAdapter } from './storage';

export interface Meta {
  ready: boolean;
  notice?: string;
  saveError?: string;
  adapterName: string;
}
export type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
function ok(): { ok: true; value: void };
function ok<T>(value: T): { ok: true; value: T };
function ok(value?: unknown) {
  return { ok: true as const, value };
}
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const MAX_ACTIVITY = 1500;

export interface ImportReport {
  addedBooks: number;
  addedMedia: number;
  replacedBooks: number;
  replacedMedia: number;
  skippedDuplicates: string[];
  skippedInvalid: string[];
  addedJournal: number;
  addedSessions: number;
}

export class Store {
  data: AppData = emptyData();
  meta: Meta;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private dirty = false;
  private saving: Promise<void> = Promise.resolve();
  /** Set after a save conflict: further saves are refused until the library is reloaded. */
  private blocked = false;
  /** Serialized form of the library as last loaded or saved; identical edits are not re-uploaded. */
  private lastSaved = '';
  private retries = 0;

  constructor(private readonly adapter: StorageAdapter, private readonly saveDelayMs = 120) {
    this.meta = { ready: false, adapterName: adapter.name };
  }

  /* ---- subscription (useSyncExternalStore) ---- */
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getData = () => this.data;
  getMeta = () => this.meta;
  private emit() {
    this.listeners.forEach((l) => l());
  }

  async init() {
    await this.reload();
  }

  async reload() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.dirty = false;
    this.blocked = false;
    this.retries = 0;
    this.data = emptyData();
    this.meta = { ...this.meta, ready: false, notice: undefined, saveError: undefined };
    this.emit();
    try {
      const { data, notice, guest, unsynced } = await this.adapter.load();
      this.data = data ?? emptyData();
      this.lastSaved = unsynced ? '' : JSON.stringify(this.data);
      this.meta = { ...this.meta, ready: true, notice };
      this.dirty = Boolean(unsynced && data);
      if (this.dirty) this.saveTimer = setTimeout(() => void this.flush(), this.saveDelayMs);
      if (guest) this.absorbGuestLibrary(guest);
    } catch (e) {
      this.meta = { ...this.meta, ready: true, notice: `Could not load saved data: ${(e as Error).message}` };
    }
    this.emit();
  }

  /** Quietly adds anything from this browser's signed-out library that the account doesn't have yet. */
  private absorbGuestLibrary(guest: AppData) {
    const r = this.importMerge(guest, 'skip');
    this.adapter.resolveGuest?.();
    const added = r.addedBooks + r.addedMedia;
    if (added) this.meta = { ...this.meta, notice: `Added ${added} item${added === 1 ? '' : 's'} from this browser to your library.` };
    this.emit();
  }

  dismissNotice() {
    this.meta = { ...this.meta, notice: undefined };
    this.emit();
  }

  /* ---- persistence ---- */
  private commit(next: AppData) {
    this.data = next;
    this.dirty = true;
    this.emit();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), this.saveDelayMs);
  }
  /** Saves run one at a time, in order, so an older write can never land after a newer one. */
  flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.saving = this.saving.then(() => this.writeNow());
    return this.saving;
  }
  private async writeNow() {
    if (!this.dirty || this.blocked) return;
    const snapshot = JSON.stringify(this.data);
    if (snapshot === this.lastSaved) {
      this.dirty = false;
      return;
    }
    this.dirty = false;
    try {
      await this.adapter.save(this.data);
      this.lastSaved = snapshot;
      this.retries = 0;
      if (this.meta.saveError) {
        this.meta = { ...this.meta, saveError: undefined };
        this.emit();
      }
    } catch (e) {
      this.dirty = true;
      if (e instanceof SaveConflictError) {
        this.blocked = true;
        this.meta = { ...this.meta, saveError: 'This library was changed on another device, so your latest edits were not saved. Export a backup from Settings, then reload the page to get the newest version.' };
        this.emit();
        return;
      }
      this.meta = { ...this.meta, saveError: `Your latest changes could not be saved (${(e as Error).message}). We'll keep retrying; you can also export a backup from Settings.` };
      this.emit();
      // Retry with exponential backoff (2s, 4s … capped at 60s) until the save goes through.
      if (!this.saveTimer) this.saveTimer = setTimeout(() => void this.flush(), Math.min(60_000, 2000 * 2 ** this.retries++));
    }
  }

  private withActivity(d: AppData, a: Omit<Activity, 'id' | 'at' | 'day'> & { at?: string; day?: string }): AppData {
    const at = a.at ?? nowIso();
    const entry: Activity = { id: uid('act'), at, day: a.day ?? toDay(new Date(at)), ...a };
    const activity = [...d.activity, entry];
    return { ...d, activity: activity.length > MAX_ACTIVITY ? activity.slice(activity.length - MAX_ACTIVITY) : activity };
  }
  private mapBook(id: string, fn: (b: Book) => Book, d: AppData = this.data): AppData {
    return { ...d, books: d.books.map((b) => (b.id === id ? { ...fn(b), updatedAt: nowIso() } : b)) };
  }
  private mapMedia(id: string, fn: (m: Media) => Media, d: AppData = this.data): AppData {
    return { ...d, media: d.media.map((m) => (m.id === id ? reconcileMedia({ ...fn(m), updatedAt: nowIso() }) : m)) };
  }

  /* =========================================================== books */

  findDuplicateBook(c: Pick<Book, 'title' | 'author' | 'isbn'>, ignoreId?: string) {
    return findDuplicateBook(this.data, c, ignoreId);
  }

  addBook(input: Partial<Book> & { title: string }, opts: { startDate?: string; finishDate?: string } = {}): Book {
    const status = input.status ?? 'want';
    const t = today();
    const runs = [...(input.runs ?? [])];
    if (!runs.length) {
      if (status === 'reading') runs.push({ id: uid('run'), outcome: 'reading', startedAt: opts.startDate ?? t });
      else if (status === 'completed') runs.push({ id: uid('run'), outcome: 'completed', startedAt: opts.startDate, finishedAt: opts.finishDate });
      else if (status === 'abandoned') runs.push({ id: uid('run'), outcome: 'abandoned', startedAt: opts.startDate, endedAt: opts.finishDate });
      else if (status === 'hold') runs.push({ id: uid('run'), outcome: 'reading', startedAt: opts.startDate });
    }
    const pages = input.pages;
    let book = normalizeBook({ ...input, id: input.id ?? uid('book'), status, runs, source: input.source ?? 'manual' });
    if (status === 'completed' && pages && !input.currentPage) book = { ...book, currentPage: pages };
    this.commit(this.withActivity({ ...this.data, books: [...this.data.books, book] }, { type: 'book-added', refKind: 'book', refId: book.id, label: `Added “${book.title}” to the library` }));
    if (status === 'reading') {
      this.commit(this.withActivity(this.data, { type: 'book-started', refKind: 'book', refId: book.id, label: `Started reading “${book.title}”` }));
    }
    if (status === 'completed' && opts.finishDate) {
      this.commit(this.withActivity(this.data, { type: 'book-finished', refKind: 'book', refId: book.id, label: `Finished “${book.title}”`, at: new Date(`${opts.finishDate}T12:00:00`).toISOString(), day: opts.finishDate }));
    }
    return book;
  }

  /** Edits descriptive fields. Status and run history are changed through dedicated methods. */
  updateBook(id: string, patch: Partial<Book>) {
    const { status: _s, runs: _r, id: _i, addedAt: _a, ...rest } = patch;
    this.commit(this.mapBook(id, (b) => normalizeBook({ ...b, ...rest })));
  }

  setAutoColor(id: string, hex: string) {
    const b = this.data.books.find((x) => x.id === id);
    if (!b || b.autoColor === hex) return;
    // Cosmetic cache only: keep updatedAt untouched.
    this.commit({ ...this.data, books: this.data.books.map((x) => (x.id === id ? { ...x, autoColor: hex } : x)) });
  }

  updateRun(bookId: string, runId: string, patch: { startedAt?: string; finishedAt?: string; endedAt?: string }) {
    this.commit(this.mapBook(bookId, (b) => ({ ...b, runs: b.runs.map((r) => (r.id === runId ? { ...r, ...patch } : r)) })));
  }

  setBookStatus(id: string, status: BookStatus, opts: { date?: string } = {}): Result {
    const book = this.data.books.find((b) => b.id === id);
    if (!book) return fail('Book not found');
    if (book.status === status) return ok();
    const date = opts.date ?? today();
    let d = this.data;
    let activity: ActivityType | undefined;
    let label = '';
    d = this.mapBook(id, (b) => {
      let runs = b.runs.map((r) => ({ ...r }));
      const cur = currentRun(b);
      let currentPage = b.currentPage;
      if (status === 'reading') {
        if (b.status === 'completed') {
          // Reread: keep the finished run, begin a fresh one.
          runs.push({ id: uid('run'), outcome: 'reading', startedAt: date });
          currentPage = 0;
          activity = 'book-started';
          label = `Started rereading “${b.title}”`;
        } else if (b.status === 'abandoned') {
          const last = runs[runs.length - 1];
          if (last && last.outcome === 'abandoned') {
            last.outcome = 'reading';
            delete last.endedAt;
          } else runs.push({ id: uid('run'), outcome: 'reading', startedAt: date });
          activity = 'book-started';
          label = `Picked “${b.title}” back up`;
        } else if (!cur) {
          runs.push({ id: uid('run'), outcome: 'reading', startedAt: date });
          activity = 'book-started';
          label = `Started reading “${b.title}”`;
        } else if (!cur.startedAt) {
          cur.startedAt = date;
          activity = b.status === 'want' ? 'book-started' : undefined;
          label = `Started reading “${b.title}”`;
        }
      } else if (status === 'completed') {
        let run = currentRun(b) ?? runs[runs.length - 1];
        if (!run || run.outcome !== 'reading') {
          run = { id: uid('run'), outcome: 'reading' };
          runs.push(run);
        } else run = runs.find((r) => r.id === run!.id)!;
        run.outcome = 'completed';
        run.finishedAt = date;
        delete run.endedAt;
        const total = progressTotal(b);
        if (total) currentPage = total;
        activity = 'book-finished';
        label = `Finished “${b.title}”`;
      } else if (status === 'abandoned') {
        const run = runs.find((r) => r.id === cur?.id);
        if (run) {
          run.outcome = 'abandoned';
          run.endedAt = date;
        }
        activity = 'book-abandoned';
        label = `Set “${b.title}” aside`;
      } else if (status === 'hold') {
        if (!cur) runs.push({ id: uid('run'), outcome: 'reading' });
      }
      return { ...b, status, runs, currentPage };
    });
    if (activity) d = this.withActivity(d, { type: activity, refKind: 'book', refId: id, label, day: date, at: date === today() ? nowIso() : new Date(`${date}T12:00:00`).toISOString() });
    this.commit(d);
    return ok();
  }

  /** Rating applies to the book and to its most recent finished run so rereads keep their own ratings. */
  rateBook(id: string, rating: number | undefined) {
    this.commit(
      this.mapBook(id, (b) => {
        const runs = b.runs.map((r) => ({ ...r }));
        for (let i = runs.length - 1; i >= 0; i--) {
          if (runs[i].outcome === 'completed') {
            runs[i].rating = rating;
            break;
          }
        }
        return { ...b, rating, runs };
      }),
    );
  }

  /** Logs a reading session the user reports. Updates current progress; never invents values. */
  logSession(bookId: string, input: { date?: string; toPage?: number; pagesRead?: number; minutes?: number; note?: string }): Result<ReadingSession> {
    const book = this.data.books.find((b) => b.id === bookId);
    if (!book) return fail('Book not found');
    if (book.status === 'completed') return fail('This book is finished. Start a reread to log new sessions.');
    const date = input.date ?? today();
    const total = progressTotal(book);
    const from = book.currentPage;
    let to = input.toPage;
    let pagesRead = input.pagesRead;
    if (to === undefined && pagesRead === undefined && input.minutes === undefined) return fail('Enter a page, pages read, or minutes.');
    if (to !== undefined) {
      if (to < 0) return fail('Page cannot be negative.');
      if (total && to > total) return fail(`This book has ${total} ${book.progressUnit === 'chapter' ? 'chapters' : 'pages'}.`);
      if (pagesRead === undefined && book.progressUnit === 'page') pagesRead = Math.max(0, to - from);
    } else if (pagesRead !== undefined && book.progressUnit === 'page') {
      to = from + pagesRead;
      if (total && to > total) to = total;
      pagesRead = to - from;
    }
    if (pagesRead !== undefined && pagesRead < 0) return fail('Pages read cannot be negative.');
    if (book.status !== 'reading') {
      const r = this.setBookStatus(bookId, 'reading', { date });
      if (!r.ok) return r;
    }
    const fresh = this.data.books.find((b) => b.id === bookId)!;
    const run = currentRun(fresh);
    const session: ReadingSession = {
      id: uid('sess'),
      bookId,
      runId: run?.id ?? '',
      date,
      pagesRead: book.progressUnit === 'page' ? pagesRead : undefined,
      fromPage: to !== undefined ? from : undefined,
      toPage: to,
      minutes: input.minutes,
      note: input.note?.trim() || undefined,
      createdAt: nowIso(),
    };
    let d: AppData = { ...this.data, sessions: [...this.data.sessions, session] };
    if (to !== undefined) d = this.mapBook(bookId, (b) => ({ ...b, currentPage: to! }), d);
    const unit = book.progressUnit === 'chapter' ? 'chapter' : 'page';
    d = this.withActivity(d, {
      type: 'session', refKind: 'book', refId: bookId, day: date,
      at: date === today() ? nowIso() : new Date(`${date}T12:00:00`).toISOString(),
      label: to !== undefined ? `Read “${book.title}” to ${unit} ${to}` : `Read “${book.title}”`,
    });
    this.commit(d);
    return ok(session);
  }

  deleteSession(id: string) {
    this.commit({ ...this.data, sessions: this.data.sessions.filter((s) => s.id !== id) });
  }

  deleteBook(id: string) {
    const d = this.data;
    this.commit({
      ...d,
      books: d.books.filter((b) => b.id !== id),
      sessions: d.sessions.filter((s) => s.bookId !== id),
      journal: d.journal.filter((j) => j.bookId !== id),
      activity: d.activity.filter((a) => !(a.refKind === 'book' && a.refId === id)),
    });
  }

  /* ========================================================= shelves */

  addShelf(name: string): Result<string> {
    const n = name.trim();
    if (!n) return fail('Give the shelf a name.');
    if (this.data.shelves.some((s) => s.name.toLowerCase() === n.toLowerCase())) return fail('A shelf with that name already exists.');
    const id = uid('shelf');
    this.commit({ ...this.data, shelves: [...this.data.shelves, { id, name: n.slice(0, 60), order: this.data.shelves.length }] });
    return ok(id);
  }
  renameShelf(id: string, name: string): Result {
    const n = name.trim();
    if (!n) return fail('Give the shelf a name.');
    if (this.data.shelves.some((s) => s.id !== id && s.name.toLowerCase() === n.toLowerCase())) return fail('A shelf with that name already exists.');
    this.commit({ ...this.data, shelves: this.data.shelves.map((s) => (s.id === id ? { ...s, name: n.slice(0, 60) } : s)) });
    return ok();
  }
  moveShelf(id: string, dir: -1 | 1) {
    const sorted = [...this.data.shelves].sort((a, b) => a.order - b.order);
    const i = sorted.findIndex((s) => s.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    this.commit({ ...this.data, shelves: sorted.map((s, k) => ({ ...s, order: k })) });
  }
  deleteShelf(id: string) {
    this.commit({
      ...this.data,
      shelves: this.data.shelves.filter((s) => s.id !== id).map((s, k) => ({ ...s, order: k })),
      books: this.data.books.map((b) => (b.shelfIds.includes(id) ? { ...b, shelfIds: b.shelfIds.filter((x) => x !== id) } : b)),
    });
  }
  setBookShelves(bookId: string, shelfIds: string[]) {
    this.commit(this.mapBook(bookId, (b) => ({ ...b, shelfIds })));
  }

  /* ========================================================== media */

  findDuplicateMedia(c: Pick<Media, 'title' | 'year' | 'kind'>, ignoreId?: string) {
    return findDuplicateMedia(this.data, c, ignoreId);
  }

  addMedia(input: Partial<Media> & { title: string }, opts: { watchedDate?: string; markAllWatched?: boolean } = {}): Media {
    const t = today();
    let m = normalizeMedia({ ...input, id: input.id ?? uid('media'), source: input.source ?? 'manual' });
    if (m.format === 'movie') {
      if (m.status === 'completed' && !m.viewings.length) {
        const date = opts.watchedDate;
        if (date) m = { ...m, viewings: [{ id: uid('view'), date }], finishedAt: date };
      }
      if (m.status === 'watching' && !m.startedAt) m = { ...m, startedAt: t };
    } else {
      if (opts.markAllWatched || (m.status === 'completed' && !m.episodes.length)) {
        const eps: EpisodeLog[] = [];
        for (const s of m.seasons) for (let e = 1; e <= s.episodeCount; e++) eps.push({ season: s.number, episode: e, ...(opts.watchedDate ? { watchedAt: opts.watchedDate } : {}) });
        m = { ...m, episodes: eps };
      }
      if (m.status === 'watching' && !m.startedAt) m = { ...m, startedAt: t };
      if (m.status === 'completed' && !m.finishedAt && opts.watchedDate) m = { ...m, finishedAt: opts.watchedDate };
    }
    m = reconcileMedia(m);
    this.commit(this.withActivity({ ...this.data, media: [...this.data.media, m] }, { type: 'media-added', refKind: 'media', refId: m.id, label: `Added “${m.title}” to the archive` }));
    return m;
  }

  updateMedia(id: string, patch: Partial<Media>) {
    const { id: _i, addedAt: _a, ...rest } = patch;
    this.commit(this.mapMedia(id, (m) => normalizeMedia({ ...m, ...rest })));
  }

  setMediaStatus(id: string, status: ViewStatus, opts: { date?: string } = {}): Result {
    const m = this.data.media.find((x) => x.id === id);
    if (!m) return fail('Title not found');
    if (m.status === status) return ok();
    const date = opts.date ?? today();
    if (status === 'completed') {
      if (m.format === 'movie') return this.addViewing(id, date);
      if (!canCompleteSeries(m)) {
        if (m.airing !== 'ended') return fail('This series is not marked as ended, so it can’t be completed yet. Finishing the released episodes completes a season, not the whole series.');
        return fail('Mark every episode as watched first (or use “Mark all as watched”).');
      }
    }
    let d = this.mapMedia(id, (x) => {
      const next: Media = { ...x, status };
      if (status === 'watching' && !x.startedAt) next.startedAt = date;
      if (status === 'completed') next.finishedAt = date;
      else if (x.status === 'completed') next.finishedAt = undefined;
      return next;
    });
    if (status === 'watching' && !m.startedAt) d = this.withActivity(d, { type: 'media-started', refKind: 'media', refId: id, label: `Started “${m.title}”`, day: date });
    if (status === 'completed') d = this.withActivity(d, { type: 'media-finished', refKind: 'media', refId: id, label: `Finished “${m.title}”`, day: date });
    this.commit(d);
    return ok();
  }

  /** Marks one episode watched/unwatched. Completing the last released episode completes a *season*, and
   *  completes the series only when the show has ended. */
  setEpisode(id: string, season: number, episode: number, watched: boolean, date: string = today()): Result {
    const m = this.data.media.find((x) => x.id === id);
    if (!m || !isSeries(m)) return fail('Not a series');
    const exists = m.episodes.some((e) => e.season === season && e.episode === episode);
    if (watched === exists) return ok();
    let d = this.mapMedia(id, (x) => {
      const episodes = watched ? [...x.episodes, { season, episode, watchedAt: date }] : x.episodes.filter((e) => !(e.season === season && e.episode === episode));
      const next: Media = { ...x, episodes };
      if (watched) {
        if (x.status === 'plan' || x.status === 'hold' || x.status === 'dropped') next.status = 'watching';
        if (!x.startedAt) next.startedAt = date;
      }
      return next;
    });
    if (watched) {
      d = this.withActivity(d, { type: 'episode', refKind: 'media', refId: id, day: date, at: date === today() ? nowIso() : new Date(`${date}T12:00:00`).toISOString(), label: `Watched “${m.title}” S${season}·E${episode}` });
      d = this.autoComplete(d, id, date);
    }
    this.commit(d);
    return ok();
  }

  /** The "I just watched the next episode" quick action. */
  markNextEpisode(id: string, date: string = today()): Result<{ season: number; episode: number } | 'caught-up'> {
    const m = this.data.media.find((x) => x.id === id);
    if (!m || !isSeries(m)) return fail('Not a series');
    const next = nextEpisode(m);
    if (!next) return ok('caught-up' as const) as Result<{ season: number; episode: number } | 'caught-up'>;
    const r = this.setEpisode(id, next.season, next.episode, true, date);
    return r.ok ? ok(next) : fail(r.error);
  }

  markSeasonWatched(id: string, season: number, date: string = today()): Result {
    const m = this.data.media.find((x) => x.id === id);
    const s = m?.seasons.find((x) => x.number === season);
    if (!m || !s) return fail('Season not found');
    const have = new Set(m.episodes.filter((e) => e.season === season).map((e) => e.episode));
    const add: EpisodeLog[] = [];
    for (let e = 1; e <= s.episodeCount; e++) if (!have.has(e)) add.push({ season, episode: e, watchedAt: date });
    if (!add.length) return ok();
    let d = this.mapMedia(id, (x) => {
      const next: Media = { ...x, episodes: [...x.episodes, ...add] };
      if (x.status === 'plan' || x.status === 'hold' || x.status === 'dropped') next.status = 'watching';
      if (!x.startedAt) next.startedAt = date;
      return next;
    });
    d = this.withActivity(d, { type: 'episode', refKind: 'media', refId: id, day: date, label: `Finished season ${season} of “${m.title}” (${add.length} episode${add.length === 1 ? '' : 's'})` });
    d = this.autoComplete(d, id, date);
    this.commit(d);
    return ok();
  }

  private autoComplete(d: AppData, id: string, date: string): AppData {
    const m = d.media.find((x) => x.id === id)!;
    if (m.status !== 'completed' && canCompleteSeries(m)) {
      d = this.mapMedia(id, (x) => ({ ...x, status: 'completed', finishedAt: date }), d);
      d = this.withActivity(d, { type: 'media-finished', refKind: 'media', refId: id, label: `Finished “${m.title}”`, day: date });
    }
    return d;
  }

  addViewing(id: string, date: string = today(), note?: string): Result {
    const m = this.data.media.find((x) => x.id === id);
    if (!m || m.format !== 'movie') return fail('Not a film');
    let d = this.mapMedia(id, (x) => {
      const viewings = [...x.viewings, { id: uid('view'), date, note: note?.trim() || undefined }];
      return { ...x, viewings, status: 'completed', finishedAt: viewings.map((v) => v.date).sort().pop() };
    });
    d = this.withActivity(d, { type: 'viewing', refKind: 'media', refId: id, day: date, at: date === today() ? nowIso() : new Date(`${date}T12:00:00`).toISOString(), label: m.viewings.length ? `Rewatched “${m.title}”` : `Watched “${m.title}”` });
    this.commit(d);
    return ok();
  }
  removeViewing(id: string, viewingId: string) {
    this.commit(
      this.mapMedia(id, (x) => {
        const viewings = x.viewings.filter((v) => v.id !== viewingId);
        return { ...x, viewings, status: viewings.length ? 'completed' : x.status === 'completed' ? 'plan' : x.status, finishedAt: viewings.length ? viewings.map((v) => v.date).sort().pop() : undefined };
      }),
    );
  }

  deleteMedia(id: string) {
    const d = this.data;
    this.commit({
      ...d,
      media: d.media.filter((m) => m.id !== id),
      journal: d.journal.filter((j) => j.mediaId !== id),
      activity: d.activity.filter((a) => !(a.refKind === 'media' && a.refId === id)),
    });
  }

  /* ========================================================= journal */

  addJournal(input: Pick<JournalEntry, 'kind' | 'text'> & Partial<JournalEntry>): Result<JournalEntry> {
    const text = input.text.trim();
    if (!text) return fail('Write something first.');
    const now = nowIso();
    const e: JournalEntry = {
      id: uid('jr'), kind: input.kind, text, bookId: input.bookId, mediaId: input.mediaId, attribution: input.attribution?.trim() || undefined,
      page: input.page, tags: input.tags ?? [], createdAt: input.createdAt ?? now, updatedAt: now,
    };
    const subject = this.data.books.find((b) => b.id === e.bookId)?.title ?? this.data.media.find((m) => m.id === e.mediaId)?.title;
    const verb = e.kind === 'quote' ? 'Saved a quote' : e.kind === 'thought' ? 'Wrote a thought' : 'Added a note';
    this.commit(this.withActivity({ ...this.data, journal: [...this.data.journal, e] }, { type: 'journal', refKind: 'journal', refId: e.id, label: subject ? `${verb} from “${subject}”` : verb }));
    return ok(e);
  }
  updateJournal(id: string, patch: Partial<JournalEntry>) {
    const { id: _i, createdAt: _c, ...rest } = patch;
    this.commit({ ...this.data, journal: this.data.journal.map((j) => (j.id === id ? { ...j, ...rest, text: (rest.text ?? j.text).trim() || j.text, updatedAt: nowIso() } : j)) });
  }
  deleteJournal(id: string) {
    this.commit({ ...this.data, journal: this.data.journal.filter((j) => j.id !== id), activity: this.data.activity.filter((a) => !(a.refKind === 'journal' && a.refId === id)) });
  }

  /* ============================================== goals & preferences */

  upsertGoal(g: { metric: GoalMetric; scope: 'year' | 'month'; period: string; target: number }): Result {
    if (!Number.isFinite(g.target) || g.target < 1) return fail('Target must be at least 1.');
    const existing = this.data.goals.find((x) => x.metric === g.metric && x.scope === g.scope && x.period === g.period);
    const goal: Goal = { id: existing?.id ?? uid('goal'), ...g, target: Math.round(g.target) };
    this.commit({ ...this.data, goals: existing ? this.data.goals.map((x) => (x.id === existing.id ? goal : x)) : [...this.data.goals, goal] });
    return ok();
  }
  deleteGoal(id: string) {
    this.commit({ ...this.data, goals: this.data.goals.filter((g) => g.id !== id) });
  }
  setPrefs(patch: Partial<Preferences>) {
    this.commit({ ...this.data, prefs: { ...this.data.prefs, ...patch } });
  }

  /* ================================================ data management */

  replaceAll(data: AppData) {
    this.commit(data);
  }
  resetAll() {
    this.commit({ ...emptyData(), prefs: this.data.prefs });
  }

  /** Merges an imported document. Duplicates are skipped by default (or replaced when asked). */
  importMerge(incoming: AppData, mode: 'skip' | 'replace' = 'skip'): ImportReport {
    const report: ImportReport = { addedBooks: 0, addedMedia: 0, replacedBooks: 0, replacedMedia: 0, skippedDuplicates: [], skippedInvalid: [], addedJournal: 0, addedSessions: 0 };
    let d = this.data;
    const idMap = new Map<string, string>();
    const shelfMap = new Map<string, string>();
    for (const s of incoming.shelves) {
      const same = d.shelves.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
      if (same) shelfMap.set(s.id, same.id);
      else {
        const created = { ...s, id: d.shelves.some((x) => x.id === s.id) ? uid('shelf') : s.id, order: d.shelves.length };
        d = { ...d, shelves: [...d.shelves, created] };
        shelfMap.set(s.id, created.id);
      }
    }
    for (const b of incoming.books) {
      const dup = findDuplicateBook(d, b) ?? d.books.find((x) => x.id === b.id);
      const mapped = { ...b, shelfIds: b.shelfIds.map((s) => shelfMap.get(s)).filter((s): s is string => !!s) };
      if (dup) {
        if (mode === 'replace') {
          idMap.set(b.id, dup.id);
          d = { ...d, books: d.books.map((x) => (x.id === dup.id ? { ...mapped, id: dup.id } : x)), sessions: d.sessions.filter((s) => s.bookId !== dup.id) };
          report.replacedBooks++;
        } else {
          idMap.set(b.id, dup.id);
          report.skippedDuplicates.push(`Book: ${b.title}`);
          // Sessions for a skipped duplicate are skipped too, to avoid double counting.
          idMap.set(`skip:${b.id}`, '1');
        }
      } else {
        const id = d.books.some((x) => x.id === b.id) ? uid('book') : b.id;
        idMap.set(b.id, id);
        d = { ...d, books: [...d.books, { ...mapped, id }] };
        report.addedBooks++;
      }
    }
    for (const m of incoming.media) {
      const dup = findDuplicateMedia(d, m) ?? d.media.find((x) => x.id === m.id);
      if (dup) {
        if (mode === 'replace') {
          idMap.set(m.id, dup.id);
          d = { ...d, media: d.media.map((x) => (x.id === dup.id ? { ...m, id: dup.id } : x)) };
          report.replacedMedia++;
        } else {
          idMap.set(m.id, dup.id);
          report.skippedDuplicates.push(`${m.format === 'movie' ? 'Film' : 'Series'}: ${m.title}`);
        }
      } else {
        const id = d.media.some((x) => x.id === m.id) ? uid('media') : m.id;
        idMap.set(m.id, id);
        d = { ...d, media: [...d.media, { ...m, id }] };
        report.addedMedia++;
      }
    }
    for (const s of incoming.sessions) {
      if (idMap.get(`skip:${s.bookId}`)) continue;
      const bookId = idMap.get(s.bookId);
      if (!bookId) continue;
      const book = d.books.find((b) => b.id === bookId);
      const runId = book?.runs.some((r) => r.id === s.runId) ? s.runId : book?.runs[book.runs.length - 1]?.id ?? '';
      d = { ...d, sessions: [...d.sessions, { ...s, id: d.sessions.some((x) => x.id === s.id) ? uid('sess') : s.id, bookId, runId }] };
      report.addedSessions++;
    }
    for (const j of incoming.journal) {
      const bookId = j.bookId ? idMap.get(j.bookId) : undefined;
      const mediaId = j.mediaId ? idMap.get(j.mediaId) : undefined;
      if (d.journal.some((x) => x.id === j.id || (x.text === j.text && x.createdAt === j.createdAt))) continue;
      if (j.bookId && idMap.get(`skip:${j.bookId}`)) continue;
      d = { ...d, journal: [...d.journal, { ...j, bookId, mediaId }] };
      report.addedJournal++;
    }
    for (const g of incoming.goals) {
      if (!d.goals.some((x) => x.metric === g.metric && x.scope === g.scope && x.period === g.period)) d = { ...d, goals: [...d.goals, { ...g, id: d.goals.some((x) => x.id === g.id) ? uid('goal') : g.id }] };
    }
    const known = new Set(d.activity.map((a) => a.id));
    d = { ...d, activity: [...d.activity, ...incoming.activity.filter((a) => !known.has(a.id) && idMap.has(a.refId))].slice(-MAX_ACTIVITY) };
    this.commit(d);
    return report;
  }

  loadDemo(demo: { books: Book[]; media: Media[]; sessions: ReadingSession[]; journal: JournalEntry[]; activity: Activity[] }) {
    if (this.data.demoLoaded) return;
    this.commit({
      ...this.data,
      demoLoaded: true,
      books: [...this.data.books, ...demo.books],
      media: [...this.data.media, ...demo.media],
      sessions: [...this.data.sessions, ...demo.sessions],
      journal: [...this.data.journal, ...demo.journal],
      activity: [...this.data.activity, ...demo.activity],
    });
  }
  removeDemo() {
    const d = this.data;
    const bookIds = new Set(d.books.filter((b) => b.isDemo).map((b) => b.id));
    const mediaIds = new Set(d.media.filter((m) => m.isDemo).map((m) => m.id));
    this.commit({
      ...d,
      demoLoaded: false,
      books: d.books.filter((b) => !b.isDemo),
      media: d.media.filter((m) => !m.isDemo),
      sessions: d.sessions.filter((s) => !bookIds.has(s.bookId)),
      journal: d.journal.filter((j) => !j.isDemo && !(j.bookId && bookIds.has(j.bookId)) && !(j.mediaId && mediaIds.has(j.mediaId))),
      activity: d.activity.filter((a) => !a.isDemo && !(a.refKind === 'book' && bookIds.has(a.refId)) && !(a.refKind === 'media' && mediaIds.has(a.refId))),
    });
  }

  /** Loads a parsed export replacing everything (after the user confirmed). */
  loadParsed(raw: unknown) {
    const { data, skipped } = normalizeData(raw);
    this.commit(data);
    return skipped;
  }
}

/** Keeps series completion honest: a "completed" series must have ended and have every known episode watched. */
export function reconcileMedia(m: Media): Media {
  if (isSeries(m) && m.status === 'completed' && totalEpisodes(m) > 0 && !canCompleteSeries(m) && !(m.episodes.length === 0 && m.airing === 'ended')) {
    return { ...m, status: 'watching', finishedAt: undefined };
  }
  return m;
}
export { isCaughtUp, reconcileBookRuns };

/* ----------------------------------------------------------- React hooks */

let singleton: Store | undefined;
export function setStore(s: Store) {
  singleton = s;
}
export function getStore(): Store {
  if (!singleton) throw new Error('Store not initialised');
  return singleton;
}
export function useData(): AppData {
  const s = getStore();
  return useSyncExternalStore(s.subscribe, s.getData);
}
export function useMeta(): Meta {
  const s = getStore();
  return useSyncExternalStore(s.subscribe, s.getMeta);
}
