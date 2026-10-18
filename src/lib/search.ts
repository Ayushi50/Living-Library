// Metadata search against public catalogues. Nothing here is required: manual entry always works.
//  • Books:  Open Library (no key) and Google Books (no key for light use)
//  • Anime:  AniList GraphQL (no key)
//  • Film/TV/K-drama: TMDB — needs either your own proxy (TMDB_PROXY_URL at build time, which keeps the
//    key server-side) or a personal key pasted into Settings (stored only in this browser).
// Parsers are pure functions so they can be tested without a network.
import type { Book, Media, MediaKind } from '../types';
import { normalizeKey } from './books';

declare const __TMDB_PROXY_URL__: string;

export interface Hit<T> {
  key: string;
  source: string;
  title: string;
  subtitle?: string;
  image?: string;
  data: T;
  /** Optional second request for richer details (runtime, cast, seasons…). Failures fall back to `data`. */
  enrich?: () => Promise<Partial<Media>>;
}
export interface SearchResult<T> {
  hits: Hit<T>[];
  errors: string[];
}

export class SearchError extends Error {}

async function getJson(url: string, init: RequestInit = {}, ms = 9000): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: init.signal ?? ctl.signal });
    if (res.status === 429) throw new SearchError('The service is rate-limiting requests. Wait a moment and try again.');
    if (res.status === 401 || res.status === 403) throw new SearchError('The service rejected the request (check your API key).');
    if (!res.ok) throw new SearchError(`The service answered with an error (${res.status}).`);
    return await res.json();
  } catch (e) {
    if (e instanceof SearchError) throw e;
    if ((e as Error).name === 'AbortError') throw new SearchError('The search timed out.');
    throw new SearchError('Could not reach the service. Check your connection, or add the title by hand.');
  } finally {
    clearTimeout(timer);
  }
}

const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asStr = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const asNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null ? (v as Rec) : {});
const stripHtml = (s?: string) => s?.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").trim();

/* ================================================================== books */

export function parseOpenLibrary(json: unknown): Hit<Partial<Book>>[] {
  const out: Hit<Partial<Book>>[] = [];
  for (const raw of asArr(rec(json).docs)) {
    const d = rec(raw);
    const title = asStr(d.title);
    if (!title) continue;
    const authors = asArr(d.author_name).map(asStr).filter((x): x is string => !!x);
    const isbns = asArr(d.isbn).map(asStr).filter((x): x is string => !!x);
    const isbn13 = isbns.find((i) => i.length === 13) ?? isbns[0];
    const cover = asNum(d.cover_i);
    const coverUrl = cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : isbn13 ? `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false` : undefined;
    const year = asNum(d.first_publish_year);
    const pages = asNum(d.number_of_pages_median);
    const publisher = asArr(d.publisher).map(asStr).find(Boolean);
    const subjects = asArr(d.subject).map(asStr).filter((x): x is string => !!x).slice(0, 5);
    out.push({
      key: `ol:${asStr(d.key) ?? title}`,
      source: 'Open Library',
      title,
      subtitle: [authors.join(', '), year].filter(Boolean).join(' · '),
      image: coverUrl,
      data: { title, author: authors.join(', ') || undefined, coverUrl, isbn: isbn13, year, pages: pages && pages > 0 ? Math.round(pages) : undefined, publisher, genres: subjects, source: 'openlibrary', externalId: asStr(d.key) },
    });
  }
  return out;
}

