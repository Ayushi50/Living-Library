import { test } from 'node:test';
import assert from 'node:assert/strict';
(globalThis as any).__TMDB_PROXY_URL__ = '';
import { parseOpenLibrary, parseGoogleBooks, mergeBookHits, parseAniList, parseTmdbSearch, parseTmdbDetails } from '../src/lib/search';

// Fixtures are hand-written from the documented response shapes; they are NOT captured from live services.
test('open library parser skips untitled docs and builds cover url', () => {
  const h = parseOpenLibrary({ docs: [{ title: 'Dune', author_name: ['Frank Herbert'], cover_i: 123, first_publish_year: 1965, number_of_pages_median: 412 }, { author_name: ['x'] }] });
  assert.equal(h.length, 1);
  assert.match(h[0].image!, /123-L/);
  assert.equal(h[0].data.pages, 412);
});
test('google books parser upgrades http covers and joins subtitle', () => {
  const h = parseGoogleBooks({ items: [{ id: 'a', volumeInfo: { title: 'Dune', subtitle: 'Book One', authors: ['Frank Herbert'], pageCount: 500, imageLinks: { thumbnail: 'http://x/y&edge=curl' }, industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780441013593' }] } }] });
  assert.equal(h[0].title, 'Dune: Book One');
  assert.equal(h[0].image, 'https://x/y');
});
test('merge dedupes by isbn and fills gaps', () => {
  const a = parseOpenLibrary({ docs: [{ title: 'Dune', author_name: ['Frank Herbert'], isbn: ['9780441013593'] }] });
  const b = parseGoogleBooks({ items: [{ id: 'a', volumeInfo: { title: 'Dune', authors: ['Frank Herbert'], pageCount: 500, description: 'Spice.', industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780441013593' }] } }] });
  const m = mergeBookHits(a, b);
  assert.equal(m.length, 1);
  assert.equal(m[0].data.pages, 500);
});
test('garbage input yields empty results, not throws', () => {
  assert.deepEqual(parseOpenLibrary(null), []);
  assert.deepEqual(parseGoogleBooks('x'), []);
  assert.deepEqual(parseAniList({}), []);
  assert.deepEqual(parseTmdbSearch(undefined, 'movie'), []);
});
test('anilist ongoing vs finished', () => {
  const h = parseAniList({ data: { Page: { media: [{ id: 1, format: 'TV', status: 'RELEASING', episodes: null, nextAiringEpisode: { episode: 6 }, title: { romaji: 'A' } }, { id: 2, format: 'TV', status: 'FINISHED', episodes: 12, title: { english: 'B' } }] } } });
  assert.equal(h[0].data.airing, 'ongoing');
  assert.equal(h[0].data.seasons![0].episodeCount, 5);
  assert.equal(h[1].data.airing, 'ended');
});
test('tmdb search + details', () => {
  const s = parseTmdbSearch({ results: [{ id: 5, name: 'Show', first_air_date: '2020-01-02', poster_path: '/p.jpg', origin_country: ['KR'], original_language: 'ko' }] }, 'tv');
  assert.equal(s[0].data.language, 'Korean');
  const d = parseTmdbDetails({ status: 'Returning Series', seasons: [{ season_number: 0, episode_count: 3 }, { season_number: 1, episode_count: 10 }], genres: [{ name: 'Drama' }] }, 'tv');
  assert.equal(d.airing, 'ongoing');
  assert.equal(d.seasons!.length, 1);
});

import { exportJson, parseImport, csvCell, booksCsv } from '../src/lib/exchange';
import { emptyData } from '../src/lib/normalize';
test('export omits the personal TMDB key and round-trips', () => {
  const d = emptyData();
  d.prefs.tmdbKey = 'secret-key';
  const json = exportJson(d);
  assert.ok(!json.includes('secret-key'));
  const p = parseImport(json);
  assert.ok(p.ok);
});
test('import rejects junk with a clear message', () => {
  assert.equal(parseImport('not json').ok, false);
  assert.equal(parseImport('[]').ok, false);
  assert.equal(parseImport('{"hello":1}').ok, false);
  assert.equal(parseImport('{"books":[],"version":99}').ok, false);
});
test('csv escapes quotes and neutralises formulas', () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell(-3), '-3');
  assert.match(booksCsv(emptyData()), /^Title,Author/);
});
