import { useEffect } from 'react';
import { Link } from './components/Link';
import { ConfirmHost, ToastHost } from './components/Hosts';
import { Icon, type IconName } from './components/Icon';
import { ShelvesManager } from './components/ShelvesManager';
import { useMotion } from './components/common';
import { getStore, useData, useMeta } from './lib/store';
import { navigate, openAdd, openSearch, toast, useRoute } from './lib/ui';
import { Library } from './views/Library';
import { Home } from './views/Home';
import { Journal } from './views/Journal';
import { Screen } from './views/Screen';
import { Stats } from './views/Stats';
import { Settings } from './views/Settings';
import { AddFlow } from './components/AddFlow';
import { GoalsEditor } from './components/GoalsEditor';
import { SearchPalette } from './components/SearchPalette';
import { AccountMenu } from './components/AccountMenu';

const NAV: { to: string; name: string; label: string; icon: IconName }[] = [
  { to: '/', name: 'home', label: 'Home', icon: 'home' },
  { to: '/library', name: 'library', label: 'Library', icon: 'book' },
  { to: '/journal', name: 'journal', label: 'Journal', icon: 'journal' },
  { to: '/screen', name: 'screen', label: 'Screen', icon: 'film' },
  { to: '/stats', name: 'stats', label: 'Stats', icon: 'chart' },
];

function useThemeEffects() {
  const prefs = useData().prefs;
  const motion = useMotion();
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#17100e' : '#f4ecdc');
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [prefs.theme]);
  useEffect(() => {
    document.documentElement.dataset.motion = motion ? 'full' : 'reduce';
  }, [motion]);
}

export function App() {
  const meta = useMeta();
  useThemeEffects();
  const data = useData();
  const route = useRoute();
  const store = getStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!meta.ready) return <div className="boot" role="status" aria-live="polite">Opening the library…</div>;

  const dark = document.documentElement.dataset.theme === 'dark';
  return (
    <div className="app">
      <a href="#main" className="visually-hidden" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      {meta.notice && <div className="banner" role="status"><span className="grow">{meta.notice}</span><button className="btn btn-sm" onClick={() => store.dismissNotice()}>Dismiss</button></div>}
      {meta.guest && (
        <div className="banner" role="status">
          <span className="grow">This browser has a guest library ({meta.guest.books} book{meta.guest.books === 1 ? '' : 's'}, {meta.guest.media} screen title{meta.guest.media === 1 ? '' : 's'}, {meta.guest.journal} journal entr{meta.guest.journal === 1 ? 'y' : 'ies'}) that isn’t in your account. Merge it in? Duplicates are skipped.</span>
          <button className="btn btn-sm btn-primary" onClick={() => {
            const r = store.mergeGuestLibrary();
            if (r) toast(`Merged ${r.addedBooks} book${r.addedBooks === 1 ? '' : 's'} and ${r.addedMedia} screen title${r.addedMedia === 1 ? '' : 's'} into your account.`);
          }}>Merge into account</button>
          <button className="btn btn-sm" onClick={() => store.dismissGuestLibrary()}>Keep separate</button>
        </div>
      )}
      {meta.saveError && <div className="banner is-error" role="alert"><Icon name="alert" /><span className="grow">{meta.saveError}</span><button className="btn btn-sm" onClick={() => void store.flush()}>Try again</button></div>}
      <header className="topbar">
        <Link to="/" className="wordmark" aria-label="The Living Library, home">
          <svg className="wordmark-mark" viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="12" width="12" height="42" rx="1.5" fill="currentColor" opacity=".9" /><rect x="22" y="18" width="10" height="36" rx="1.5" fill="#c19a43" /><g transform="rotate(10 44 33)"><rect x="35" y="10" width="15" height="44" rx="1.5" fill="currentColor" opacity=".72" /></g></svg>
          <span>The Livin' <b>Library</b></span>
        </Link>
        <nav className="nav" aria-label="Primary">
          {NAV.map((n) => <Link key={n.to} to={n.to} aria-current={route.name === n.name ? 'page' : undefined}>{n.label}</Link>)}
        </nav>
        <div className="top-actions">
          <button className="search-trigger" onClick={openSearch} aria-label="Search your library"><Icon name="search" size={16} /><span>Search your library…</span><kbd>⌘K</kbd></button>
          <button className="btn btn-primary btn-sm" onClick={() => openAdd(route.name === 'screen' ? 'movie' : 'book')} data-testid="quick-add"><Icon name="plus" size={15} /> <span className="add-label">Add</span></button>
          <button className="icon-btn" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => store.setPrefs({ theme: dark ? 'light' : 'dark' })} data-testid="theme-toggle"><Icon name={dark ? 'sun' : 'moon'} /></button>
          <AccountMenu />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="main" data-mood={route.name === 'screen' ? 'cinema' : undefined}>
        {route.name === 'home' && <Home />}
        {route.name === 'library' && <Library bookId={route.bookId} />}
        {route.name === 'journal' && <Journal />}
        {route.name === 'screen' && <Screen mediaId={route.mediaId} />}
        {route.name === 'stats' && <Stats />}
        {route.name === 'settings' && <Settings />}
      </main>
      <nav className="tabbar" aria-label="Primary mobile">
        {NAV.map((n) => <Link key={n.to} to={n.to} aria-current={route.name === n.name ? 'page' : undefined}><Icon name={n.icon} size={20} />{n.label}</Link>)}
      </nav>
      <ShelvesManager />
      <GoalsEditor />
      <AddFlow />
      <SearchPalette />
      <ConfirmHost />
      <ToastHost />
    </div>
  );
}
void navigate;
