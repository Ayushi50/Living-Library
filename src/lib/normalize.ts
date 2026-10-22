// Turns untrusted/partial input (imports, saved data, API results, forms) into well-formed records.
import {
  DEFAULT_PREFS, SCHEMA_VERSION,
  type Activity, type AppData, type Book, type BookFormat, type BookStatus, type Goal, type JournalEntry, type Media,
  type MediaKind, type Preferences, type ReadingRun, type ReadingSession, type Shelf, type ViewStatus,
} from '../types';
import { isDay, toDay } from './dates';
import { nowIso, uid } from './ids';

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 20000): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const num = (v: unknown, min = -Infinity, max = Infinity): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};
const int = (v: unknown, min = 0, max = 1e7): number | undefined => {
  const n = num(v, min, max);
  return n === undefined ? undefined : Math.round(n);
};
const day = (v: unknown): string | undefined => (isDay(v) ? v : undefined);
const strList = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[;,]/) : [];
  const out: string[] = [];
  for (const x of raw) {
    const s = typeof x === 'string' ? x.trim() : '';
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s.slice(0, 80));
  }
  return out;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const rating = (v: unknown): number | undefined => {
  const n = num(v, 0.5, 5);
  return n === undefined ? undefined : Math.round(n * 2) / 2;
};
const hex = (v: unknown): string | undefined => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);
const url = (v: unknown): string | undefined => {
  const s = str(v, 2000);
  return s && /^(https?:\/\/|data:image\/)/i.test(s) ? s : undefined;
};

export const BOOK_STATUSES = ['want', 'reading', 'completed', 'hold', 'abandoned'] as const;
export const BOOK_FORMATS = ['physical', 'ebook', 'audiobook'] as const;
export const VIEW_STATUSES = ['plan', 'watching', 'completed', 'hold', 'dropped'] as const;
export const MEDIA_KINDS = ['movie', 'tv', 'kdrama', 'anime'] as const;

export class ValidationError extends Error {}

export function normalizeRun(raw: unknown): ReadingRun | undefined {
  if (!isRec(raw)) return undefined;
  const outcome = oneOf(raw.outcome, ['reading', 'completed', 'abandoned'] as const, 'reading');
  return {
    id: str(raw.id, 60) ?? uid('run'),
    startedAt: day(raw.startedAt),
    finishedAt: outcome === 'completed' ? day(raw.finishedAt) : undefined,
    endedAt: outcome === 'abandoned' ? day(raw.endedAt) : undefined,
    outcome,
    rating: rating(raw.rating),
  };
}

export function normalizeBook(raw: unknown): Book {
  if (!isRec(raw)) throw new ValidationError('Not an object');
  const title = str(raw.title, 300);
  if (!title) throw new ValidationError('A book needs a title');
  const status = oneOf<BookStatus>(raw.status, BOOK_STATUSES, 'want');
  const runs = (Array.isArray(raw.runs) ? raw.runs : []).map(normalizeRun).filter((r): r is ReadingRun => !!r);
  const now = nowIso();
  const pages = int(raw.pages, 1, 20000);
  const unit = oneOf(raw.progressUnit, ['page', 'chapter'] as const, 'page');
  const book: Book = {
    id: str(raw.id, 60) ?? uid('book'),
    title,
    author: str(raw.author, 200) ?? 'Unknown author',
    coverUrl: url(raw.coverUrl),
    isbn: str(raw.isbn, 20),
    edition: str(raw.edition, 120),
    publisher: str(raw.publisher, 120),
    year: int(raw.year, 0, 2200),
    pages,
    genres: strList(raw.genres),
    tags: strList(raw.tags),
    format: oneOf<BookFormat>(raw.format, BOOK_FORMATS, 'physical'),
    synopsis: str(raw.synopsis),
    status,
    progressUnit: unit,
    currentPage: int(raw.currentPage, 0, 1e6) ?? 0,
    totalChapters: int(raw.totalChapters, 1, 5000),
    rating: rating(raw.rating),
    review: str(raw.review),
    notes: str(raw.notes),
    spineColor: hex(raw.spineColor),
    autoColor: hex(raw.autoColor),
    shelfIds: strList(raw.shelfIds),
    runs,
    source: oneOf(raw.source, ['manual', 'openlibrary', 'googlebooks', 'import', 'demo'] as const, 'manual'),
    externalId: str(raw.externalId, 80),
    isDemo: raw.isDemo === true ? true : undefined,
    addedAt: str(raw.addedAt, 40) ?? now,
    updatedAt: str(raw.updatedAt, 40) ?? now,
  };
  return reconcileBookRuns(book);
}

