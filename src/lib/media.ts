import type { AppData, Media, EpisodeLog } from '../types';
import { normalizeKey } from './books';

export const isSeries = (m: Media) => m.format === 'series';

export function totalEpisodes(m: Media): number {
  return m.seasons.reduce((n, s) => n + s.episodeCount, 0);
}
export function watchedSet(m: Media): Set<string> {
  return new Set(m.episodes.map((e) => `${e.season}x${e.episode}`));
}
export function isWatched(m: Media, season: number, episode: number): boolean {
  return m.episodes.some((e) => e.season === season && e.episode === episode);
}
export function watchedCount(m: Media): number {
  // Only count watched episodes that still exist in the season map, so shrinking a season can't inflate progress.
  const set = watchedSet(m);
  let n = 0;
  for (const s of m.seasons) for (let e = 1; e <= s.episodeCount; e++) if (set.has(`${s.number}x${e}`)) n++;
  return n;
}
/** The first episode (in season order) that has not been watched, or undefined when caught up. */
export function nextEpisode(m: Media): { season: number; episode: number } | undefined {
  const set = watchedSet(m);
  for (const s of [...m.seasons].sort((a, b) => a.number - b.number)) {
    for (let e = 1; e <= s.episodeCount; e++) if (!set.has(`${s.number}x${e}`)) return { season: s.number, episode: e };
  }
  return undefined;
}
export function lastWatched(m: Media): EpisodeLog | undefined {
  let best: EpisodeLog | undefined;
  for (const e of m.episodes) {
    if (!best) {
      best = e;
      continue;
    }
    const a = e.watchedAt ?? '';
    const b = best.watchedAt ?? '';
    if (a > b || (a === b && (e.season > best.season || (e.season === best.season && e.episode > best.episode)))) best = e;
  }
  return best;
}
export function seasonProgress(m: Media, season: number): { watched: number; total: number; done: boolean } {
  const s = m.seasons.find((x) => x.number === season);
  const total = s?.episodeCount ?? 0;
  const set = watchedSet(m);
  let watched = 0;
  for (let e = 1; e <= total; e++) if (set.has(`${season}x${e}`)) watched++;
  return { watched, total, done: total > 0 && watched === total };
}
/** All released episodes have been watched. For an ongoing show this does NOT mean the series is complete. */
export function isCaughtUp(m: Media): boolean {
  return isSeries(m) && totalEpisodes(m) > 0 && watchedCount(m) === totalEpisodes(m);
}
/** A series may only be completed once its run has ended and every known episode is watched. */
export function canCompleteSeries(m: Media): boolean {
  return isSeries(m) && m.airing === 'ended' && isCaughtUp(m);
}
export function percentWatched(m: Media): number {
  if (m.status === 'completed') return 100;
  if (!isSeries(m)) return m.viewings.length ? 100 : 0;
  const t = totalEpisodes(m);
  return t ? Math.round((watchedCount(m) / t) * 100) : 0;
}
export function lastViewing(m: Media): string | undefined {
  return m.viewings.map((v) => v.date).sort().pop();
}
export function mediaLabel(m: Media): string {
  if (m.kind === 'anime') return m.format === 'movie' ? 'Anime film' : 'Anime';
  if (m.kind === 'kdrama') return 'K-Drama';
  if (m.kind === 'tv') return 'TV series';
  return 'Film';
}
export function findDuplicateMedia(data: AppData, c: Pick<Media, 'title' | 'year' | 'kind'>, ignoreId?: string): Media | undefined {
  const tk = normalizeKey(c.title);
  return data.media.find((m) => m.id !== ignoreId && m.kind === c.kind && normalizeKey(m.title) === tk && (!c.year || !m.year || c.year === m.year));
}
export function formatRuntime(min?: number): string {
  if (!min || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m ? m + 'm' : ''}`.trim() : `${m}m`;
}
