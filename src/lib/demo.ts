// Optional sample content. Everything here is flagged `isDemo` (or belongs to a demo book/title) so it is
// clearly identifiable in the UI and can be removed in one click from Settings. Dates are relative to today.
import type { Activity, Book, JournalEntry, Media, ReadingSession, Shelf } from '../types';
import { addDays, today, toDay } from './dates';
import { nowIso } from './ids';

const ago = (n: number) => addDays(today(), -n);

interface BookSeed {
  key: string;
  title: string;
  author: string;
  pages: number;
  year: number;
  genres: string[];
  status: Book['status'];
  edition?: string;
  format?: Book['format'];
  shelves?: string[];
  synopsis: string;
  rating?: number;
  started?: number; // days ago
  finished?: number; // days ago
  page?: number; // current page for reading/hold
}

const BOOKS: BookSeed[] = [
  { key: 'pp', title: 'Pride and Prejudice', author: 'Jane Austen', pages: 279, year: 1813, genres: ['Classics', 'Romance'], status: 'completed', edition: 'Hardcover', shelves: ['Classics', 'Favorites', 'Books to Reread'], synopsis: 'Elizabeth Bennet and Mr Darcy misjudge one another in a witty study of class, money and marriage in Regency England.', rating: 5, started: 44, finished: 38 },
  { key: 'je', title: 'Jane Eyre', author: 'Charlotte Brontë', pages: 532, year: 1847, genres: ['Classics', 'Gothic'], status: 'completed', edition: 'Hardcover', shelves: ['Classics'], synopsis: 'An orphaned governess finds love and a terrible secret at Thornfield Hall.', rating: 4.5, started: 95, finished: 81 },
  { key: 'fr', title: 'Frankenstein', author: 'Mary Shelley', pages: 280, year: 1818, genres: ['Classics', 'Science Fiction', 'Gothic'], status: 'completed', shelves: ['Classics'], synopsis: 'A young scientist assembles a living creature and is undone by what he has made.', rating: 4, started: 130, finished: 124 },
  { key: 'dr', title: 'Dracula', author: 'Bram Stoker', pages: 418, year: 1897, genres: ['Classics', 'Gothic', 'Horror'], status: 'reading', edition: 'Hardcover', shelves: ['Classics'], synopsis: 'Told through letters and diaries, a band of friends pursue a count from Transylvania.', started: 9, page: 190 },
  { key: 'em', title: 'Emma', author: 'Jane Austen', pages: 474, year: 1815, genres: ['Classics', 'Romance'], status: 'reading', shelves: ['Comfort Reads'], synopsis: 'A well-meaning matchmaker learns that she understands other hearts better than her own.', started: 3, page: 88 },
  { key: 'dg', title: 'The Picture of Dorian Gray', author: 'Oscar Wilde', pages: 254, year: 1890, genres: ['Classics', 'Gothic'], status: 'completed', edition: 'Mass market paperback', shelves: ['Favorites'], synopsis: 'A beautiful young man stays unchanged while his portrait bears the cost of his choices.', rating: 4.5, started: 20, finished: 14 },
  { key: 'al', title: 'Alice’s Adventures in Wonderland', author: 'Lewis Carroll', pages: 96, year: 1865, genres: ['Classics', 'Fantasy'], status: 'completed', shelves: ['Comfort Reads'], synopsis: 'A girl follows a white rabbit into a world where logic keeps changing its mind.', rating: 4, started: 60, finished: 59 },
  { key: 'md', title: 'Moby-Dick', author: 'Herman Melville', pages: 635, year: 1851, genres: ['Classics', 'Adventure'], status: 'hold', edition: 'Hardcover', shelves: ['Classics'], synopsis: 'Captain Ahab’s obsessive hunt for a white whale, narrated by the sailor Ishmael.', started: 70, page: 120 },
  { key: 'cp', title: 'Crime and Punishment', author: 'Fyodor Dostoevsky', pages: 671, year: 1866, genres: ['Classics', 'Psychological'], status: 'hold', shelves: ['Classics'], synopsis: 'A destitute student commits a murder and is consumed by the aftermath.', started: 150, page: 210 },
  { key: 'wh', title: 'Wuthering Heights', author: 'Emily Brontë', pages: 416, year: 1847, genres: ['Classics', 'Gothic'], status: 'want', shelves: ['Classics', 'Book Club'], synopsis: 'Love and revenge across two generations on the Yorkshire moors.' },
  { key: 'ge', title: 'Great Expectations', author: 'Charles Dickens', pages: 544, year: 1861, genres: ['Classics'], status: 'want', edition: 'Hardcover', shelves: ['Book Club'], synopsis: 'Pip, a blacksmith’s apprentice, receives a mysterious fortune.' },
  { key: 'od', title: 'The Odyssey', author: 'Homer', pages: 541, year: 0, genres: ['Classics', 'Epic'], status: 'want', shelves: ['To Buy'], synopsis: 'Odysseus spends ten years finding his way home from Troy.' },
  { key: 'ak', title: 'Anna Karenina', author: 'Leo Tolstoy', pages: 864, year: 1878, genres: ['Classics', 'Romance'], status: 'want', shelves: ['To Buy', 'Classics'], synopsis: 'A married aristocrat’s affair unfolds alongside a landowner’s search for meaning.' },
  { key: 'lw', title: 'Little Women', author: 'Louisa May Alcott', pages: 759, year: 1868, genres: ['Classics'], status: 'abandoned', synopsis: 'Four sisters grow up in Civil War-era New England.', started: 200, page: 150 },
];