/** Keeps `status` and `runs` consistent without inventing dates or history. */
export function reconcileBookRuns(book: Book): Book {
  const runs = book.runs.map((r) => ({ ...r }));
  const last = runs[runs.length - 1];
  if (book.status === 'reading' && !runs.some((r) => r.outcome === 'reading')) {
    runs.push({ id: uid('run'), outcome: 'reading' });
  }
  if (book.status === 'completed' && last && last.outcome === 'reading') {
    last.outcome = 'completed';
  }
  if (book.status === 'completed' && !runs.length) runs.push({ id: uid('run'), outcome: 'completed' });
  return { ...book, runs };
}

export function normalizeMedia(raw: unknown): Media {
  if (!isRec(raw)) throw new ValidationError('Not an object');
  const title = str(raw.title, 300);
  if (!title) throw new ValidationError('A title needs a name');
  const kind = oneOf<MediaKind>(raw.kind, MEDIA_KINDS, 'movie');
  const format = kind === 'movie' ? 'movie' : oneOf(raw.format, ['movie', 'series'] as const, 'series');
  const now = nowIso();
  const seasons = (Array.isArray(raw.seasons) ? raw.seasons : [])
    .map((s) => (isRec(s) ? { number: int(s.number, 0, 200), episodeCount: int(s.episodeCount, 0, 5000), title: str(s.title, 120) } : undefined))
    .filter((s): s is { number: number; episodeCount: number; title: string | undefined } => !!s && s.number !== undefined && s.episodeCount !== undefined)
    .map((s) => ({ number: s.number, episodeCount: s.episodeCount, ...(s.title ? { title: s.title } : {}) }));
  const episodes = (Array.isArray(raw.episodes) ? raw.episodes : [])
    .map((e) => (isRec(e) ? { season: int(e.season, 0, 200), episode: int(e.episode, 1, 5000), watchedAt: day(e.watchedAt) } : undefined))
    .filter((e): e is { season: number; episode: number; watchedAt: string | undefined } => !!e && e.season !== undefined && e.episode !== undefined)
    .map((e) => (e.watchedAt ? e : { season: e.season, episode: e.episode }));
  const seenEp = new Set<string>();
  const uniqueEpisodes = episodes.filter((e) => {
    const k = `${e.season}x${e.episode}`;
    if (seenEp.has(k)) return false;
    seenEp.add(k);
    return true;
  });
  const viewings = (Array.isArray(raw.viewings) ? raw.viewings : [])
    .map((v) => (isRec(v) && day(v.date) ? { id: str(v.id, 60) ?? uid('view'), date: v.date as string, note: str(v.note, 500) } : undefined))
    .filter((v): v is { id: string; date: string; note: string | undefined } => !!v);
  const media: Media = {
    id: str(raw.id, 60) ?? uid('media'),
    kind,
    format,
    title,
    originalTitle: str(raw.originalTitle, 300),
    posterUrl: url(raw.posterUrl),
    backdropUrl: url(raw.backdropUrl),
    year: int(raw.year, 1850, 2200),
    country: str(raw.country, 80),
    language: str(raw.language, 60),
    genres: strList(raw.genres),
    tags: strList(raw.tags),
    runtime: int(raw.runtime, 1, 2000),
    director: str(raw.director, 200),
    cast: strList(raw.cast),
    studio: str(raw.studio, 120),
    synopsis: str(raw.synopsis),
    status: oneOf<ViewStatus>(raw.status, VIEW_STATUSES, 'plan'),
    rating: rating(raw.rating),
    review: str(raw.review),
    notes: str(raw.notes),
    favoriteCharacters: strList(raw.favoriteCharacters),
    quotes: (Array.isArray(raw.quotes) ? raw.quotes : []).map((q) => str(q, 1000)).filter((q): q is string => !!q),
    airing: oneOf(raw.airing, ['ongoing', 'ended', 'unknown'] as const, 'unknown'),
    seasons: format === 'series' ? seasons : [],
    episodes: format === 'series' ? uniqueEpisodes : [],
    viewings: format === 'movie' ? viewings : [],
    startedAt: day(raw.startedAt),
    finishedAt: day(raw.finishedAt),
    source: oneOf(raw.source, ['manual', 'tmdb', 'anilist', 'import', 'demo'] as const, 'manual'),
    externalId: str(raw.externalId, 80),
    isDemo: raw.isDemo === true ? true : undefined,
    addedAt: str(raw.addedAt, 40) ?? now,
    updatedAt: str(raw.updatedAt, 40) ?? now,
  };
  return media;
}

