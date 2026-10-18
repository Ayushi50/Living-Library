// Data model for the whole app. Everything the user does is persisted as one versioned document
// (see storage.ts). All dates are ISO strings: `YYYY-MM-DD` for calendar days, full ISO for timestamps.

export const SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ books */

export type BookStatus = 'want' | 'reading' | 'completed' | 'hold' | 'abandoned';
export type BookFormat = 'physical' | 'ebook' | 'audiobook';
export type ProgressUnit = 'page' | 'chapter';

export const BOOK_STATUS_LABEL: Record<BookStatus, string> = {
  want: 'Want to Read',
  reading: 'Currently Reading',
  completed: 'Completed',
  hold: 'On Hold',
  abandoned: 'Abandoned',
};
export const BOOK_STATUS_ORDER: BookStatus[] = ['reading', 'want', 'hold', 'completed', 'abandoned'];
export const BOOK_FORMAT_LABEL: Record<BookFormat, string> = {
  physical: 'Physical',
  ebook: 'E-book',
  audiobook: 'Audiobook',
};

/** One pass through a book. A reread creates a new run; old runs are never overwritten. */
export interface ReadingRun {
  id: string;
  startedAt?: string; // YYYY-MM-DD
  finishedAt?: string; // YYYY-MM-DD, set when the run was completed
  endedAt?: string; // YYYY-MM-DD, set when the run was abandoned
  outcome: 'reading' | 'completed' | 'abandoned';
  rating?: number; // rating given at the end of this run
}

/** A reading session the user logged. Never generated automatically from nothing. */
export interface ReadingSession {
  id: string;
  bookId: string;
  runId: string;
  date: string; // YYYY-MM-DD
  pagesRead?: number;
  fromPage?: number;
  toPage?: number;
  minutes?: number;
  note?: string;
  createdAt: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  isbn?: string;
  edition?: string;
  publisher?: string;
  year?: number;
  pages?: number;
  genres: string[];
  tags: string[];
  format: BookFormat;
  synopsis?: string;
  status: BookStatus;
  /** Current progress inside the active run. */
  progressUnit: ProgressUnit;
  currentPage: number; // current page, or current chapter if progressUnit === 'chapter'
  totalChapters?: number;
  rating?: number; // 0.5 steps, 1..5
  review?: string;
  notes?: string;
  spineColor?: string; // user override, hex
  autoColor?: string; // sampled from the cover when possible, hex
  shelfIds: string[];
  runs: ReadingRun[];
  source?: 'manual' | 'openlibrary' | 'googlebooks' | 'import' | 'demo';
  externalId?: string;
  isDemo?: boolean;
  addedAt: string;
  updatedAt: string;
}

export interface Shelf {
  id: string;
  name: string;
  order: number;
}

/* --------------------------------------------------------------- screen */

export type MediaKind = 'movie' | 'tv' | 'kdrama' | 'anime';
export type MediaFormat = 'movie' | 'series'; // anime can be either; movie kind is always 'movie'
export type ViewStatus = 'plan' | 'watching' | 'completed' | 'hold' | 'dropped';
export type Airing = 'ongoing' | 'ended' | 'unknown';

export const MEDIA_KIND_LABEL: Record<MediaKind, string> = {
  movie: 'Movies',
  tv: 'TV Series',
  kdrama: 'K-Dramas',
  anime: 'Anime',
};
export const VIEW_STATUS_LABEL: Record<ViewStatus, string> = {
  plan: 'Plan to Watch',
  watching: 'Currently Watching',
  completed: 'Completed',
  hold: 'On Hold',
  dropped: 'Dropped',
};
export const VIEW_STATUS_ORDER: ViewStatus[] = ['watching', 'plan', 'hold', 'completed', 'dropped'];

export interface SeasonInfo {
  number: number;
  episodeCount: number; // episodes released/known so far
  title?: string;
}

export interface EpisodeLog {
  season: number;
  episode: number;
  /** YYYY-MM-DD. Missing when the user said "already watched" without knowing when; never invented. */
  watchedAt?: string;
}

export interface ViewingLog {
  id: string;
  date: string; // YYYY-MM-DD
  note?: string;
}

export interface Media {
  id: string;
  kind: MediaKind;
  format: MediaFormat;
  title: string;
  originalTitle?: string;
  posterUrl?: string;
  backdropUrl?: string;
  year?: number;
  country?: string;
  language?: string;
  genres: string[];
  tags: string[];
  runtime?: number; // minutes: whole film, or per episode for series
  director?: string;
  cast: string[];
  studio?: string;
  synopsis?: string;
  status: ViewStatus;
  rating?: number;
  review?: string;
  notes?: string;
  favoriteCharacters: string[];
  quotes: string[]; // favourite scenes & quotes
  airing: Airing; // series only
  seasons: SeasonInfo[]; // series only
  episodes: EpisodeLog[]; // series only: which episodes have been watched
  viewings: ViewingLog[]; // movies: each viewing (rewatch history)
  startedAt?: string;
  finishedAt?: string;
  source?: 'manual' | 'tmdb' | 'anilist' | 'import' | 'demo';
  externalId?: string;
  isDemo?: boolean;
  addedAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------- journal */

export type JournalKind = 'quote' | 'thought' | 'note';
export interface JournalEntry {
  id: string;
  kind: JournalKind;
  bookId?: string;
  mediaId?: string;
  text: string;
  attribution?: string; // e.g. speaker for a media quote
  page?: number;
  tags: string[]; // mood / theme
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

/* ---------------------------------------------------------------- goals */

export type GoalMetric = 'books' | 'pages' | 'movies' | 'episodes';
export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = {
  books: 'Books finished',
  pages: 'Pages read',
  movies: 'Movies watched',
  episodes: 'Episodes watched',
};
export interface Goal {
  id: string;
  metric: GoalMetric;
  scope: 'year' | 'month';
  period: string; // '2026' or '2026-10'
  target: number;
}

/* ------------------------------------------------------------- activity */

export type ActivityType =
  | 'book-added'
  | 'book-started'
  | 'book-finished'
  | 'book-abandoned'
  | 'session'
  | 'media-added'
  | 'media-started'
  | 'media-finished'
  | 'episode'
  | 'viewing'
  | 'journal';

export interface Activity {
  id: string;
  type: ActivityType;
  at: string; // full ISO timestamp
  day: string; // YYYY-MM-DD in local time
  refKind: 'book' | 'media' | 'journal';
  refId: string;
  label: string;
  isDemo?: boolean;
}

/* ---------------------------------------------------------- preferences */

export interface Preferences {
  theme: 'light' | 'dark' | 'system';
  motion: 'system' | 'reduce' | 'full';
  shelfView: 'shelf' | 'gallery' | 'list';
  shelfGroup: 'shelf' | 'status' | 'all';
  displayName: string;
  weekStartsOn: 0 | 1;
  tmdbKey?: string; // personal TMDB key, stored only in this browser
}

/* ----------------------------------------------------------- the state */

export interface AppData {
  version: number;
  books: Book[];
  shelves: Shelf[];
  sessions: ReadingSession[];
  media: Media[];
  journal: JournalEntry[];
  goals: Goal[];
  activity: Activity[];
  prefs: Preferences;
  demoLoaded: boolean;
}

export const DEFAULT_PREFS: Preferences = {
  theme: 'system',
  motion: 'system',
  shelfView: 'shelf',
  shelfGroup: 'shelf',
  displayName: '',
  weekStartsOn: 1,
};