export function buildDemo(shelves: Shelf[] = []): { books: Book[]; media: Media[]; sessions: ReadingSession[]; journal: JournalEntry[]; activity: Activity[] } {
  const now = nowIso();
  const idOf = (name: string) => shelves.find((s) => s.name === name)?.id;
  const books: Book[] = [];
  const sessions: ReadingSession[] = [];
  const journal: JournalEntry[] = [];
  const activity: Activity[] = [];
  let sid = 0;

  for (const s of BOOKS) {
    const id = `demo_book_${s.key}`;
    const runId = `demo_run_${s.key}`;
    const completed = s.status === 'completed';
    const startedAt = s.started !== undefined ? ago(s.started) : undefined;
    const finishedAt = completed && s.finished !== undefined ? ago(s.finished) : undefined;
    books.push({
      id,
      title: s.title,
      author: s.author,
      pages: s.pages,
      year: s.year > 0 ? s.year : undefined,
      genres: s.genres,
      tags: ['sample'],
      format: s.format ?? 'physical',
      edition: s.edition,
      synopsis: s.synopsis,
      status: s.status,
      progressUnit: 'page',
      currentPage: completed ? s.pages : s.page ?? 0,
      rating: s.rating,
      shelfIds: (s.shelves ?? []).map(idOf).filter((x): x is string => !!x),
      runs: s.status === 'want' ? [] : [{ id: runId, startedAt, finishedAt, endedAt: s.status === 'abandoned' ? ago(180) : undefined, outcome: completed ? 'completed' : s.status === 'abandoned' ? 'abandoned' : 'reading', rating: completed ? s.rating : undefined }],
      source: 'demo',
      isDemo: true,
      addedAt: now,
      updatedAt: now,
    });
    // A few sessions so charts and the calendar have something real to draw. All flagged by belonging to a demo book.
    const add = (daysAgo: number, from: number, to: number, minutes: number) => {
      sessions.push({ id: `demo_sess_${sid++}`, bookId: id, runId, date: ago(daysAgo), fromPage: from, toPage: to, pagesRead: to - from, minutes, createdAt: now });
    };
    if (s.key === 'pp') { add(44, 0, 80, 70); add(41, 80, 190, 95); add(38, 190, 279, 80); }
    if (s.key === 'dg') { add(20, 0, 90, 80); add(16, 90, 200, 90); add(14, 200, 254, 50); }
    if (s.key === 'je') { add(95, 0, 120, 80); add(88, 120, 400, 160); add(81, 400, 532, 90); }
    if (s.key === 'dr') { add(9, 0, 60, 55); add(6, 60, 120, 50); add(2, 120, 190, 60); add(1, 190, 190, 15); }
    if (s.key === 'em') { add(3, 0, 40, 40); add(1, 40, 88, 45); add(0, 88, 88, 10); }
    if (finishedAt) activity.push({ id: `demo_act_fin_${s.key}`, type: 'book-finished', at: new Date(`${finishedAt}T18:00:00`).toISOString(), day: finishedAt, refKind: 'book', refId: id, label: `Finished “${s.title}”`, isDemo: true });
  }
  for (const x of sessions) {
    const b = books.find((bk) => bk.id === x.bookId)!;
    activity.push({ id: `demo_act_${x.id}`, type: 'session', at: new Date(`${x.date}T20:00:00`).toISOString(), day: x.date, refKind: 'book', refId: b.id, label: `Read “${b.title}”${x.toPage ? ` to page ${x.toPage}` : ''}`, isDemo: true });
  }

  journal.push(
    { id: 'demo_jr_1', kind: 'quote', bookId: 'demo_book_pp', text: 'There is no charm equal to tenderness of heart.', page: 192, tags: ['tenderness', 'sample'], createdAt: new Date(`${ago(40)}T21:00:00`).toISOString(), updatedAt: now, isDemo: true },
    { id: 'demo_jr_2', kind: 'thought', bookId: 'demo_book_dr', text: 'The letters-and-diaries format makes the dread feel documented rather than narrated. Every page reads like evidence.', page: 120, tags: ['atmosphere', 'sample'], createdAt: new Date(`${ago(6)}T22:10:00`).toISOString(), updatedAt: now, isDemo: true },
    { id: 'demo_jr_3', kind: 'note', bookId: 'demo_book_dg', text: 'Notice how often beauty is treated as a kind of permission. Revisit the preface before reviewing.', tags: ['theme', 'sample'], createdAt: new Date(`${ago(15)}T19:30:00`).toISOString(), updatedAt: now, isDemo: true },
  );

  const media: Media[] = [];
  const mbase = { tags: ['sample'], cast: [], favoriteCharacters: [], quotes: [], seasons: [], episodes: [], viewings: [], source: 'demo' as const, isDemo: true, addedAt: now, updatedAt: now };
  media.push(
    { ...mbase, id: 'demo_m_spirited', kind: 'anime', format: 'movie', title: 'Spirited Away', originalTitle: '千と千尋の神隠し', year: 2001, country: 'Japan', language: 'Japanese', genres: ['Fantasy', 'Animation', 'Family'], runtime: 125, studio: 'Studio Ghibli', director: 'Hayao Miyazaki', synopsis: 'A girl wanders into a bathhouse for spirits and must work to free her parents.', status: 'completed', rating: 5, airing: 'ended', viewings: [{ id: 'demo_v1', date: ago(22) }], finishedAt: ago(22) },
    { ...mbase, id: 'demo_m_parasite', kind: 'movie', format: 'movie', title: 'Parasite', year: 2019, country: 'South Korea', language: 'Korean', genres: ['Thriller', 'Drama'], runtime: 132, director: 'Bong Joon-ho', synopsis: 'A poor family schemes its way into the lives of a wealthy household.', status: 'completed', rating: 4.5, airing: 'ended', viewings: [{ id: 'demo_v2', date: ago(48) }, { id: 'demo_v3', date: ago(5), note: 'Rewatch' }], finishedAt: ago(5) },
    { ...mbase, id: 'demo_m_casablanca', kind: 'movie', format: 'movie', title: 'Casablanca', year: 1942, country: 'USA', language: 'English', genres: ['Romance', 'Drama'], runtime: 102, director: 'Michael Curtiz', synopsis: 'A cynical bar owner in wartime Morocco must choose between love and virtue.', status: 'plan', airing: 'ended' },
  );
  const eps = (season: number, count: number, startAgo: number): Media['episodes'] => Array.from({ length: count }, (_, i) => ({ season, episode: i + 1, watchedAt: ago(Math.max(0, startAgo - i)) }));
  media.push(
    { ...mbase, id: 'demo_m_clay', kind: 'kdrama', format: 'series', title: 'Crash Landing on You', year: 2019, country: 'South Korea', language: 'Korean', genres: ['Romance', 'Drama', 'Comedy'], runtime: 80, synopsis: 'A South Korean heiress paraglides into North Korea and is hidden by an army captain.', status: 'watching', airing: 'ended', seasons: [{ number: 1, episodeCount: 16 }], episodes: eps(1, 9, 10), startedAt: ago(10) },
    { ...mbase, id: 'demo_m_bebop', kind: 'anime', format: 'series', title: 'Cowboy Bebop', year: 1998, country: 'Japan', language: 'Japanese', genres: ['Sci-Fi', 'Action'], runtime: 24, studio: 'Sunrise', synopsis: 'Bounty hunters drift through the solar system chasing bounties and their pasts.', status: 'watching', airing: 'ended', seasons: [{ number: 1, episodeCount: 26 }], episodes: eps(1, 7, 7), startedAt: ago(7) },
    { ...mbase, id: 'demo_m_sev', kind: 'tv', format: 'series', title: 'Severance', year: 2022, country: 'USA', language: 'English', genres: ['Sci-Fi', 'Thriller'], runtime: 50, synopsis: 'Employees surgically divide their work and personal memories.', status: 'watching', rating: 4.5, airing: 'ongoing', seasons: [{ number: 1, episodeCount: 9 }, { number: 2, episodeCount: 10 }], episodes: [...eps(1, 9, 40), ...eps(2, 10, 30)], startedAt: ago(40) },
    { ...mbase, id: 'demo_m_fleabag', kind: 'tv', format: 'series', title: 'Fleabag', year: 2016, country: 'UK', language: 'English', genres: ['Comedy', 'Drama'], runtime: 27, synopsis: 'A sharp, grieving woman navigates family and love in London.', status: 'completed', rating: 5, airing: 'ended', seasons: [{ number: 1, episodeCount: 6 }, { number: 2, episodeCount: 6 }], episodes: [...eps(1, 6, 70), ...eps(2, 6, 63)], startedAt: ago(70), finishedAt: ago(58) },
  );
  for (const m of media) {
    for (const v of m.viewings) activity.push({ id: `demo_act_${v.id}`, type: 'viewing', at: new Date(`${v.date}T21:00:00`).toISOString(), day: v.date, refKind: 'media', refId: m.id, label: `${m.viewings.length > 1 && v === m.viewings[m.viewings.length - 1] ? 'Rewatched' : 'Watched'} “${m.title}”`, isDemo: true });
    const last = [...m.episodes].sort((a, b) => ((a.watchedAt ?? '') < (b.watchedAt ?? '') ? 1 : -1))[0];
    if (last?.watchedAt) activity.push({ id: `demo_act_ep_${m.id}`, type: 'episode', at: new Date(`${last.watchedAt}T21:30:00`).toISOString(), day: last.watchedAt, refKind: 'media', refId: m.id, label: `Watched “${m.title}” S${last.season}·E${last.episode}`, isDemo: true });
  }
  void toDay;
  return { books, media, sessions, journal, activity };
}