export function parseGoogleBooks(json: unknown): Hit<Partial<Book>>[] {
  const out: Hit<Partial<Book>>[] = [];
  for (const raw of asArr(rec(json).items)) {
    const item = rec(raw);
    const v = rec(item.volumeInfo);
    const title = asStr(v.title);
    if (!title) continue;
    const full = [title, asStr(v.subtitle)].filter(Boolean).join(': ');
    const authors = asArr(v.authors).map(asStr).filter((x): x is string => !!x);
    const ids = asArr(v.industryIdentifiers).map(rec);
    const isbn = asStr(ids.find((i) => i.type === 'ISBN_13')?.identifier) ?? asStr(ids.find((i) => i.type === 'ISBN_10')?.identifier);
    const img = rec(v.imageLinks);
    let image = asStr(img.thumbnail) ?? asStr(img.smallThumbnail);
    if (image) image = image.replace(/^http:\/\//, 'https://').replace('&edge=curl', '');
    const published = asStr(v.publishedDate);
    const year = published ? Number(published.slice(0, 4)) || undefined : undefined;
    const pages = asNum(v.pageCount);
    const categories = asArr(v.categories).map(asStr).filter((x): x is string => !!x).flatMap((c) => c.split('/').map((s) => s.trim())).slice(0, 4);
    out.push({
      key: `gb:${asStr(item.id) ?? full}`,
      source: 'Google Books',
      title: full,
      subtitle: [authors.join(', '), year].filter(Boolean).join(' · '),
      image,
      data: { title: full, author: authors.join(', ') || undefined, coverUrl: image, isbn, year, pages: pages && pages > 0 ? pages : undefined, publisher: asStr(v.publisher), synopsis: asStr(v.description), genres: [...new Set(categories)], source: 'googlebooks', externalId: asStr(item.id) },
    });
  }
  return out;
}

/** Merge hits from several catalogues: prefer entries that carry a cover and synopsis, drop repeats. */
export function mergeBookHits(...lists: Hit<Partial<Book>>[][]): Hit<Partial<Book>>[] {
  const out: Hit<Partial<Book>>[] = [];
  const index = new Map<string, number>();
  for (const hit of lists.flat()) {
    const keys = [hit.data.isbn ? `i:${hit.data.isbn.replace(/[^0-9X]/gi, '')}` : '', `t:${normalizeKey(hit.data.title ?? hit.title)}|${normalizeKey((hit.data.author ?? '').split(',')[0])}`].filter(Boolean);
    const found = keys.map((k) => index.get(k)).find((i) => i !== undefined);
    if (found !== undefined) {
      const existing = out[found];
      // fill gaps in the existing hit from the duplicate
      existing.data = { ...hit.data, ...Object.fromEntries(Object.entries(existing.data).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) };
      existing.image = existing.image ?? hit.image;
      existing.source = existing.source.includes(hit.source) ? existing.source : `${existing.source} + ${hit.source}`;
      continue;
    }
    out.push({ ...hit, data: { ...hit.data } });
    for (const k of keys) index.set(k, out.length - 1);
  }
  return out;
}

export async function searchBooks(q: string): Promise<SearchResult<Partial<Book>>> {
  const query = encodeURIComponent(q.trim());
  const errors: string[] = [];
  const [ol, gb] = await Promise.allSettled([
    getJson(`https://openlibrary.org/search.json?q=${query}&limit=12&fields=key,title,author_name,first_publish_year,cover_i,isbn,number_of_pages_median,publisher,subject`),
    getJson(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=12&printType=books`),
  ]);
  const lists: Hit<Partial<Book>>[][] = [];
  if (ol.status === 'fulfilled') lists.push(parseOpenLibrary(ol.value));
  else errors.push(`Open Library: ${(ol.reason as Error).message}`);
  if (gb.status === 'fulfilled') lists.push(parseGoogleBooks(gb.value));
  else errors.push(`Google Books: ${(gb.reason as Error).message}`);
  return { hits: mergeBookHits(...lists).slice(0, 20), errors };
}

/* ================================================================== anime */

const ANILIST_QUERY = `query ($search: String) {
  Page(perPage: 15) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id format status episodes duration seasonYear countryOfOrigin genres description(asHtml: false)
      title { romaji english native }
      startDate { year }
      studios(isMain: true) { nodes { name } }
      coverImage { extraLarge large }
      bannerImage
      nextAiringEpisode { episode }
    }
  }
}`;

export function parseAniList(json: unknown): Hit<Partial<Media>>[] {
  const out: Hit<Partial<Media>>[] = [];
  const media = asArr(rec(rec(rec(json).data).Page).media);
  for (const raw of media) {
    const m = rec(raw);
    const t = rec(m.title);
    const title = asStr(t.english) ?? asStr(t.romaji) ?? asStr(t.native);
    if (!title) continue;
    const isMovie = m.format === 'MOVIE';
    const status = asStr(m.status);
    const airing = status === 'FINISHED' || status === 'CANCELLED' ? 'ended' : status === 'RELEASING' || status === 'HIATUS' || status === 'NOT_YET_RELEASED' ? 'ongoing' : 'unknown';
    const next = asNum(rec(m.nextAiringEpisode).episode);
    const episodes = asNum(m.episodes) ?? (next ? Math.max(0, next - 1) : undefined);
    const year = asNum(m.seasonYear) ?? asNum(rec(m.startDate).year);
    const image = asStr(rec(m.coverImage).extraLarge) ?? asStr(rec(m.coverImage).large);
    const studio = asStr(asArr(rec(m.studios).nodes).map((n) => asStr(rec(n).name)).find(Boolean));
    out.push({
      key: `al:${asNum(m.id) ?? title}`,
      source: 'AniList',
      title,
      subtitle: [isMovie ? 'Film' : asStr(m.format)?.replace('_', ' '), year, episodes && !isMovie ? `${episodes} eps` : undefined].filter(Boolean).join(' · '),
      image,
      data: {
        kind: 'anime',
        format: isMovie ? 'movie' : 'series',
        title,
        originalTitle: asStr(t.native) && asStr(t.native) !== title ? asStr(t.native) : undefined,
        posterUrl: image,
        backdropUrl: asStr(m.bannerImage),
        year,
        country: m.countryOfOrigin === 'JP' ? 'Japan' : asStr(m.countryOfOrigin),
        language: m.countryOfOrigin === 'JP' ? 'Japanese' : undefined,
        genres: asArr(m.genres).map(asStr).filter((x): x is string => !!x),
        runtime: asNum(m.duration),
        studio,
        synopsis: stripHtml(asStr(m.description)),
        airing: isMovie ? 'ended' : airing,
        seasons: isMovie ? [] : [{ number: 1, episodeCount: episodes ?? 0 }],
        source: 'anilist',
        externalId: String(asNum(m.id) ?? ''),
      },
    });
  }
  return out;
}

export async function searchAnime(q: string): Promise<SearchResult<Partial<Media>>> {
  try {
    const json = await getJson('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: q.trim() } }),
    });
    return { hits: parseAniList(json), errors: [] };
  } catch (e) {
    return { hits: [], errors: [`AniList: ${(e as Error).message}`] };
  }
}

/* =================================================================== TMDB */

export const TMDB_ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';
const IMG = 'https://image.tmdb.org/t/p';

export function tmdbConfigured(personalKey?: string): boolean {
  return !!(__TMDB_PROXY_URL__ || personalKey);
}

function tmdbRequest(path: string, params: Record<string, string>, personalKey?: string): Promise<unknown> {
  const qs = new URLSearchParams({ language: 'en-US', ...params });
  if (__TMDB_PROXY_URL__) return getJson(`${__TMDB_PROXY_URL__.replace(/\/$/, '')}${path}?${qs}`);
  if (!personalKey) throw new SearchError('TMDB search needs an API key. Add one in Settings, or enter the title by hand.');
  const isToken = personalKey.length > 40; // v4 read-access tokens are long JWTs
  if (!isToken) qs.set('api_key', personalKey);
  return getJson(`https://api.themoviedb.org/3${path}?${qs}`, isToken ? { headers: { Authorization: `Bearer ${personalKey}`, Accept: 'application/json' } } : {});
}

const COUNTRY_NAMES: Record<string, string> = { US: 'USA', GB: 'UK', KR: 'South Korea', JP: 'Japan', CN: 'China', FR: 'France', DE: 'Germany', IN: 'India', ES: 'Spain', IT: 'Italy', CA: 'Canada', AU: 'Australia', TH: 'Thailand', TW: 'Taiwan', HK: 'Hong Kong', MX: 'Mexico', BR: 'Brazil', SE: 'Sweden', DK: 'Denmark', NO: 'Norway' };
const LANG_NAMES: Record<string, string> = { en: 'English', ko: 'Korean', ja: 'Japanese', zh: 'Chinese', fr: 'French', de: 'German', es: 'Spanish', hi: 'Hindi', it: 'Italian', th: 'Thai', ta: 'Tamil', te: 'Telugu', pt: 'Portuguese', ru: 'Russian', sv: 'Swedish', da: 'Danish' };

export function parseTmdbSearch(json: unknown, kind: MediaKind): Hit<Partial<Media>>[] {
  const out: Hit<Partial<Media>>[] = [];
  const isMovie = kind === 'movie';
  for (const raw of asArr(rec(json).results)) {
    const r = rec(raw);
    const title = asStr(isMovie ? r.title : r.name);
    const id = asNum(r.id);
    if (!title || id === undefined) continue;
    const date = asStr(isMovie ? r.release_date : r.first_air_date);
    const year = date ? Number(date.slice(0, 4)) || undefined : undefined;
    const poster = asStr(r.poster_path);
    const origin = asArr(r.origin_country).map(asStr).filter((x): x is string => !!x);
    const lang = asStr(r.original_language);
    out.push({
      key: `tmdb:${isMovie ? 'm' : 't'}${id}`,
      source: 'TMDB',
      title,
      subtitle: [isMovie ? 'Film' : 'Series', year, origin[0] ? COUNTRY_NAMES[origin[0]] ?? origin[0] : undefined].filter(Boolean).join(' · '),
      image: poster ? `${IMG}/w342${poster}` : undefined,
      data: {
        kind,
        format: isMovie ? 'movie' : 'series',
        title,
        originalTitle: asStr(isMovie ? r.original_title : r.original_name) !== title ? asStr(isMovie ? r.original_title : r.original_name) : undefined,
        posterUrl: poster ? `${IMG}/w500${poster}` : undefined,
        backdropUrl: asStr(r.backdrop_path) ? `${IMG}/w1280${asStr(r.backdrop_path)}` : undefined,
        year,
        country: origin[0] ? COUNTRY_NAMES[origin[0]] ?? origin[0] : undefined,
        language: lang ? LANG_NAMES[lang] ?? lang : undefined,
        synopsis: asStr(r.overview),
        source: 'tmdb',
        externalId: `${isMovie ? 'movie' : 'tv'}/${id}`,
      },
    });
  }
  return out;
}

/** Details response (movie or tv with credits appended) → fields worth prefilling. */
export function parseTmdbDetails(json: unknown, kind: MediaKind): Partial<Media> {
  const d = rec(json);
  const isMovie = kind === 'movie';
  const genres = asArr(d.genres).map((g) => asStr(rec(g).name)).filter((x): x is string => !!x);
  const credits = rec(d.credits);
  const cast = asArr(credits.cast).slice(0, 8).map((c) => asStr(rec(c).name)).filter((x): x is string => !!x);
  const director = isMovie
    ? asStr(asArr(credits.crew).map(rec).find((c) => c.job === 'Director')?.name)
    : asArr(d.created_by).map((c) => asStr(rec(c).name)).filter(Boolean).join(', ') || undefined;
  const countries = asArr(d.production_countries).map((c) => asStr(rec(c).name)).filter((x): x is string => !!x);
  const origin = asArr(d.origin_country).map(asStr).filter((x): x is string => !!x);
  const out: Partial<Media> = {
    genres,
    cast,
    director,
    country: countries[0] ?? (origin[0] ? COUNTRY_NAMES[origin[0]] ?? origin[0] : undefined),
    synopsis: asStr(d.overview),
  };
  if (isMovie) {
    out.runtime = asNum(d.runtime) || undefined;
  } else {
    const status = asStr(d.status);
    out.airing = status === 'Ended' || status === 'Canceled' ? 'ended' : status === 'Returning Series' || status === 'In Production' || status === 'Planned' || status === 'Pilot' ? 'ongoing' : 'unknown';
    const runtimes = asArr(d.episode_run_time).map(asNum).filter((x): x is number => !!x);
    out.runtime = runtimes[0] ?? undefined;
    out.seasons = asArr(d.seasons)
      .map(rec)
      .filter((s) => asNum(s.season_number) !== undefined && asNum(s.season_number)! > 0 && (asNum(s.episode_count) ?? 0) > 0)
      .map((s) => ({ number: asNum(s.season_number)!, episodeCount: asNum(s.episode_count)!, ...(asStr(s.name) && !/^season \d+$/i.test(asStr(s.name)!) ? { title: asStr(s.name) } : {}) }));
  }
  for (const k of Object.keys(out) as (keyof Media)[]) {
    const v = out[k];
    if (v === undefined || (Array.isArray(v) && !v.length)) delete out[k];
  }
  return out;
}

export async function searchTmdb(q: string, kind: MediaKind, personalKey?: string): Promise<SearchResult<Partial<Media>>> {
  const isMovie = kind === 'movie';
  try {
    const json = await tmdbRequest(isMovie ? '/search/movie' : '/search/tv', { query: q.trim(), include_adult: 'false' }, personalKey);
    let hits = parseTmdbSearch(json, kind);
    if (kind === 'kdrama') {
      const korean = hits.filter((h) => h.data.language === 'Korean' || h.data.country === 'South Korea');
      hits = korean;
    }
    for (const h of hits) {
      const path = h.data.externalId!;
      h.enrich = async () => parseTmdbDetails(await tmdbRequest(`/${path}`, { append_to_response: 'credits' }, personalKey), kind);
    }
    return { hits, errors: kind === 'kdrama' && !hits.length ? ['No Korean series matched. Try the TV tab, or enter it by hand.'] : [] };
  } catch (e) {
    return { hits: [], errors: [`TMDB: ${(e as Error).message}`] };
  }
}