export function normalizeSession(raw: unknown): ReadingSession | undefined {
  if (!isRec(raw)) return undefined;
  const bookId = str(raw.bookId, 60);
  const d = day(raw.date);
  if (!bookId || !d) return undefined;
  return {
    id: str(raw.id, 60) ?? uid('sess'),
    bookId,
    runId: str(raw.runId, 60) ?? '',
    date: d,
    pagesRead: int(raw.pagesRead, 0, 20000),
    fromPage: int(raw.fromPage, 0, 1e6),
    toPage: int(raw.toPage, 0, 1e6),
    minutes: int(raw.minutes, 0, 2000),
    note: str(raw.note, 1000),
    createdAt: str(raw.createdAt, 40) ?? nowIso(),
  };
}

export function normalizeJournal(raw: unknown): JournalEntry | undefined {
  if (!isRec(raw)) return undefined;
  const text = str(raw.text, 10000);
  if (!text) return undefined;
  const now = nowIso();
  return {
    id: str(raw.id, 60) ?? uid('jr'),
    kind: oneOf(raw.kind, ['quote', 'thought', 'note'] as const, 'note'),
    bookId: str(raw.bookId, 60),
    mediaId: str(raw.mediaId, 60),
    text,
    attribution: str(raw.attribution, 200),
    page: int(raw.page, 0, 1e6),
    tags: strList(raw.tags),
    createdAt: str(raw.createdAt, 40) ?? now,
    updatedAt: str(raw.updatedAt, 40) ?? now,
    isDemo: raw.isDemo === true ? true : undefined,
  };
}

export function normalizeShelf(raw: unknown, i: number): Shelf | undefined {
  if (!isRec(raw)) return undefined;
  const name = str(raw.name, 60);
  if (!name) return undefined;
  return { id: str(raw.id, 60) ?? uid('shelf'), name, order: int(raw.order, 0, 1e6) ?? i };
}

export function normalizeGoal(raw: unknown): Goal | undefined {
  if (!isRec(raw)) return undefined;
  const metric = oneOf(raw.metric, ['books', 'pages', 'movies', 'episodes'] as const, 'books');
  const scope = oneOf(raw.scope, ['year', 'month'] as const, 'year');
  const period = str(raw.period, 7);
  const target = int(raw.target, 1, 1e7);
  if (!period || !target) return undefined;
  if (scope === 'year' ? !/^\d{4}$/.test(period) : !/^\d{4}-\d{2}$/.test(period)) return undefined;
  return { id: str(raw.id, 60) ?? uid('goal'), metric, scope, period, target };
}

const ACTIVITY_TYPES = ['book-added', 'book-started', 'book-finished', 'book-abandoned', 'session', 'media-added', 'media-started', 'media-finished', 'episode', 'viewing', 'journal'] as const;
export function normalizeActivity(raw: unknown): Activity | undefined {
  if (!isRec(raw)) return undefined;
  const at = str(raw.at, 40);
  const label = str(raw.label, 300);
  const refId = str(raw.refId, 60);
  if (!at || !label || !refId || Number.isNaN(new Date(at).getTime())) return undefined;
  return {
    id: str(raw.id, 60) ?? uid('act'),
    type: oneOf(raw.type, ACTIVITY_TYPES, 'session'),
    at,
    day: day(raw.day) ?? toDay(new Date(at)),
    refKind: oneOf(raw.refKind, ['book', 'media', 'journal'] as const, 'book'),
    refId,
    label,
    isDemo: raw.isDemo === true ? true : undefined,
  };
}

export function normalizePrefs(raw: unknown): Preferences {
  const r = isRec(raw) ? raw : {};
  return {
    theme: oneOf(r.theme, ['light', 'dark', 'system'] as const, DEFAULT_PREFS.theme),
    motion: oneOf(r.motion, ['system', 'reduce', 'full'] as const, DEFAULT_PREFS.motion),
    shelfView: oneOf(r.shelfView, ['shelf', 'gallery', 'list'] as const, DEFAULT_PREFS.shelfView),
    shelfGroup: oneOf(r.shelfGroup, ['shelf', 'status', 'all'] as const, DEFAULT_PREFS.shelfGroup),
    displayName: str(r.displayName, 60) ?? '',
    weekStartsOn: r.weekStartsOn === 0 ? 0 : 1,
    tmdbKey: str(r.tmdbKey, 200),
  };
}

export const DEFAULT_SHELF_NAMES = ['Favorites'];

export function emptyData(): AppData {
  return {
    version: SCHEMA_VERSION,
    books: [],
    shelves: DEFAULT_SHELF_NAMES.map((name, order) => ({ id: uid('shelf'), name, order })),
    sessions: [],
    media: [],
    journal: [],
    goals: [],
    activity: [],
    prefs: { ...DEFAULT_PREFS },
    demoLoaded: false,
  };
}

/** Parses a saved/imported document. Invalid records are dropped and reported, never silently "fixed" into fake data. */
export function normalizeData(raw: unknown): { data: AppData; skipped: string[] } {
  if (!isRec(raw)) throw new ValidationError('The file is not a Living Library export.');
  const skipped: string[] = [];
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const books: Book[] = [];
  list(raw.books).forEach((b, i) => {
    try {
      books.push(normalizeBook(b));
    } catch (e) {
      skipped.push(`Book #${i + 1}: ${(e as Error).message}`);
    }
  });
  const media: Media[] = [];
  list(raw.media).forEach((m, i) => {
    try {
      media.push(normalizeMedia(m));
    } catch (e) {
      skipped.push(`Screen title #${i + 1}: ${(e as Error).message}`);
    }
  });
  const bookIds = new Set(books.map((b) => b.id));
  const mediaIds = new Set(media.map((m) => m.id));
  const sessions = list(raw.sessions).map(normalizeSession).filter((s): s is ReadingSession => !!s && bookIds.has(s.bookId));
  const journal = list(raw.journal)
    .map(normalizeJournal)
    .filter((j): j is JournalEntry => !!j)
    .map((j) => ({ ...j, bookId: j.bookId && bookIds.has(j.bookId) ? j.bookId : undefined, mediaId: j.mediaId && mediaIds.has(j.mediaId) ? j.mediaId : undefined }));
  const shelves = list(raw.shelves).map(normalizeShelf).filter((s): s is Shelf => !!s);
  const shelfIds = new Set(shelves.map((s) => s.id));
  for (const b of books) b.shelfIds = b.shelfIds.filter((id) => shelfIds.has(id));
  const goals = list(raw.goals).map(normalizeGoal).filter((g): g is Goal => !!g);
  const activity = list(raw.activity).map(normalizeActivity).filter((a): a is Activity => !!a);
  const dropped = (list(raw.sessions).length - sessions.length);
  if (dropped > 0) skipped.push(`${dropped} reading session(s) without a matching book`);
  return {
    data: {
      version: SCHEMA_VERSION,
      books,
      shelves,
      sessions,
      media,
      journal,
      goals,
      activity,
      prefs: normalizePrefs(raw.prefs),
      demoLoaded: raw.demoLoaded === true,
    },
    skipped,
  };
}
